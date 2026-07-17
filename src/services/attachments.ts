import * as ImagePicker from "expo-image-picker";
import type { Attachment } from "@/domain/types";
import { createId, nowIso } from "@/domain/ids";
import { validateAttachment } from "@/domain/validation";
import { supabase } from "./supabase";
import { compressPilotImage } from "./imageCompression";

export type PhotoSource = "library" | "camera";

export async function pickPhoto(
  ownerId: string,
  projectId: string,
  entityType: Attachment["relatedEntityType"],
  source: PhotoSource,
  entityId?: string,
): Promise<Attachment | undefined> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("CAMERA_PERMISSION_DENIED");
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
          allowsMultipleSelection: false,
          selectionLimit: 1,
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
  return {
    id: createId("attachment"),
    ownerId,
    projectId,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    localUri: compressed.uri,
    fileSize: compressed.fileSize,
    mimeType: compressed.mimeType,
    createdAt: nowIso(),
    uploadStatus: "pending",
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
  const response = await fetch(attachment.localUri);
  if (!response.ok) throw new Error("ATTACHMENT_READ_FAILED");
  const bytes = await response.arrayBuffer();
  const storagePath = `${attachment.ownerId}/${attachment.projectId}/${attachment.id}.jpg`;
  const upload = await supabase.storage
    .from("attachments")
    .upload(storagePath, bytes, {
      contentType: attachment.mimeType,
      upsert: true,
    });
  if (upload.error) throw upload.error;
  const { error } = await supabase
    .from("attachments")
    .upsert({
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
