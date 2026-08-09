import { describe, expect, it } from 'vitest';
import {
  isSupportedPlanMimeType,
  normalizePlanCoordinate,
  taskEvidenceRequirement,
  taskIsOverdue,
  taskStatusPatch,
  validateTaskInput,
} from '../src/domain/planTasks';
import type { SiteTask } from '../src/domain/types';

const task: SiteTask = {
  id: 'task-1',
  ownerId: 'owner-1',
  projectId: 'project-1',
  title: 'Opraviť škáru',
  kind: 'defect',
  status: 'open',
  priority: 'high',
  dueDate: '2026-07-20',
  syncStatus: 'pending',
  createdAt: '2026-07-19T10:00:00.000Z',
  updatedAt: '2026-07-19T10:00:00.000Z',
};

describe('plan coordinates', () => {
  it('clamps relative coordinates to the plan bounds', () => {
    expect(normalizePlanCoordinate(-0.2)).toBe(0);
    expect(normalizePlanCoordinate(0.42)).toBe(0.42);
    expect(normalizePlanCoordinate(1.7)).toBe(1);
    expect(normalizePlanCoordinate(Number.NaN)).toBe(0);
  });

  it('accepts only supported drawing formats', () => {
    expect(isSupportedPlanMimeType('application/pdf')).toBe(true);
    expect(isSupportedPlanMimeType('image/jpeg')).toBe(true);
    expect(isSupportedPlanMimeType('image/svg+xml')).toBe(false);
  });
});

describe('site task rules', () => {
  it('requires a concise task title', () => {
    expect(validateTaskInput({ title: '  ', description: '' })).toBe(
      'title_required',
    );
    expect(validateTaskInput({ title: 'A'.repeat(121), description: '' })).toBe(
      'title_too_long',
    );
    expect(
      validateTaskInput({ title: 'Kontrola hydroizolácie', description: '' }),
    ).toBe('ok');
  });

  it('sets and clears the completion timestamp with status', () => {
    const at = '2026-07-23T08:00:00.000Z';
    expect(taskStatusPatch('done', at)).toEqual({
      status: 'done',
      completedAt: at,
    });
    expect(taskStatusPatch('open', at)).toEqual({
      status: 'open',
      completedAt: undefined,
    });
  });

  it('marks only unfinished tasks past their due date as overdue', () => {
    expect(taskIsOverdue(task, '2026-07-23')).toBe(true);
    expect(taskIsOverdue({ ...task, status: 'done' }, '2026-07-23')).toBe(false);
    expect(taskIsOverdue({ ...task, dueDate: '2026-07-23' }, '2026-07-23')).toBe(
      false,
    );
  });

  it('requires before and after evidence for defects only', () => {
    expect(taskEvidenceRequirement({ kind: 'defect' }, 0, 0, 'save')).toBe(
      'before',
    );
    expect(taskEvidenceRequirement({ kind: 'defect' }, 1, 0, 'save')).toBe(
      undefined,
    );
    expect(
      taskEvidenceRequirement({ kind: 'defect' }, 1, 0, 'complete'),
    ).toBe('after');
    expect(
      taskEvidenceRequirement({ kind: 'defect' }, 1, 1, 'complete'),
    ).toBe(undefined);
    expect(taskEvidenceRequirement({ kind: 'task' }, 0, 0, 'complete')).toBe(
      undefined,
    );
  });
});
