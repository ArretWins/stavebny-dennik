import { describe, expect, it } from 'vitest';
import {
  checklistSummary,
  defectsForFailedChecklist,
  checklistTemplate,
  checklistTemplates,
  createChecklistAnswers,
  validateChecklistCompletion,
} from '../src/domain/checklists';
import type { ChecklistAnswer } from '../src/domain/types';

describe('quality and safety checklists', () => {
  it('ships practical quality and safety templates with stable item keys', () => {
    expect(checklistTemplates).toHaveLength(5);
    expect(checklistTemplates.some(item => item.category === 'quality')).toBe(
      true,
    );
    expect(checklistTemplates.some(item => item.category === 'safety')).toBe(
      true,
    );
    expect(checklistTemplate('waterproofing')?.itemKeys).toContain('overlaps');
  });

  it('snapshots translated labels into a new checklist', () => {
    const template = checklistTemplate('hidden_works')!;
    const answers = createChecklistAnswers(template, key => `label:${key}`);
    expect(answers).toHaveLength(5);
    expect(answers[0]).toMatchObject({
      itemKey: 'dimensions',
      required: true,
      result: 'pending',
    });
    expect(answers[0].label).toContain('hidden_works.items.dimensions');
  });

  it('requires every answer and a note for failed controls', () => {
    const answers = createChecklistAnswers(
      checklistTemplate('concrete')!,
      key => key,
    );
    expect(validateChecklistCompletion(answers)).toBe('missing_answers');
    const answered: ChecklistAnswer[] = answers.map(answer => ({
      ...answer,
      result: 'pass',
    }));
    expect(validateChecklistCompletion(answered)).toBeUndefined();
    answered[1] = { ...answered[1], result: 'fail', note: '' };
    expect(validateChecklistCompletion(answered)).toBe('failed_note_required');
    answered[1] = { ...answered[1], note: 'Opraviť krytie výstuže.' };
    expect(validateChecklistCompletion(answered)).toBeUndefined();
  });

  it('summarizes outcomes for project dashboards', () => {
    expect(
      checklistSummary([
        { itemKey: '1', label: 'A', required: true, result: 'pass' },
        { itemKey: '2', label: 'B', required: true, result: 'fail', note: 'x' },
        { itemKey: '3', label: 'C', required: false, result: 'na' },
        { itemKey: '4', label: 'D', required: true, result: 'pending' },
      ]),
    ).toEqual({ pass: 1, fail: 1, na: 1, pending: 1 });
  });

  it('creates one deterministic high-priority defect for each failed item', () => {
    const defects = defectsForFailedChecklist(
      {
        id: 'check-1',
        ownerId: 'owner-1',
        projectId: 'project-1',
        templateKey: 'concrete',
        templateName: 'Betonáž',
        category: 'quality',
        inspectionDate: '2026-07-27',
        answers: [
          { itemKey: 'cover', label: 'Krytie výstuže', required: true, result: 'fail', note: 'Doplniť dištančné prvky.' },
          { itemKey: 'mix', label: 'Trieda betónu', required: true, result: 'pass' },
        ],
        status: 'completed',
        confirmedAt: '2026-07-27T10:00:00.000Z',
        confirmedBy: 'owner-1',
        syncStatus: 'pending',
        createdAt: '2026-07-27T10:00:00.000Z',
        updatedAt: '2026-07-27T10:00:00.000Z',
      },
      '2026-07-27T10:00:00.000Z',
    );
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({
      kind: 'defect',
      priority: 'high',
      sourceChecklistId: 'check-1',
      sourceChecklistItemKey: 'cover',
    });
    expect(
      defectsForFailedChecklist(
        {
          ...({
            id: 'check-1',
            ownerId: 'owner-1',
            projectId: 'project-1',
            templateKey: 'concrete',
            templateName: 'Betonáž',
            category: 'quality',
            inspectionDate: '2026-07-27',
            answers: [],
            syncStatus: 'pending',
            createdAt: '',
            updatedAt: '',
          } as const),
          status: 'draft',
        },
        '',
      ),
    ).toEqual([]);
  });
});
