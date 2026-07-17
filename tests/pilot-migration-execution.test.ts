import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const prelude = `
  create extension if not exists pgcrypto;
  create schema auth;
  create role authenticated;
  create role anon;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table auth.users(id uuid primary key);
  create table public.projects(id uuid primary key default gen_random_uuid(),owner_id uuid not null,status text not null default 'active');
  create table public.project_workers(id uuid primary key default gen_random_uuid(),owner_id uuid not null,project_id uuid not null,auth_user_id uuid,first_name text not null,last_name text not null,position text not null,status text not null default 'pending',reviewed_at timestamptz,reviewed_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
  create table public.receipt_files(id text primary key,owner_id uuid not null,file_size bigint not null);
  create table public.attachments(id text primary key,owner_id uuid not null,file_size bigint not null);
  create table public.project_worker_invites(id uuid primary key default gen_random_uuid(),token_hash text not null,owner_id uuid not null,project_id uuid not null,expires_at timestamptz not null,max_uses integer not null default 100,use_count integer not null default 0,revoked_at timestamptz,created_at timestamptz not null default now());
  create table public.notifications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid,worker_id uuid,notification_type text,title text,body text,data jsonb);
  create table public.material_requests(id text primary key,owner_id uuid not null,project_id uuid not null,worker_id uuid not null,desired_date date,comment text,status text not null default 'new');
  create table public.material_request_items(id text primary key,request_id text not null,name text not null,quantity numeric not null,unit text not null);
  create function public.create_checkin_token(uuid,date) returns text language plpgsql set search_path=public as $$ begin return encode(gen_random_bytes(8),'hex'); end $$;
  create function public.create_worker_invite(uuid) returns text language plpgsql set search_path=public as $$ begin return encode(gen_random_bytes(8),'hex'); end $$;
`;

describe("pilot migration executes on PostgreSQL", () => {
  it("creates the schema and enforces active resource limits", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202607140003_pilot_plans_quotas_analytics.sql",
          "utf8",
        ),
      );
      await db.exec(
        readFileSync(
          "supabase/migrations/202607160001_supabase_extension_search_path.sql",
          "utf8",
        ),
      );
      const functionPaths = await db.query<{ proconfig: string[] }>(`
        select proconfig
        from pg_proc
        where oid in (
          'public.create_checkin_token(uuid,date)'::regprocedure,
          'public.create_worker_invite(uuid)'::regprocedure,
          'public.join_project_as_worker(text,text,text,text)'::regprocedure,
          'public.track_analytics_event(text,jsonb)'::regprocedure
        )
      `);
      expect(functionPaths.rows).toHaveLength(4);
      expect(
        functionPaths.rows.every((row) =>
          row.proconfig?.includes("search_path=public, extensions"),
        ),
      ).toBe(true);
      await db.query("insert into auth.users(id) values ($1)", [ownerId]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        "update public.feature_entitlements set resource_limit=1 where plan_key='free' and feature_key in ('projects','workers_per_project')",
      );
      await db.query(
        "insert into public.projects(id,owner_id) values ($1,$2)",
        [projectId, ownerId],
      );
      await expect(
        db.query("insert into public.projects(owner_id) values ($1)", [
          ownerId,
        ]),
      ).rejects.toThrow("PLAN_RESOURCE_LIMIT");
      await db.query(
        "insert into public.project_workers(owner_id,project_id,first_name,last_name,position,status) values ($1,$2,'A','B','Murár','rejected'),($1,$2,'C','D','Murár','pending')",
        [ownerId, projectId],
      );
      await expect(
        db.query(
          "insert into public.project_workers(owner_id,project_id,first_name,last_name,position,status) values ($1,$2,'E','F','Murár','active')",
          [ownerId, projectId],
        ),
      ).rejects.toThrow("PLAN_RESOURCE_LIMIT");
      await db.query(
        "update public.feature_entitlements set resource_limit=10 where plan_key='free' and feature_key='receipt_storage_bytes'",
      );
      await db.query(
        "insert into public.receipt_files(id,owner_id,file_size) values ('receipt-a',$1,6)",
        [ownerId],
      );
      await db.query(
        "select public.assert_upload_allowed('receipt',10,'receipt-a')",
      );
      await expect(
        db.query(
          "insert into public.receipt_files(id,owner_id,file_size) values ('receipt-b',$1,5)",
          [ownerId],
        ),
      ).rejects.toThrow("PLAN_RESOURCE_LIMIT");
      await db.query(
        'select public.track_analytics_event(\'project_created\',\'{"platform":"android","email":"private@example.com"}\'::jsonb)',
      );
      const event = await db.query<{
        actor_hash: string;
        properties: Record<string, string>;
      }>("select actor_hash,properties from public.analytics_events");
      expect(event.rows[0].actor_hash).toHaveLength(64);
      expect(event.rows[0].properties).toEqual({ platform: "android" });
      await db.query("select public.set_analytics_enabled(false)");
      await db.query(
        "select public.track_analytics_event('receipt_saved','{}'::jsonb)",
      );
      const eventCount = await db.query<{ count: bigint }>(
        "select count(*)::bigint count from public.analytics_events",
      );
      expect(Number(eventCount.rows[0].count)).toBe(1);
      await db.query(
        "insert into public.subscription_plans(user_id,plan_key,premium_until) values ($1,'premium',now()+interval '1 day')",
        [ownerId],
      );
      const premium = await db.query<{ plan: string }>(
        "select public.plan_for_user($1) plan",
        [ownerId],
      );
      expect(premium.rows[0].plan).toBe("premium");
      await db.query(
        "update public.subscription_plans set premium_until=now()-interval '1 day' where user_id=$1",
        [ownerId],
      );
      const expired = await db.query<{ plan: string }>(
        "select public.plan_for_user($1) plan",
        [ownerId],
      );
      expect(expired.rows[0].plan).toBe("free");
      const result = await db.query<{ count: bigint }>(
        "select count(*)::bigint count from public.feature_entitlements",
      );
      expect(Number(result.rows[0].count)).toBe(16);
    } finally {
      await db.close();
    }
  }, 20_000);
});
