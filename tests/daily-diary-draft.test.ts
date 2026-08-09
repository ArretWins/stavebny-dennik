import { describe, expect, it } from "vitest";
import { buildDailyDiaryDraft } from "../src/domain/dailyDiaryDraft";
import {
  buildDayClosureReminderPlan,
  dayClosureReminderIdentifier,
} from "../src/domain/dayClosureReminder";
import type { AppState } from "../src/domain/types";

const projectId = "project-1";
const date = "2026-07-29";

function state(overrides: Partial<AppState> = {}): AppState {
  return {
    projects: [],
    diaryEntries: [],
    dayClosures: [],
    diaryApprovalRequests: [],
    diaryApprovalEvents: [],
    delayEvents: [],
    workerCheckins: [],
    workShifts: [],
    workShiftEvents: [],
    safetyBriefings: [],
    workerCredentials: [],
    workerCredentialEvents: [],
    siteIncidents: [],
    siteIncidentEvents: [],
    safetyBriefingRecipients: [],
    safetyBriefingEvents: [],
    attachments: [],
    reports: [],
    receiptCategories: [],
    receipts: [],
    receiptFiles: [],
    receiptExports: [],
    workers: [],
    materialRequests: [],
    materialRequestItems: [],
    materialDeliveries: [],
    materialDeliveryLines: [],
    materialDeliveryEvents: [],
    materialStockMovements: [],
    materialStockMovementEvents: [],
    taskMaterialRequirements: [],
    taskToolRequirements: [],
    receiptRequestLinks: [],
    projectPlans: [],
    projectRfis: [],
    projectRfiEvents: [],
    projectTools: [],
    projectToolEvents: [],
    siteTasks: [],
    siteTaskEvents: [],
    projectChecklists: [],
    changeOrders: [],
    projectBudgets: [],
    projectSchedules: [],
    dailyControlActions: [],
    weeklyReports: [],
    notifications: [],
    outbox: [],
    ...overrides,
  };
}

describe("daily diary evidence draft", () => {
  it("summarizes verified sources without inventing performed work", () => {
    const draft = buildDailyDiaryDraft(
      state({
        workerCheckins: [
          {
            id: "check-1",
            projectId,
            workerName: "Ján Novák",
            checkedInAt: `${date}T07:00:00Z`,
          },
        ],
        attachments: [
          {
            id: "photo-1",
            ownerId: "owner-1",
            projectId,
            relatedEntityType: "diary_entry",
            localUri: "file:///photo.jpg",
            fileSize: 100,
            mimeType: "image/jpeg",
            uploadStatus: "synced",
            createdAt: `${date}T09:00:00Z`,
          },
        ],
      }),
      projectId,
      date,
    );

    expect(draft.workDescription).toBe("");
    expect(draft.needsWorkDescription).toBe(true);
    expect(draft.workerCount).toBe(1);
    expect(draft.note).toBe("Fotodokumentácia: 1.");
    expect(draft.evidenceCount).toBe(2);
  });

  it("builds a bounded reviewable draft from tasks, requests and receipts", () => {
    const draft = buildDailyDiaryDraft(
      state({
        siteTasks: [
          {
            id: "done-1",
            ownerId: "owner-1",
            projectId,
            title: "Montáž okien",
            kind: "task",
            status: "done",
            priority: "normal",
            completedAt: `${date}T14:00:00Z`,
            syncStatus: "synced",
            createdAt: `${date}T08:00:00Z`,
            updatedAt: `${date}T14:00:00Z`,
          },
          {
            id: "review-1",
            ownerId: "owner-1",
            projectId,
            title: "Hydroizolácia",
            kind: "inspection",
            status: "review",
            priority: "high",
            submittedAt: `${date}T15:00:00Z`,
            syncStatus: "synced",
            createdAt: `${date}T08:00:00Z`,
            updatedAt: `${date}T15:00:00Z`,
          },
        ],
        materialRequests: [
          {
            id: "request-1",
            ownerId: "owner-1",
            projectId,
            workerId: "worker-1",
            status: "new",
            createdAt: `${date}T10:00:00Z`,
            updatedAt: `${date}T10:00:00Z`,
          },
        ],
        materialRequestItems: [
          {
            id: "item-1",
            requestId: "request-1",
            name: "Cement",
            quantity: 10,
            unit: "ks",
            createdAt: `${date}T10:00:00Z`,
          },
        ],
        receipts: [
          {
            id: "receipt-1",
            ownerId: "owner-1",
            projectId,
            purchaseDate: date,
            seller: "Stavmat",
            totalAmountCents: 12550,
            currency: "EUR",
            status: "ready",
            ocrStatus: "completed",
            syncStatus: "synced",
            createdAt: `${date}T11:00:00Z`,
            updatedAt: `${date}T11:00:00Z`,
          },
        ],
      }),
      projectId,
      date,
    );

    expect(draft.workDescription).toBe("Dokončené práce: Montáž okien.");
    expect(draft.note).toContain("Na prevzatie: Hydroizolácia.");
    expect(draft.note).toContain("Nové žiadosti o materiál: 1 (Cement).");
    expect(draft.note).toContain("Potvrdené doklady: 1 · 125,50 €.");
    expect(draft.needsWorkDescription).toBe(false);
  });
});

describe("unclosed day reminder", () => {
  it("schedules the reminder for 18:00 before the cutoff", () => {
    const plan = buildDayClosureReminderPlan({
      projectId,
      projectName: "Rezidencia Javor",
      logDate: date,
      now: new Date(2026, 6, 29, 15, 30),
      isClosed: false,
    });

    expect(plan?.identifier).toBe(
      dayClosureReminderIdentifier(projectId, date),
    );
    expect(plan?.triggerAt.getHours()).toBe(18);
    expect(plan?.body).toContain("Rezidencia Javor");
  });

  it("schedules a near-term reminder after the cutoff and none after closure", () => {
    const now = new Date(2026, 6, 29, 19, 0);
    const plan = buildDayClosureReminderPlan({
      projectId,
      projectName: "Rezidencia Javor",
      logDate: date,
      now,
      isClosed: false,
    });
    expect(plan?.triggerAt.getTime()).toBe(now.getTime() + 60_000);
    expect(
      buildDayClosureReminderPlan({
        projectId,
        projectName: "Rezidencia Javor",
        logDate: date,
        now,
        isClosed: true,
      }),
    ).toBeUndefined();
  });
});
