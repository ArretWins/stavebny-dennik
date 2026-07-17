import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Supabase release contract', () => {
  const sql = readFileSync('supabase/migrations/202607110001_initial_schema.sql', 'utf8');
  it('contains all MVP entities, RLS, private buckets, audit, and lock guards', () => { for (const table of ['profiles', 'projects', 'daily_logs', 'diary_entries', 'delay_events', 'weather_snapshots', 'attachments', 'worker_checkins', 'checkin_tokens', 'report_exports', 'audit_events']) expect(sql).toContain(`create table public.${table}`); expect(sql).toContain('enable row level security'); expect(sql).toContain("values ('attachments', 'attachments', false), ('reports', 'reports', false)"); expect(sql).toContain('reject_locked_update'); expect(sql).toContain('validate_correction_target'); expect(sql).toContain("then 'report_generation'"); expect(sql).toContain("then 'lock'"); expect(sql).toContain('attachment_ids text[]'); expect(sql).toContain('audit_row'); expect(sql).toContain('owns_project(project_id, auth.uid())'); });
});

describe('Receipts and worker workflow security contract', () => {
  const sql = readFileSync('supabase/migrations/202607140001_receipts_workers_materials.sql', 'utf8');
  it('contains the complete accounting and materials model', () => {
    for (const table of ['expense_categories', 'receipts', 'receipt_files', 'receipt_ocr_jobs', 'receipt_duplicate_candidates', 'receipt_export_batches', 'receipt_export_items', 'project_workers', 'project_worker_invites', 'material_requests', 'material_request_items', 'material_request_status_history', 'receipt_request_links', 'push_subscriptions', 'notifications']) expect(sql).toContain(`create table public.${table}`);
  });
  it('uses expiring invitations, approval-aware worker access and immutable exports', () => {
    expect(sql).toContain("now() + interval '15 minutes'");
    expect(sql).toContain("w.status = 'active'");
    expect(sql).toContain('guard_immutable_receipt_export');
    expect(sql).toContain("bucket_id = 'receipts'");
    expect(sql).toContain('enable row level security');
  });
});
