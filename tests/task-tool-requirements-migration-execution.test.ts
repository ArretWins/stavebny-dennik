import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const workerUser = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const project = "44444444-4444-4444-8444-444444444444";
const worker = "55555555-5555-4555-8555-555555555555";
const prelude = `create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table projects(id uuid primary key,owner_id uuid references auth.users);create function owns_project(pid uuid,uid uuid)returns boolean language sql stable as $$select exists(select 1 from projects where id=pid and owner_id=uid)$$;create table project_workers(id uuid primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,auth_user_id uuid references auth.users,status text);create table site_tasks(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,assigned_worker_id uuid references project_workers);create table project_tools(id text primary key,owner_id uuid references auth.users,project_id uuid references projects on delete cascade,asset_number integer,name text,category text,status text);create function set_updated_at()returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;create function audit_row()returns trigger language plpgsql as $$begin return coalesce(new,old);end$$;create function export_my_data()returns jsonb language sql stable as $$select jsonb_build_object('schemaVersion',25)$$;grant select on projects,project_workers,site_tasks,project_tools to authenticated;`;

describe("task tool requirements migration", () => {
  it("saves confirmed sets atomically and exposes them only to participants", async () => {
    const db = new PGlite();
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080005_task_tool_requirements.sql",
          "utf8",
        ),
      );
      await db.exec(
        `insert into auth.users values('${owner}'),('${workerUser}'),('${outsider}');insert into projects values('${project}','${owner}');insert into project_workers values('${worker}','${owner}','${project}','${workerUser}','active');insert into site_tasks values('task-1','${owner}','${project}','${worker}');insert into project_tools values('tool-1','${owner}','${project}',7,'Mixer','Machine','available');set request.jwt.claim.sub='${owner}';`,
      );
      await expect(
        db.query(
          "select save_task_tool_requirements('task-1',array['tool-1'],false)",
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
      await db.query(
        "select save_task_tool_requirements('task-1',array['tool-1'],true)",
      );
      await expect(
        db.exec("update task_tool_requirements set asset_number=9"),
      ).rejects.toThrow(/RPC_REQUIRED/);
      await expect(
        db.query(
          "select save_task_tool_requirements('task-1',array['tool-1','tool-1'],true)",
        ),
      ).rejects.toThrow(/INVALID_TASK_TOOL_REQUIREMENTS/);
      expect(
        (
          await db.query<{ count: number }>(
            "select count(*)::int count from task_tool_requirements",
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await db.query<{ payload: { schemaVersion: number } }>(
            "select export_my_data()payload",
          )
        ).rows[0].payload.schemaVersion,
      ).toBe(26);
      await db.exec(
        `set request.jwt.claim.sub='${workerUser}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            "select count(*)::int count from task_tool_requirements",
          )
        ).rows[0].count,
      ).toBe(1);
      await db.exec(
        `reset role;set request.jwt.claim.sub='${outsider}';set role authenticated;`,
      );
      expect(
        (
          await db.query<{ count: number }>(
            "select count(*)::int count from task_tool_requirements",
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await db.close();
    }
  }, 15000);
});
