import type {
  ChangeOrder,
  DelayEvent,
  MaterialRequest,
  ProjectSchedule,
  SiteTask,
} from './types';

export type ScheduleRisk = 'not_configured' | 'on_track' | 'watch' | 'high' | 'critical';
export type LookaheadTone =
  | 'ready'
  | 'blocked'
  | 'overdue'
  | 'material'
  | 'unassigned';

export interface LookaheadItem {
  id: string;
  kind: 'task' | 'material';
  title: string;
  date: string;
  tone: LookaheadTone;
  taskId?: string;
  requestId?: string;
}

export interface ScheduleForecast {
  contractualTargetDate?: string;
  forecastCompletionDate?: string;
  acceptedChangeDays: number;
  pendingChangeDays: number;
  confirmedDelayDays: number;
  pendingDelayDays: number;
  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  unassignedTaskCount: number;
  materialRiskCount: number;
  daysToForecast?: number;
  risk: ScheduleRisk;
  lookahead: LookaheadItem[];
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string): Date | undefined {
  if (!datePattern.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function validateProjectSchedule(input: {
  startDate: string;
  targetCompletionDate: string;
  note?: string;
}): 'ok' | 'start' | 'target' | 'range' | 'note' {
  if (!parseDate(input.startDate)) return 'start';
  if (!parseDate(input.targetCompletionDate)) return 'target';
  if (input.targetCompletionDate < input.startDate) return 'range';
  if ((input.note?.trim().length ?? 0) > 500) return 'note';
  return 'ok';
}

export function projectScheduleForecast(input: {
  projectId: string;
  today: string;
  schedule?: ProjectSchedule;
  tasks: SiteTask[];
  delays: DelayEvent[];
  materialRequests: MaterialRequest[];
  changeOrders: ChangeOrder[];
  materialRequestNames?: Record<string, string>;
}): ScheduleForecast {
  const tasks = input.tasks.filter(
    item => item.projectId === input.projectId && item.status !== 'done',
  );
  const changes = input.changeOrders.filter(
    item => item.projectId === input.projectId,
  );
  const delays = input.delays.filter(
    item => item.projectId === input.projectId,
  );
  const requests = input.materialRequests.filter(
    item =>
      item.projectId === input.projectId &&
      ['new', 'approved', 'partially_purchased'].includes(item.status),
  );
  const acceptedChangeDays = changes
    .filter(item => item.status === 'accepted')
    .reduce((total, item) => total + item.scheduleImpactDays, 0);
  const pendingChangeDays = changes
    .filter(item => item.status === 'pending_client')
    .reduce((total, item) => total + item.scheduleImpactDays, 0);
  const confirmedDelayDates = new Set(
    delays.filter(item => item.lockedAt).map(item => item.eventDate.slice(0, 10)),
  );
  const pendingDelayDates = new Set(
    delays.filter(item => !item.lockedAt).map(item => item.eventDate.slice(0, 10)),
  );
  const contractualTargetDate = input.schedule
    ? addDays(input.schedule.targetCompletionDate, acceptedChangeDays)
    : undefined;
  const forecastCompletionDate = contractualTargetDate
    ? addDays(contractualTargetDate, confirmedDelayDates.size)
    : undefined;
  const horizon = addDays(input.today, 14);
  const overdueTasks = tasks.filter(
    item => !!item.dueDate && item.dueDate < input.today,
  );
  const blockedTasks = tasks.filter(item => item.status === 'blocked');
  const unassignedTasks = tasks.filter(
    item =>
      !item.assignedWorkerId &&
      (!item.dueDate || item.dueDate <= horizon),
  );
  const materialRisks = requests.filter(
    item => !item.desiredDate || item.desiredDate <= horizon,
  );
  const taskItems: LookaheadItem[] = tasks
    .filter(
      item =>
        item.status === 'blocked' ||
        (!!item.dueDate && item.dueDate <= horizon),
    )
    .map(item => ({
      id: `task:${item.id}`,
      kind: 'task',
      title: item.title,
      date: item.dueDate ?? input.today,
      tone:
        item.dueDate && item.dueDate < input.today
          ? 'overdue'
          : item.status === 'blocked'
            ? 'blocked'
            : !item.assignedWorkerId
              ? 'unassigned'
              : 'ready',
      taskId: item.id,
    }));
  const materialItems: LookaheadItem[] = materialRisks.map(item => ({
    id: `material:${item.id}`,
    kind: 'material',
    title:
      input.materialRequestNames?.[item.id] ??
      item.comment ??
      'Materiálová požiadavka',
    date: item.desiredDate ?? input.today,
    tone: 'material',
    requestId: item.id,
  }));
  const lookahead = [...taskItems, ...materialItems].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
  );
  const daysToForecast = forecastCompletionDate
    ? dayDifference(input.today, forecastCompletionDate)
    : undefined;
  const risk: ScheduleRisk = !input.schedule
    ? 'not_configured'
    : (daysToForecast !== undefined && daysToForecast < 0 && tasks.length > 0) ||
        overdueTasks.length >= 3
      ? 'critical'
      : overdueTasks.length > 0 ||
          blockedTasks.length > 0 ||
          requests.some(
            item => !!item.desiredDate && item.desiredDate < input.today,
          )
        ? 'high'
        : unassignedTasks.length > 0 ||
            pendingDelayDates.size > 0 ||
            pendingChangeDays !== 0 ||
            (daysToForecast !== undefined &&
              daysToForecast <= 14 &&
              tasks.length > 0)
          ? 'watch'
          : 'on_track';
  return {
    contractualTargetDate,
    forecastCompletionDate,
    acceptedChangeDays,
    pendingChangeDays,
    confirmedDelayDays: confirmedDelayDates.size,
    pendingDelayDays: pendingDelayDates.size,
    openTaskCount: tasks.length,
    overdueTaskCount: overdueTasks.length,
    blockedTaskCount: blockedTasks.length,
    unassignedTaskCount: unassignedTasks.length,
    materialRiskCount: materialRisks.length,
    daysToForecast,
    risk,
    lookahead,
  };
}

