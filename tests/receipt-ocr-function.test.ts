import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('receipt OCR function contract', () => {
  const source = readFileSync('supabase/functions/process-receipt-ocr/index.ts', 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');
  it('requires JWT ownership and uses the current Azure receipt model contract', () => {
    expect(config).toContain('[functions.process-receipt-ocr]');
    expect(config).toContain('verify_jwt = true');
    expect(source).toContain('client.auth.getUser()');
    expect(source).toContain("receipt.owner_id !== authData.user.id");
    expect(source).toContain('prebuilt-receipt:analyze');
    expect(source).toContain('api-version=2024-11-30');
    expect(source).toContain('Ocp-Apim-Subscription-Key');
  });
  it('supports PDF/image files, manual review and duplicate candidates', () => {
    expect(source).toContain("storage.from('receipts').download");
    expect(source).toContain("ocr_status: 'needs_review'");
    expect(source).toContain("status: 'needs_review'");
    expect(source).toContain("from('receipt_duplicate_candidates').upsert");
  });
});
