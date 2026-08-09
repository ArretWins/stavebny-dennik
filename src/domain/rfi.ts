import type { ProjectRfi } from './types';

export type ProjectRfiValidation =
  | 'ok'
  | 'subject'
  | 'question'
  | 'recipient'
  | 'due_date'
  | 'pin';

export function validateProjectRfiInput(input: {
  subject: string;
  question: string;
  recipientName: string;
  dueDate?: string;
  planId?: string;
  pageNumber?: number;
  xRatio?: number;
  yRatio?: number;
}, today = new Date().toISOString().slice(0, 10)): ProjectRfiValidation {
  if (input.subject.trim().length < 3 || input.subject.trim().length > 160)
    return 'subject';
  if (input.question.trim().length < 10 || input.question.trim().length > 4000)
    return 'question';
  if (
    input.recipientName.trim().length < 2 ||
    input.recipientName.trim().length > 160
  )
    return 'recipient';
  if (
    input.dueDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || input.dueDate < today)
  )
    return 'due_date';
  const pin = [input.planId, input.pageNumber, input.xRatio, input.yRatio];
  if (
    pin.some(value => value !== undefined) &&
    (pin.some(value => value === undefined) ||
      !input.pageNumber || input.pageNumber < 1 ||
      input.xRatio! < 0 || input.xRatio! > 1 ||
      input.yRatio! < 0 || input.yRatio! > 1)
  )
    return 'pin';
  return 'ok';
}

export function projectRfiReference(number: number): string {
  return `RFI-${String(number).padStart(3, '0')}`;
}

export function nextProjectRfiNumber(rfis: ProjectRfi[], projectId: string): number {
  return rfis
    .filter(rfi => rfi.projectId === projectId)
    .reduce((maximum, rfi) => Math.max(maximum, rfi.rfiNumber), 0) + 1;
}

export function isProjectRfiOverdue(
  rfi: ProjectRfi,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return Boolean(
    rfi.dueDate &&
    rfi.dueDate < today &&
    (rfi.status === 'open' || rfi.status === 'draft'),
  );
}
