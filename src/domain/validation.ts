export const MAX_WORK_DESCRIPTION = 500;
export const MAX_NOTE = 300;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function validateLength(value: string, max: number): boolean { return value.length <= max; }

export interface DiaryInput { workDescription: string; workerCount: number; note: string; }
export interface DelayInput { reason?: string; note: string; }

export function validateDiaryInput(input: DiaryInput): string[] {
  const errors: string[] = [];
  if (!input.workDescription.trim()) errors.push('workRequired');
  if (!validateLength(input.workDescription, MAX_WORK_DESCRIPTION)) errors.push('workTooLong');
  if (input.workerCount < 0 || input.workerCount > 999) errors.push('workerCountInvalid');
  if (!validateLength(input.note, MAX_NOTE)) errors.push('noteTooLong');
  return errors;
}

export function validateDelayInput(input: DelayInput): string[] {
  const errors: string[] = [];
  if (!input.reason) errors.push('reasonRequired');
  if (!validateLength(input.note, MAX_NOTE)) errors.push('noteTooLong');
  return errors;
}

export function validateAttachment(file: { size?: number; mimeType?: string }): 'ok' | 'too_large' | 'unsupported' {
  if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE) return 'too_large';
  if (file.mimeType && !file.mimeType.startsWith('image/')) return 'unsupported';
  return 'ok';
}
