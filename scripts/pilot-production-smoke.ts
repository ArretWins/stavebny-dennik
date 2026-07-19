import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const portalUrl = process.env.WORKER_PORTAL_PUBLIC_URL ?? process.env.EXPO_PUBLIC_WORKER_PORTAL_URL ?? "";
if (!url || !anonKey || !serviceKey || !portalUrl) throw new Error("PILOT_SMOKE_ENV_REQUIRED");

const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `Smoke-${randomUUID()}-aA1!`;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers: string[] = [];
const storageCleanup: Array<{ bucket: string; paths: string[] }> = [];
let projectId = "";

async function cleanupStaleSmokeUsers(): Promise<void> {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    check(result.error, "list stale smoke users");
    const stale = result.data.users.filter((user) => user.email?.startsWith("pilot-smoke-"));
    for (const user of stale) await admin.auth.admin.deleteUser(user.id);
    if (result.data.users.length < 100) break;
  }
}

function client(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function check(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}
function requireData<T>(data: T | null, operation: string): T {
  if (data === null) throw new Error(`${operation}: response data is missing`);
  return data;
}
async function createOwner(label: string): Promise<{ id: string; api: SupabaseClient }> {
  const email = `pilot-smoke-${label}-${stamp}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  check(created.error, `create ${label}`);
  const id = created.data.user!.id;
  createdUsers.push(id);
  const api = client();
  const signed = await api.auth.signInWithPassword({ email, password });
  check(signed.error, `sign in ${label}`);
  return { id, api };
}

async function main(): Promise<void> {
  await cleanupStaleSmokeUsers();
  const portal = await fetch(portalUrl);
  if (!portal.ok || !(await portal.text()).includes("Materiál na stavbu")) throw new Error("WORKER_PORTAL_UNHEALTHY");
  const privacy = await fetch(new URL("/privacy.html", portalUrl));
  if (!privacy.ok || !(await privacy.text()).includes("Ochrana súkromia")) throw new Error("PRIVACY_PAGE_UNHEALTHY");

  const owner = await createOwner("owner");
  const outsider = await createOwner("outsider");
  const project = await owner.api.from("projects").insert({ owner_id: owner.id, name: `Pilot smoke ${stamp}`, location: "Bratislava", address: "Automatický test" }).select("id").single();
  check(project.error, "create project");
  projectId = String(requireData(project.data, "create project").id);

  const isolated = await outsider.api.from("projects").select("id").eq("id", projectId);
  check(isolated.error, "RLS isolation query");
  if (requireData(isolated.data, "RLS isolation query").length !== 0) throw new Error("RLS_PROJECT_LEAK");

  const invite = await owner.api.rpc("create_worker_invite", { p_project_id: projectId });
  check(invite.error, "create worker invite");
  const worker = client();
  const anonymous = await worker.auth.signInAnonymously();
  check(anonymous.error, "anonymous worker sign in");
  createdUsers.push(anonymous.data.user!.id);
  const joined = await worker.rpc("join_project_as_worker", { p_token: String(invite.data), p_first_name: "Pilot", p_last_name: "Pracovník", p_position: "Murár" });
  check(joined.error, "worker joins from QR");
  const workerId = String(joined.data);
  const duplicate = await worker.rpc("join_project_as_worker", { p_token: String(invite.data), p_first_name: "Pilot", p_last_name: "Druhý", p_position: "Murár" });
  if (!duplicate.error) throw new Error("QR_DEVICE_REUSE_NOT_BLOCKED");

  const approved = await owner.api.from("project_workers").update({ status: "active", reviewed_at: new Date().toISOString(), reviewed_by: owner.id }).eq("id", workerId).select("id").single();
  check(approved.error, "approve worker");
  const request = await worker.rpc("create_material_request", { p_worker_id: workerId, p_desired_date: new Date().toISOString().slice(0, 10), p_comment: "Pilot smoke", p_items: [{ name: "Cement", quantity: 2, unit: "vrecia" }] });
  check(request.error, "create material request");
  const requestId = String(request.data);
  const ownerRequest = await owner.api.from("material_requests").select("id,status,material_request_items(*)").eq("id", requestId).single();
  check(ownerRequest.error, "owner receives request");
  if (requireData(ownerRequest.data, "owner receives request").material_request_items.length !== 1) throw new Error("MATERIAL_REQUEST_ITEMS_MISSING");
  const requestStatus = await owner.api.from("material_requests").update({ status: "approved" }).eq("id", requestId).select("status").single();
  check(requestStatus.error, "approve material request");
  const workerRequest = await worker.from("material_requests").select("status").eq("id", requestId).single();
  check(workerRequest.error, "worker sees request status");
  if (requireData(workerRequest.data, "worker sees request status").status !== "approved") throw new Error("WORKER_STATUS_NOT_UPDATED");

  const categoryId = `category-${randomUUID()}`;
  const receiptId = `receipt-${randomUUID()}`;
  const fileId = `receipt-file-${randomUUID()}`;
  check((await owner.api.from("expense_categories").insert({ id: categoryId, owner_id: owner.id, name: "Pilot test", is_default: false })).error, "create category");
  check((await owner.api.from("receipts").insert({ id: receiptId, owner_id: owner.id, project_id: projectId, category_id: categoryId, status: "needs_review", ocr_status: "pending", currency: "EUR" })).error, "create receipt");
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2SIAAAAASUVORK5CYII=", "base64"));
  const storagePath = `${owner.id}/${projectId}/${receiptId}/${fileId}.png`;
  const upload = await owner.api.storage.from("receipts").upload(storagePath, png, { contentType: "image/png" });
  check(upload.error, "upload receipt image");
  storageCleanup.push({ bucket: "receipts", paths: [storagePath] });
  check((await owner.api.from("receipt_files").insert({ id: fileId, receipt_id: receiptId, owner_id: owner.id, project_id: projectId, storage_path: storagePath, file_size: png.byteLength, mime_type: "image/png", page_order: 0, upload_status: "synced" })).error, "create receipt file");

  await owner.api.functions.invoke("process-receipt-ocr", { body: { receiptId } });
  const afterOcr = await owner.api.from("receipts").select("ocr_status,status").eq("id", receiptId).single();
  check(afterOcr.error, "read OCR result");
  if (!["needs_review", "failed"].includes(requireData(afterOcr.data, "read OCR result").ocr_status)) throw new Error("OCR_MANUAL_FALLBACK_MISSING");
  const today = new Date().toISOString().slice(0, 10);
  check((await owner.api.from("receipts").update({ purchase_date: today, seller: "Pilot predajca", total_amount_cents: 1234, status: "ready", ocr_status: "completed" }).eq("id", receiptId)).error, "manual receipt confirmation");
  const session = await owner.api.auth.getSession();
  const reportResponse = await fetch(`${url}/functions/v1/generate-receipt-report`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${session.data.session?.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ projectId, dateFrom: today, dateTo: today, categoryIds: [], excludedReceiptIds: [] }),
  });
  const reportText = await reportResponse.text();
  let reportData: any;
  try { reportData = reportText ? JSON.parse(reportText) : {}; }
  catch { reportData = { raw: reportText.slice(0, 500) }; }
  if (!reportResponse.ok) throw new Error(`generate accountant PDF (${reportResponse.status}): ${JSON.stringify(reportData).slice(0, 500)}`);
  if (!reportData?.report?.storagePath || Number(reportData.report.pageCount) < 2) throw new Error("ACCOUNTANT_PDF_INVALID");
  storageCleanup.push({ bucket: "reports", paths: [String(reportData.report.storagePath)] });

  const support = await owner.api.rpc("submit_support_report", { p_subject: "Pilot smoke report", p_description: "Automatické overenie používateľského hlásenia počas pilotného smoke testu.", p_diagnostics: { platform: "android", pendingCount: 0, failedCount: 0, projectId } });
  check(support.error, "submit support report");
  check((await owner.api.rpc("record_sync_run", { p_status: "success", p_pending_before: 1, p_pending_after: 0, p_failed_count: 0, p_duration_ms: 100, p_project_id: projectId })).error, "record sync run");
  const exported = await owner.api.rpc("export_my_data");
  check(exported.error, "export account data");
  if (!Array.isArray(exported.data?.projects) || exported.data.projects.length !== 1) throw new Error("ACCOUNT_EXPORT_INVALID");

  const removed = await owner.api.from("projects").delete().eq("id", projectId).select("id").single();
  check(removed.error, "delete project");
  projectId = "";
  console.log("Production smoke passed: portal, privacy, RLS, project lifecycle, QR worker, material request, receipt fallback, accountant PDF, support, sync diagnostics and export.");
}

void main().finally(async () => {
  for (const item of storageCleanup) await admin.storage.from(item.bucket).remove(item.paths);
  if (projectId) await admin.from("projects").delete().eq("id", projectId);
  for (const id of [...createdUsers].reverse()) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
