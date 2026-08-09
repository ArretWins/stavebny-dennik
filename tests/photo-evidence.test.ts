import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  exifCoordinates,
  parseExifCapturedAt,
  safeExifMetadata,
  validatePhotoEvidence,
} from "../src/domain/photoEvidence";

describe("photo evidence provenance", () => {
  it("normalizes an EXIF timestamp and coordinates", () => {
    const exif = {
      DateTimeOriginal: "2026:08:08 14:05:06",
      GPSLatitude: 48.1486,
      GPSLongitude: 17.1077,
      Make: "Evidence camera",
      Model: "A1",
      SecretComment: "must not be persisted",
    };
    const captured = new Date(parseExifCapturedAt(exif)!);
    expect([
      captured.getFullYear(),
      captured.getMonth() + 1,
      captured.getDate(),
      captured.getHours(),
      captured.getMinutes(),
      captured.getSeconds(),
    ]).toEqual([2026, 8, 8, 14, 5, 6]);
    expect(exifCoordinates(exif)).toEqual({
      latitude: 48.1486,
      longitude: 17.1077,
    });
    expect(safeExifMetadata(exif)).toEqual({
      DateTimeOriginal: "2026:08:08 14:05:06",
      Make: "Evidence camera",
      Model: "A1",
    });
  });

  it("renders digest bytes as canonical lowercase hex", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]).buffer)).toBe(
      "000f10ff",
    );
  });

  it("rejects incomplete or malformed evidence metadata", () => {
    expect(
      validatePhotoEvidence({
        contentSha256: "not-a-digest",
        capturedAt: "not-a-date",
        latitude: 48,
        captureSource: "camera",
      }),
    ).toEqual([
      "invalid_sha256",
      "invalid_captured_at",
      "incomplete_coordinates",
    ]);
  });

  it("accepts complete SHA-256 evidence metadata", () => {
    expect(
      validatePhotoEvidence({
        contentSha256: "a".repeat(64),
        capturedAt: "2026-08-08T14:05:06.000Z",
        latitude: 48.1486,
        longitude: 17.1077,
        captureSource: "worker_portal",
      }),
    ).toEqual([]);
  });
});
