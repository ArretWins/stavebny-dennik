import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const project = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);

const prelude = `
  create extension if not exists pgcrypto;
  create schema auth;
  create role authenticated; create role anon; create role service_role;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.projects(
    id uuid primary key,owner_id uuid not null references auth.users(id),
    name text not null,location text,address text,status text not null default 'active'
  );
  create function public.owns_project(pid uuid,uid uuid) returns boolean
  language sql stable as $$select exists(select 1 from projects where id=pid and owner_id=uid)$$;
  create table public.notifications(
    id bigint generated always as identity primary key,
    recipient_user_id uuid,notification_type text not null,
    title text,body text,data jsonb,
    constraint notifications_notification_type_check check(notification_type in(
      'worker_join','material_request','request_status','site_task','task_review',
      'task_assignment','task_comment','client_decision','change_order_decision',
      'supplier_quote','site_incident','material_delivery','material_stock'
    ))
  );
  create table public.day_closures(
    id text primary key,owner_id uuid not null references auth.users(id),
    project_id uuid not null references projects(id),log_date date not null,
    version integer not null,content_hash text not null,snapshot_json jsonb not null,
    confirmed_at timestamptz not null,confirmed_by uuid not null,
    created_at timestamptz not null default now()
  );
  create table public.daily_control_actions(
    id text primary key,owner_id uuid not null,project_id uuid not null,
    action_date date not null,issue text not null,severity text not null,target text not null,
    item_count integer,amount_cents bigint,status text not null default 'open',
    resolution text,resolved_at timestamptz,resolved_by uuid,
    created_at timestamptz default now(),updated_at timestamptz default now(),
    constraint daily_control_actions_issue_check check(issue in('sync_failed')),
    constraint daily_control_actions_target_check check(target in('sync'))
  );
  create function public.export_my_data() returns jsonb language sql stable
  security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null else jsonb_build_object('schemaVersion',29) end
  $$;
`;

describe("diary approval migration", () => {
  it("keeps one exact closure decision attributable, immutable and exportable", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080009_diary_approval_workflow_v30.sql",
          "utf8",
        ),
      );
      await db.exec(`
        insert into auth.users values('${owner}');
        insert into projects values('${project}','${owner}','Dom','Bratislava','Hlavná 1','active');
        insert into day_closures(
          id,owner_id,project_id,log_date,version,content_hash,snapshot_json,
          confirmed_at,confirmed_by
        ) values('closure-1','${owner}','${project}',current_date,1,'${hash}',
          '{"diaryEntries":[{"id":"entry-1","workDescription":"Betonáž","workerCount":4}]}',
          now(),'${owner}');
        set request.jwt.claim.sub='${owner}';
      `);

      await expect(
        db.query(`select create_diary_approval_request(
          'closure-1','Ing. Ján Novák','technical_supervisor',168,false
        )`),
      ).rejects.toThrow(/DIARY_APPROVAL_CONFIRMATION_REQUIRED/);

      const created = await db.query<{
        payload: { id: string; token: string; closureHash: string };
      }>(`select create_diary_approval_request(
        'closure-1','Ing. Ján Novák','technical_supervisor',168,true
      ) payload`);
      const token = created.rows[0].payload.token;
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(created.rows[0].payload.closureHash).toBe(hash);

      const stored = await db.query<{ token_hash: string }>(
        "select token_hash from diary_approval_requests",
      );
      expect(stored.rows[0].token_hash).not.toBe(token);
      await expect(
        db.exec("update diary_approval_requests set status='approved'"),
      ).rejects.toThrow(/DIARY_APPROVAL_RPC_REQUIRED/);

      const resolved = await db.query<{
        payload: { closure: { contentHash: string }; request: { recipientName: string } };
      }>("select resolve_diary_approval($1) payload", [token]);
      expect(resolved.rows[0].payload.closure.contentHash).toBe(hash);
      expect(resolved.rows[0].payload.request.recipientName).toBe("Ing. Ján Novák");

      await expect(
        db.query(
          "select submit_diary_approval_decision($1,'approved','Iná osoba',null,true)",
          [token],
        ),
      ).rejects.toThrow(/DIARY_APPROVAL_SIGNER_MISMATCH/);
      await expect(
        db.query(
          "select submit_diary_approval_decision($1,'changes_requested','Ing. Ján Novák','',true)",
          [token],
        ),
      ).rejects.toThrow(/INVALID_DIARY_APPROVAL_COMMENT/);

      await db.query(
        "select submit_diary_approval_decision($1,'approved','Ing. Ján Novák','Súhlasím',true)",
        [token],
      );
      const decided = await db.query<{
        status: string;
        confirmation_version: string;
        view_count: number;
      }>("select status,confirmation_version,view_count from diary_approval_requests");
      expect(decided.rows[0]).toMatchObject({
        status: "approved",
        confirmation_version: "sk-v1",
        view_count: 1,
      });

      // Decided links remain readable and audit the additional opening without
      // allowing the decision evidence itself to change.
      await db.query("select resolve_diary_approval($1)", [token]);
      await expect(
        db.query(
          "select submit_diary_approval_decision($1,'changes_requested','Ing. Ján Novák','Zmena',true)",
          [token],
        ),
      ).rejects.toThrow(/DIARY_APPROVAL_ALREADY_DECIDED/);
      const audit = await db.query<{ events: number; notices: number; views: number }>(`
        select
          (select count(*)::int from diary_approval_events) events,
          (select count(*)::int from notifications where notification_type='diary_approval') notices,
          (select view_count from diary_approval_requests) views
      `);
      expect(audit.rows[0]).toEqual({ events: 2, notices: 1, views: 2 });
      await expect(
        db.exec("delete from diary_approval_events"),
      ).rejects.toThrow(/DIARY_APPROVAL_EVENT_IMMUTABLE/);

      const exported = await db.query<{
        payload: { schemaVersion: number; diaryApprovalRequests: Record<string, unknown>[] };
      }>("select export_my_data() payload");
      expect(exported.rows[0].payload.schemaVersion).toBe(30);
      expect(exported.rows[0].payload.diaryApprovalRequests[0]).not.toHaveProperty("token_hash");

      const action = await db.query<{ issue: string; target: string }>(`
        select issue,target from save_daily_control_action(
          'approval-action','${project}',current_date,'diary_changes_requested',
          'high','diary_approvals',1,null,null,false,false
        )
      `);
      expect(action.rows[0]).toEqual({
        issue: "diary_changes_requested",
        target: "diary_approvals",
      });
    } finally {
      await db.close();
    }
  }, 20_000);
});
