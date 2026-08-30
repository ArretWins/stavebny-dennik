import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import type { Attachment } from "@/domain/types";
import { createId, nowIso } from "@/domain/ids";
import { validateAttachment } from "@/domain/validation";
import { supabase } from "./supabase";
import { compressPilotImage } from "./imageCompression";
import { launchPhotoCamera } from "./cameraLauncher";
import { readLocalFile } from "./localFile";
import {
  bytesToHex,
  exifCoordinates,
  parseExifCapturedAt,
  safeExifMetadata,
} from "@/domain/photoEvidence";

export type PhotoSource = "library" | "camera";

export async function pickPhoto(
  ownerId: string,
  projectId: string,
  entityType: Attachment["relatedEntityType"],
  source: PhotoSource,
  entityId?: string,
  evidenceRole: Attachment["evidenceRole"] = "general",
): Promise<Attachment | undefined> {
  const result =
    source === "camera"
      ? await launchPhotoCamera({
          mediaTypes: ["images"],
          quality: 0.8,
          exif: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
          allowsMultipleSelection: false,
          selectionLimit: 1,
          exif: true,
        });
  if (result.canceled || !result.assets[0]) return undefined;
  const asset = result.assets[0];
  const compressed = await compressPilotImage(asset.uri);
  const validation = validateAttachment({
    size: compressed.fileSize,
    mimeType: compressed.mimeType,
  });
  if (validation !== "ok")
    throw new Error(
      validation === "too_large" ? "FILE_TOO_LARGE" : "FILE_UNSUPPORTED",
    );
  if (!FileSystem.documentDirectory)
    throw new Error("ATTACHMENT_STORAGE_UNAVAILABLE");
  const id = createId("attachment");
  const directory = `${FileSystem.documentDirectory}attachments`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const localUri = `${directory}/${id}.jpg`;
  await FileSystem.copyAsync({ from: compressed.uri, to: localUri });
  const storedBytes = await readLocalFile(localUri, "ATTACHMENT_READ_FAILED");
  const contentSha256 = bytesToHex(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, storedBytes),
  );
  const coordinates = exifCoordinates(asset.exif);
  const createdAt = nowIso();
  return {
    id,
    ownerId,
    projectId,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    localUri,
    fileSize: compressed.fileSize,
    mimeType: compressed.mimeType,
    createdAt,
    uploadStatus: "pending",
    evidenceRole,
    captureSource: source,
    capturedAt:
      parseExifCapturedAt(asset.exif) ??
      (source === "camera" ? createdAt : undefined),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    contentSha256,
    integrityVersion: "sha256-v1",
    sourceFileName: asset.fileName ?? undefined,
    sourceMetadata: safeExifMetadata(asset.exif),
  };
}

export async function uploadPrivateAttachment(
  attachment: Attachment,
): Promise<Attachment> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const quota = await supabase.rpc("assert_upload_allowed", {
    p_kind: "attachment",
    p_bytes: attachment.fileSize,
    p_record_id: attachment.id,
  });
  if (quota.error) throw quota.error;
  const bytes = await readLocalFile(
    attachment.localUri,
    "ATTACHMENT_READ_FAILED",
  );
  const storagePath = `${attachment.ownerId}/${attachment.projectId}/${attachment.id}.jpg`;
  const upload = await supabase.storage
    .from("attachments")
    .upload(storagePath, bytes, {
      contentType: attachment.mimeType,
      upsert: false,
    });
  if (upload.error) {
    const existing = await supabase.storage
      .from("attachments")
      .download(storagePath);
    if (existing.error || !existing.data) throw upload.error;
    if (!attachment.contentSha256)
      throw new Error("ATTACHMENT_STORAGE_CONFLICT");
    const existingDigest = bytesToHex(
      await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        await existing.data.arrayBuffer(),
      ),
    );
    if (existingDigest !== attachment.contentSha256)
      throw new Error("ATTACHMENT_STORAGE_CONFLICT");
  }
  const { error } = await supabase.from("attachments").upsert({
    id: attachment.id,
    owner_id: attachment.ownerId,
    project_id: attachment.projectId,
    related_entity_type: attachment.relatedEntityType,
    related_entity_id: attachment.relatedEntityId ?? null,
    local_uri: attachment.localUri,
    storage_path: storagePath,
    file_size: attachment.fileSize,
    mime_type: attachment.mimeType,
    upload_status: "synced",
    evidence_role: attachment.evidenceRole ?? "general",
    capture_source: attachment.captureSource ?? null,
    captured_at: attachment.capturedAt ?? null,
    latitude: attachment.latitude ?? null,
    longitude: attachment.longitude ?? null,
    content_sha256: attachment.contentSha256 ?? null,
    integrity_version: attachment.integrityVersion ?? null,
    source_file_name: attachment.sourceFileName ?? null,
    source_metadata: attachment.sourceMetadata ?? {},
  });
  if (error) throw error;
  return { ...attachment, storagePath, uploadStatus: "synced" };
}

export async function signedAttachmentUrl(
  storagePath: string,
): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
