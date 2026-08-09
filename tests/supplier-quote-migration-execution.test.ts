import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { describe, expect, it } from 'vitest';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const workerId = '44444444-4444-4444-8444-444444444444';

const prelude = `
  create extension if not exists pgcrypto;
  create schema auth;
  create role authenticated;
  create role anon;
  create role service_role;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.projects(
    id uuid primary key,
    owner_id uuid not null references auth.users(id),
    name text not null
  );
  create function public.owns_project(pid uuid,uid uuid)
  returns boolean language sql stable as $$
    select exists(select 1 from public.projects where id=pid and owner_id=uid)
  $$;
  create table public.project_workers(
    id uuid primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id)
  );
  create table public.material_requests(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    worker_id uuid not null references public.project_workers(id),
    desired_date date,
    status text not null,
    updated_at timestamptz not null default now()
  );
  create table public.material_request_items(
    id text primary key,
    request_id text not null references public.material_requests(id),
    name text not null,
    quantity numeric not null,
    unit text not null,
    created_at timestamptz not null default now()
  );
  create table public.receipts(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    total_amount_cents bigint
  );
  create table public.receipt_request_links(
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id),
    receipt_id text not null references public.receipts(id),
    request_id text not null references public.material_requests(id),
    allocated_amount_cents bigint
  );
  create table public.notifications(
    id uuid primary key default gen_random_uuid(),
    recipient_user_id uuid references auth.users(id),
    notification_type text not null,
    title text not null,
    body text not null,
    data jsonb not null default '{}',
    constraint notifications_notification_type_check check (
      notification_type in (
        'worker_join','material_request','request_status','site_task','task_review',
        'task_assignment','task_comment','client_decision','change_order_decision'
      )
    )
  );
  create function public.export_my_data() returns jsonb
  language sql stable security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null
      else jsonb_build_object('schemaVersion',14) end
  $$;
`;

describe('public supplier quote migration', () => {
  it('rotates expiring links and records idempotent no-account offers', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          'supabase/migrations/202607290003_material_procurement_quotes.sql',
          'utf8',
        ),
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202608010001_public_supplier_quote_requests.sql',
          'utf8',
        ),
      );
      await db.exec(`
        insert into auth.users(id) values ('${ownerId}'),('${otherOwnerId}');
        insert into public.projects(id,owner_id,name)
          values ('${projectId}','${ownerId}','Rezidencia Javorová');
        insert into public.project_workers(id,owner_id,project_id)
          values ('${workerId}','${ownerId}','${projectId}');
        insert into public.material_requests(
          id,owner_id,project_id,worker_id,desired_date,status
        ) values (
          'request-1','${ownerId}','${projectId}','${workerId}',
          current_date + 10,'approved'
        );
        insert into public.material_request_items(
          id,request_id,name,quantity,unit
        ) values
          ('item-1','request-1','Cement CEM II',30,'vriec'),
          ('item-2','request-1','Murovacia malta',12,'vriec');
        set request.jwt.claim.sub='${ownerId}';
      `);

      const first = await db.query<{
        payload: { token: string; expiresAt: string };
      }>(
        `select public.create_material_supplier_quote_invite(
          'request-1',72
        ) payload`,
      );
      const second = await db.query<{
        payload: { token: string; expiresAt: string };
      }>(
        `select public.create_material_supplier_quote_invite(
          'request-1',72
        ) payload`,
      );
      expect(first.rows[0].payload.token).toMatch(/^[0-9a-f]{64}$/);
      expect(second.rows[0].payload.token).not.toBe(first.rows[0].payload.token);

      const oldLink = await db.query<{ unavailable: boolean }>(
        `select public.resolve_material_supplier_quote_invite($1) is null unavailable`,
        [first.rows[0].payload.token],
      );
      expect(oldLink.rows[0].unavailable).toBe(true);
      const resolved = await db.query<{
        payload: { projectName: string; desiredDate: string; items: unknown[] };
      }>(
        'select public.resolve_material_supplier_quote_invite($1) payload',
        [second.rows[0].payload.token],
      );
      expect(resolved.rows[0].payload).toMatchObject({
        projectName: 'Rezidencia Javorová',
        desiredDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(resolved.rows[0].payload.items).toHaveLength(2);

      const idempotency = '55555555-5555-4555-8555-555555555555';
      const submitted = await db.query<{
        payload: { quoteId: string; duplicate: boolean };
      }>(
        `select public.submit_material_supplier_quote(
          $1,$2,'Stavmat',110000,current_date + 5,current_date + 4,'Doprava v cene'
        ) payload`,
        [second.rows[0].payload.token, idempotency],
      );
      expect(submitted.rows[0].payload.duplicate).toBe(false);
      const retried = await db.query<{
        payload: { quoteId: string; duplicate: boolean };
      }>(
        `select public.submit_material_supplier_quote(
          $1,$2,'Stavmat',110000,current_date + 5,current_date + 4,'Doprava v cene'
        ) payload`,
        [second.rows[0].payload.token, idempotency],
      );
      expect(retried.rows[0].payload).toEqual({
        quoteId: submitted.rows[0].payload.quoteId,
        duplicate: true,
      });
      const counts = await db.query<{
        quotes: number;
        submissions: number;
        notifications: number;
      }>(`select
        (select count(*)::integer from public.material_supplier_quotes) quotes,
        (select submission_count from public.material_supplier_quote_invites
         where revoked_at is null) submissions,
        (select count(*)::integer from public.notifications
         where notification_type='supplier_quote') notifications`);
      expect(counts.rows[0]).toEqual({
        quotes: 1,
        submissions: 1,
        notifications: 1,
      });

      const exported = await db.query<{
        payload: Record<string, unknown> & { schemaVersion: number };
      }>('select public.export_my_data() payload');
      expect(exported.rows[0].payload.schemaVersion).toBe(16);
      expect(JSON.stringify(exported.rows[0].payload)).not.toContain(
        'token_hash',
      );

      await db.exec(
        `set request.jwt.claim.sub='${otherOwnerId}'; set role authenticated;`,
      );
      const isolated = await db.query<{ count: number }>(
        'select count(*)::integer count from public.material_supplier_quote_invites',
      );
      expect(isolated.rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  });
});
