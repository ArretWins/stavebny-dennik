import type { Attachment } from "./types";

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

const EXIF_KEYS = [
  "DateTimeOriginal",
  "DateTimeDigitized",
  "DateTime",
  "Make",
  "Model",
  "Software",
  "PixelXDimension",
  "PixelYDimension",
  "Orientation",
] as const;

export function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function parseExifCapturedAt(
  exif: Record<string, unknown> | null | undefined,
): string | undefined {
  const raw =
    exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw !== "string") return undefined;
  const match = raw
    .trim()
    .match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function finiteCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max
    ? numeric
    : undefined;
}

export function exifCoordinates(
  exif: Record<string, unknown> | null | undefined,
): { latitude?: number; longitude?: number } {
  const latitude = finiteCoordinate(exif?.GPSLatitude, -90, 90);
  const longitude = finiteCoordinate(exif?.GPSLongitude, -180, 180);
  return { latitude, longitude };
}

export function safeExifMetadata(
  exif: Record<string, unknown> | null | undefined,
): Record<string, string | number> | undefined {
  if (!exif) return undefined;
  const entries = EXIF_KEYS.flatMap((key) => {
    const value = exif[key];
    return typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
      ? [[key, value] as const]
      : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function validatePhotoEvidence(
  attachment: Pick<
    Attachment,
    | "contentSha256"
    | "capturedAt"
    | "latitude"
    | "longitude"
    | "captureSource"
    | "sourceMetadata"
  >,
): string[] {
  const errors: string[] = [];
  if (
    attachment.contentSha256 &&
    !SHA256_HEX_PATTERN.test(attachment.contentSha256)
  )
    errors.push("invalid_sha256");
  if (attachment.capturedAt && Number.isNaN(Date.parse(attachment.capturedAt)))
    errors.push("invalid_captured_at");
  if (
    attachment.latitude !== undefined &&
    (!Number.isFinite(attachment.latitude) ||
      attachment.latitude < -90 ||
      attachment.latitude > 90)
  )
    errors.push("invalid_latitude");
  if (
    attachment.longitude !== undefined &&
    (!Number.isFinite(attachment.longitude) ||
      attachment.longitude < -180 ||
      attachment.longitude > 180)
  )
    errors.push("invalid_longitude");
  if (
    (attachment.latitude === undefined) !==
    (attachment.longitude === undefined)
  )
    errors.push("incomplete_coordinates");
  if (
    attachment.captureSource &&
    !["camera", "library", "worker_portal"].includes(attachment.captureSource)
  )
    errors.push("invalid_capture_source");
  if (
    attachment.sourceMetadata &&
    JSON.stringify(attachment.sourceMetadata).length > 4096
  )
    errors.push("metadata_too_large");
  return errors;
}
