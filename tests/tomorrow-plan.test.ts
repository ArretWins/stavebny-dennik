import { describe, expect, it } from "vitest";
import {
  buildTomorrowPlan,
  nextPlanningDate,
} from "../src/domain/tomorrowPlan";
import type {
  ProjectWorker,
  ProjectTool,
  SiteTask,
  TaskMaterialRequirement,
  TaskToolRequirement,
  WorkerCredential,
} from "../src/domain/types";

const projectId = "project";
const now = "2026-08-08T08:00:00.000Z";
const task = (overrides: Partial<SiteTask> = {}): SiteTask => ({
  id: "task",
  ownerId: "owner",
  projectId,
  title: "Murivo",
  kind: "task",
  status: "open",
  priority: "high",
  dueDate: "2026-08-09",
  assignedWorkerId: "worker",
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
  ...overrides,
});
const worker: ProjectWorker = {
  id: "worker",
  ownerId: "owner",
  projectId,
  firstName: "Jan",
  lastName: "Novak",
  position: "Murar",
  status: "active",
  createdAt: now,
  updatedAt: now,
};
const credential: WorkerCredential = {
  id: "credential",
  ownerId: "owner",
  projectId,
  workerId: worker.id,
  credentialType: "bozp_training",
  title: "BOZP",
  expiresAt: "2027-01-01",
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
};
const requirement: TaskMaterialRequirement = {
  id: "requirement",
  ownerId: "owner",
  projectId,
  taskId: "task",
  requestId: "request",
  requestItemId: "item",
  materialName: "Cement",
  unit: "ks",
  quantity: 4,
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
};
const tool: ProjectTool = {
  id: "tool",
  ownerId: "owner",
  projectId,
  assetNumber: 3,
  name: "Mixer",
  category: "Machine",
  status: "available",
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
};
const toolRequirement: TaskToolRequirement = {
  id: "tool-requirement",
  ownerId: "owner",
  projectId,
  taskId: "task",
  toolId: tool.id,
  assetNumber: tool.assetNumber,
  toolName: tool.name,
  category: tool.category,
  syncStatus: "synced",
  createdAt: now,
  updatedAt: now,
};
const base = () => ({
  projectId,
  today: "2026-08-08",
  tasks: [task()],
  workers: [worker],
  credentials: [credential],
  requirements: [requirement],
  toolRequirements: [toolRequirement],
  stock: [
    {
      requestId: "request",
      requestItemId: "item",
      materialName: "Cement",
      unit: "ks",
      deliveredQuantity: 10,
      damagedQuantity: 0,
      availableQuantity: 10,
      usedQuantity: 0,
      wasteQuantity: 0,
      returnedQuantity: 0,
      adjustedQuantity: 0,
      balanceQuantity: 10,
      health: "available" as const,
    },
  ],
  tools: [tool],
  safetyBriefings: [
    {
      id: "briefing",
      ownerId: "owner",
      projectId,
      title: "Rano",
      body: "Poucenie",
      briefingDate: "2026-08-09",
      status: "published" as const,
      syncStatus: "synced" as const,
      createdAt: now,
      updatedAt: now,
    },
  ],
  safetyRecipients: [
    {
      id: "recipient",
      ownerId: "owner",
      projectId,
      briefingId: "briefing",
      workerId: "worker",
      workerName: "Jan Novak",
      position: "Murar",
      status: "pending" as const,
      contentHash: "hash",
      createdAt: now,
    },
  ],
});

describe("tomorrow plan", () => {
  it("advances dates across month boundaries", () =>
    expect(nextPlanningDate("2026-08-31")).toBe("2026-09-01"));
  it("marks a fully staffed, supplied and briefed task ready", () => {
    const result = buildTomorrowPlan(base());
    expect(result.tasks[0].readiness).toBe("ready");
    expect(result).toMatchObject({
      readyCount: 1,
      blockedCount: 0,
      plannedWorkerCount: 1,
      pendingBriefingAcknowledgementCount: 1,
    });
  });
  it("blocks a task with no worker and a material shortage", () => {
    const input = base();
    input.tasks = [task({ assignedWorkerId: undefined })];
    input.stock[0].balanceQuantity = 2;
    const result = buildTomorrowPlan(input);
    expect(result.tasks[0].risks).toEqual(
      expect.arrayContaining(["worker_missing", "materials_shortage"]),
    );
    expect(result.blockedCount).toBe(1);
  });
  it("keeps unscheduled backlog outside the dispatch list", () => {
    const input = base();
    input.tasks.push(
      task({ id: "backlog", dueDate: undefined, assignedWorkerId: undefined }),
    );
    const result = buildTomorrowPlan(input);
    expect(result.tasks.map((item) => item.task.id)).toEqual(["task"]);
    expect(result.unscheduledTaskCount).toBe(1);
  });
  it("leaves completed work awaiting foreman review outside the crew dispatch", () => {
    const input = base();
    input.tasks = [task({ status: "review" })];
    expect(buildTomorrowPlan(input).tasks).toHaveLength(0);
  });
});
