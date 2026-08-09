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
    select exists(select 1 from public.projects where id=pid and owner_id=uid)
  $$;
  create table public.project_workers(
    id uuid primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id) on delete cascade,
    status text not null
  );
  create function public.audit_row() returns trigger language plpgsql as $$
  begin return coalesce(new,old); end;
  $$;
  create function public.export_my_data() returns jsonb
  language sql stable security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null
      else jsonb_build_object('schemaVersion',17) end
  $$;
`;

describe('project tool register migration', () => {
  it('keeps custody transitions attributable, guarded and owner-isolated', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          'supabase/migrations/202608010003_project_tool_register.sql',
          'utf8',
        ),
      );
      await db.exec(`
        insert into auth.users(id) values ('${ownerId}'),('${otherOwnerId}');
        insert into public.projects(id,owner_id)
          values ('${projectId}','${ownerId}');
        insert into public.project_workers(id,owner_id,project_id,status)
          values ('${workerId}','${ownerId}','${projectId}','active');
        set request.jwt.claim.sub='${ownerId}';
      `);

      const created = await db.query<{ asset_number: number; status: string }>(`
        select saved.asset_number,saved.status from public.save_project_tool(
          'tool-1','${projectId}','Aku vŕtačka','Elektrické náradie',
          'Makita','DHP486','SER-001','S kufrom a dvoma batériami'
        ) saved
      `);
      expect(created.rows[0]).toEqual({ asset_number: 1, status: 'available' });
      await expect(
        db.exec(`update public.project_tools set name='Prepísané'`),
      ).rejects.toThrow(/PROJECT_TOOL_RPC_REQUIRED/);

      await db.query(`select public.issue_project_tool(
        'tool-1','${workerId}','2099-08-10','Montáž strechy'
      )`);
      const issued = await db.query<{ status: string; current_worker_id: string }>(`
        select status,current_worker_id::text from public.project_tools
        where id='tool-1'
      `);
      expect(issued.rows[0]).toEqual({
        status: 'issued',
        current_worker_id: workerId,
      });

      await db.query(`select public.return_project_tool(
        'tool-1','damaged','Poškodené skľučovadlo'
      )`);
      await db.query(`select public.complete_project_tool_maintenance(
        'tool-1','Skľučovadlo vymenené'
      )`);
      await db.query(`select public.report_project_tool_issue(
        'tool-1','lost','Náradie sa nenašlo pri večernej kontrole'
      )`);
      await db.query(`select public.complete_project_tool_maintenance(
        'tool-1','Nájdené v skladovom kontajneri'
      )`);
      await expect(
        db.query(`select public.retire_project_tool(
          'tool-1','Opotrebované',false
        )`),
      ).rejects.toThrow(/PROJECT_TOOL_RETIRE_CONFIRMATION_REQUIRED/);
      await db.query(`select public.retire_project_tool(
        'tool-1','Ekonomicky neopraviteľné',true
      )`);

      const final = await db.query<{ status: string; events: number }>(`
        select tool.status,
          (select count(*)::integer from public.project_tool_events) events
        from public.project_tools tool where id='tool-1'
      `);
      expect(final.rows[0]).toEqual({ status: 'retired', events: 8 });
      await expect(
        db.exec(`update public.project_tool_events set body='Prepísané'`),
      ).rejects.toThrow(/PROJECT_TOOL_EVENT_IMMUTABLE/);

      const exported = await db.query<{
        payload: {
          schemaVersion: number;
          projectTools: unknown[];
          projectToolEvents: unknown[];
        };
      }>('select public.export_my_data() payload');
      expect(exported.rows[0].payload.schemaVersion).toBe(18);
      expect(exported.rows[0].payload.projectTools).toHaveLength(1);
      expect(exported.rows[0].payload.projectToolEvents).toHaveLength(8);

      await db.exec(
        `set request.jwt.claim.sub='${otherOwnerId}'; set role authenticated;`,
      );
      const isolated = await db.query<{ count: number }>(
        'select count(*)::integer count from public.project_tools',
      );
      expect(isolated.rows[0].count).toBe(0);
      await db.exec(`
        reset role;
        set request.jwt.claim.sub='${ownerId}';
      `);
      await db.query(`select public.save_project_tool(
        'tool-2','${projectId}','Laser','Meracia technika',null,null,'SER-002',null
      )`);
      await db.query(`select public.issue_project_tool(
        'tool-2','${workerId}','2099-08-10',null
      )`);
      await db.exec(`
        delete from public.projects where id='${projectId}';
      `);
      const cascaded = await db.query<{ tools: number; events: number }>(`
        select (select count(*)::integer from public.project_tools) tools,
          (select count(*)::integer from public.project_tool_events) events
      `);
      expect(cascaded.rows[0]).toEqual({ tools: 0, events: 0 });
    } finally {
      await db.close();
    }
  });
});
