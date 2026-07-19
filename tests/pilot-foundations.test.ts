import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("pilot plan and quota contract", () => {
  const sql = readFileSync(
    "supabase/migrations/202607140003_pilot_plans_quotas_analytics.sql",
    "utf8",
  );

  it("defines Free and Premium entitlements with server-side enforcement", () => {
    for (const table of [
      "subscription_plans",
      "feature_entitlements",
      "feature_usage_monthly",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    for (const feature of [
      "projects",
      "workers_per_project",
      "receipt_storage_bytes",
      "attachment_storage_bytes",
      "receipt_ocr",
      "receipt_exports",
      "worker_portal",
      "material_requests",
    ]) {
      expect(sql).toContain(`'${feature}'`);
    }
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain(
      "revoke execute on function public.plan_for_user(uuid) from public,anon,authenticated",
    );
    expect(sql).toContain("status in ('pending','active')");
    expect(sql).toContain(
      "perform public.assert_feature_for_user(invite.owner_id,'worker_portal')",
    );
    expect(sql).toContain(
      "perform public.assert_feature_for_user(worker.owner_id,'material_requests')",
    );
  });

  it("stores only allowlisted anonymous analytics", () => {
    const eventTable =
      sql.match(
        /create table public\.analytics_events \(([\s\S]*?)\n\);/,
      )?.[1] ?? "";
    expect(eventTable).not.toContain("user_id");
    expect(eventTable).toContain("actor_hash");
    expect(sql).toContain("date_trunc('month',now())");
    expect(sql).toContain("p_properties->>'platform' in ('android','web','edge')");
    expect(sql).toContain("jsonb_typeof(p_properties->'count')='number'");
    expect(sql).toContain("between 0 and 10000");
    expect(sql).toContain("created_at<now()-interval '180 days'");
    expect(sql).toContain(
      "analytics_events deliberately has no client read/write policy",
    );
  });
});

describe("compressed uploads and metered functions", () => {
  const compression = readFileSync("src/services/imageCompression.ts", "utf8");
  const receiptUpload = readFileSync(
    "src/services/receiptRepository.ts",
    "utf8",
  );
  const attachmentUpload = readFileSync("src/services/attachments.ts", "utf8");
  const ocr = readFileSync(
    "supabase/functions/process-receipt-ocr/index.ts",
    "utf8",
  );
  const report = readFileSync(
    "supabase/functions/generate-receipt-report/index.ts",
    "utf8",
  );

  it("compresses images before upload and checks both storage quotas", () => {
    expect(compression).toContain("MAX_WIDTH = 1800");
    expect(compression).toContain("TARGET_BYTES = 2 * 1024 * 1024");
    expect(compression).toContain("SaveFormat.JPEG");
    expect(compression).toContain("Math.min(currentWidth, 1400)");
    expect(compression).toContain("Math.min(currentWidth, 1000)");
    expect(compression).toContain("IMAGE_COMPRESSION_FAILED");
    expect(receiptUpload).toContain('p_kind: "receipt"');
    expect(attachmentUpload).toContain('p_kind: "attachment"');
    expect(receiptUpload).toContain("p_record_id: file.id");
    expect(attachmentUpload).toContain("p_record_id: attachment.id");
  });

  it("charges OCR only after files exist and meters PDF exports", () => {
    expect(ocr.indexOf("receipt_files_missing")).toBeLessThan(
      ocr.indexOf("p_feature_key: 'receipt_ocr'"),
    );
    expect(ocr).toContain("status: 402");
    expect(report).toMatch(/p_feature_key:\s*["']receipt_exports["']/);
    expect(report).toContain("track_analytics_event");
  });
});

describe("static worker portal and recoverable backups", () => {
  const portal = readFileSync("worker-portal/src/app.js", "utf8");
  const portalHtml = readFileSync("worker-portal/src/index.html", "utf8");
  const build = readFileSync("scripts/build-worker-portal.ts", "utf8");
  const backup = readFileSync("scripts/backup-pilot.ts", "utf8");
  const restore = readFileSync("scripts/restore-pilot.ts", "utf8");
  const restoreVerify = readFileSync("scripts/verify-restore-drill.ts", "utf8");
  const workflow = readFileSync(".github/workflows/pilot-backup.yml", "utf8");
  const restoreWorkflow = readFileSync(
    ".github/workflows/pilot-restore-drill.yml",
    "utf8",
  );

  it("builds a safe static portal with QR join, own requests and analytics opt-out", () => {
    expect(build).toContain("WORKER_PORTAL_SUPABASE_URL");
    expect(portal).toContain("config.supabaseUrl && config.anonKey");
    expect(portal).toContain(
      "createClient(config.supabaseUrl, config.anonKey)",
    );
    expect(portal).toContain("signInAnonymously");
    expect(portal).toContain('.eq("worker_id", worker.id)');
    expect(portal).toContain("set_analytics_enabled");
    expect(portal).toContain(
      '["127.0.0.1", "localhost"].includes(location.hostname)',
    );
    expect(portalHtml).toContain('id="analytics-toggle"');
    expect(portal).toContain("textContent = request.rejection_reason");
  });

  it("backs up database, auth metadata and storage with checksums and a guarded restore", () => {
    expect(backup).toContain('"--data-only", "--use-copy"');
    expect(backup).toContain("client.storage.listBuckets()");
    expect(backup).toContain('createHash("sha256")');
    expect(backup).toContain("await rename(partial, destination)");
    expect(restore).toContain('RESTORE_CONFIRM !== "RESTORE"');
    expect(restore).toContain('RESTORE_CLEAR_TARGET !== "CLEAR"');
    expect(restore).toContain("TRUNCATE TABLE");
    expect(restore).toContain("DROP SCHEMA IF EXISTS public CASCADE");
    expect(restore).toContain("supabase_auth_admin");
    expect(restore).toContain("withoutStorageCopies");
    expect(restore).toContain("createBucket");
    expect(restore).toContain("upsert: true");
    expect(restoreVerify).toContain("Restored object checksum mismatch");
    expect(restoreVerify).toContain("auth.users");
    expect(workflow).toContain("cron:");
    expect(workflow).toContain("retention-days: 14");
    expect(restoreWorkflow).toContain("workflow_dispatch:");
    expect(restoreWorkflow).toContain("DRILL_SUPABASE_DB_URL");
  });
});
