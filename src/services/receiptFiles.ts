import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { createId, nowIso } from "@/domain/ids";
import type { ReceiptFile } from "@/domain/types";
import type { PhotoSource } from "./attachments";
import { compressPilotImage } from "./imageCompression";
import { launchPhotoCamera } from "./cameraLauncher";

const MAX_RECEIPT_FILE_SIZE = 25 * 1024 * 1024;
const MAX_RECEIPT_PAGES = 20;

async function fileHash(uri: string): Promise<string | undefined> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64,
    );
  } catch {
    return undefined;
  }
}

async function makeReceiptFile(input: {
  ownerId: string;
  projectId: string;
  receiptId: string;
  uri: string;
  fileSize?: number;
  mimeType?: string;
  pageOrder: number;
}): Promise<ReceiptFile> {
  const fileSize = input.fileSize ?? 0;
  if (fileSize > MAX_RECEIPT_FILE_SIZE)
    throw new Error("RECEIPT_FILE_TOO_LARGE");
  const mimeType = input.mimeType ?? "image/jpeg";
  if (!mimeType.startsWith("image/") && mimeType !== "application/pdf")
    throw new Error("RECEIPT_FILE_UNSUPPORTED");
  return {
    id: createId("receipt-file"),
    receiptId: input.receiptId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    localUri: input.uri,
    fileSize,
    mimeType,
    pageOrder: input.pageOrder,
    sha256: await fileHash(input.uri),
    uploadStatus: "pending",
    createdAt: nowIso(),
  };
}

export async function pickReceiptPhotos(
  ownerId: string,
  projectId: string,
  receiptId: string,
  source: PhotoSource,
  startOrder = 0,
): Promise<ReceiptFile[]> {
  const result =
    source === "camera"
      ? await launchPhotoCamera({
          mediaTypes: ["images"],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
          allowsMultipleSelection: true,
          selectionLimit: Math.max(1, MAX_RECEIPT_PAGES - startOrder),
          orderedSelection: true,
        });
  if (result.canceled) return [];
  const files: ReceiptFile[] = [];
  for (const [index, asset] of result.assets
    .slice(0, MAX_RECEIPT_PAGES - startOrder)
    .entries()) {
    const compressed = await compressPilotImage(asset.uri);
    files.push(
      await makeReceiptFile({
        ownerId,
        projectId,
        receiptId,
        ...compressed,
        pageOrder: startOrder + index,
      }),
    );
  }
  return files;
}

export async function pickReceiptPdf(
  ownerId: string,
  projectId: string,
  receiptId: string,
  pageOrder = 0,
): Promise<ReceiptFile | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return undefined;
  const asset = result.assets[0];
  return makeReceiptFile({
    ownerId,
    projectId,
    receiptId,
    uri: asset.uri,
    fileSize: asset.size,
    mimeType: asset.mimeType ?? "application/pdf",
    pageOrder,
  });
}

export function reorderReceiptFiles(
  files: ReceiptFile[],
  from: number,
  to: number,
): ReceiptFile[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= files.length ||
    to >= files.length ||
    from === to
  )
    return files;
  const next = [...files];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((file, pageOrder) => ({ ...file, pageOrder }));
}
