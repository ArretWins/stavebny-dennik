import * as FileSystem from "expo-file-system";
import { base64ToArrayBuffer } from "@/domain/base64";

/** Reads an app-local file without routing file:// URIs through the network stack. */
export async function readLocalFile(
  uri: string,
  errorCode = "FILE_READ_FAILED",
): Promise<ArrayBuffer> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) throw new Error(errorCode);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64ToArrayBuffer(base64);
  } catch {
    throw new Error(errorCode);
  }
}
