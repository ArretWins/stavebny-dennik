import { describe, expect, it } from "vitest";
import {
  deliveryHasDiscrepancy,
  deliveryVariance,
  validateMaterialDelivery,
} from "../src/domain/materialDeliveries";
const base = {
  supplierName: "Stavmat",
  receiverName: "Ján Novák",
  deliveredAt: "2026-08-08T08:00:00Z",
};
const line = {
  requestItemId: "i1",
  itemName: "Cement",
  unit: "ks",
  expectedQuantity: 10,
  deliveredQuantity: 10,
  damagedQuantity: 0,
};
describe("material delivery", () => {
  it("validates attributable item reconciliation", () => {
    expect(validateMaterialDelivery(base, [line])).toBe("ok");
    expect(
      validateMaterialDelivery({ ...base, receiverName: "x" }, [line]),
    ).toBe("receiver");
    expect(
      validateMaterialDelivery(base, [{ ...line, damagedQuantity: 11 }]),
    ).toBe("quantity");
  });
  it("detects shortage, surplus and damage", () => {
    expect(deliveryHasDiscrepancy([line])).toBe(false);
    expect(deliveryHasDiscrepancy([{ ...line, deliveredQuantity: 9 }])).toBe(
      true,
    );
    expect(deliveryHasDiscrepancy([{ ...line, damagedQuantity: 1 }])).toBe(
      true,
    );
    expect(
      deliveryVariance({ ...line, deliveredQuantity: 12, damagedQuantity: 1 }),
    ).toBe(1);
  });
});
