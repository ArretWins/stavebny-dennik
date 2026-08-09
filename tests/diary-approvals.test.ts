import { describe, expect, it } from "vitest";
import {
  diaryApprovalEffectiveStatus,
  pendingDiaryApprovals,
} from "../src/domain/diaryApprovals";
import type { DiaryApprovalRequest } from "../src/domain/types";

function request(overrides: Partial<DiaryApprovalRequest> = {}): DiaryApprovalRequest {
  return {
    id: "approval-1",
    ownerId: "owner-1",
    projectId: "project-1",
    closureId: "closure-1",
    closureHash: "a".repeat(64),
    recipientName: "Ján Novák",
    reviewerRole: "technical_supervisor",
    status: "pending",
    expiresAt: "2026-08-09T12:00:00.000Z",
    viewCount: 0,
    createdAt: "2026-08-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("diary approvals", () => {
  it("distinguishes an expired link without rewriting its audit status", () => {
    const item = request();
    expect(
      diaryApprovalEffectiveStatus(item, new Date("2026-08-10T00:00:00Z")),
    ).toBe("expired");
    expect(item.status).toBe("pending");
  });

  it("returns only active pending approvals for the selected project", () => {
    expect(
      pendingDiaryApprovals(
        [
          request(),
          request({ id: "approved", status: "approved" }),
          request({ id: "other", projectId: "project-2" }),
        ],
        "project-1",
        new Date("2026-08-08T12:00:00Z"),
      ).map((item) => item.id),
    ).toEqual(["approval-1"]);
  });
});
