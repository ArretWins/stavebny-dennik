import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { describe, expect, it } from 'vitest';

const ownerId = '11111111-1111-4111-8111-111111111111';
const workerUserId = '22222222-2222-4222-8222-222222222222';
const outsiderId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';
const workerId = '55555555-5555-4555-8555-555555555555';

describe('site task timeline migration', () => {
  it('records system history and allows only immutable participant comments', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(`
        create extension if not exists pgcrypto;
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
        create table public.project_workers(
          id uuid primary key,
          owner_id uuid not null references auth.users(id),
          project_id uuid not null references public.projects(id),
          auth_user_id uuid references auth.users(id),
          status text not null
        );
        create table public.notifications(
          id uuid primary key default gen_random_uuid(),
          recipient_user_id uuid references auth.users(id),
          worker_id uuid references public.project_workers(id),
          notification_type text not null,
          title text not null,
          body text not null,
          data jsonb not null default '{}',
          constraint notifications_notification_type_check check (
            notification_type in (
              'worker_join','material_request','request_status','task_assignment'
            )
          )
        );
        create table public.site_tasks(
          id text primary key,
          owner_id uuid not null references auth.users(id),
          project_id uuid not null references public.projects(id),
          assigned_worker_id uuid references public.project_workers(id),
          title text not null,
          description text,
          priority text not null default 'normal',
          due_date date,
          plan_id text,
          status text not null default 'open',
          review_note text,
          source_checklist_id text,
          created_at timestamptz not null default now()
        );
        create function public.owns_project(pid uuid,uid uuid)
        returns boolean language sql stable as $$
          select exists(
            select 1 from public.projects where id=pid and owner_id=uid
          )
        $$;
      `);
      const migration = readFileSync(
        'supabase/migrations/202607280001_site_task_timeline.sql',
        'utf8',
      ).split('create or replace function public.export_my_data()')[0];
      await db.exec(migration);
      await db.query('insert into auth.users(id) values ($1),($2),($3)', [
        ownerId,
        workerUserId,
        outsiderId,
      ]);
      await db.query(
        'insert into public.projects(id,owner_id) values ($1,$2)',
        [projectId, ownerId],
      );
      await db.query(
        `insert into public.project_workers(
          id,owner_id,project_id,auth_user_id,status
        ) values ($1,$2,$3,$4,'active')`,
        [workerId, ownerId, projectId, workerUserId],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ownerId,
      ]);
      await db.query(
        `insert into public.site_tasks(
          id,owner_id,project_id,assigned_worker_id,title
        ) values ('task-1',$1,$2,$3,'Opraviť detail')`,
        [ownerId, projectId, workerId],
      );
      await db.query(
        "update public.site_tasks set status='in_progress' where id='task-1'",
      );
      await db.query(
        `insert into public.site_task_events(
          id,owner_id,project_id,task_id,actor_user_id,event_type,body
        ) values ('comment-owner',$1,$2,'task-1',$1,'comment','Skontrolovať zajtra.')`,
        [ownerId, projectId],
      );
      const eventTypes = await db.query<{ eventType: string }>(
        `select event_type "eventType"
         from public.site_task_events order by created_at,id`,
      );
      expect(eventTypes.rows.map(row => row.eventType)).toEqual([
        'created',
        'status_changed',
        'comment',
      ]);
      await expect(
        db.query(
          "update public.site_task_events set body='Prepísané' where id='comment-owner'",
        ),
      ).rejects.toThrow(/TASK_EVENT_IMMUTABLE/);
      await expect(
        db.query(
          `insert into public.site_task_events(
            id,owner_id,project_id,task_id,actor_user_id,event_type
          ) values ('spoof',$1,$2,'task-1',$1,'created')`,
          [ownerId, projectId],
        ),
      ).rejects.toThrow(/SYSTEM_TASK_EVENT_REQUIRED/);

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerUserId,
      ]);
      await db.query(
        `insert into public.site_task_events(
          id,owner_id,project_id,task_id,actor_user_id,actor_worker_id,
          event_type,body
        ) values ('comment-worker',$1,$2,'task-1',$3,$4,'comment',
          'Práca je pripravená na kontrolu.')`,
        [ownerId, projectId, workerUserId, workerId],
      );
      const notifications = await db.query<{
        recipientUserId: string;
        taskId: string;
      }>(
        `select recipient_user_id::text "recipientUserId",
          data->>'taskId' "taskId"
         from public.notifications order by recipient_user_id`,
      );
      expect(notifications.rows).toEqual([
        { recipientUserId: ownerId, taskId: 'task-1' },
        { recipientUserId: workerUserId, taskId: 'task-1' },
      ]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        outsiderId,
      ]);
      await expect(
        db.query(
          `insert into public.site_task_events(
            id,owner_id,project_id,task_id,actor_user_id,event_type,body
          ) values ('comment-outsider',$1,$2,'task-1',$3,'comment','Cudzí')`,
          [ownerId, projectId, outsiderId],
        ),
      ).rejects.toThrow(/TASK_COMMENT_FORBIDDEN/);
      await db.exec(`
        grant usage on schema public,auth to authenticated;
        grant select on public.site_task_events,public.site_tasks,
          public.project_workers,public.projects to authenticated;
        set role authenticated;
      `);
      const hiddenFromOutsider = await db.query<{ count: bigint }>(
        'select count(*)::bigint count from public.site_task_events',
      );
      expect(Number(hiddenFromOutsider.rows[0].count)).toBe(0);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        workerUserId,
      ]);
      const visibleToAssignee = await db.query<{ count: bigint }>(
        'select count(*)::bigint count from public.site_task_events',
      );
      expect(Number(visibleToAssignee.rows[0].count)).toBe(4);
    } finally {
      await db.close();
    }
  });
});
