import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('authenticated report generation boundary', () => {
  const source = readFileSync('supabase/functions/generate-report/index.ts', 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');

  it('requires a user JWT and scopes project data through RLS', () => {
    expect(config).toContain('[functions.generate-report]');
    expect(config).toContain('verify_jwt = true');
    expect(source).toContain('client.auth.getUser()');
    expect(source).toContain("project.owner_id !== user.id");
    expect(source).toContain("from('diary_entries')");
    expect(source).toContain("from('delay_events')");
  });

  it('embeds Slovak-capable fonts and photos, stores privately, and records metadata', () => {
    expect(source).toContain('vfs_fonts.js');
    expect(source).toContain("font: 'Roboto'");
    expect(source).toContain("storage.from('attachments').download");
    expect(source).toContain("storage.from('reports').upload");
    expect(source).toContain("from('report_exports').insert");
    expect(source).toContain("locale: 'sk-SK'");
    expect(source).toContain('attachment_ids: attachmentIds');
  });
});
