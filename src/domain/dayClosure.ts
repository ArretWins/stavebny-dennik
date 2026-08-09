import type {
  AppState,
  DayClosureCheck,
  DayClosureRecord,
  DayClosureSnapshot,
} from "./types";
import { buildDailyDiaryDraft } from "./dailyDiaryDraft";

export type { DayClosureCheck } from "./types";

export interface DayClosureDraft {
  logDate: string;
  workDescription: string;
  workerCount: number;
  note: string;
}

export interface DayClosureSummary {
  checks: Array<{
    key: DayClosureCheck;
    complete: boolean;
    count: number;
  }>;
  completedCount: number;
  totalCount: number;
  ready: boolean;
  draft: DayClosureDraft;
}

export interface DayClosureStatus {
  latest?: DayClosureRecord;
  unsealedEntryIds: string[];
  canConfirm: boolean;
  correctionRequired: boolean;
}

function onDate(value: string | undefined, date: string): boolean {
  return Boolean(value?.startsWith(date));
}

function bounded(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > maxLength * 0.7 ? lastSpace : shortened.length).trim()}…`;
}

export function summarizeDayClosure(
  state: AppState,
  projectId: string,
  date: string,
): DayClosureSummary {
  const entries = state.diaryEntries.filter(
    (entry) => entry.projectId === projectId && entry.logDate === date,
  );
  const checkins = state.workerCheckins.filter(
    (item) => item.projectId === projectId && onDate(item.checkedInAt, date),
  );
  const photos = state.attachments.filter(
    (item) =>
      item.projectId === projectId &&
      item.mimeType.startsWith("image/") &&
      onDate(item.createdAt, date),
  );
  const tasks = state.siteTasks.filter((task) => task.projectId === projectId);
  const submittedTasks = tasks.filter(
    (task) => task.status === "review" && onDate(task.submittedAt, date),
  );
  const receiptsToReview = state.receipts.filter(
    (receipt) =>
      receipt.projectId === projectId &&
      receipt.status !== "ready" &&
      onDate(receipt.createdAt, date),
  );
  const workerNames = new Set(
    checkins.map((item) => item.workerName.trim()).filter(Boolean),
  );
  const recordedWorkerCount = Math.max(
    workerNames.size,
    ...entries.map((entry) => entry.workerCount),
    0,
  );
  const weatherCount = entries.filter(
    (entry) => entry.evidence.weather?.status === "saved",
  ).length;
  const checks: DayClosureSummary["checks"] = [
    { key: "diary", complete: entries.length > 0, count: entries.length },
    {
      key: "workforce",
      complete: recordedWorkerCount > 0,
      count: recordedWorkerCount,
    },
    { key: "weather", complete: weatherCount > 0, count: weatherCount },
    { key: "photos", complete: photos.length > 0, count: photos.length },
    {
      key: "taskReviews",
      complete: submittedTasks.length === 0,
      count: submittedTasks.length,
    },
    {
      key: "receipts",
      complete: receiptsToReview.length === 0,
      count: receiptsToReview.length,
    },
  ];
  const generatedDraft = buildDailyDiaryDraft(state, projectId, date);
  const existingWork = entries
    .map((entry) => entry.workDescription.trim())
    .filter(Boolean);
  const workDescription = bounded(
    generatedDraft.workDescription || existingWork.join(" "),
    500,
  );
  const completedCount = checks.filter((check) => check.complete).length;

  return {
    checks,
    completedCount,
    totalCount: checks.length,
    ready: completedCount === checks.length,
    draft: {
      logDate: date,
      workDescription,
      workerCount: recordedWorkerCount,
      note: generatedDraft.note,
    },
  };
}

export function buildDayClosureSnapshot(
  state: AppState,
  projectId: string,
  date: string,
): DayClosureSnapshot {
  const diaryEntries = state.diaryEntries
    .filter((entry) => entry.projectId === projectId && entry.logDate === date)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((entry) => ({
      id: entry.id,
      workDescription: entry.workDescription.trim(),
      workerCount: entry.workerCount,
      workStartTime: entry.workStartTime,
      workEndTime: entry.workEndTime,
      workforceRoles: (entry.workforceRoles ?? []).map((item) => ({ ...item })),
      technicalRecords: (entry.technicalRecords ?? []).map((item) => ({
        ...item,
      })),
      note: entry.note?.trim() || undefined,
      correctionOfId: entry.correctionOfId,
      correctionReason: entry.correctionReason?.trim() || undefined,
      capturedAt: entry.evidence.capturedAt,
      attachmentIds: [...entry.evidence.attachmentIds].sort(),
      weatherCapturedAt: entry.evidence.weather?.capturedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  const taskIds = (status: "done" | "review") =>
    state.siteTasks
      .filter(
        (task) =>
          task.projectId === projectId &&
          task.status === status &&
          onDate(status === "done" ? task.completedAt : task.submittedAt, date),
      )
      .map((task) => task.id)
      .sort();

  return {
    schemaVersion: 2,
    projectId,
    logDate: date,
    diaryEntries,
    workerCheckinIds: state.workerCheckins
      .filter(
        (item) =>
          item.projectId === projectId && onDate(item.checkedInAt, date),
      )
      .map((item) => item.id)
      .sort(),
    attachmentIds: state.attachments
      .filter(
        (item) => item.projectId === projectId && onDate(item.createdAt, date),
      )
      .map((item) => item.id)
      .sort(),
    completedTaskIds: taskIds("done"),
    pendingTaskReviewIds: taskIds("review"),
    incompleteReceiptIds: state.receipts
      .filter(
        (receipt) =>
          receipt.projectId === projectId &&
          receipt.status !== "ready" &&
          onDate(receipt.createdAt, date),
      )
      .map((receipt) => receipt.id)
      .sort(),
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

export function canonicalDayClosureSnapshot(
  snapshot: DayClosureSnapshot,
): string {
  return JSON.stringify(sortJson(snapshot));
}

export function dayClosureStatus(
  state: AppState,
  projectId: string,
  date: string,
): DayClosureStatus {
  const closures = state.dayClosures
    .filter((item) => item.projectId === projectId && item.logDate === date)
    .sort((a, b) => b.version - a.version);
  const latest = closures[0];
  const sealedIds = new Set(
    latest?.snapshot.diaryEntries.map((item) => item.id),
  );
  const unsealedEntryIds = state.diaryEntries
    .filter(
      (entry) =>
        entry.projectId === projectId &&
        entry.logDate === date &&
        !sealedIds.has(entry.id),
    )
    .map((entry) => entry.id);

  return {
    latest,
    unsealedEntryIds,
    canConfirm: unsealedEntryIds.length > 0,
    correctionRequired: Boolean(latest),
  };
}

export function validateDayClosureConfirmation(input: {
  summary: DayClosureSummary;
  status: DayClosureStatus;
  confirmed: boolean;
  correctionReason?: string;
}):
  | "diary_required"
  | "confirmation_required"
  | "correction_reason_required"
  | undefined {
  if (!input.status.canConfirm) return "diary_required";
  if (!input.confirmed) return "confirmation_required";
  if (
    input.status.correctionRequired &&
    (input.correctionReason?.trim().length ?? 0) < 3
  )
    return "correction_reason_required";
  return undefined;
}
