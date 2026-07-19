import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const prelude = `
  create extension if not exists pgcrypto;
  create schema auth; create schema storage;
  create role authenticated; create role anon;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  create table auth.users(id uuid primary key);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,status text default 'active');
  create function public.owns_project(uuid,uuid) returns boolean language sql stable as $$ select exists(select 1 from public.projects where id=$1 and owner_id=$2) $$;
  create table public.profiles(id uuid primary key references auth.users(id) on delete cascade);
  create table public.diary_entries(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.delay_events(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.attachments(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.report_exports(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.expense_categories(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.receipts(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.receipt_files(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.project_workers(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,project_id uuid not null references public.projects(id) on delete cascade,auth_user_id uuid references auth.users(id),first_name text,last_name text,position text,status text default 'pending',created_at timestamptz default now(),updated_at timestamptz default now());
  create unique index project_workers_device_idx on public.project_workers(project_id,auth_user_id) where auth_user_id is not null;
  create table public.project_worker_invites(id uuid primary key default gen_random_uuid(),token_hash text,owner_id uuid references auth.users(id),project_id uuid references public.projects(id),expires_at timestamptz,max_uses integer default 100,use_count integer default 0,revoked_at timestamptz);
  create table public.material_requests(id text primary key,owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.material_request_items(id text primary key,request_id text references public.material_requests(id) on delete cascade);
  create table public.receipt_request_links(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade);
  create table public.notifications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid references auth.users(id),worker_id uuid,title text,body text,notification_type text,data jsonb);
  create function public.assert_feature_for_user(uuid,text) returns void language plpgsql as $$ begin return; end $$;
`;

describe("pilot readiness migration", () => {
  it("creates diagnostics, applies rate limits and exports only the current user", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(readFileSync("supabase/migrations/202607180001_pilot_readiness.sql", "utf8"));
      await db.exec(readFileSync("supabase/migrations/202607180002_pilot_readiness_search_path.sql", "utf8"));
      await db.query("insert into auth.users(id) values ($1)", [userId]);
      await db.query("insert into public.projects(id,owner_id) values ($1,$2)", [projectId,userId]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
      const event = await db.query<{ id: string }>("select public.record_client_error('sync','error','NETWORK_ERROR','safe',jsonb_build_object('operation','upload','email','private@example.com'),$1,'1.1.0','android') id", [projectId]);
      expect(event.rows[0].id).toBeTruthy();
      const stored = await db.query<{ context: Record<string, unknown> }>("select context from public.client_error_events");
      expect(stored.rows[0].context).toEqual({ operation: "upload" });
      await db.query("select public.consume_public_rate_limit('worker_join_device','device',1,3600)");
      await expect(db.query("select public.consume_public_rate_limit('worker_join_device','device',1,3600)")).rejects.toThrow("RATE_LIMITED");
      const exported = await db.query<{ payload: Record<string, unknown> }>("select public.export_my_data() payload");
      expect(exported.rows[0].payload).toMatchObject({ schemaVersion: 1 });
      await db.query("select public.record_sync_run('success',2,0,0,120,null,$1)", [projectId]);
      const runs = await db.query<{ count: number }>("select count(*)::integer count from public.sync_runs");
      expect(runs.rows[0].count).toBe(1);
    } finally {
      await db.close();
    }
  }, 20_000);
});
