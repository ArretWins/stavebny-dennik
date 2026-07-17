import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";

export const PILOT_IMAGE_MAX_WIDTH = 1800;
export const PILOT_IMAGE_QUALITY = 0.72;
export const PILOT_IMAGE_TARGET_BYTES = 2 * 1024 * 1024;

function imageWidth(uri: string): Promise<number> {
  return new Promise((resolve, reject) =>
    Image.getSize(uri, (width) => resolve(width), reject),
  );
}

export async function compressPilotImage(
  uri: string,
): Promise<{ uri: string; fileSize: number; mimeType: "image/jpeg" }> {
  const width = await imageWidth(uri).catch(() => PILOT_IMAGE_MAX_WIDTH);
  let currentWidth = Math.min(width, PILOT_IMAGE_MAX_WIDTH);
  let result = await ImageManipulator.manipulateAsync(
    uri,
    width > PILOT_IMAGE_MAX_WIDTH
      ? [{ resize: { width: PILOT_IMAGE_MAX_WIDTH } }]
      : [],
    { compress: PILOT_IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  let info = await FileSystem.getInfoAsync(result.uri, { size: true });
  if (
    info.exists &&
    typeof info.size === "number" &&
    info.size > PILOT_IMAGE_TARGET_BYTES
  ) {
    const nextWidth = Math.min(currentWidth, 1400);
    result = await ImageManipulator.manipulateAsync(
      result.uri,
      currentWidth > nextWidth ? [{ resize: { width: nextWidth } }] : [],
      { compress: 0.58, format: ImageManipulator.SaveFormat.JPEG },
    );
    currentWidth = nextWidth;
    info = await FileSystem.getInfoAsync(result.uri, { size: true });
  }
  if (
    info.exists &&
    typeof info.size === "number" &&
    info.size > PILOT_IMAGE_TARGET_BYTES
  ) {
    const nextWidth = Math.min(currentWidth, 1000);
    result = await ImageManipulator.manipulateAsync(
      result.uri,
      currentWidth > nextWidth ? [{ resize: { width: nextWidth } }] : [],
      { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG },
    );
    info = await FileSystem.getInfoAsync(result.uri, { size: true });
  }
  if (!info.exists || typeof info.size !== "number" || info.size <= 0)
    throw new Error("IMAGE_COMPRESSION_FAILED");
  return {
    uri: result.uri,
    fileSize: info.size,
    mimeType: "image/jpeg",
  };
}
