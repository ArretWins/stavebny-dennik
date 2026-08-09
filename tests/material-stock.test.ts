import { describe, expect, it } from "vitest";
import {
  calculateMaterialStock,
  materialStockMovementSign,
  validateMaterialStockMovement,
} from "../src/domain/materialStock";
import type {
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialStockMovement,
} from "../src/domain/types";

const delivery = (status: MaterialDelivery["status"]): MaterialDelivery => ({
  id: "delivery-1",
  ownerId: "owner",
  projectId: "project",
  requestId: "request",
  supplierName: "Supplier",
  deliveredAt: "2026-08-08T10:00:00Z",
  receiverName: "Foreman",
  status,
  syncStatus: "synced",
  createdAt: "2026-08-08T10:00:00Z",
  updatedAt: "2026-08-08T10:00:00Z",
});
const line: MaterialDeliveryLine = {
  id: "line",
  ownerId: "owner",
  projectId: "project",
  deliveryId: "delivery-1",
  requestItemId: "item",
  itemName: "Cement",
  unit: "ks",
  expectedQuantity: 10,
  deliveredQuantity: 10,
  damagedQuantity: 1,
  createdAt: "2026-08-08T10:00:00Z",
};
const movement = (
  movementType: MaterialStockMovement["movementType"],
  quantity: number,
  status: MaterialStockMovement["status"] = "confirmed",
): MaterialStockMovement => ({
  id: `${movementType}-${quantity}`,
  ownerId: "owner",
  projectId: "project",
  requestId: "request",
  requestItemId: "item",
  materialName: "Cement",
  unit: "ks",
  movementType,
  quantity,
  occurredAt: "2026-08-08T11:00:00Z",
  status,
  syncStatus: "synced",
  createdAt: "2026-08-08T11:00:00Z",
});

describe("material stock ledger", () => {
  it("counts only reviewed deliveries and confirmed movements", () => {
    expect(
      calculateMaterialStock("project", [delivery("reported")], [line], []),
    ).toEqual([]);
    const [row] = calculateMaterialStock(
      "project",
      [delivery("accepted")],
      [line],
      [
        movement("usage", 6),
        movement("waste", 1),
        movement("return", 0.5),
        movement("usage", 99, "reported"),
      ],
    );
    expect(row).toMatchObject({
      availableQuantity: 9,
      usedQuantity: 6,
      wasteQuantity: 1,
      returnedQuantity: 0.5,
      balanceQuantity: 2.5,
      health: "available",
    });
  });

  it("flags low, empty and negative balances", () => {
    expect(
      calculateMaterialStock(
        "project",
        [delivery("accepted")],
        [line],
        [movement("usage", 8)],
      )[0].health,
    ).toBe("low");
    expect(
      calculateMaterialStock(
        "project",
        [delivery("accepted")],
        [line],
        [movement("usage", 9)],
      )[0].health,
    ).toBe("empty");
    expect(
      calculateMaterialStock(
        "project",
        [delivery("accepted")],
        [line],
        [movement("usage", 10)],
      )[0].health,
    ).toBe("negative");
  });

  it("validates immutable movement input and signs directions", () => {
    expect(materialStockMovementSign("return")).toBe(1);
    expect(materialStockMovementSign("waste")).toBe(-1);
    expect(
      validateMaterialStockMovement({
        requestId: "r",
        requestItemId: "i",
        materialName: "Cement",
        unit: "ks",
        movementType: "usage",
        quantity: 2,
        occurredAt: "2026-08-08T10:00:00Z",
      }),
    ).toBe("ok");
    expect(
      validateMaterialStockMovement({
        requestId: "r",
        requestItemId: "i",
        materialName: "Cement",
        unit: "ks",
        movementType: "usage",
        quantity: 0,
        occurredAt: "bad",
      }),
    ).toBe("invalid");
  });
});
