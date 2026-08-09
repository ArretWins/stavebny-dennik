import type { MaterialDelivery, MaterialDeliveryLine } from "./types";
export type DeliveryInputLine = Pick<
  MaterialDeliveryLine,
  | "requestItemId"
  | "itemName"
  | "unit"
  | "expectedQuantity"
  | "deliveredQuantity"
  | "damagedQuantity"
>;
export function validateMaterialDelivery(
  input: Pick<
    MaterialDelivery,
    | "supplierName"
    | "receiverName"
    | "deliveredAt"
    | "deliveryNoteNumber"
    | "note"
  >,
  lines: DeliveryInputLine[],
): "ok" | "supplier" | "receiver" | "date" | "lines" | "quantity" | "length" {
  if (
    input.supplierName.trim().length < 2 ||
    input.supplierName.trim().length > 160
  )
    return "supplier";
  if (
    input.receiverName.trim().length < 2 ||
    input.receiverName.trim().length > 180
  )
    return "receiver";
  if (!Number.isFinite(Date.parse(input.deliveredAt))) return "date";
  if (!lines.length || lines.length > 100) return "lines";
  if (
    lines.some(
      (x) =>
        !x.requestItemId ||
        x.itemName.trim().length < 1 ||
        x.itemName.length > 160 ||
        x.unit.trim().length < 1 ||
        x.unit.length > 30 ||
        ![x.expectedQuantity, x.deliveredQuantity, x.damagedQuantity].every(
          Number.isFinite,
        ) ||
        x.expectedQuantity <= 0 ||
        x.deliveredQuantity < 0 ||
        x.damagedQuantity < 0 ||
        x.damagedQuantity > x.deliveredQuantity,
    )
  )
    return "quantity";
  if (
    (input.deliveryNoteNumber?.length ?? 0) > 100 ||
    (input.note?.length ?? 0) > 1000
  )
    return "length";
  return "ok";
}
export function deliveryHasDiscrepancy(lines: DeliveryInputLine[]): boolean {
  return lines.some(
    (x) =>
      Math.abs(x.deliveredQuantity - x.expectedQuantity) > 0.000001 ||
      x.damagedQuantity > 0,
  );
}
export function deliveryVariance(line: DeliveryInputLine): number {
  return line.deliveredQuantity - line.damagedQuantity - line.expectedQuantity;
}
