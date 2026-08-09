export interface DayClosureReminderPlan {
  identifier: string;
  triggerAt: Date;
  title: string;
  body: string;
  data: {
    type: 'day_closure_reminder';
    projectId: string;
    logDate: string;
  };
}

export interface DayClosureReminderInput {
  projectId: string;
  projectName: string;
  logDate: string;
  now: Date;
  isClosed: boolean;
  reminderHour?: number;
}

export function dayClosureReminderIdentifier(
  projectId: string,
  logDate: string,
): string {
  return `day-closure-${projectId}-${logDate}`;
}

export function buildDayClosureReminderPlan({
  projectId,
  projectName,
  logDate,
  now,
  isClosed,
  reminderHour = 18,
}: DayClosureReminderInput): DayClosureReminderPlan | undefined {
  if (isClosed) return undefined;
  const [year, month, day] = logDate.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  const triggerAt = new Date(year, month - 1, day, reminderHour, 0, 0, 0);
  if (triggerAt.getTime() <= now.getTime())
    triggerAt.setTime(now.getTime() + 60_000);

  return {
    identifier: dayClosureReminderIdentifier(projectId, logDate),
    triggerAt,
    title: 'Pracovný deň ešte nie je uzavretý',
    body: `${projectName}: skontrolujte podklady a potvrďte dnešný záznam.`,
    data: {
      type: 'day_closure_reminder',
      projectId,
      logDate,
    },
  };
}
