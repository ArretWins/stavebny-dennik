import type {
  Attachment,
  ChangeOrder,
  DiaryEntry,
  MaterialRequest,
  ProjectSchedule,
  Receipt,
  SiteTask,
  WeeklyReportSnapshot,
} from './types';
import { projectScheduleForecast } from './scheduleForecast';

const DAY_MS = 86_400_000;
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

export function weeklyPeriodForDate(value: string): {
  periodStart: string;
  periodEnd: string;
} {
  const date = parseDate(value);
  if (!date) throw new Error('INVALID_WEEKLY_REPORT_DATE');
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const periodStart = addDays(value, -mondayOffset);
  return { periodStart, periodEnd: addDays(periodStart, 6) };
}

export function shiftWeeklyPeriod(periodStart: string, weeks: number): {
  periodStart: string;
  periodEnd: string;
} {
  if (!parseDate(periodStart) || !Number.isInteger(weeks))
    throw new Error('INVALID_WEEKLY_REPORT_PERIOD');
  const nextStart = addDays(periodStart, weeks * 7);
  return { periodStart: nextStart, periodEnd: addDays(nextStart, 6) };
}

function datePart(value?: string): string | undefined {
  return value?.slice(0, 10);
}

function isInPeriod(value: string | undefined, start: string, end: string): boolean {
  const date = datePart(value);
  return Boolean(date && date >= start && date <= end);
}

export function validateWeeklyReport(input: {
  periodStart: string;
  periodEnd: string;
  summary: string;
  nextWeekPlan: string;
  clientNote?: string;
}): 'ok' | 'period' | 'summary' | 'plan' | 'note' {
  const start = parseDate(input.periodStart);
  const end = parseDate(input.periodEnd);
  if (
    !start ||
    !end ||
    end.getTime() - start.getTime() !== 6 * DAY_MS
  )
    return 'period';
  const summary = input.summary.trim();
  if (summary.length < 5 || summary.length > 1200) return 'summary';
  const plan = input.nextWeekPlan.trim();
  if (plan.length < 5 || plan.length > 1200) return 'plan';
  if ((input.clientNote?.trim().length ?? 0) > 800) return 'note';
  return 'ok';
}

export function buildWeeklyReportSnapshot(input: {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  today: string;
  tasks: SiteTask[];
  diaryEntries: DiaryEntry[];
  receipts: Receipt[];
  attachments: Attachment[];
  changeOrders: ChangeOrder[];
  delays: Parameters<typeof projectScheduleForecast>[0]['delays'];
  materialRequests: MaterialRequest[];
  schedule?: ProjectSchedule;
}): WeeklyReportSnapshot {
  const projectTasks = input.tasks.filter(task => task.projectId === input.projectId);
  const completedTasks = projectTasks
    .filter(
      task =>
        task.status === 'done' &&
        isInPeriod(task.completedAt, input.periodStart, input.periodEnd),
    )
    .sort(
      (left, right) =>
        String(left.completedAt).localeCompare(String(right.completedAt)) ||
        left.id.localeCompare(right.id),
    )
    .map(task => ({
      id: task.id,
      title: task.title,
      completedAt: task.completedAt!,
      attachmentIds: input.attachments
        .filter(
          attachment =>
            attachment.projectId === input.projectId &&
            attachment.relatedEntityId === task.id &&
            attachment.mimeType.startsWith('image/'),
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )
        .slice(0, 4)
        .map(attachment => attachment.id),
    }));
  const diaryEntries = input.diaryEntries.filter(
    entry =>
      entry.projectId === input.projectId &&
      isInPeriod(entry.logDate, input.periodStart, input.periodEnd),
  );
  const verifiedSpendCents = input.receipts
    .filter(
      receipt =>
        receipt.projectId === input.projectId &&
        receipt.status === 'ready' &&
        isInPeriod(receipt.purchaseDate, input.periodStart, input.periodEnd),
    )
    .reduce((total, receipt) => total + (receipt.totalAmountCents ?? 0), 0);
  const acceptedChangeCents = input.changeOrders
    .filter(
      item =>
        item.projectId === input.projectId &&
        item.status === 'accepted' &&
        isInPeriod(item.decidedAt, input.periodStart, input.periodEnd),
    )
    .reduce((total, item) => total + item.amountCents, 0);
  const forecast = projectScheduleForecast({
    projectId: input.projectId,
    today: input.today,
    schedule: input.schedule,
    tasks: projectTasks,
    delays: input.delays,
    materialRequests: input.materialRequests,
    changeOrders: input.changeOrders,
  });
  const attachmentIds = [...new Set(completedTasks.flatMap(task => task.attachmentIds))]
    .slice(0, 12);
  return {
    generatedAt: input.generatedAt,
    completedTasks,
    diaryEntryCount: diaryEntries.length,
    workerDays: diaryEntries.reduce(
      (total, entry) => total + Math.max(0, entry.workerCount),
      0,
    ),
    verifiedSpendCents,
    acceptedChangeCents,
    openTaskCount: forecast.openTaskCount,
    blockedTaskCount: forecast.blockedTaskCount,
    overdueTaskCount: forecast.overdueTaskCount,
    materialRiskCount: forecast.materialRiskCount,
    scheduleRisk: forecast.risk,
    forecastCompletionDate: forecast.forecastCompletionDate,
    attachmentIds,
  };
}
