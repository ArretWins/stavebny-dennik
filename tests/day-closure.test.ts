import { describe, expect, it } from "vitest";
import {
  buildDayClosureSnapshot,
  canonicalDayClosureSnapshot,
  dayClosureStatus,
  summarizeDayClosure,
  validateDayClosureConfirmation,
} from "../src/domain/dayClosure";
import { localDateIso } from "../src/domain/ids";
import type { AppState } from "../src/domain/types";

const date = "2026-07-27";
const projectId = "project-1";

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

describe("day closure assistant", () => {
  it("uses the device calendar date instead of UTC around midnight", () => {
    expect(localDateIso(new Date(2026, 6, 27, 23, 55))).toBe("2026-07-27");
    expect(localDateIso(new Date(2026, 6, 28, 0, 5))).toBe("2026-07-28");
  });

  it("keeps evidence checks explicit without inventing site activity", () => {
    const result = summarizeDayClosure(state(), projectId, date);

    expect(result.completedCount).toBe(2);
    expect(result.ready).toBe(false);
    expect(result.draft).toEqual({
      logDate: date,
      workDescription: "",
      workerCount: 0,
      note: "",
    });
    expect(
      result.checks
        .filter((check) => !check.complete)
        .map((check) => check.key),
    ).toEqual(["diary", "workforce", "weather", "photos"]);
  });

  it("builds a reviewable draft from accepted work and unique check-ins", () => {
    const result = summarizeDayClosure(
      state({
        diaryEntries: [
          {
            id: "entry-1",
            ownerId: "owner-1",
            projectId,
            logDate: date,
            workDescription: "Pôvodný zápis",
            workerCount: 1,
            evidence: {
              capturedAt: `${date}T15:00:00Z`,
              attachmentIds: ["photo-1"],
              weather: {
                provider: "open-meteo",
                requestUrl: "https://weather.test",
                latitude: 48,
                longitude: 17,
                capturedAt: `${date}T08:00:00Z`,
                rawJson: {},
                status: "saved",
              },
            },
            syncStatus: "synced",
            createdAt: `${date}T15:00:00Z`,
            updatedAt: `${date}T15:00:00Z`,
          },
        ],
        workerCheckins: [
          {
            id: "check-1",
            projectId,
            workerName: "Ján Novák",
            checkedInAt: `${date}T07:00:00Z`,
          },
          {
            id: "check-2",
            projectId,
            workerName: "Ján Novák",
            checkedInAt: `${date}T08:00:00Z`,
          },
          {
            id: "check-3",
            projectId,
            workerName: "Peter Malý",
            checkedInAt: `${date}T07:10:00Z`,
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
            createdAt: `${date}T10:00:00Z`,
            uploadStatus: "synced",
          },
        ],
        siteTasks: [
          {
            id: "task-1",
            ownerId: "owner-1",
            projectId,
            title: "Montáž okien",
            kind: "task",
            status: "done",
            priority: "normal",
            completedAt: `${date}T14:00:00Z`,
            syncStatus: "synced",
            createdAt: `${date}T07:00:00Z`,
            updatedAt: `${date}T14:00:00Z`,
          },
        ],
      }),
      projectId,
      date,
    );

    expect(result.ready).toBe(true);
    expect(result.draft.workerCount).toBe(2);
    expect(result.draft.workDescription).toBe("Dokončené práce: Montáž okien.");
  });

  it("flags pending acceptance and incomplete receipts in the draft note", () => {
    const result = summarizeDayClosure(
      state({
        siteTasks: [
          {
            id: "task-review",
            ownerId: "owner-1",
            projectId,
            title: "Hydroizolácia",
            kind: "inspection",
            status: "review",
            priority: "high",
            submittedAt: `${date}T13:00:00Z`,
            syncStatus: "synced",
            createdAt: `${date}T08:00:00Z`,
            updatedAt: `${date}T13:00:00Z`,
          },
        ],
        receipts: [
          {
            id: "receipt-1",
            ownerId: "owner-1",
            projectId,
            currency: "EUR",
            status: "needs_review",
            ocrStatus: "needs_review",
            syncStatus: "synced",
            createdAt: `${date}T12:00:00Z`,
            updatedAt: `${date}T12:00:00Z`,
          },
        ],
        materialRequests: [
          {
            id: "request-1",
            ownerId: "owner-1",
            projectId,
            workerId: "worker-1",
            status: "new",
            createdAt: `${date}T09:00:00Z`,
            updatedAt: `${date}T09:00:00Z`,
          },
        ],
      }),
      projectId,
      date,
    );

    expect(result.ready).toBe(false);
    expect(
      result.checks.find((check) => check.key === "taskReviews")?.complete,
    ).toBe(false);
    expect(
      result.checks.find((check) => check.key === "receipts")?.complete,
    ).toBe(false);
    expect(result.draft.workDescription).toBe("");
    expect(result.draft.note).toContain("Na prevzatie: Hydroizolácia.");
    expect(result.draft.note).toContain("Nové žiadosti o materiál: 1.");
    expect(result.draft.note).toContain("Doklady na doplnenie: 1.");
  });

  it("creates a deterministic evidence snapshot independent of collection order", () => {
    const entry = {
      id: "entry-1",
      ownerId: "owner-1",
      projectId,
      logDate: date,
      workDescription: "  Montáž okien  ",
      workerCount: 2,
      workStartTime: "07:00",
      workEndTime: "15:30",
      workforceRoles: [{ role: "Montér", count: 2 }],
      technicalRecords: [
        {
          id: "technical-1",
          category: "test_measurement" as const,
          description: "Kontrolné meranie vyhovelo.",
        },
      ],
      evidence: {
        capturedAt: `${date}T15:00:00Z`,
        attachmentIds: ["photo-2", "photo-1"],
      },
      syncStatus: "synced" as const,
      createdAt: `${date}T15:00:00Z`,
      updatedAt: `${date}T15:00:00Z`,
    };
    const first = buildDayClosureSnapshot(
      state({
        diaryEntries: [entry],
        workerCheckins: [
          {
            id: "worker-b",
            projectId,
            workerName: "B",
            checkedInAt: `${date}T08:00:00Z`,
          },
          {
            id: "worker-a",
            projectId,
            workerName: "A",
            checkedInAt: `${date}T07:00:00Z`,
          },
        ],
      }),
      projectId,
      date,
    );
    const second = buildDayClosureSnapshot(
      state({
        diaryEntries: [entry],
        workerCheckins: [
          {
            id: "worker-a",
            projectId,
            workerName: "A",
            checkedInAt: `${date}T07:00:00Z`,
          },
          {
            id: "worker-b",
            projectId,
            workerName: "B",
            checkedInAt: `${date}T08:00:00Z`,
          },
        ],
      }),
      projectId,
      date,
    );

    expect(first.diaryEntries[0].workDescription).toBe("Montáž okien");
    expect(first.diaryEntries[0].attachmentIds).toEqual(["photo-1", "photo-2"]);
    expect(first.schemaVersion).toBe(2);
    expect(first.diaryEntries[0]).toMatchObject({
      workStartTime: "07:00",
      workEndTime: "15:30",
      workforceRoles: [{ role: "Montér", count: 2 }],
      technicalRecords: [{ category: "test_measurement" }],
    });
    expect(canonicalDayClosureSnapshot(first)).toBe(
      canonicalDayClosureSnapshot(second),
    );
  });

  it("only offers a new closure for diary entries not present in the latest seal", () => {
    const entry = {
      id: "entry-1",
      ownerId: "owner-1",
      projectId,
      logDate: date,
      workDescription: "Murivo",
      workerCount: 2,
      evidence: { capturedAt: `${date}T15:00:00Z`, attachmentIds: [] },
      syncStatus: "synced" as const,
      createdAt: `${date}T15:00:00Z`,
      updatedAt: `${date}T15:00:00Z`,
    };
    const snapshot = buildDayClosureSnapshot(
      state({ diaryEntries: [entry] }),
      projectId,
      date,
    );
    const closed = state({
      diaryEntries: [entry],
      dayClosures: [
        {
          id: "closure-1",
          ownerId: "owner-1",
          projectId,
          logDate: date,
          version: 1,
          snapshot,
          contentHash: "a".repeat(64),
          confirmationVersion: "sk-v1",
          acknowledgedWarnings: [],
          confirmedAt: `${date}T16:00:00Z`,
          confirmedBy: "owner-1",
          syncStatus: "synced",
          createdAt: `${date}T16:00:00Z`,
        },
      ],
    });

    expect(dayClosureStatus(closed, projectId, date).canConfirm).toBe(false);
    const withCorrection = {
      ...closed,
      diaryEntries: [
        ...closed.diaryEntries,
        {
          ...entry,
          id: "entry-2",
          correctionOfId: entry.id,
          correctionReason: "Doplnený počet pracovníkov",
          createdAt: `${date}T17:00:00Z`,
          updatedAt: `${date}T17:00:00Z`,
        },
      ],
    };
    const status = dayClosureStatus(withCorrection, projectId, date);
    expect(status.canConfirm).toBe(true);
    expect(status.correctionRequired).toBe(true);
    expect(status.unsealedEntryIds).toEqual(["entry-2"]);
  });

  it("requires explicit confirmation and a reason for every later version", () => {
    const summary = summarizeDayClosure(state(), projectId, date);
    expect(
      validateDayClosureConfirmation({
        summary,
        status: {
          canConfirm: true,
          correctionRequired: false,
          unsealedEntryIds: ["entry-1"],
        },
        confirmed: false,
      }),
    ).toBe("confirmation_required");
    expect(
      validateDayClosureConfirmation({
        summary,
        status: {
          canConfirm: true,
          correctionRequired: true,
          unsealedEntryIds: ["entry-2"],
        },
        confirmed: true,
        correctionReason: " ",
      }),
    ).toBe("correction_reason_required");
    expect(
      validateDayClosureConfirmation({
        summary,
        status: {
          canConfirm: true,
          correctionRequired: true,
          unsealedEntryIds: ["entry-2"],
        },
        confirmed: true,
        correctionReason: "Doplnené meranie",
      }),
    ).toBeUndefined();
  });
});
