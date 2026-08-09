import type { AppState } from './types';

export type DailyDiaryDraftSourceKey =
  | 'completedTasks'
  | 'reviewTasks'
  | 'workers'
  | 'photos'
  | 'materialRequests'
  | 'receipts'
  | 'blockedTasks';

export interface DailyDiaryDraftSource {
  key: DailyDiaryDraftSourceKey;
  count: number;
  itemIds: string[];
}

export interface DailyDiaryDraft {
  logDate: string;
  workDescription: string;
  workerCount: number;
  note: string;
  sources: DailyDiaryDraftSource[];
  evidenceCount: number;
  needsWorkDescription: boolean;
}

function onDate(value: string | undefined, date: string): boolean {
  return Boolean(value?.startsWith(date));
}

function bounded(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const shortened = normalized.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = shortened.lastIndexOf(' ');
  const end =
    lastSpace > maxLength * 0.7 ? shortened.slice(0, lastSpace) : shortened;
  return `${end.trim()}…`;
}

function uniqueTitles(items: Array<{ title: string }>): string[] {
  return [
    ...new Set(items.map((item) => item.title.trim()).filter(Boolean)),
  ];
}

export function buildDailyDiaryDraft(
  state: AppState,
  projectId: string,
  date: string,
): DailyDiaryDraft {
  const projectTasks = state.siteTasks.filter(
    (task) => task.projectId === projectId,
  );
  const completedTasks = projectTasks.filter(
    (task) => task.status === 'done' && onDate(task.completedAt, date),
  );
  const reviewTasks = projectTasks.filter(
    (task) => task.status === 'review' && onDate(task.submittedAt, date),
  );
  const blockedTasks = projectTasks.filter(
    (task) => task.status === 'blocked' && onDate(task.updatedAt, date),
  );
  const checkins = state.workerCheckins.filter(
    (item) => item.projectId === projectId && onDate(item.checkedInAt, date),
  );
  const workerNames = new Set(
    checkins.map((item) => item.workerName.trim()).filter(Boolean),
  );
  const photos = state.attachments.filter(
    (item) =>
      item.projectId === projectId &&
      item.mimeType.startsWith('image/') &&
      onDate(item.createdAt, date),
  );
  const materialRequests = state.materialRequests.filter(
    (request) =>
      request.projectId === projectId && onDate(request.createdAt, date),
  );
  const requestIds = new Set(materialRequests.map((request) => request.id));
  const materialNames = [
    ...new Set(
      state.materialRequestItems
        .filter((item) => requestIds.has(item.requestId))
        .map((item) => item.name.trim())
        .filter(Boolean),
    ),
  ];
  const receipts = state.receipts.filter(
    (receipt) =>
      receipt.projectId === projectId &&
      (receipt.purchaseDate === date || onDate(receipt.createdAt, date)),
  );
  const readyReceipts = receipts.filter(
    (receipt) => receipt.status === 'ready',
  );
  const incompleteReceipts = receipts.filter(
    (receipt) => receipt.status !== 'ready',
  );
  const verifiedSpendCents = readyReceipts.reduce(
    (sum, receipt) => sum + (receipt.totalAmountCents ?? 0),
    0,
  );

  const completedTitles = uniqueTitles(completedTasks);
  const reviewTitles = uniqueTitles(reviewTasks);
  const blockedTitles = uniqueTitles(blockedTasks);
  const workDescription = completedTitles.length
    ? bounded(`Dokončené práce: ${completedTitles.join('; ')}.`, 500)
    : '';
  const notes: string[] = [];
  if (reviewTitles.length)
    notes.push(`Na prevzatie: ${reviewTitles.join('; ')}.`);
  if (blockedTitles.length)
    notes.push(`Blokované práce: ${blockedTitles.join('; ')}.`);
  if (materialRequests.length) {
    const materialDetail = materialNames.length
      ? ` (${materialNames.join(', ')})`
      : '';
    notes.push(
      `Nové žiadosti o materiál: ${materialRequests.length}${materialDetail}.`,
    );
  }
  if (readyReceipts.length) {
    const amount = (verifiedSpendCents / 100).toLocaleString('sk-SK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    notes.push(`Potvrdené doklady: ${readyReceipts.length} · ${amount} €.`);
  }
  if (incompleteReceipts.length)
    notes.push(`Doklady na doplnenie: ${incompleteReceipts.length}.`);
  if (photos.length) notes.push(`Fotodokumentácia: ${photos.length}.`);

  const sources: DailyDiaryDraftSource[] = [
    {
      key: 'completedTasks',
      count: completedTasks.length,
      itemIds: completedTasks.map((item) => item.id).sort(),
    },
    {
      key: 'reviewTasks',
      count: reviewTasks.length,
      itemIds: reviewTasks.map((item) => item.id).sort(),
    },
    {
      key: 'workers',
      count: workerNames.size,
      itemIds: checkins.map((item) => item.id).sort(),
    },
    {
      key: 'photos',
      count: photos.length,
      itemIds: photos.map((item) => item.id).sort(),
    },
    {
      key: 'materialRequests',
      count: materialRequests.length,
      itemIds: materialRequests.map((item) => item.id).sort(),
    },
    {
      key: 'receipts',
      count: receipts.length,
      itemIds: receipts.map((item) => item.id).sort(),
    },
    {
      key: 'blockedTasks',
      count: blockedTasks.length,
      itemIds: blockedTasks.map((item) => item.id).sort(),
    },
  ];

  return {
    logDate: date,
    workDescription,
    workerCount: workerNames.size,
    note: bounded(notes.join(' '), 300),
    sources,
    evidenceCount: sources.reduce((sum, source) => sum + source.count, 0),
    needsWorkDescription: workDescription.length === 0,
  };
}
