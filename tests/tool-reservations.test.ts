import { describe, expect, it } from "vitest";
import {
  calculateTaskToolReadiness,
  validateTaskToolRequirements,
} from "../src/domain/toolReservations";
import type {
  ProjectTool,
  SiteTask,
  TaskToolRequirement,
} from "../src/domain/types";

const now = "2026-08-08T08:00:00.000Z";
const task = (id: string, dueDate: string, worker = "worker"): SiteTask => ({
  id,
  ownerId: "owner",
  projectId: "project",
  title: id,
  kind: "task",
  status: "open",
  priority: "normal",
  dueDate,
  assignedWorkerId: worker,
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
});
const tool: ProjectTool = {
  id: "tool",
  ownerId: "owner",
  projectId: "project",
  assetNumber: 7,
  name: "Mixer",
  category: "Machine",
  status: "available",
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
};
const requirement = (id: string, taskId: string): TaskToolRequirement => ({
  id,
  ownerId: "owner",
  projectId: "project",
  taskId,
  toolId: tool.id,
  assetNumber: tool.assetNumber,
  toolName: tool.name,
  category: tool.category,
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
});

describe("task tool reservations", () => {
  it("reserves one asset for the earlier task", () => {
    const result = calculateTaskToolReadiness(
      [task("later", "2026-08-10"), task("earlier", "2026-08-09")],
      [requirement("one", "earlier"), requirement("two", "later")],
      [tool],
    );
    expect(result[0].ready).toBe(true);
    expect(result[1].allocations[0]).toMatchObject({
      available: false,
      shortageReason: "reserved_elsewhere",
      reservedByTaskId: "earlier",
    });
  });
  it("accepts an issued tool only for the assigned worker", () => {
    const issued = {
      ...tool,
      status: "issued" as const,
      currentWorkerId: "worker",
    };
    expect(
      calculateTaskToolReadiness(
        [task("mine", "2026-08-09")],
        [requirement("one", "mine")],
        [issued],
      )[0].ready,
    ).toBe(true);
    expect(
      calculateTaskToolReadiness(
        [task("other", "2026-08-09", "other")],
        [requirement("two", "other")],
        [issued],
      )[0].allocations[0].shortageReason,
    ).toBe("wrong_worker");
  });
  it("rejects duplicate tool ids", () => {
    expect(validateTaskToolRequirements([{ toolId: "tool" }])).toBe("ok");
    expect(
      validateTaskToolRequirements([{ toolId: "tool" }, { toolId: "tool" }]),
    ).toBe("invalid");
  });
});
