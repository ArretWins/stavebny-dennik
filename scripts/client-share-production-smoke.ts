import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const publicShareUrl =
  process.env.EXPO_PUBLIC_CLIENT_SHARE_URL ??
  `${process.env.EXPO_PUBLIC_WORKER_PORTAL_URL?.replace(/\/+$/, '')}/client-share`;
if (!url || !anonKey || publicShareUrl.startsWith('undefined/'))
  throw new Error('PUBLIC_SUPABASE_AND_SHARE_ENV_REQUIRED');

const client = (): SupabaseClient =>
  createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const owner = client();
const worker = client();
let projectId = '';
let evidencePath = '';

function check(
  error: { message: string } | null,
  operation: string,
): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function required<T>(value: T | null, operation: string): T {
  if (value === null) throw new Error(`${operation}: missing data`);
  return value;
}

async function removeCurrentAccount(api: SupabaseClient): Promise<void> {
  const session = await api.auth.getSession();
  if (!session.data.session) return;
  await api.rpc('delete_my_account', { p_confirmation: 'DELETE' });
}

async function main(): Promise<void> {
  const ownerAuth = await owner.auth.signInAnonymously();
  check(ownerAuth.error, 'sign in owner');
  const ownerId = required(ownerAuth.data.user, 'sign in owner').id;

  const project = await owner
    .from('projects')
    .insert({
      owner_id: ownerId,
      name: 'Klientsky test <projekt>',
      location: 'Bratislava',
      address: 'Testovacia 1',
    })
    .select('id')
    .single();
  check(project.error, 'create project');
  projectId = String(required(project.data, 'create project').id);

  const invite = await owner.rpc('create_worker_invite', {
    p_project_id: projectId,
  });
  check(invite.error, 'create worker invite');
  const workerAuth = await worker.auth.signInAnonymously();
  check(workerAuth.error, 'sign in worker');
  const workerUserId = required(workerAuth.data.user, 'sign in worker').id;
  const joined = await worker.rpc('join_project_as_worker', {
    p_token: String(invite.data),
    p_first_name: 'Klientsky',
    p_last_name: 'Test',
    p_position: 'Kontrolór',
  });
  check(joined.error, 'join worker');
  const workerId = String(joined.data);
  const approved = await owner
    .from('project_workers')
    .update({
      status: 'active',
      reviewed_at: new Date().toISOString(),
      reviewed_by: ownerId,
    })
    .eq('id', workerId);
  check(approved.error, 'approve worker');

  const taskId = `share-task-${randomUUID()}`;
  const title = 'Kontrola <okna> & dverí';
  const task = await owner.from('site_tasks').insert({
    id: taskId,
    owner_id: ownerId,
    project_id: projectId,
    title,
    description: 'Dokončené podľa dohody.',
    kind: 'inspection',
    status: 'open',
    priority: 'normal',
    assigned_worker_id: workerId,
  });
  check(task.error, 'create assigned task');

  const premature = await owner.rpc('set_site_task_client_visibility', {
    p_task_id: taskId,
    p_visible: true,
  });
  if (!premature.error)
    throw new Error('NON_COMPLETED_TASK_BECAME_CLIENT_VISIBLE');

  const png = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2SIAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const evidenceId = `share-photo-${randomUUID()}`;
  evidencePath = `${ownerId}/${projectId}/site-tasks/${taskId}/${workerUserId}/${evidenceId}.png`;
  const capturedAt = new Date().toISOString();
  const contentSha256 = createHash('sha256').update(png).digest('hex');
  const upload = await worker.storage
    .from('attachments')
    .upload(evidencePath, png, { contentType: 'image/png' });
  check(upload.error, 'upload completion evidence');
  const submitted = await worker.rpc('submit_my_site_task', {
    p_task_id: taskId,
    p_evidence: [
      {
        id: evidenceId,
        storagePath: evidencePath,
        fileSize: png.byteLength,
        mimeType: 'image/png',
        captureSource: 'worker_portal',
        capturedAt,
        contentSha256,
        integrityVersion: 'sha256-v1',
      },
    ],
  });
  check(submitted.error, 'submit task for review');
  const accepted = await owner.rpc('review_site_task', {
    p_task_id: taskId,
    p_decision: 'accept',
    p_note: null,
  });
  check(accepted.error, 'accept task');

  const created = await owner.rpc('create_project_share_link', {
    p_project_id: projectId,
    p_expires_hours: 24,
  });
  check(created.error, 'create share link');
  const link = required(
    created.data as { id: string; token: string } | null,
    'create share link',
  );
  const shareUrl = `${publicShareUrl}?token=${encodeURIComponent(link.token)}`;

  const hiddenResponse = await fetch(shareUrl);
  const hiddenHtml = await hiddenResponse.text();
  if (!hiddenResponse.ok || hiddenHtml.includes(title))
    throw new Error('UNSELECTED_TASK_LEAKED');

  const shown = await owner.rpc('set_site_task_client_visibility', {
    p_task_id: taskId,
    p_visible: true,
  });
  check(shown.error, 'publish accepted task');
  const visibleResponse = await fetch(shareUrl);
  const visibleHtml = await visibleResponse.text();
  if (!visibleResponse.ok) throw new Error('SHARE_PAGE_UNAVAILABLE');
  if (
    !visibleHtml.includes('Kontrola &lt;okna&gt; &amp; dverí') ||
    visibleHtml.includes(title) ||
    !visibleHtml.includes('Prijaté') ||
    !visibleHtml.includes('/storage/v1/object/sign/attachments/')
  )
    throw new Error(
      `SHARE_PAGE_CONTENT_INVALID: ${JSON.stringify({
        escapedTitle: visibleHtml.includes(
          'Kontrola &lt;okna&gt; &amp; dverí',
        ),
        rawTitle: visibleHtml.includes(title),
        accepted: visibleHtml.includes('Prijaté'),
        signedPhoto: visibleHtml.includes(
          '/storage/v1/object/sign/attachments/',
        ),
        status: visibleResponse.status,
      })}`,
    );
  if (
    visibleResponse.headers.get('cache-control') !==
      'private, no-store, max-age=0' ||
    !visibleResponse.headers
      .get('content-security-policy')
      ?.includes("frame-ancestors 'none'")
  )
    throw new Error(
      `SHARE_PAGE_SECURITY_HEADERS_MISSING: ${JSON.stringify({
        cacheControl: visibleResponse.headers.get('cache-control'),
        contentSecurityPolicy: visibleResponse.headers.get(
          'content-security-policy',
        ),
      })}`,
    );

  const links = await owner
    .from('project_share_links')
    .select('id,view_count,last_viewed_at')
    .eq('id', link.id)
    .single();
  check(links.error, 'read share link metrics');
  if (
    Number(required(links.data, 'read share link metrics').view_count) < 2 ||
    !links.data?.last_viewed_at
  )
    throw new Error('SHARE_VIEW_METRICS_NOT_RECORDED');

  const revoked = await owner.rpc('revoke_project_share_link', {
    p_link_id: link.id,
  });
  check(revoked.error, 'revoke share link');
  const revokedResponse = await fetch(shareUrl);
  if (revokedResponse.status !== 404)
    throw new Error('REVOKED_SHARE_LINK_STILL_AVAILABLE');

  console.log(
    'Client share production smoke passed: hidden-by-default, accepted-only, escaped HTML, signed evidence, metrics and revocation.',
  );
}

void main()
  .finally(async () => {
    if (evidencePath)
      await worker.storage.from('attachments').remove([evidencePath]);
    await removeCurrentAccount(worker);
    if (projectId) await owner.from('projects').delete().eq('id', projectId);
    await removeCurrentAccount(owner);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
