import { describe, expect, it } from 'vitest';
import type { ProjectTool } from '../src/domain/types';
import {
  isProjectToolOverdue,
  nextProjectToolNumber,
  projectToolQrValue,
  projectToolReference,
  validateProjectTool,
} from '../src/domain/tools';

const tool: ProjectTool = {
  id: 'tool-1', ownerId: 'owner-1', projectId: 'project-1', assetNumber: 12,
  name: 'Laserový nivelák', category: 'Meracia technika', status: 'issued',
  currentWorkerId: 'worker-1', issuedAt: '2026-08-01T08:00:00.000Z',
  expectedReturnDate: '2026-08-02', syncStatus: 'synced',
  createdAt: '2026-08-01T07:00:00.000Z', updatedAt: '2026-08-01T08:00:00.000Z',
};

describe('project tools domain', () => {
  it('validates register fields and formats durable asset references', () => {
    expect(validateProjectTool(tool)).toBe('ok');
    expect(validateProjectTool({ ...tool, name: 'x' })).toBe('name');
    expect(projectToolReference(12)).toBe('TL-0012');
    expect(projectToolQrValue('tool 1')).toBe('stavebnydennik://tools/tool%201');
  });

  it('numbers assets per project and detects only overdue custody', () => {
    expect(nextProjectToolNumber([tool], 'project-1')).toBe(13);
    expect(nextProjectToolNumber([tool], 'project-2')).toBe(1);
    expect(isProjectToolOverdue(tool, '2026-08-03')).toBe(true);
    expect(isProjectToolOverdue({ ...tool, status: 'available' }, '2026-08-03'))
      .toBe(false);
  });
});
