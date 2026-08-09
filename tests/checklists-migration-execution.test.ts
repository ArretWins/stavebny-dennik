import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';

const answers = JSON.stringify([
  {
    itemKey: 'substrate',
    label: 'Podklad',
    required: true,
    result: 'pending',
  },
]);

describe('quality and safety checklist migration', () => {
  it('validates completion, locks confirmed records and isolates owners', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema auth;
        create role authenticated;
        create role anon;
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
        $$;
        create table auth.users(id uuid primary key);
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
        create function public.set_updated_at() returns trigger
        language plpgsql as $$
        begin new.updated_at=now(); return new; end
        $$;
        create function public.audit_row() returns trigger
        language plpgsql as $$
        begin return coalesce(new,old); end
        $$;
      `);
      const migration = readFileSync(
        'supabase/migrations/202607270003_quality_safety_checklists.sql',
        'utf8',
      ).split('create or replace function public.export_my_data()')[0];
      await db.exec(migration);
      await db.exec(`
        create table public.site_tasks(
          id text primary key,
          owner_id uuid not null references auth.users(id),
          project_id uuid not null references public.projects(id),
          title text not null
        );
      `);
      await db.exec(
        readFileSync(
          'supabase/migrations/202607270004_checklist_defect_links.sql',
          'utf8',
        ),
      );
      await db.query('insert into auth.users(id) values ($1),($2)', [
        ownerId,
        otherId,
      ]);
      await db.query(
        'insert into public.projects(id,owner_id) values ($1,$2)',
        [projectId, ownerId],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        `insert into public.project_checklists(
          id,owner_id,project_id,template_key,template_name,category,
          inspection_date,answers
        ) values ('check-1',$1,$2,'waterproofing','Hydroizolácia',
          'quality','2026-07-27',$3::jsonb)`,
        [ownerId, projectId, answers],
      );

      await expect(
        db.query(
          `update public.project_checklists set
            status='completed',confirmed_at=now(),confirmed_by=$1
           where id='check-1'`,
          [ownerId],
        ),
      ).rejects.toThrow(/CHECKLIST_ANSWERS_REQUIRED/);

      const completedAnswers = JSON.stringify([
        {
          itemKey: 'substrate',
          label: 'Podklad',
          required: true,
          result: 'fail',
          note: 'Opraviť podklad.',
        },
      ]);
      await db.query(
        `update public.project_checklists set
          answers=$1::jsonb,status='completed',confirmed_at=now(),confirmed_by=$2
         where id='check-1'`,
        [completedAnswers, ownerId],
      );
      await db.query(
        `insert into public.site_tasks(
          id,owner_id,project_id,title,source_checklist_id,
          source_checklist_item_key
        ) values ('defect-1',$1,$2,'Podklad','check-1','substrate')`,
        [ownerId, projectId],
      );
      await expect(
        db.query(
          `insert into public.site_tasks(
            id,owner_id,project_id,title,source_checklist_id,
            source_checklist_item_key
          ) values ('defect-duplicate',$1,$2,'Podklad','check-1','substrate')`,
          [ownerId, projectId],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          `insert into public.site_tasks(
            id,owner_id,project_id,title,source_checklist_id,
            source_checklist_item_key
          ) values ('defect-invalid',$1,$2,'Iné','check-1','not-failed')`,
          [ownerId, projectId],
        ),
      ).rejects.toThrow(/INVALID_CHECKLIST_DEFECT_SOURCE/);
      await expect(
        db.query(
          "update public.project_checklists set note='changed' where id='check-1'",
        ),
      ).rejects.toThrow(/COMPLETED_CHECKLIST_IMMUTABLE/);

      await db.exec('grant select on public.project_checklists to authenticated');
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        otherId,
      ]);
      const isolated = await db.query<{ count: bigint }>(
        'select count(*)::bigint count from public.project_checklists',
      );
      expect(Number(isolated.rows[0].count)).toBe(0);
    } finally {
      await db.close();
    }
  });
});
