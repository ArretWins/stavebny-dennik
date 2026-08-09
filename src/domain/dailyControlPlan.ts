import type { ControlTowerItem } from './controlTower';
import type { DailyControlAction } from './types';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const severityRank: Record<DailyControlAction['severity'], number> = {
  critical: 3,
  high: 2,
  watch: 1,
};

export interface CarriedDailyControlAction {
  action: DailyControlAction;
  ageDays: number;
}

export interface MorningControlBriefing {
  carriedOpen: CarriedDailyControlAction[];
  todayOpen: DailyControlAction[];
  resolvedToday: DailyControlAction[];
  waiting: ControlTowerItem[];
  openCount: number;
  handledCount: number;
  totalCount: number;
}

function dateUtcValue(value: string): number {
  if (!datePattern.test(value)) throw new Error('INVALID_DAILY_ACTION_DATE');
  const [year, month, day] = value.split('-').map(Number);
  const result = Date.UTC(year, month - 1, day);
  const parsed = new Date(result);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    throw new Error('INVALID_DAILY_ACTION_DATE');
  return result;
}

function orderActions(
  left: DailyControlAction,
  right: DailyControlAction,
): number {
  return (
    severityRank[right.severity] - severityRank[left.severity] ||
    left.actionDate.localeCompare(right.actionDate) ||
    left.createdAt.localeCompare(right.createdAt)
  );
}

export function dailyControlActionId(
  projectId: string,
  actionDate: string,
  issue: string,
): string {
  return `daily_${projectId}_${actionDate}_${issue}`;
}

export function materializeDailyControlActions(input: {
  existing: DailyControlAction[];
  items: ControlTowerItem[];
  projectId: string;
  ownerId: string;
  actionDate: string;
  at: string;
}): DailyControlAction[] {
  dateUtcValue(input.actionDate);
  const existingByIssue = new Map(
    input.existing
      .filter(
        item =>
          item.projectId === input.projectId &&
          (item.actionDate === input.actionDate ||
            (item.status === 'open' &&
              item.actionDate.localeCompare(input.actionDate) < 0)),
      )
      .map(item => [item.issue, item]),
  );
  const additions = input.items
    .filter(item => !existingByIssue.has(item.id))
    .map<DailyControlAction>(item => ({
      id: dailyControlActionId(input.projectId, input.actionDate, item.id),
      ownerId: input.ownerId,
      projectId: input.projectId,
      actionDate: input.actionDate,
      issue: item.id,
      severity: item.severity,
      target: item.target,
      count: item.count,
      amountCents: item.amountCents,
      status: 'open',
      syncStatus: 'pending',
      createdAt: input.at,
      updatedAt: input.at,
    }));
  return [...additions, ...input.existing];
}

export function resolveDailyControlAction(input: {
  action: DailyControlAction;
  resolution: string;
  userId: string;
  at: string;
}): DailyControlAction {
  const resolution = input.resolution.trim();
  if (resolution.length < 3 || resolution.length > 500)
    throw new Error('INVALID_DAILY_ACTION_RESOLUTION');
  if (input.action.status === 'resolved') return input.action;
  return {
    ...input.action,
    status: 'resolved',
    resolution,
    resolvedAt: input.at,
    resolvedBy: input.userId,
    syncStatus: 'pending',
    updatedAt: input.at,
  };
}

export function dailyControlPlanProgress(
  actions: DailyControlAction[],
  projectId: string,
  actionDate: string,
): {
  open: DailyControlAction[];
  resolved: DailyControlAction[];
  total: number;
  resolvedCount: number;
} {
  const selected = actions
    .filter(
      item =>
        item.projectId === projectId && item.actionDate === actionDate,
    )
    .sort(
      orderActions,
    );
  const open = selected.filter(item => item.status === 'open');
  const resolved = selected
    .filter(item => item.status === 'resolved')
    .sort((left, right) =>
      (right.resolvedAt ?? '').localeCompare(left.resolvedAt ?? ''),
    );
  return {
    open,
    resolved,
    total: selected.length,
    resolvedCount: resolved.length,
  };
}

export function morningControlBriefing(input: {
  actions: DailyControlAction[];
  waiting: ControlTowerItem[];
  projectId: string;
  today: string;
}): MorningControlBriefing {
  const todayValue = dateUtcValue(input.today);
  const projectActions = input.actions.filter(
    action => action.projectId === input.projectId,
  );
  const carriedOpen = projectActions
    .filter(
      action =>
        action.status === 'open' &&
        action.actionDate.localeCompare(input.today) < 0,
    )
    .map(action => ({
      action,
      ageDays: Math.max(
        1,
        Math.round(
          (todayValue - dateUtcValue(action.actionDate)) / millisecondsPerDay,
        ),
      ),
    }))
    .sort(
      (left, right) =>
        orderActions(left.action, right.action) ||
        right.ageDays - left.ageDays,
    );
  const todayOpen = projectActions
    .filter(
      action =>
        action.status === 'open' && action.actionDate === input.today,
    )
    .sort(orderActions);
  const resolvedToday = projectActions
    .filter(
      action =>
        action.status === 'resolved' &&
        (action.actionDate === input.today ||
          action.resolvedAt?.slice(0, 10) === input.today),
    )
    .sort((left, right) =>
      (right.resolvedAt ?? '').localeCompare(left.resolvedAt ?? ''),
    );
  const waiting = [...input.waiting].sort(
    (left, right) =>
      severityRank[right.severity] - severityRank[left.severity] ||
      left.id.localeCompare(right.id),
  );
  const openCount = carriedOpen.length + todayOpen.length;
  const handledCount = resolvedToday.length;
  return {
    carriedOpen,
    todayOpen,
    resolvedToday,
    waiting,
    openCount,
    handledCount,
    totalCount: openCount + handledCount,
  };
}
