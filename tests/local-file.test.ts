import { describe, expect, it } from "vitest";
import { base64ToArrayBuffer } from "../src/domain/base64";

describe("local file reader", () => {
  it("decodes bytes without using fetch for a file URI", () => {
    expect(Array.from(new Uint8Array(base64ToArrayBuffer("AAEC/f7/")))).toEqual([
      0, 1, 2, 253, 254, 255,
    ]);
  });
});
