import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { describe, expect, it } from 'vitest';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';

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
  create table public.project_plans(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id) on delete cascade,
    page_count integer not null
  );
  create table public.attachments(
    id text primary key,
    related_entity_type text not null,
    constraint attachments_related_entity_type_check check (
      related_entity_type in (
        'diary_entry','delay_event','worker_checkin','attachment',
        'weather_snapshot','site_task'
      )
    )
  );
  create function public.audit_row() returns trigger language plpgsql as $$
  begin return coalesce(new,old); end;
  $$;
  create function public.export_my_data() returns jsonb
  language sql stable security definer set search_path=public,auth as $$
    select case when auth.uid() is null then null
      else jsonb_build_object('schemaVersion',16) end
  $$;
`;

describe('formal RFI register migration', () => {
  it('keeps drawing-linked questions attributable and transition guarded', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      await db.exec(
        readFileSync(
          'supabase/migrations/202608010002_project_rfi_register.sql',
          'utf8',
        ),
      );
      await db.exec(`
        insert into auth.users(id) values ('${ownerId}'),('${otherOwnerId}');
        insert into public.projects(id,owner_id)
          values ('${projectId}','${ownerId}');
        insert into public.project_plans(id,owner_id,project_id,page_count)
          values ('plan-v2','${ownerId}','${projectId}',3);
        set request.jwt.claim.sub='${ownerId}';
      `);

      const draft = await db.query<{ rfi_number: number; status: string }>(`
        select saved.rfi_number,saved.status from public.save_project_rfi(
          'rfi-1','${projectId}','Prestup VZT','Aký má byť presný priemer prestupu?',
          'Ing. Novák','2099-08-10','plan-v2',2,0.4,0.6
        ) saved`);
      expect(draft.rows[0]).toMatchObject({ rfi_number: 1, status: 'draft' });

      await expect(db.exec(`update public.project_rfis set subject='Obchádzka'`))
        .rejects.toThrow(/PROJECT_RFI_RPC_REQUIRED/);
      await expect(
        db.query(`select public.open_project_rfi('rfi-1',false)`),
      ).rejects.toThrow(/RFI_OPEN_CONFIRMATION_REQUIRED/);

      await db.query(`select public.open_project_rfi('rfi-1',true)`);
      await expect(
        db.query(`select public.save_project_rfi(
          'rfi-1','${projectId}','Zmena','Tento otvorený text sa nesmie prepísať.',
          'Ing. Novák','2099-08-10','plan-v2',2,0.4,0.6
        )`),
      ).rejects.toThrow(/OPEN_PROJECT_RFI_IMMUTABLE/);
      await db.query(`select public.answer_project_rfi(
        'rfi-1','Použite prestup s priemerom 250 mm.','Ing. Novák'
      )`);
      await db.query(`select public.close_project_rfi('rfi-1',true)`);
      await db.query(`select public.reopen_project_rfi(
        'rfi-1','Chýba požiarna klasifikácia prestupu.'
      )`);
      await db.query(`select public.answer_project_rfi(
        'rfi-1','Prestup 250 mm s klasifikáciou EI 90.','Ing. Novák'
      )`);

      const state = await db.query<{
        status: string;
        answer: string;
        events: number;
        answers: number;
      }>(`select rfi.status,rfi.answer,
        (select count(*)::integer from public.project_rfi_events) events,
        (select count(*)::integer from public.project_rfi_events
          where event_type='answered') answers
        from public.project_rfis rfi where id='rfi-1'`);
      expect(state.rows[0]).toEqual({
        status: 'answered',
        answer: 'Prestup 250 mm s klasifikáciou EI 90.',
        events: 6,
        answers: 2,
      });

      const exported = await db.query<{
        payload: { schemaVersion: number; projectRfis: unknown[]; projectRfiEvents: unknown[] };
      }>('select public.export_my_data() payload');
      expect(exported.rows[0].payload.schemaVersion).toBe(17);
      expect(exported.rows[0].payload.projectRfis).toHaveLength(1);
      expect(exported.rows[0].payload.projectRfiEvents).toHaveLength(6);

      await db.exec(
        `set request.jwt.claim.sub='${otherOwnerId}'; set role authenticated;`,
      );
      const isolated = await db.query<{ count: number }>(
        'select count(*)::integer count from public.project_rfis',
      );
      expect(isolated.rows[0].count).toBe(0);
      await db.exec(`reset role; set request.jwt.claim.sub='${ownerId}'; delete from public.projects where id='${projectId}';`);
      const cascaded = await db.query<{ rfis: number; events: number }>(`
        select (select count(*)::integer from public.project_rfis) rfis,
          (select count(*)::integer from public.project_rfi_events) events
      `);
      expect(cascaded.rows[0]).toEqual({ rfis: 0, events: 0 });
    } finally {
      await db.close();
    }
  });
});
