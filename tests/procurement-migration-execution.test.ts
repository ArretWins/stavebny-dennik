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
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.projects(
    id uuid primary key,
    owner_id uuid not null references auth.users(id)
  );
  create function public.owns_project(pid uuid,uid uuid)
  returns boolean language sql stable as $$
    select exists(
      select 1 from public.projects where id=pid and owner_id=uid
    )
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
    status text not null,
    updated_at timestamptz not null default now()
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
  create function public.export_my_data() returns jsonb
  language sql stable security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null
      else jsonb_build_object('schemaVersion',14) end
  $$;
`;

describe('material procurement migration', () => {
  it('selects one audited quote and derives purchase status from receipts', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          'supabase/migrations/202607290003_material_procurement_quotes.sql',
          'utf8',
        ),
      );
      await db.exec(`
        insert into auth.users(id) values ('${ownerId}'),('${otherOwnerId}');
        insert into public.projects(id,owner_id)
          values ('${projectId}','${ownerId}');
        insert into public.project_workers(id,owner_id,project_id)
          values ('${workerId}','${ownerId}','${projectId}');
        insert into public.material_requests(
          id,owner_id,project_id,worker_id,status
        ) values (
          'request-1','${ownerId}','${projectId}','${workerId}','approved'
        );
        insert into public.receipts(
          id,owner_id,project_id,total_amount_cents
        ) values ('receipt-1','${ownerId}','${projectId}',120000);
        set request.jwt.claim.sub='${ownerId}';
      `);

      await db.query(
        `select public.save_material_supplier_quote(
          'quote-a','request-1','Stavmat',120000,'2026-08-03',null,null
        )`,
      );
      await db.query(
        `select public.save_material_supplier_quote(
          'quote-b','request-1','Dom stavebnĂ­n',110000,'2026-08-05',null,null
        )`,
      );
      await db.query(
        `select public.select_material_supplier_quote('quote-a')`,
      );
      await db.query(
        `select public.select_material_supplier_quote('quote-b')`,
      );
      const selected = await db.query<{
        id: string;
        decisions: number;
        previousStatus: string;
        firstSnapshotAmount: number;
      }>(
        `select quote.id,
          (select count(*)::integer
           from public.material_supplier_quote_decisions) decisions,
          (select status from public.material_supplier_quotes
           where id='quote-a') "previousStatus",
          (select (quote_snapshot->>'totalAmountCents')::integer
           from public.material_supplier_quote_decisions
           where quote_id='quote-a') "firstSnapshotAmount"
         from public.material_supplier_quotes quote
         where quote.status='selected'`,
      );
      expect(selected.rows).toEqual([
        {
          id: 'quote-b',
          decisions: 2,
          previousStatus: 'withdrawn',
          firstSnapshotAmount: 120000,
        },
      ]);

      await db.exec(`
        insert into public.receipt_request_links(
          owner_id,receipt_id,request_id,allocated_amount_cents
        ) values ('${ownerId}','receipt-1','request-1',50000);
      `);
      const partial = await db.query<{ status: string }>(
        `select status from public.material_requests where id='request-1'`,
      );
      expect(partial.rows[0].status).toBe('partially_purchased');

      await db.exec(`
        update public.receipt_request_links
        set allocated_amount_cents=110000 where request_id='request-1';
      `);
      const purchased = await db.query<{ status: string }>(
        `select status from public.material_requests where id='request-1'`,
      );
      expect(purchased.rows[0].status).toBe('purchased');

      const exported = await db.query<{
        payload: {
          schemaVersion: number;
          materialSupplierQuotes: unknown[];
          materialSupplierQuoteDecisions: unknown[];
        };
      }>('select public.export_my_data() payload');
      expect(exported.rows[0].payload.schemaVersion).toBe(15);
      expect(exported.rows[0].payload.materialSupplierQuotes).toHaveLength(2);
      expect(
        exported.rows[0].payload.materialSupplierQuoteDecisions,
      ).toHaveLength(2);

      await db.exec(
        `set request.jwt.claim.sub='${otherOwnerId}'; set role authenticated;`,
      );
      const isolated = await db.query<{ count: number }>(
        'select count(*)::integer count from public.material_supplier_quotes',
      );
      expect(isolated.rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  });
});
