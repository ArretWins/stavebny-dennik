import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activeSyncItems,
  syncErrorKind,
  syncItemCategory,
} from "../src/domain/syncCenter";
import type { OutboxItem } from "../src/domain/types";
import { shouldAttemptSync } from "../src/domain/network";

function item(status: OutboxItem["status"], id: string): OutboxItem {
  return {
    id,
    type: "receipt_file",
    localId: id,
    payload: {},
    status,
    attemptCount: 1,
    createdAt: `2026-08-01T10:00:0${id}Z`,
    updatedAt: `2026-08-01T10:00:0${id}Z`,
  };
}

describe("sync center", () => {
  it("groups every field workflow without exposing implementation details", () => {
    expect(syncItemCategory("diary_entry")).toBe("diary");
    expect(syncItemCategory("attachment")).toBe("photo");
    expect(syncItemCategory("receipt_ocr")).toBe("receipt");
    expect(syncItemCategory("material_request")).toBe("workforce");
    expect(syncItemCategory("work_shift_approve")).toBe("workforce");
    expect(syncItemCategory("worker_credential_revoke")).toBe("workforce");
    expect(syncItemCategory("material_quote_selection")).toBe("procurement");
    expect(syncItemCategory("material_delivery_review")).toBe("procurement");
    expect(syncItemCategory("material_stock_review")).toBe("procurement");
    expect(syncItemCategory("project_plan")).toBe("plan");
    expect(syncItemCategory("project_tool_issue")).toBe("tool");
    expect(syncItemCategory("project_checklist")).toBe("task");
    expect(syncItemCategory("safety_briefing_publish")).toBe("task");
    expect(syncItemCategory("project_budget")).toBe("project");
    expect(syncItemCategory("weekly_report")).toBe("report");
  });

  it("turns technical failures into actionable categories", () => {
    expect(syncErrorKind("TypeError: Network request failed")).toBe("offline");
    expect(syncErrorKind("JWT expired")).toBe("authentication");
    expect(syncErrorKind("DAY_CLOSURE_IMMUTABLE")).toBe("conflict");
    expect(syncErrorKind("Storage upload failed")).toBe("file");
    expect(syncErrorKind("ATTACHMENT_READ_FAILED")).toBe("file");
    expect(syncErrorKind("unknown")).toBe("server");
  });

  it("attempts a real sync when only the reachability probe is blocked", () => {
    expect(shouldAttemptSync({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(shouldAttemptSync({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(shouldAttemptSync({ isConnected: false, isInternetReachable: true })).toBe(false);
  });

  it("hides completed work and puts failed work first", () => {
    expect(
      activeSyncItems([
        item("pending", "2"),
        item("synced", "3"),
        item("failed", "1"),
      ]).map((value) => value.id),
    ).toEqual(["1", "2"]);
  });

  it("retries once after startup or network recovery and prevents overlap", () => {
    const app = readFileSync("src/state/app.tsx", "utf8");
    const automaticSync = readFileSync(
      "src/state/useAutomaticSync.ts",
      "utf8",
    );
    const today = readFileSync("src/screens/TodayScreen.tsx", "utf8");
    expect(app).toContain("useAutomaticSync({");
    expect(app).toContain("syncInFlightRef.current");
    expect(automaticSync).toContain("NetInfo.addEventListener");
    expect(automaticSync).toContain("NetInfo.fetch()");
    expect(automaticSync).toContain(
      "startupSyncUserRef.current === userId",
    );
    expect(today).toContain('navigation.navigate("SyncCenter")');
  });
});
