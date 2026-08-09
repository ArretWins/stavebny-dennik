import type {
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialStockMovement,
  MaterialStockMovementType,
} from "./types";

export interface MaterialStockRow {
  requestId: string;
  requestItemId: string;
  materialName: string;
  unit: string;
  deliveredQuantity: number;
  damagedQuantity: number;
  availableQuantity: number;
  usedQuantity: number;
  wasteQuantity: number;
  returnedQuantity: number;
  adjustedQuantity: number;
  balanceQuantity: number;
  health: "available" | "low" | "empty" | "negative";
}

export function materialStockMovementSign(
  type: MaterialStockMovementType,
): 1 | -1 {
  return type === "return" || type === "adjustment_in" ? 1 : -1;
}

export function validateMaterialStockMovement(input: {
  requestId: string;
  requestItemId: string;
  materialName: string;
  unit: string;
  movementType: MaterialStockMovementType;
  quantity: number;
  occurredAt: string;
  note?: string;
}): "ok" | "invalid" {
  if (
    !input.requestId.trim() ||
    !input.requestItemId.trim() ||
    input.materialName.trim().length < 2 ||
    !input.unit.trim() ||
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0 ||
    !Number.isFinite(Date.parse(input.occurredAt)) ||
    (input.note?.trim().length ?? 0) > 1000
  )
    return "invalid";
  return "ok";
}

export function calculateMaterialStock(
  projectId: string,
  deliveries: MaterialDelivery[],
  lines: MaterialDeliveryLine[],
  movements: MaterialStockMovement[],
): MaterialStockRow[] {
  const approvedDeliveryIds = new Set(
    deliveries
      .filter(
        (item) =>
          item.projectId === projectId &&
          (item.status === "accepted" || item.status === "resolved"),
      )
      .map((item) => item.id),
  );
  const rows = new Map<string, MaterialStockRow>();
  for (const line of lines) {
    if (
      line.projectId !== projectId ||
      !approvedDeliveryIds.has(line.deliveryId)
    )
      continue;
    const row = rows.get(line.requestItemId) ?? {
      requestId:
        deliveries.find((item) => item.id === line.deliveryId)?.requestId ?? "",
      requestItemId: line.requestItemId,
      materialName: line.itemName,
      unit: line.unit,
      deliveredQuantity: 0,
      damagedQuantity: 0,
      availableQuantity: 0,
      usedQuantity: 0,
      wasteQuantity: 0,
      returnedQuantity: 0,
      adjustedQuantity: 0,
      balanceQuantity: 0,
      health: "available" as const,
    };
    row.deliveredQuantity += line.deliveredQuantity;
    row.damagedQuantity += line.damagedQuantity;
    row.availableQuantity += line.deliveredQuantity - line.damagedQuantity;
    rows.set(line.requestItemId, row);
  }
  for (const movement of movements) {
    if (movement.projectId !== projectId || movement.status !== "confirmed")
      continue;
    const row = rows.get(movement.requestItemId);
    if (!row) continue;
    if (movement.movementType === "usage")
      row.usedQuantity += movement.quantity;
    if (movement.movementType === "waste")
      row.wasteQuantity += movement.quantity;
    if (movement.movementType === "return")
      row.returnedQuantity += movement.quantity;
    if (movement.movementType.startsWith("adjustment")) {
      row.adjustedQuantity +=
        materialStockMovementSign(movement.movementType) * movement.quantity;
    }
    row.balanceQuantity +=
      materialStockMovementSign(movement.movementType) * movement.quantity;
  }
  return [...rows.values()]
    .map((row) => {
      row.balanceQuantity += row.availableQuantity;
      const lowBoundary = Math.max(row.availableQuantity * 0.15, 0.000001);
      row.health =
        row.balanceQuantity < 0
          ? "negative"
          : row.balanceQuantity === 0
            ? "empty"
            : row.balanceQuantity <= lowBoundary
              ? "low"
              : "available";
      return row;
    })
    .sort((left, right) => left.materialName.localeCompare(right.materialName));
}
