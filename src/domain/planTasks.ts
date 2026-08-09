import type { SiteTask, SiteTaskStatus } from './types';

export const MAX_PLAN_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_TASK_TITLE_LENGTH = 120;
export const MAX_TASK_DESCRIPTION_LENGTH = 1_500;

export function isSupportedPlanMimeType(
  mimeType: string,
): mimeType is 'application/pdf' | 'image/jpeg' | 'image/png' {
  return ['application/pdf', 'image/jpeg', 'image/png'].includes(mimeType);
}

export function normalizePlanCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function validateTaskInput(input: Pick<SiteTask, 'title' | 'description'>):
  | 'ok'
  | 'title_required'
  | 'title_too_long'
  | 'description_too_long' {
  if (!input.title.trim()) return 'title_required';
  if (input.title.trim().length > MAX_TASK_TITLE_LENGTH) return 'title_too_long';
  if ((input.description?.trim().length ?? 0) > MAX_TASK_DESCRIPTION_LENGTH)
    return 'description_too_long';
  return 'ok';
}

export function taskStatusPatch(
  status: SiteTaskStatus,
  at: string,
): Pick<SiteTask, 'status' | 'completedAt'> {
  return {
    status,
    completedAt: status === 'done' ? at : undefined,
  };
}

export function taskIsOverdue(task: SiteTask, today: string): boolean {
  return task.status !== 'done' && !!task.dueDate && task.dueDate < today;
}

export type TaskEvidenceRequirement = 'before' | 'after' | undefined;

export function taskEvidenceRequirement(
  task: Pick<SiteTask, 'kind'>,
  beforeCount: number,
  afterCount: number,
  action: 'save' | 'complete',
): TaskEvidenceRequirement {
  if (task.kind !== 'defect') return undefined;
  if (beforeCount < 1) return 'before';
  if (action === 'complete' && afterCount < 1) return 'after';
  return undefined;
}
