import { describe, expect, it } from "vitest";
import {
  enqueue,
  markFailed,
  pendingCount,
  processOutbox,
  summarizeOutbox,
} from "../src/domain/sync";

describe("offline outbox", () => {
  it("is idempotent for a local record", () => {
    const first = enqueue([], "diary_entry", "local-1", { value: 1 });
    const second = enqueue(first, "diary_entry", "local-1", { value: 1 });
    expect(second).toHaveLength(1);
  });

  it("updates the queued payload when an unlocked local record is edited", () => {
    const first = enqueue([], "diary_entry", "local-1", { value: 1 });
    const edited = enqueue(first, "diary_entry", "local-1", { value: 2 });
    expect(edited).toHaveLength(1);
    expect(edited[0].payload).toEqual({ value: 2 });
    expect(edited[0].status).toBe("pending");
  });

  it("queues a later update after the previous version was synced", () => {
    const first = enqueue([], "diary_entry", "local-1", { value: 1 }).map(
      (item) => ({ ...item, status: "synced" as const }),
    );
    const edited = enqueue(first, "diary_entry", "local-1", { value: 2 });
    expect(edited).toHaveLength(2);
    expect(edited[1].payload).toEqual({ value: 2 });
  });

  it("retries failures and marks the remote id without duplication", async () => {
    const initial = enqueue([], "delay_event", "local-2", { value: 2 });
    const failed = [markFailed(initial[0], "NETWORK")];
    const synced = await processOutbox(failed, async () => "remote-2");
    expect(synced[0].status).toBe("synced");
    expect(synced[0].remoteId).toBe("remote-2");
    expect(pendingCount(synced)).toBe(0);
  });

  it("recovers an item left syncing after the app was interrupted", async () => {
    const initial = enqueue([], "attachment", "local-3", { value: 3 }).map(
      (item) => ({ ...item, status: "syncing" as const }),
    );
    const synced = await processOutbox(initial, async () => "remote-3");
    expect(synced[0].status).toBe("synced");
    expect(synced[0].attemptCount).toBe(1);
    expect(pendingCount(synced)).toBe(0);
  });

  it("summarizes only active work for sync diagnostics", () => {
    const pending = enqueue([], "diary_entry", "local-4", {});
    const failed = markFailed(
      enqueue([], "attachment", "local-5", {})[0],
      "ATTACHMENT_READ_FAILED",
    );
    const synced = {
      ...enqueue([], "receipt", "local-6", {})[0],
      status: "synced" as const,
    };
    expect(summarizeOutbox([...pending, failed, synced])).toEqual({
      pendingCount: 2,
      failedCount: 1,
      firstError: "ATTACHMENT_READ_FAILED",
    });
  });
});
