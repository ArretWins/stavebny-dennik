import { describe, expect, it } from "vitest";
import {
  diaryPdfHtml,
  delayPdfHtml,
  weeklyReportPdfHtml,
  type PdfAttachment,
} from "../src/domain/pdfTemplate";
import { countPdfPageObjects } from "../src/domain/pdfBinary";
import type { DelayEvent, DiaryEntry, Project } from "../src/domain/types";

const project: Project = {
  id: "p1",
  ownerId: "u1",
  name: "Stavba Žilina",
  location: "Žilina",
  status: "active",
  createdAt: "2026-07-13T10:00:00.000Z",
  updatedAt: "2026-07-13T10:00:00.000Z",
};
const evidence = {
  capturedAt: "2026-07-13T10:05:00.000Z",
  attachmentIds: ["a1"],
  gps: {
    latitude: 49.2231,
    longitude: 18.7394,
    capturedAt: "2026-07-13T10:05:00.000Z",
    status: "captured" as const,
  },
  weather: {
    provider: "open-meteo" as const,
    requestUrl: "https://api.open-meteo.test",
    latitude: 49.2231,
    longitude: 18.7394,
    capturedAt: "2026-07-13T10:05:00.000Z",
    rawJson: {},
    temperatureC: 18.5,
    precipitationMm: 1.2,
    windSpeedKmh: 14,
    status: "saved" as const,
  },
};
const attachment: PdfAttachment & { pdfUri: string } = {
  id: "a1",
  ownerId: "u1",
  projectId: "p1",
  relatedEntityType: "diary_entry",
  relatedEntityId: "e1",
  localUri: "file:///photo.jpg",
  pdfUri: "data:image/jpeg;base64,abc",
  fileSize: 3,
  mimeType: "image/jpeg",
  createdAt: "2026-07-13T10:05:00.000Z",
  uploadStatus: "pending",
  captureSource: "camera",
  capturedAt: "2026-07-13T10:04:30.000Z",
  latitude: 48.1486,
  longitude: 17.1077,
  contentSha256: "a".repeat(64),
  integrityVersion: "sha256-v1",
  contentDigest: "a".repeat(64),
  integrityStatus: "verified",
};

describe("PDF templates", () => {
  it("counts page objects without counting the Pages tree", () => {
    expect(
      countPdfPageObjects("/Type /Pages /Count 2 /Type /Page /Type  /Page"),
    ).toBe(2);
  });

  it("renders stored evidence, lock metadata, Slovak text, and inline photos in diary exports", () => {
    const entry: DiaryEntry = {
      id: "e1",
      ownerId: "u1",
      projectId: "p1",
      logDate: "2026-07-13",
      workDescription: "Montáž zábradlia",
      workerCount: 3,
      workStartTime: "07:00",
      workEndTime: "16:00",
      workforceRoles: [{ role: "Montér", count: 3 }],
      technicalRecords: [
        {
          id: "technical-1",
          category: "test_measurement",
          description: "Meranie pevnosti vyhovelo.",
          reference: "Protokol P-17",
        },
      ],
      evidence,
      lockedAt: "2026-07-13T11:00:00.000Z",
      lockedBy: "u1",
      syncStatus: "pending",
      createdAt: "2026-07-13T10:05:00.000Z",
      updatedAt: "2026-07-13T10:05:00.000Z",
    };
    const html = diaryPdfHtml(project, [entry], [attachment]);
    expect(html).toContain("Montáž zábradlia");
    expect(html).toContain("Open-Meteo");
    expect(html).toContain("1,2 mm");
    expect(html).toContain("data:image/jpeg;base64,abc");
    expect(html).toContain("Uzamknuté");
    expect(html).toContain("07:00–16:00");
    expect(html).toContain("Meranie pevnosti vyhovelo.");
    expect(html).toContain("Protokol P-17");
    expect(html).toContain("SHA-256");
    expect(html).toContain("48.14860, 17.10770");
    expect(html).toContain("overená pri exporte");
  });

  it("renders delay correction metadata and a linked photo", () => {
    const event: DelayEvent = {
      id: "e1",
      ownerId: "u1",
      projectId: "p1",
      eventDate: "2026-07-13T10:05:00.000Z",
      reason: "bad_weather",
      correctionOfId: "old-delay",
      evidence,
      syncStatus: "pending",
      createdAt: "2026-07-13T10:05:00.000Z",
      updatedAt: "2026-07-13T10:05:00.000Z",
    };
    const html = delayPdfHtml(project, event, "Zlé počasie", [
      { ...attachment, relatedEntityType: "delay_event" },
    ]);
    expect(html).toContain("Zlé počasie");
    expect(html).toContain("Oprava pôvodného záznamu");
    expect(html).toContain("data:image/jpeg;base64,abc");
  });

  it("includes attributable closed-day approvals in an offline diary PDF", () => {
    const html = diaryPdfHtml(project, [], [], {
      closures: [
        {
          id: "closure-1",
          ownerId: "u1",
          projectId: "p1",
          logDate: "2026-07-13",
          version: 2,
          snapshot: {
            schemaVersion: 2,
            projectId: "p1",
            logDate: "2026-07-13",
            diaryEntries: [],
            workerCheckinIds: [],
            attachmentIds: [],
            completedTaskIds: [],
            pendingTaskReviewIds: [],
            incompleteReceiptIds: [],
          },
          contentHash: "a".repeat(64),
          confirmationVersion: "sk-v1",
          acknowledgedWarnings: [],
          confirmedAt: "2026-07-13T18:00:00.000Z",
          confirmedBy: "u1",
          syncStatus: "synced",
          createdAt: "2026-07-13T18:00:00.000Z",
        },
      ],
      requests: [
        {
          id: "approval-1",
          ownerId: "u1",
          projectId: "p1",
          closureId: "closure-1",
          closureHash: "a".repeat(64),
          recipientName: "Ing. J\u00e1n Nov\u00e1k",
          reviewerRole: "technical_supervisor",
          status: "approved",
          expiresAt: "2026-07-20T18:00:00.000Z",
          viewCount: 2,
          decidedAt: "2026-07-14T08:00:00.000Z",
          decisionComment: "S\u00fahlas\u00edm.",
          confirmationVersion: "sk-v1",
          createdAt: "2026-07-13T18:05:00.000Z",
        },
      ],
    });
    expect(html).toContain("Schv\u00e1lenia uzavret\u00fdch dn\u00ed");
    expect(html).toContain("Ing. J\u00e1n Nov\u00e1k");
    expect(html).toContain("verzia 2");
    expect(html).toContain("S\u00fahlas\u00edm.");
    expect(html).toContain("a".repeat(64));
    expect(html).toContain("nie kvalifikovan\u00e9 elektronick\u00e9 podpisy");
  });

  it("renders a weekly snapshot and escapes foreman copy", () => {
    const html = weeklyReportPdfHtml({
      project,
      report: {
        id: "weekly-1",
        ownerId: project.ownerId,
        projectId: project.id,
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        summary: "Hotové <základy>",
        nextWeekPlan: "Nosné steny",
        snapshot: {
          generatedAt: "2026-08-02T10:00:00Z",
          completedTasks: [],
          diaryEntryCount: 3,
          workerDays: 12,
          verifiedSpendCents: 25000,
          acceptedChangeCents: 10000,
          openTaskCount: 4,
          blockedTaskCount: 1,
          overdueTaskCount: 0,
          materialRiskCount: 1,
          scheduleRisk: "watch",
          attachmentIds: [],
        },
        status: "published",
        publishedAt: "2026-08-02T10:00:00Z",
        syncStatus: "synced",
        createdAt: "2026-08-02T10:00:00Z",
        updatedAt: "2026-08-02T10:00:00Z",
      },
      attachments: [],
    });
    expect(html).toContain('class="scoreboard"');
    expect(html).toContain("250");
    expect(html).toContain("&lt;základy&gt;");
    expect(html).not.toContain("<základy>");
  });
});
