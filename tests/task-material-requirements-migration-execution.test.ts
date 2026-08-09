import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const workerUser = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const project = "44444444-4444-4444-8444-444444444444";
const worker = "55555555-5555-4555-8555-555555555555";
const prelude = `create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table projects(id uuid primary key,owner_id uuid references auth.users);create function owns_project(pid uuid,uid uuid)returns boolean language sql stable as $$select exists(select 1 from projects where id=pid and owner_id=uid)$$;create table project_workers(id uuid primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,auth_user_id uuid references auth.users,status text);create table site_tasks(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,assigned_worker_id uuid references project_workers,title text,status text,priority text,created_at timestamptz default now(),updated_at timestamptz default now());create table material_requests(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade);create table material_request_items(id text primary key,request_id text references material_requests on delete cascade,name text,unit text);create function material_item_has_stock(text)returns boolean language sql stable as $$select true$$;create function set_updated_at()returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;create function audit_row()returns trigger language plpgsql as $$begin return coalesce(new,old);end$$;create function export_my_data()returns jsonb language sql stable as $$select jsonb_build_object('schemaVersion',24)$$;grant select on projects,project_workers,site_tasks,material_requests,material_request_items to authenticated;`;

describe("task material requirements migration", () => {
  it("saves atomically, requires confirmation and isolates worker access", async () => {
    const db = new PGlite();
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080004_task_material_requirements.sql",
          "utf8",
        ),
      );
      await db.exec(
        `insert into auth.users values('${owner}'),('${workerUser}'),('${outsider}');insert into projects values('${project}','${owner}');insert into project_workers values('${worker}','${owner}','${project}','${workerUser}','active');insert into site_tasks values('task-1','${owner}','${project}','${worker}','Murivo','open','high',now(),now());insert into material_requests values('req-1','${owner}','${project}');insert into material_request_items values('item-1','req-1','Cement','ks');set request.jwt.claim.sub='${owner}';`,
      );
      const payload = `'[{"requestItemId":"item-1","quantity":4}]'::jsonb`;
      await expect(
        db.query(
          `select save_task_material_requirements('task-1',${payload},false)`,
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
      await db.query(
        `select save_task_material_requirements('task-1',${payload},true)`,
      );
      await expect(
        db.exec("update task_material_requirements set quantity=9"),
      ).rejects.toThrow(/RPC_REQUIRED/);
      await expect(
        db.query(
          `select save_task_material_requirements('task-1','[{"requestItemId":"item-1","quantity":2},{"requestItemId":"item-1","quantity":3}]'::jsonb,true)`,
        ),
      ).rejects.toThrow(/INVALID_TASK_MATERIAL_REQUIREMENTS/);
      expect(
        (
          await db.query<{ count: number }>(
            "select count(*)::int count from task_material_requirements",
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await db.query<{ payload: { schemaVersion: number } }>(
            "select export_my_data() payload",
          )
        ).rows[0].payload.schemaVersion,
      ).toBe(25);
      await db.exec(
        `set request.jwt.claim.sub='${workerUser}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            "select count(*)::int count from task_material_requirements",
          )
        ).rows[0].count,
      ).toBe(1);
      await db.exec(
        `reset role;set request.jwt.claim.sub='${outsider}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            "select count(*)::int count from task_material_requirements",
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await db.close();
    }
  }, 15000);
});
