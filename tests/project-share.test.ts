import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public client progress page security contract', () => {
  const source = readFileSync(
    'supabase/functions/project-share/index.ts',
    'utf8',
  );

  it('resolves opaque tokens only through the service-only database RPC', () => {
    expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain('resolve_project_share_snapshot');
    expect(source).toContain('/^[0-9a-f]{64}$/');
    expect(source).not.toContain('.from("site_tasks")');
    expect(source).not.toContain(".from('site_tasks')");
  });

  it('uses short-lived signed photo URLs and limits the shared payload', () => {
    expect(source).toContain('.createSignedUrl(photo.storagePath, 15 * 60)');
    expect(source).toContain('snapshot.tasks ?? []).slice(0, 100)');
    expect(source).toContain('task.photos ?? []).slice(0, 6)');
  });

  it('renders immutable weekly snapshots and signs only selected report photos', () => {
    expect(source).toContain('resolve_project_share_weekly_reports');
    expect(source).toContain('snapshot.weeklyReports');
    expect(source).toContain('weeklyReportHtml');
    expect(source).toContain('report.snapshot?.attachmentIds');
    expect(source).toContain('Týždenné reporty');
    expect(source).toContain('Potvrden\\u00e9 v\\u00fddavky');
  });

  it('escapes database content and prevents caching, embedding and referrer leaks', () => {
    expect(source).toContain('function escapeHtml');
    expect(source).toContain('escapeHtml(snapshot.project.name)');
    expect(source).toContain('escapeHtml(task.title)');
    expect(source).toContain('escapeHtml(task.description)');
    expect(source).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(source).toContain('"Referrer-Policy": "no-referrer"');
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("form-action 'self'");
    expect(source).toContain('submit_project_share_task_decision');
    expect(source).toContain('p_confirmed: form.get("confirmed") === "yes"');
    expect(source).toContain('resolve_project_share_change_orders');
    expect(source).toContain('submit_project_share_change_order_decision');
    expect(source).toContain('name="entity" value="change_order"');
    expect(source).toContain('formatMoney(item.amountCents)');
  });

  it('returns the same non-disclosing page for malformed and unavailable links', () => {
    expect(source).toContain('new Response(invalidPage(), { status: 404');
    expect(source).toContain('if (result.error || !result.data)');
    expect(source).not.toContain('result.error.message');
  });
});

describe('Cloudflare client progress gateway contract', () => {
  const source = readFileSync('worker-portal/src/_worker.js', 'utf8');
  const client = readFileSync('src/services/clientSharing.ts', 'utf8');

  it('routes generated links through the static portal gateway', () => {
    expect(client).toContain('EXPO_PUBLIC_CLIENT_SHARE_URL');
    expect(client).toContain('EXPO_PUBLIC_WORKER_PORTAL_URL');
    expect(client).toContain('`${workerPortal}/client-share`');
    expect(source).toContain("url.pathname === '/client-share'");
    expect(source).toContain('functions/v1/project-share');
  });

  it('validates tokens, does not cache pages and restores a usable strict CSP', () => {
    expect(source).toContain('/^[0-9a-f]{64}$/');
    expect(source).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("form-action 'self'");
    expect(source).toContain("['GET', 'POST'].includes(request.method)");
    expect(source).toContain("redirect: 'manual'");
    expect(source).toContain("'X-Robots-Tag': 'noindex, nofollow, noarchive'");
    expect(source).toContain("upstream.searchParams.set('view', crypto.randomUUID())");
    expect(source).toContain("'Cache-Control': 'no-cache'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
