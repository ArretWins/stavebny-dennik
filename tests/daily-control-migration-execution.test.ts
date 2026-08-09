import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';

const prelude = `
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
  create function public.audit_row() returns trigger language plpgsql as $$
  begin return coalesce(new,old); end
  $$;
  create function public.export_my_data() returns jsonb
  language sql stable security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null
      else jsonb_build_object('schemaVersion',12) end
  $$;
`;

describe('daily control action migration', () => {
  it('creates immutable attributable decisions and owner-isolated history', async () => {
    const db = new PGlite();
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          'supabase/migrations/202607290001_daily_control_actions.sql',
          'utf8',
        ),
      );
      await db.exec(
        `insert into auth.users(id) values ('${ownerId}'),('${otherOwnerId}');
         insert into public.projects(id,owner_id)
         values ('${projectId}','${ownerId}');
         set request.jwt.claim.sub='${ownerId}';`,
      );
      const created = await db.query<{ status: string }>(
        `select status from public.save_daily_control_action(
          'daily-1','${projectId}','2026-07-29','financial_setup',
          'watch','financial',null,null,null,false,false
        )`,
      );
      expect(created.rows[0].status).toBe('open');
      await expect(
        db.exec(
          `select public.save_daily_control_action(
            'daily-1','${projectId}','2026-07-29','financial_setup',
            'watch','financial',null,null,'Nastavené',true,false
          )`,
        ),
      ).rejects.toThrow(/CONFIRMATION_REQUIRED/);
      const resolved = await db.query<{
        status: string;
        resolution: string;
        resolved_by: string;
      }>(
        `select status,resolution,resolved_by::text from
          public.save_daily_control_action(
            'daily-1','${projectId}','2026-07-29','financial_setup',
            'watch','financial',null,null,'Rozpočet bol nastavený',true,true
          )`,
      );
      expect(resolved.rows[0]).toMatchObject({
        status: 'resolved',
        resolution: 'Rozpočet bol nastavený',
        resolved_by: ownerId,
      });
      await expect(
        db.exec(
          `update public.daily_control_actions
           set resolution='Prepísané' where id='daily-1'`,
        ),
      ).rejects.toThrow(/IMMUTABLE/);
      const exported = await db.query<{ payload: { schemaVersion: number; dailyControlActions: unknown[] } }>(
        `select public.export_my_data() payload`,
      );
      expect(exported.rows[0].payload.schemaVersion).toBe(13);
      expect(exported.rows[0].payload.dailyControlActions).toHaveLength(1);
      await db.exec(
        `set request.jwt.claim.sub='${otherOwnerId}';
         set role authenticated;`,
      );
      const isolated = await db.query<{ count: string }>(
        'select count(*)::text count from public.daily_control_actions',
      );
      expect(isolated.rows[0].count).toBe('0');
    } finally {
      await db.close();
    }
  });
});
