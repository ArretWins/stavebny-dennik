import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { describe, expect, it } from 'vitest';

const owner = '11111111-1111-4111-8111-111111111111';
const workerUser = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const project = '44444444-4444-4444-8444-444444444444';
const worker = '55555555-5555-4555-8555-555555555555';
const prelude = `
create extension if not exists pgcrypto; create schema auth; create role authenticated; create role anon;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
create function public.owns_project(pid uuid,uid uuid) returns boolean language sql stable as $$ select exists(select 1 from public.projects where id=pid and owner_id=uid) $$;
create table public.project_workers(id uuid primary key,owner_id uuid not null references auth.users(id),project_id uuid not null references public.projects(id) on delete cascade,auth_user_id uuid references auth.users(id),status text not null);
grant select on public.project_workers,public.projects to authenticated;
create function public.audit_row() returns trigger language plpgsql as $$ begin return coalesce(new,old); end $$;
create function public.export_my_data() returns jsonb language sql stable security definer set search_path=public,auth as $$ select jsonb_build_object('schemaVersion',18) $$;
`;

describe('work shift migration', () => {
  it('enforces worker self-service, owner approval, immutable history and isolation', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(readFileSync('supabase/migrations/202608010005_work_shifts.sql','utf8'));
      await db.exec(`insert into auth.users(id) values('${owner}'),('${workerUser}'),('${outsider}'); insert into public.projects values('${project}','${owner}'); insert into public.project_workers values('${worker}','${owner}','${project}','${workerUser}','active'); set request.jwt.claim.sub='${workerUser}';`);
      const started = await db.query<{ id: string; status: string }>(`select id,status from public.start_my_work_shift('${project}')`);
      expect(started.rows[0].status).toBe('active');
      await expect(db.query(`select public.start_my_work_shift('${project}')`)).rejects.toThrow(/WORK_SHIFT_ALREADY_ACTIVE/);
      const id = started.rows[0].id;
      const ended = await db.query<{ status: string; break_minutes: number }>(`select status,break_minutes from public.end_my_work_shift('${id}',0,'Hotovo')`);
      expect(ended.rows[0]).toEqual({ status: 'completed', break_minutes: 0 });
      await db.exec(`set request.jwt.claim.sub='${owner}';`);
      const approved = await db.query<{ status: string }>(`select status from public.approve_work_shift('${id}')`);
      expect(approved.rows[0].status).toBe('approved');
      await expect(db.query(`select public.save_work_shift('${id}','${project}','${worker}',now()-interval '8 hours',now(),30,null)`)).rejects.toThrow(/WORK_SHIFT_NOT_EDITABLE/);
      await db.query(`select public.reopen_work_shift('${id}','Oprava prestávky')`);
      await db.query(`select public.save_work_shift('${id}','${project}','${worker}',now()-interval '8 hours',now(),45,null)`);
      await expect(db.query(`select public.save_work_shift('overlap','${project}','${worker}',now()-interval '7 hours',now()-interval '1 hour',0,null)`)).rejects.toThrow(/WORK_SHIFT_OVERLAP/);
      await expect(db.exec(`update public.work_shift_events set body='prepísané'`)).rejects.toThrow(/WORK_SHIFT_EVENT_IMMUTABLE/);
      const result = await db.query<{ events: number; schema: number }>(`select (select count(*)::integer from public.work_shift_events) events,(public.export_my_data()->>'schemaVersion')::integer schema`);
      expect(result.rows[0]).toEqual({ events: 5, schema: 19 });
      await db.exec(`set request.jwt.claim.sub='${workerUser}';`);
      const forgotten = await db.query<{ id: string }>(`select id from public.start_my_work_shift('${project}')`);
      await db.exec(`set request.jwt.claim.sub='${owner}';`);
      const manualClose = await db.query<{ status: string; source: string }>(`select status,source from public.save_work_shift('${forgotten.rows[0].id}','${project}','${worker}',(select started_at from public.work_shifts where id='${forgotten.rows[0].id}'),now(),0,'Ručne ukončené majstrom')`);
      expect(manualClose.rows[0]).toEqual({ status: 'completed', source: 'worker' });
      await db.exec(`set request.jwt.claim.sub='${outsider}'; set role authenticated;`);
      expect((await db.query<{ count: number }>('select count(*)::integer count from public.work_shifts')).rows[0].count).toBe(0);
      await db.exec(`reset role; set request.jwt.claim.sub='${owner}'; delete from public.projects where id='${project}';`);
      const cascaded = await db.query<{ shifts: number; events: number }>(`select (select count(*)::integer from public.work_shifts) shifts,(select count(*)::integer from public.work_shift_events) events`);
      expect(cascaded.rows[0]).toEqual({ shifts: 0, events: 0 });
    } finally { await db.close(); }
  }, 15_000);
});
