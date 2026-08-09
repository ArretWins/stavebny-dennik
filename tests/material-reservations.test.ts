import { describe, expect, it } from "vitest";
import {
  calculateTaskMaterialReadiness,
  validateTaskMaterialRequirements,
} from "../src/domain/materialReservations";
import type { MaterialStockRow } from "../src/domain/materialStock";
import type { SiteTask, TaskMaterialRequirement } from "../src/domain/types";

const task = (
  id: string,
  dueDate: string,
  status: SiteTask["status"] = "open",
): SiteTask => ({
  id,
  ownerId: "owner",
  projectId: "project",
  title: id,
  description: "",
  status,
  kind: "task",
  priority: "normal",
  dueDate,
  syncStatus: "synced",
  createdAt: dueDate,
  updatedAt: dueDate,
});
const requirement = (
  id: string,
  taskId: string,
  quantity: number,
): TaskMaterialRequirement => ({
  id,
  ownerId: "owner",
  projectId: "project",
  taskId,
  requestId: "request",
  requestItemId: "brick",
  materialName: "Tehla",
  unit: "ks",
  quantity,
  syncStatus: "synced",
  createdAt: "2026-08-08",
  updatedAt: "2026-08-08",
});
const stock: MaterialStockRow[] = [
  {
    requestId: "request",
    requestItemId: "brick",
    materialName: "Tehla",
    unit: "ks",
    deliveredQuantity: 10,
    damagedQuantity: 0,
    availableQuantity: 10,
    usedQuantity: 0,
    wasteQuantity: 0,
    returnedQuantity: 0,
    adjustedQuantity: 0,
    balanceQuantity: 10,
    health: "available",
  },
];

describe("task material readiness", () => {
  it("allocates finite stock to earlier tasks first", () => {
    const result = calculateTaskMaterialReadiness(
      [task("later", "2026-08-10"), task("earlier", "2026-08-09")],
      [requirement("a", "earlier", 7), requirement("b", "later", 6)],
      stock,
    );
    expect(result.map((item) => item.taskId)).toEqual(["earlier", "later"]);
    expect(result[0].ready).toBe(true);
    expect(result[1].allocations[0].shortageQuantity).toBe(3);
  });

  it("releases reservations of completed tasks", () => {
    const result = calculateTaskMaterialReadiness(
      [task("done", "2026-08-08", "done"), task("open", "2026-08-09")],
      [requirement("a", "done", 10), requirement("b", "open", 10)],
      stock,
    );
    expect(result).toHaveLength(1);
    expect(result[0].ready).toBe(true);
  });

  it("rejects duplicates and invalid quantities", () => {
    expect(
      validateTaskMaterialRequirements([{ requestItemId: "a", quantity: 1 }]),
    ).toBe("ok");
    expect(
      validateTaskMaterialRequirements([
        { requestItemId: "a", quantity: 1 },
        { requestItemId: "a", quantity: 2 },
      ]),
    ).toBe("invalid");
    expect(
      validateTaskMaterialRequirements([{ requestItemId: "a", quantity: 0 }]),
    ).toBe("invalid");
  });
});
