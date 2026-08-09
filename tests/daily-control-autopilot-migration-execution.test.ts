import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  CONTROL_TOWER_ISSUES,
  CONTROL_TOWER_TARGETS,
} from "../src/domain/controlTower";

const ownerId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

const prelude = `
  create schema auth;
  create role authenticated;
  create role anon;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table projects(id uuid primary key,owner_id uuid references auth.users);
  create function owns_project(pid uuid,uid uuid) returns boolean
  language sql stable as $$select exists(select 1 from projects where id=pid and owner_id=uid)$$;
  create function audit_row() returns trigger language plpgsql as $$
  begin return coalesce(new,old); end
  $$;
  create function export_my_data() returns jsonb language sql stable
  security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null else jsonb_build_object('schemaVersion',12) end
  $$;
`;

describe("daily control autopilot migration", () => {
  it("accepts every newer workflow target that previously failed remote sync", async () => {
    const db = new PGlite();
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          "supabase/migrations/202607290001_daily_control_actions.sql",
          "utf8",
        ),
      );
      await db.exec(
        readFileSync(
          "supabase/migrations/202608080006_daily_control_autopilot_v27.sql",
          "utf8",
        ),
      );
      await db.exec(
        `insert into auth.users values('${ownerId}');
         insert into projects values('${projectId}','${ownerId}');
         set request.jwt.claim.sub='${ownerId}';`,
      );

      const legacyIssues = CONTROL_TOWER_ISSUES.filter(
        (issue) => issue !== "diary_changes_requested" && issue !== "pending_diary_approvals",
      );
      const legacyTargets = CONTROL_TOWER_TARGETS.filter(
        (target) => target !== "diary_approvals",
      );
      for (const [index, issue] of legacyIssues.entries()) {
        const target =
          legacyTargets[index % legacyTargets.length];
        const result = await db.query<{ issue: string; target: string }>(
          `select issue,target from save_daily_control_action(
            'autopilot-${index}','${projectId}',current_date,
            '${issue}','critical','${target}',1,null,null,false,false
          )`,
        );
        expect(result.rows[0]).toEqual({ issue, target });
      }

      await expect(
        db.query(
          `select save_daily_control_action(
            'invalid-action','${projectId}',current_date,
            'unknown_issue','watch','tomorrow_plan',1,null,null,false,false
          )`,
        ),
      ).rejects.toThrow(/INVALID_DAILY_CONTROL_ACTION_ISSUE/);

      const exported = await db.query<{ payload: { schemaVersion: number } }>(
        "select export_my_data() payload",
      );
      expect(exported.rows[0].payload.schemaVersion).toBe(27);

      const migration = readFileSync(
        "supabase/migrations/202608080006_daily_control_autopilot_v27.sql",
        "utf8",
      );
      const currentContract =
        migration +
        readFileSync(
          "supabase/migrations/202608080009_diary_approval_workflow_v30.sql",
          "utf8",
        );
      for (const issue of CONTROL_TOWER_ISSUES)
        expect(currentContract).toContain(`'${issue}'`);
      for (const target of CONTROL_TOWER_TARGETS)
        expect(currentContract).toContain(`'${target}'`);
    } finally {
      await db.close();
    }
  }, 15_000);
});
