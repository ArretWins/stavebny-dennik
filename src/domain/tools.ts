import type { ProjectTool } from './types';

export type ProjectToolValidation =
  | 'ok'
  | 'name'
  | 'category'
  | 'manufacturer'
  | 'model'
  | 'serial_number'
  | 'note';

export function validateProjectTool(input: {
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  note?: string;
}): ProjectToolValidation {
  if (input.name.trim().length < 2 || input.name.trim().length > 160)
    return 'name';
  if (input.category.trim().length < 2 || input.category.trim().length > 80)
    return 'category';
  if (
    input.manufacturer &&
    (input.manufacturer.trim().length < 2 || input.manufacturer.trim().length > 100)
  )
    return 'manufacturer';
  if (input.model && input.model.trim().length > 100) return 'model';
  if (input.serialNumber && input.serialNumber.trim().length > 120)
    return 'serial_number';
  if (input.note && input.note.trim().length > 1000) return 'note';
  return 'ok';
}

export function nextProjectToolNumber(
  tools: ProjectTool[],
  projectId: string,
): number {
  return tools
    .filter(tool => tool.projectId === projectId)
    .reduce((maximum, tool) => Math.max(maximum, tool.assetNumber), 0) + 1;
}

export function projectToolReference(assetNumber: number): string {
  return `TL-${String(assetNumber).padStart(4, '0')}`;
}

export function isProjectToolOverdue(
  tool: ProjectTool,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return Boolean(
    tool.status === 'issued' &&
    tool.expectedReturnDate &&
    tool.expectedReturnDate < today,
  );
}

export function projectToolQrValue(toolId: string): string {
  return `stavebnydennik://tools/${encodeURIComponent(toolId)}`;
}
