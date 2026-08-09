import type { ProjectRfiStatus } from './types';
import { projectRfiReference } from './rfi';

export interface ProjectRfiReminderPlan {
  identifier: string;
  triggerAt: Date;
  title: string;
  body: string;
  data: {
    type: 'project_rfi_due';
    projectId: string;
    rfiId: string;
  };
}

export function projectRfiReminderIdentifier(rfiId: string): string {
  return `project-rfi-due-${rfiId}`;
}

export function buildProjectRfiReminderPlan(input: {
  id: string;
  projectId: string;
  rfiNumber: number;
  subject: string;
  recipientName: string;
  dueDate?: string;
  status: ProjectRfiStatus;
  now: Date;
  reminderHour?: number;
}): ProjectRfiReminderPlan | undefined {
  if (input.status !== 'open' || !input.dueDate) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.dueDate);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number);
  const triggerAt = new Date(
    year,
    month - 1,
    day,
    input.reminderHour ?? 9,
    0,
    0,
    0,
  );
  if (
    triggerAt.getFullYear() !== year ||
    triggerAt.getMonth() !== month - 1 ||
    triggerAt.getDate() !== day
  )
    return undefined;
  if (triggerAt.getTime() <= input.now.getTime())
    triggerAt.setTime(input.now.getTime() + 60_000);

  const reference = projectRfiReference(input.rfiNumber);
  return {
    identifier: projectRfiReminderIdentifier(input.id),
    triggerAt,
    title: `${reference} čaká na odpoveď`,
    body: `${input.subject} · zodpovedá ${input.recipientName}`,
    data: {
      type: 'project_rfi_due',
      projectId: input.projectId,
      rfiId: input.id,
    },
  };
}
