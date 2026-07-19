import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import pdfFontsImport from "npm:pdfmake@0.2.20/build/vfs_fonts.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const jsonHeaders = { ...cors, "Content-Type": "application/json; charset=utf-8" };
const A4: [number, number] = [595.28, 841.89];
const ink = rgb(0.07, 0.11, 0.15);
const green = rgb(0.09, 0.31, 0.15);
const muted = rgb(0.37, 0.42, 0.38);
type Row = Record<string, any>;

function date(value: string): string {
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeZone: "Europe/Bratislava" }).format(new Date(`${value}T12:00:00Z`));
}
function money(cents: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(cents / 100);
}
function fontBytes(): Uint8Array {
  const module = pdfFontsImport as any;
  const encoded = module.pdfMake?.vfs?.["Roboto-Regular.ttf"] ?? module["Roboto-Regular.ttf"];
  if (typeof encoded !== "string") throw new Error("PDF_FONT_MISSING");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function fit(value: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let result = value;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}…`, size) > width) result = result.slice(0, -1);
  return `${result}…`;
}
function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size = 9, color = ink): void {
  page.drawText(value, { x, y, font, size, color });
}
function summaryPage(document: PDFDocument, font: PDFFont, project: Row, receipts: Row[], dateFrom: string, dateTo: string, version: number): void {
  let page = document.addPage(A4);
  let y = 795;
  text(page, "Účtovný balík dokladov", 38, y, font, 22, green); y -= 28;
  text(page, fit(String(project.name), font, 15, 519), 38, y, font, 15, ink); y -= 20;
  text(page, `${date(dateFrom)} – ${date(dateTo)} · Verzia ${version}`, 38, y, font, 9, muted); y -= 26;
  const headers = ["Dátum", "Predajca", "Kategória", "Suma"];
  const xs = [38, 112, 302, 451];
  const widths = [68, 184, 143, 106];
  const drawHeader = () => {
    page.drawRectangle({ x: 34, y: y - 5, width: 527, height: 22, color: rgb(0.91, 0.95, 0.91) });
    headers.forEach((header, index) => text(page, header, xs[index], y + 1, font, 9, green));
    y -= 24;
  };
  drawHeader();
  for (const receipt of receipts) {
    if (y < 70) { page = document.addPage(A4); y = 795; drawHeader(); }
    const cells = [date(receipt.purchase_date), String(receipt.seller), String(receipt.expense_categories?.name ?? "—"), money(Number(receipt.total_amount_cents))];
    cells.forEach((cell, index) => text(page, fit(cell, font, 8.5, widths[index]), xs[index], y, font, 8.5, ink));
    page.drawLine({ start: { x: 34, y: y - 7 }, end: { x: 561, y: y - 7 }, thickness: 0.5, color: rgb(0.84, 0.84, 0.82) });
    y -= 22;
  }
  const total = receipts.reduce((sum, receipt) => sum + Number(receipt.total_amount_cents), 0);
  if (y < 60) { page = document.addPage(A4); y = 795; }
  text(page, `Spolu: ${money(total)}`, 410, y - 5, font, 13, green);
}
async function appendReceiptFiles(document: PDFDocument, font: PDFFont, receipts: Row[], client: any): Promise<void> {
  for (const [receiptIndex, receipt] of receipts.entries()) {
    const files = [...(receipt.receipt_files ?? [])].sort((a: Row, b: Row) => a.page_order - b.page_order);
    for (const file of files) {
      if (!file.storage_path) throw new Error("RECEIPT_FILE_NOT_SYNCED");
      const downloaded = await client.storage.from("receipts").download(file.storage_path);
      if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("RECEIPT_FILE_DOWNLOAD_FAILED");
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (file.mime_type === "application/pdf") {
        const source = await PDFDocument.load(bytes);
        const pages = await document.copyPages(source, source.getPageIndices());
        pages.forEach((page) => document.addPage(page));
        continue;
      }
      const page = document.addPage(A4);
      text(page, `${receiptIndex + 1}. ${fit(String(receipt.seller), font, 15, 500)}`, 38, 795, font, 15, green);
      text(page, `${date(receipt.purchase_date)} · ${receipt.expense_categories?.name ?? "—"} · ${money(Number(receipt.total_amount_cents))}`, 38, 775, font, 9, muted);
      const image = file.mime_type === "image/png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
      const scale = Math.min(519 / image.width, 700 / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: (A4[0] - width) / 2, y: Math.max(38, 750 - height), width, height });
    }
  }
}
async function checksum(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    const body = await request.json();
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom : "";
    const dateTo = typeof body.dateTo === "string" ? body.dateTo : "";
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.filter((value: unknown) => typeof value === "string") : [];
    const excludedIds = new Set(Array.isArray(body.excludedReceiptIds) ? body.excludedReceiptIds.filter((value: unknown) => typeof value === "string") : []);
    if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < dateFrom)
      return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: jsonHeaders });
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    const projectResult = await client.from("projects").select("id,owner_id,name,location").eq("id", projectId).single();
    const project = projectResult.data;
    if (projectResult.error || !project || project.owner_id !== auth.data.user.id) return new Response(JSON.stringify({ error: "project_not_found" }), { status: 404, headers: jsonHeaders });
    let query = client.from("receipts").select("*,expense_categories(name),receipt_files(*)").eq("project_id", projectId).eq("status", "ready").gte("purchase_date", dateFrom).lte("purchase_date", dateTo).order("purchase_date").order("created_at");
    if (categoryIds.length) query = query.in("category_id", categoryIds);
    const receiptResult = await query;
    if (receiptResult.error) throw receiptResult.error;
    const receipts = (receiptResult.data ?? []).filter((receipt: Row) => !excludedIds.has(receipt.id));
    if (!receipts.length) return new Response(JSON.stringify({ error: "no_receipts" }), { status: 409, headers: jsonHeaders });
    const allowance = await client.rpc("consume_feature", { p_feature_key: "receipt_exports", p_amount: 1 });
    if (allowance.error) return new Response(JSON.stringify({ error: allowance.error.message }), { status: 402, headers: jsonHeaders });
    const previous = await client.from("receipt_export_batches").select("version").eq("project_id", projectId).eq("date_from", dateFrom).eq("date_to", dateTo).order("version", { ascending: false }).limit(1).maybeSingle();
    if (previous.error) throw previous.error;
    const version = Number(previous.data?.version ?? 0) + 1;
    const document = await PDFDocument.create();
    document.registerFontkit(fontkit);
    const font = await document.embedFont(fontBytes(), { subset: true });
    const tableContract = ["Dátum", "Predajca", "Kategória", "Suma"];
    void tableContract;
    summaryPage(document, font, project, receipts, dateFrom, dateTo, version);
    await appendReceiptFiles(document, font, receipts, client);
    const bytes = await document.save();
    const pageCount = document.getPageCount();
    const digest = await checksum(bytes);
    const storagePath = `${auth.data.user.id}/${projectId}/receipts-${dateFrom}-${dateTo}-v${version}-${crypto.randomUUID()}.pdf`;
    const upload = await client.storage.from("reports").upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw upload.error;
    const receiptIds = receipts.map((receipt: Row) => receipt.id);
    const total = receipts.reduce((sum: number, receipt: Row) => sum + Number(receipt.total_amount_cents), 0);
    const snapshot = await client.rpc("create_receipt_export_snapshot", { p_project_id: projectId, p_date_from: dateFrom, p_date_to: dateTo, p_category_ids: categoryIds, p_receipt_ids: receiptIds, p_version: version, p_storage_path: storagePath, p_checksum: digest, p_page_count: pageCount });
    if (snapshot.error || !snapshot.data?.[0]) { await client.storage.from("reports").remove([storagePath]); throw snapshot.error ?? new Error("EXPORT_SNAPSHOT_FAILED"); }
    void client.rpc("track_analytics_event", { p_event_name: "receipt_exported", p_properties: { platform: "edge", count: receipts.length, plan: allowance.data?.plan ?? "free" } });
    const row = snapshot.data[0];
    return new Response(JSON.stringify({ report: { id: row.id, ownerId: auth.data.user.id, projectId, dateFrom, dateTo, categoryIds, receiptIds, version, totalAmountCents: total, storagePath, checksum: digest, pageCount, status: "synced", createdAt: row.created_at } }), { status: 201, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "server_error";
    console.error("generate-receipt-report", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
