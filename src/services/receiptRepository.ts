import type { Receipt, ReceiptCategory, ReceiptFile } from "@/domain/types";
import { supabase } from "./supabase";
import { readLocalFileArrayBuffer } from "./localFile";

function receiptFromRow(row: Record<string, unknown>): Receipt {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    categoryId: row.category_id ? String(row.category_id) : undefined,
    purchaseDate: row.purchase_date ? String(row.purchase_date) : undefined,
    seller: row.seller ? String(row.seller) : undefined,
    totalAmountCents:
      row.total_amount_cents === null || row.total_amount_cents === undefined
        ? undefined
        : Number(row.total_amount_cents),
    currency: "EUR",
    note: row.note ? String(row.note) : undefined,
    status: row.status as Receipt["status"],
    ocrStatus: row.ocr_status as Receipt["ocrStatus"],
    ocrConfidence:
      row.ocr_confidence === null || row.ocr_confidence === undefined
        ? undefined
        : Number(row.ocr_confidence),
    ocrError: row.ocr_error ? String(row.ocr_error) : undefined,
    syncStatus: "synced",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function receiptFileFromRow(row: Record<string, unknown>): ReceiptFile {
  return {
    id: String(row.id),
    receiptId: String(row.receipt_id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    localUri: row.local_uri ? String(row.local_uri) : "",
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    fileSize: Number(row.file_size),
    mimeType: String(row.mime_type),
    pageOrder: Number(row.page_order),
    sha256: row.sha256 ? String(row.sha256) : undefined,
    perceptualHash: row.perceptual_hash
      ? String(row.perceptual_hash)
      : undefined,
    uploadStatus: "synced",
    createdAt: String(row.created_at),
  };
}

export async function upsertReceiptCategory(
  category: ReceiptCategory,
): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("expense_categories")
    .upsert(
      {
        id: category.id,
        owner_id: category.ownerId,
        name: category.name.trim(),
        is_default: category.isDefault,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function upsertReceipt(receipt: Receipt): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("receipts")
    .upsert(
      {
        id: receipt.id,
        owner_id: receipt.ownerId,
        project_id: receipt.projectId,
        category_id: receipt.categoryId ?? null,
        purchase_date: receipt.purchaseDate ?? null,
        seller: receipt.seller?.trim() || null,
        total_amount_cents: receipt.totalAmountCents ?? null,
        currency: receipt.currency,
        note: receipt.note?.trim() || null,
        status: receipt.status,
        ocr_status: receipt.ocrStatus,
        ocr_confidence: receipt.ocrConfidence ?? null,
        ocr_error: receipt.ocrError ?? null,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function uploadReceiptFile(
  file: ReceiptFile,
): Promise<ReceiptFile> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const quota = await supabase.rpc("assert_upload_allowed", {
    p_kind: "receipt",
    p_bytes: file.fileSize,
    p_record_id: file.id,
  });
  if (quota.error) throw quota.error;
  const bytes = await readLocalFileArrayBuffer(
    file.localUri,
    "RECEIPT_FILE_READ_FAILED",
  );
  const extension =
    file.mimeType === "application/pdf"
      ? "pdf"
      : file.mimeType === "image/png"
        ? "png"
        : "jpg";
  const storagePath = `${file.ownerId}/${file.projectId}/${file.receiptId}/${file.id}.${extension}`;
  const upload = await supabase.storage
    .from("receipts")
    .upload(storagePath, bytes, { contentType: file.mimeType, upsert: true });
  if (upload.error) throw upload.error;
  const { error } = await supabase.from("receipt_files").upsert(
    {
      id: file.id,
      receipt_id: file.receiptId,
      owner_id: file.ownerId,
      project_id: file.projectId,
      local_uri: file.localUri,
      storage_path: storagePath,
      file_size: file.fileSize,
      mime_type: file.mimeType,
      page_order: file.pageOrder,
      sha256: file.sha256 ?? null,
      perceptual_hash: file.perceptualHash ?? null,
      upload_status: "synced",
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return { ...file, storagePath, uploadStatus: "synced" };
}

export async function listReceiptCategories(
  ownerId: string,
): Promise<ReceiptCategory[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("owner_id", ownerId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    isDefault: Boolean(row.is_default),
    syncStatus: "synced",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function listReceipts(
  projectId: string,
): Promise<{ receipts: Receipt[]; files: ReceiptFile[] }> {
  if (!supabase) return { receipts: [], files: [] };
  const [receiptResult, fileResult] = await Promise.all([
    supabase
      .from("receipts")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("receipt_files")
      .select("*")
      .eq("project_id", projectId)
      .order("page_order"),
  ]);
  if (receiptResult.error) throw receiptResult.error;
  if (fileResult.error) throw fileResult.error;
  return {
    receipts: (receiptResult.data ?? []).map(receiptFromRow),
    files: (fileResult.data ?? []).map(receiptFileFromRow),
  };
}
