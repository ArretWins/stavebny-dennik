import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { describe, expect, it } from 'vitest';

const ownerId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const workerId = '33333333-3333-4333-8333-333333333333';
const workerAuthId = '44444444-4444-4444-8444-444444444444';
const otherProjectId = '55555555-5555-4555-8555-555555555555';

const prelude = `
  create extension if not exists pgcrypto;
  create schema auth;
  create schema storage;
  create role authenticated;
  create role anon;
  create role service_role;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table auth.users(id uuid primary key);
  create table public.projects(
    id uuid primary key,
    owner_id uuid not null references auth.users(id),
    name text not null default 'Test project',
    location text not null default 'Bratislava',
    address text,
    status text not null default 'active'
  );
  create type public.report_type as enum ('diary','delay','evidence_pack');
  create table public.report_exports(
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    report_type public.report_type not null,
    storage_path text
  );
  create table public.project_workers(
    id uuid primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    auth_user_id uuid references auth.users(id),
    status text not null default 'active'
  );
  create table public.attachments(
    id text primary key,
    owner_id uuid not null references auth.users(id),
    project_id uuid not null references public.projects(id),
    related_entity_type text not null,
    related_entity_id text,
    local_uri text,
    storage_path text,
    file_size bigint not null default 1,
    mime_type text not null default 'image/jpeg',
    thumbnail_path text,
    upload_status text not null default 'pending',
    created_at timestamptz not null default now(),
    constraint attachments_related_entity_type_check
      check(related_entity_type in (
        'diary_entry','delay_event','worker_checkin','attachment','weather_snapshot'
      ))
  );
  create table public.notifications(
    id uuid primary key default gen_random_uuid(),
    recipient_user_id uuid references auth.users(id),
    worker_id uuid references public.project_workers(id),
    notification_type text not null,
    title text not null,
    body text not null,
    data jsonb not null default '{}',
    constraint notifications_notification_type_check
      check(notification_type in ('worker_join','material_request','request_status'))
  );
  create function public.owns_project(pid uuid, uid uuid) returns boolean
  language sql stable as $$
    select exists(select 1 from public.projects where id=pid and owner_id=uid)
  $$;
  create function public.set_updated_at() returns trigger language plpgsql as $$
  begin new.updated_at=now(); return new; end $$;
  create function public.audit_row() returns trigger language plpgsql as $$
  begin return coalesce(new,old); end $$;
  create table storage.buckets(
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects(bucket_id text not null,name text not null);
  alter table storage.objects enable row level security;
  grant usage on schema storage, public, auth to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  create function storage.foldername(path text) returns text[]
  language sql immutable as $$
    select regexp_split_to_array(path,'/')
  $$;
`;

describe('plans and tasks migration executes on PostgreSQL', () => {
  it('creates the model and enforces complete bounded plan pins', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(prelude);
      const sql = readFileSync(
        'supabase/migrations/202607230001_plans_pins_tasks.sql',
        'utf8',
      ).split('create or replace function public.export_my_data()')[0];
      await db.exec(sql);
      await db.query('insert into auth.users(id) values ($1),($2)', [
        ownerId,
        workerAuthId,
      ]);
      await db.query(
        'insert into public.projects(id,owner_id) values ($1,$2)',
        [projectId, ownerId],
      );
      await db.query(
        'insert into public.project_workers(id,owner_id,project_id,auth_user_id) values ($1,$2,$3,$4)',
        [workerId, ownerId, projectId, workerAuthId],
      );
      await db.query(
        `insert into public.project_plans(
          id,owner_id,project_id,name,local_uri,file_size,mime_type
        ) values ('plan-1',$1,$2,'Pôdorys','file:///plan.pdf',1024,'application/pdf')`,
        [ownerId, projectId],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607230005_task_evidence_plan_versions_worker_tasks.sql',
          'utf8',
        ),
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607250001_task_completion_review.sql',
          'utf8',
        ),
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607270001_client_progress_sharing.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607270003_quality_safety_checklists.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607270004_checklist_defect_links.sql',
          'utf8',
        ),
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280001_site_task_timeline.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280003_client_task_acceptance.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280004_change_orders.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280005_project_financial_control.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280006_project_schedule_forecast.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280007_weekly_client_reports.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.exec(
        readFileSync(
          'supabase/migrations/202607280008_cost_completion_forecast.sql',
          'utf8',
        ).split('create or replace function public.export_my_data()')[0],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        `insert into public.project_budgets(
          project_id,owner_id,baseline_budget_cents,contingency_cents,
          remaining_commitment_cents
        ) values ($1,$2,1000000,100000,300000)`,
        [projectId, ownerId],
      );
      await expect(
        db.query(
          `update public.project_budgets
           set contingency_cents=1100000 where project_id=$1`,
          [projectId],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          `update public.project_budgets
           set remaining_commitment_cents=-1 where project_id=$1`,
          [projectId],
        ),
      ).rejects.toThrow();
      await db.query(
        `insert into public.project_schedules(
          project_id,owner_id,start_date,target_completion_date
        ) values ($1,$2,'2026-07-01','2026-12-31')`,
        [projectId, ownerId],
      );
      await expect(
        db.query(
          `update public.project_schedules
           set target_completion_date='2026-06-30' where project_id=$1`,
          [projectId],
        ),
      ).rejects.toThrow();
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerAuthId,
      ]);
      await db.exec('set role authenticated');
      const hiddenBudget = await db.query<{ count: number }>(
        'select count(*)::integer count from public.project_budgets',
      );
      expect(hiddenBudget.rows[0].count).toBe(0);
      const hiddenSchedule = await db.query<{ count: number }>(
        'select count(*)::integer count from public.project_schedules',
      );
      expect(hiddenSchedule.rows[0].count).toBe(0);
      const hiddenWeekly = await db.query<{ count: number }>(
        'select count(*)::integer count from public.weekly_reports',
      );
      expect(hiddenWeekly.rows[0].count).toBe(0);
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        `select * from public.save_project_plan_version(
          'plan-2',$1,'Pôdorys','file:///plan-2.pdf','owner/project/plan-2.pdf',
          2048,'application/pdf',1,'plan-1',2,'plan-1'
        )`,
        [projectId],
      );
      await db.query(
        `insert into public.site_tasks(
          id,owner_id,project_id,plan_id,page_number,x_ratio,y_ratio,title,assigned_worker_id
        ) values ('task-1',$1,$2,'plan-1',1,0.4,0.7,'Opraviť škáru',$3)`,
        [ownerId, projectId, workerId],
      );
      await expect(
        db.query(
          `insert into public.site_tasks(
            id,owner_id,project_id,plan_id,page_number,x_ratio,y_ratio,title
          ) values ('task-bad',$1,$2,'plan-1',1,1.2,0.2,'Mimo plánu')`,
          [ownerId, projectId],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          `insert into public.site_tasks(
            id,owner_id,project_id,plan_id,page_number,title
          ) values ('task-incomplete',$1,$2,'plan-1',1,'Neúplná značka')`,
          [ownerId, projectId],
        ),
      ).rejects.toThrow();
      const result = await db.query<{ count: bigint }>(
        'select count(*)::bigint count from public.site_tasks',
      );
      expect(Number(result.rows[0].count)).toBe(1);
      const versions = await db.query<{
        id: string;
        versionNumber: number;
        isCurrent: boolean;
      }>(
        `select id,version_number "versionNumber",is_current "isCurrent"
         from public.project_plans order by version_number`,
      );
      expect(versions.rows).toEqual([
        { id: 'plan-1', versionNumber: 1, isCurrent: false },
        { id: 'plan-2', versionNumber: 2, isCurrent: true },
      ]);
      await expect(
        db.query(
          "update public.site_tasks set status='done' where id='task-1'",
        ),
      ).rejects.toThrow('SITE_TASK_REVIEW_WORKFLOW_REQUIRED');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerAuthId,
      ]);
      const updated = await db.query<{ status: string }>(
        "select (public.set_my_site_task_status('task-1','in_progress')).status",
      );
      expect(updated.rows[0].status).toBe('in_progress');
      await expect(
        db.query(
          "select public.set_my_site_task_status('task-1','done')",
        ),
      ).rejects.toThrow('INVALID_WORKER_TASK_STATUS');
      const evidencePath =
        `${ownerId}/${projectId}/site-tasks/task-1/${workerAuthId}/after-1.jpg`;
      await db.exec('set role authenticated');
      await expect(
        db.query(
          `insert into storage.objects(bucket_id,name)
           values ('attachments',$1)`,
          [
            `${ownerId}/${projectId}/site-tasks/not-assigned/${workerAuthId}/bad.jpg`,
          ],
        ),
      ).rejects.toThrow();
      await db.query(
        `insert into storage.objects(bucket_id,name)
         values ('attachments',$1)`,
        [evidencePath],
      );
      await db.exec('reset role');
      const submitted = await db.query<{ status: string }>(
        `select (public.submit_my_site_task(
          'task-1',
          jsonb_build_array(jsonb_build_object(
            'id','attachment-after-1',
            'storagePath',$1::text,
            'fileSize',1024,
            'mimeType','image/jpeg'
          ))
        )).status`,
        [evidencePath],
      );
      expect(submitted.rows[0].status).toBe('review');
      const registered = await db.query<{
        evidenceRole: string;
        workerId: string;
      }>(
        `select evidence_role "evidenceRole",
                created_by_worker_id "workerId"
         from public.attachments
         where id='attachment-after-1'`,
      );
      expect(registered.rows).toEqual([
        { evidenceRole: 'after', workerId },
      ]);

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      const reworked = await db.query<{
        status: string;
        revisionCount: number;
        note: string;
      }>(
        `select status,
                revision_count "revisionCount",
                review_note note
         from public.review_site_task(
           'task-1','rework','Doplniť tesnenie pri ráme'
         )`,
      );
      expect(reworked.rows[0]).toEqual({
        status: 'in_progress',
        revisionCount: 1,
        note: 'Doplniť tesnenie pri ráme',
  });

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerAuthId,
      ]);
      const secondEvidencePath =
        `${ownerId}/${projectId}/site-tasks/task-1/${workerAuthId}/after-2.jpg`;
      await db.exec('set role authenticated');
      await db.query(
        `insert into storage.objects(bucket_id,name)
         values ('attachments',$1)`,
        [secondEvidencePath],
      );
      await db.exec('reset role');
      await db.query(
        `select public.submit_my_site_task(
          'task-1',
          jsonb_build_array(jsonb_build_object(
            'id','attachment-after-2',
            'storagePath',$1::text,
            'fileSize',2048,
            'mimeType','image/jpeg'
          ))
        )`,
        [secondEvidencePath],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      const accepted = await db.query<{
        status: string;
        completed: boolean;
      }>(
        `select status, completed_at is not null completed
         from public.review_site_task('task-1','accept',null)`,
      );
      expect(accepted.rows[0]).toEqual({
        status: 'done',
        completed: true,
      });
      await db.query(
        "select public.set_site_task_client_visibility('task-1',true)",
      );
      const createdLink = await db.query<{
        link: { id: string; token: string };
      }>(
        `select public.create_project_share_link(
          $1,168
        ) link`,
        [projectId],
      );
      expect(createdLink.rows[0].link.token).toMatch(/^[0-9a-f]{64}$/);
      const submittedChange = await db.query<{
        number: number;
        status: string;
      }>(
        `select order_number number,status
         from public.save_change_order(
           'change-1',$1,'Dodatočná izolácia sokla',
           'Rozsah nebol zahrnutý v pôvodnej objednávke.',
           45000,3,null,true
         )`,
        [projectId],
      );
      expect(submittedChange.rows[0]).toEqual({
        number: 1,
        status: 'pending_client',
      });
      await db.exec('set role service_role');
      const snapshot = await db.query<{
        taskCount: number;
        projectName: string;
      }>(
        `with resolved as (
          select public.resolve_project_share_snapshot($1) value
        )
        select
          jsonb_array_length(value->'tasks') "taskCount",
          value->'project'->>'name' "projectName"
        from resolved`,
        [createdLink.rows[0].link.token],
      );
      expect(snapshot.rows[0]).toEqual({
        taskCount: 1,
        projectName: 'Test project',
      });
      const sharedChanges = await db.query<{ count: number }>(
        `select jsonb_array_length(
          public.resolve_project_share_change_orders($1)
        ) count`,
        [createdLink.rows[0].link.token],
      );
      expect(sharedChanges.rows[0].count).toBe(1);
      await db.exec('reset role');
      const weeklyReport = await db.query<{
        status: string;
        published: boolean;
      }>(
        `select status,published_at is not null published
         from public.save_weekly_report(
           'weekly-1',$1,'2026-07-27','2026-08-02',
           'DokonÄŤili sme zĂˇklady a pripravili murivo.',
           'BudĂşci tĂ˝ĹľdeĹ zaÄŤneme nosnĂ© steny.',
           'Postup je v sĂşlade s dohodou.',
           '{"generatedAt":"2026-07-31T10:00:00Z","completedTasks":[],"attachmentIds":[]}',
           null,true,true
         )`,
        [projectId],
      );
      expect(weeklyReport.rows[0]).toEqual({
        status: 'published',
        published: true,
      });
      await expect(
        db.query(
          `update public.weekly_reports set summary='PrepĂ­sanĂ©'
           where id='weekly-1'`,
        ),
      ).rejects.toThrow('WEEKLY_REPORT_IMMUTABLE');
      await db.query(
        'insert into public.projects(id,owner_id) values ($1,$2)',
        [otherProjectId, workerAuthId],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerAuthId,
      ]);
      await expect(
        db.query(
          `select public.save_weekly_report(
            'weekly-1',$1,'2026-07-27','2026-08-02',
            'CudzĂ­ report sa nesmie sprĂ­stupniĹĄ.',
            'Ani pri idempotentnom publikovanĂ­.',
            null,
            '{"generatedAt":"2026-07-31T10:00:00Z","completedTasks":[],"attachmentIds":[]}',
            null,true,true
          )`,
          [otherProjectId],
        ),
      ).rejects.toThrow('WEEKLY_REPORT_ACCESS_DENIED');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.exec('set role service_role');
      const sharedWeekly = await db.query<{ count: number }>(
        `select jsonb_array_length(
          public.resolve_project_share_weekly_reports($1)
        ) count`,
        [createdLink.rows[0].link.token],
      );
      expect(sharedWeekly.rows[0].count).toBe(1);
      const acceptedChange = await db.query<{
        status: string;
        signerName: string;
      }>(
        `select value->>'status' status,value->>'signerName' "signerName"
         from (select public.submit_project_share_change_order_decision(
           $1,'change-1','accept','Peter Kováč',null,true
         ) value) decision`,
        [createdLink.rows[0].link.token],
      );
      expect(acceptedChange.rows[0]).toEqual({
        status: 'accepted',
        signerName: 'Peter Kováč',
      });
      const clientDecision = await db.query<{
        decision: string;
        signerName: string;
      }>(
        `select value->>'decision' decision,
                value->>'signerName' "signerName"
         from (
           select public.submit_project_share_task_decision(
             $1,'task-1','accept','Peter Kováč',null,true
           ) value
         ) submitted`,
        [createdLink.rows[0].link.token],
      );
      expect(clientDecision.rows[0]).toEqual({
        decision: 'accept',
        signerName: 'Peter Kováč',
      });
      await expect(
        db.query(
          `select public.submit_project_share_task_decision(
            $1,'task-1','rework','Peter Kováč','Upraviť detail',true
          )`,
          [createdLink.rows[0].link.token],
        ),
      ).rejects.toThrow('CLIENT_DECISION_ALREADY_RECORDED');
      await db.exec('reset role');
      await db.query(
        `insert into public.site_tasks(
          id,owner_id,project_id,title,status,client_visible
        ) values ('task-client-rework',$1,$2,'Upraviť povrch','done',true)`,
        [ownerId, projectId],
      );
      await db.exec('set role service_role');
      await db.query(
        `select public.submit_project_share_task_decision(
          $1,'task-client-rework','rework','Peter Kováč',
          'Povrch pri rohu treba zarovnať.',true
        )`,
        [createdLink.rows[0].link.token],
      );
      await db.exec('reset role');
      const reopenedByClient = await db.query<{
        status: string;
        revisionCount: number;
        clientVisible: boolean;
      }>(
        `select status,revision_count "revisionCount",
                client_visible "clientVisible"
         from public.site_tasks where id='task-client-rework'`,
      );
      expect(reopenedByClient.rows[0]).toEqual({
        status: 'in_progress',
        revisionCount: 1,
        clientVisible: false,
      });
      await expect(
        db.query(
          "update public.client_task_decisions set signer_name='Iné meno'",
        ),
      ).rejects.toThrow('CLIENT_TASK_DECISION_IMMUTABLE');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        "update public.site_tasks set status='in_progress' where id='task-1'",
      );
      const hiddenAfterReopen = await db.query<{ hidden: boolean }>(
        "select not client_visible hidden from public.site_tasks where id='task-1'",
      );
      expect(hiddenAfterReopen.rows[0].hidden).toBe(true);
      await db.exec('set role service_role');
      const reopenedSnapshot = await db.query<{ taskCount: number }>(
        `select jsonb_array_length(
          public.resolve_project_share_snapshot($1)->'tasks'
        ) "taskCount"`,
        [createdLink.rows[0].link.token],
      );
      expect(reopenedSnapshot.rows[0].taskCount).toBe(0);
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        'select public.revoke_project_share_link($1)',
        [createdLink.rows[0].link.id],
      );
      await db.exec('set role service_role');
      const revokedSnapshot = await db.query<{ unavailable: boolean }>(
        `select public.resolve_project_share_snapshot($1) is null unavailable`,
        [createdLink.rows[0].link.token],
      );
      expect(revokedSnapshot.rows[0].unavailable).toBe(true);
      await db.exec('reset role');

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerAuthId,
      ]);
      await expect(
        db.query(
          "select public.set_my_site_task_status('task-bad-id','in_progress')",
        ),
      ).rejects.toThrow('WORKER_TASK_ACCESS_DENIED');
    } finally {
      await db.close();
    }
  }, 20_000);
});
