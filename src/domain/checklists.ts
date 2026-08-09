import type {
  ChecklistAnswer,
  ChecklistCategory,
  ProjectChecklist,
  SiteTask,
} from './types';

export type ChecklistTemplateKey =
  | 'hidden_works'
  | 'concrete'
  | 'waterproofing'
  | 'electrical'
  | 'safety_briefing';

export interface ChecklistTemplateDefinition {
  key: ChecklistTemplateKey;
  category: ChecklistCategory;
  titleKey: string;
  descriptionKey: string;
  itemKeys: string[];
}

export const checklistTemplates: ChecklistTemplateDefinition[] = [
  {
    key: 'hidden_works',
    category: 'quality',
    titleKey: 'checklists.templates.hidden_works.title',
    descriptionKey: 'checklists.templates.hidden_works.description',
    itemKeys: ['dimensions', 'materials', 'photos', 'connections', 'approval'],
  },
  {
    key: 'concrete',
    category: 'quality',
    titleKey: 'checklists.templates.concrete.title',
    descriptionKey: 'checklists.templates.concrete.description',
    itemKeys: ['formwork', 'reinforcement', 'cover', 'mix', 'curing'],
  },
  {
    key: 'waterproofing',
    category: 'quality',
    titleKey: 'checklists.templates.waterproofing.title',
    descriptionKey: 'checklists.templates.waterproofing.description',
    itemKeys: ['substrate', 'primer', 'overlaps', 'details', 'protection'],
  },
  {
    key: 'electrical',
    category: 'quality',
    titleKey: 'checklists.templates.electrical.title',
    descriptionKey: 'checklists.templates.electrical.description',
    itemKeys: ['routing', 'protection', 'connections', 'labels', 'measurement'],
  },
  {
    key: 'safety_briefing',
    category: 'safety',
    titleKey: 'checklists.templates.safety_briefing.title',
    descriptionKey: 'checklists.templates.safety_briefing.description',
    itemKeys: ['risks', 'ppe', 'access', 'equipment', 'attendance'],
  },
];

export function checklistTemplate(
  key: string,
): ChecklistTemplateDefinition | undefined {
  return checklistTemplates.find(template => template.key === key);
}

export function createChecklistAnswers(
  template: ChecklistTemplateDefinition,
  translate: (key: string) => string,
): ChecklistAnswer[] {
  return template.itemKeys.map(itemKey => ({
    itemKey,
    label: translate(`checklists.templates.${template.key}.items.${itemKey}`),
    required: true,
    result: 'pending',
  }));
}

export type ChecklistCompletionError =
  | 'missing_answers'
  | 'failed_note_required'
  | undefined;

export function validateChecklistCompletion(
  answers: ChecklistAnswer[],
): ChecklistCompletionError {
  if (
    !answers.length ||
    answers.some(answer => answer.required && answer.result === 'pending')
  )
    return 'missing_answers';
  if (
    answers.some(
      answer =>
        answer.result === 'fail' && (answer.note?.trim().length ?? 0) < 3,
    )
  )
    return 'failed_note_required';
  return undefined;
}

export function checklistSummary(answers: ChecklistAnswer[]): {
  pass: number;
  fail: number;
  na: number;
  pending: number;
} {
  return answers.reduce(
    (summary, answer) => {
      summary[answer.result] += 1;
      return summary;
    },
    { pass: 0, fail: 0, na: 0, pending: 0 },
  );
}

function stableItemHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function checklistDefectId(
  checklistId: string,
  itemKey: string,
): string {
  return `checkdef_${checklistId}_${stableItemHash(itemKey)}`;
}

export function defectsForFailedChecklist(
  checklist: ProjectChecklist,
  at: string,
): SiteTask[] {
  if (checklist.status !== 'completed') return [];
  return checklist.answers
    .filter(answer => answer.result === 'fail')
    .map(answer => ({
      id: checklistDefectId(checklist.id, answer.itemKey),
      ownerId: checklist.ownerId,
      projectId: checklist.projectId,
      title: answer.label.trim().slice(0, 120),
      description: answer.note?.trim().slice(0, 1500) || undefined,
      kind: 'defect',
      status: 'open',
      priority: 'high',
      revisionCount: 0,
      clientVisible: false,
      sourceChecklistId: checklist.id,
      sourceChecklistItemKey: answer.itemKey,
      syncStatus: 'pending',
      createdAt: at,
      updatedAt: at,
    }));
}
