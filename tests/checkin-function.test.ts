import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public check-in boundary', () => {
  const functionSource = readFileSync('supabase/functions/worker-checkin/index.ts', 'utf8');
  it('hashes the token and enforces action and expiry before inserting', () => { expect(functionSource).toContain('SHA-256'); expect(functionSource).toContain("eq('action', 'checkin')"); expect(functionSource).toContain("gt('expires_at', new Date().toISOString())"); expect(functionSource).toContain("from('worker_checkins').insert"); });
  it('serves a browser form without exposing service credentials', () => { expect(functionSource).toContain('Príchod na stavbu'); expect(functionSource).not.toContain('SERVICE_ROLE_KEY`}</'); });
});
