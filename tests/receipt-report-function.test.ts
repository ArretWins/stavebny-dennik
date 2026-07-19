import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('receipt accountant report contract', () => {
  const source = readFileSync('supabase/functions/generate-receipt-report/index.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/202607140001_receipts_workers_materials.sql', 'utf8');
  it('authenticates, filters only ready receipts and snapshots immutable source data', () => {
    expect(source).toContain('client.auth.getUser()'); expect(source).toContain('.eq("status", "ready")'); expect(source).toContain('rpc("create_receipt_export_snapshot"');
    expect(migration).toContain('create_receipt_export_snapshot'); expect(migration).toContain('guard_immutable_receipt_export');
  });
  it('contains the accounting table, images, original PDFs, versions and checksum', () => {
    expect(source).toContain('["Dátum", "Predajca", "Kategória", "Suma"]'); expect(source).toContain('file.mime_type === "application/pdf"');
    expect(source).toContain('Verzia ${version}'); expect(source).toContain('digest("SHA-256"'); expect(source).toContain('storage.from("reports").upload');
  });
});
