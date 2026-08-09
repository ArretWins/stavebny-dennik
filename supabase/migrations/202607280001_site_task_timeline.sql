-- Human-readable, immutable task history shared by the foreman and assignee.
create table public.site_task_events (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id text not null references public.site_tasks(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_worker_id uuid references public.project_workers(id) on delete set null,
  event_type text not null check (
    event_type in (
      'created','updated','status_changed','assignment_changed','comment'
    )
  ),
  body text check (body is null or char_length(body) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 4096
  ),
  created_at timestamptz not null default now(),
  constraint site_task_event_comment_body check (
    (event_type = 'comment' and body is not null)
    or event_type <> 'comment'
  )
);

create index site_task_events_task_time_idx
  on public.site_task_events(task_id, created_at desc, id);
create index site_task_events_project_time_idx
  on public.site_task_events(project_id, created_at desc);

create or replace function public.validate_site_task_event()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  task public.site_tasks;
  assigned_worker public.project_workers;
begin
  select * into task from public.site_tasks where id = new.task_id;
  if task.id is null
    or task.owner_id <> new.owner_id
    or task.project_id <> new.project_id then
    raise exception 'INVALID_TASK_EVENT_TARGET';
  end if;

  if new.event_type <> 'comment' then
    if coalesce(current_setting('app.task_event_system',true),'') <> 'allowed'
    then raise exception 'SYSTEM_TASK_EVENT_REQUIRED';
    end if;
    return new;
  end if;

  new.body := trim(new.body);
  if coalesce(char_length(new.body),0) not between 1 and 1000
  then raise exception 'INVALID_TASK_COMMENT'; end if;
  if new.metadata <> '{}'::jsonb
  then raise exception 'INVALID_TASK_COMMENT_METADATA'; end if;
  if auth.uid() is null or new.actor_user_id is distinct from auth.uid()
  then raise exception 'INVALID_TASK_COMMENT_ACTOR'; end if;

  if task.owner_id = auth.uid() then
    if new.actor_worker_id is not null
    then raise exception 'INVALID_TASK_COMMENT_ACTOR'; end if;
    return new;
  end if;

  select * into assigned_worker
  from public.project_workers worker
  where worker.id = task.assigned_worker_id
    and worker.auth_user_id = auth.uid()
    and worker.status = 'active';
  if assigned_worker.id is null
    or new.actor_worker_id is distinct from assigned_worker.id then
    raise exception 'TASK_COMMENT_FORBIDDEN';
  end if;
  return new;
end;
$$;

create or replace function public.reject_site_task_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'TASK_EVENT_IMMUTABLE';
end;
$$;

create or replace function public.track_site_task_event()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  actor_worker uuid;
  event_id text;
begin
  select worker.id into actor_worker
  from public.project_workers worker
  where worker.auth_user_id = auth.uid()
    and worker.id = new.assigned_worker_id
    and worker.status = 'active';
  perform set_config('app.task_event_system','allowed',true);

  if tg_op = 'INSERT' then
    event_id := concat('event_',gen_random_uuid()::text);
    insert into public.site_task_events(
      id,owner_id,project_id,task_id,actor_user_id,actor_worker_id,
      event_type,metadata,created_at
    ) values (
      event_id,new.owner_id,new.project_id,new.id,auth.uid(),actor_worker,
      'created',
      jsonb_strip_nulls(jsonb_build_object(
        'sourceChecklistId',new.source_checklist_id
      )),
      new.created_at
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.site_task_events(
      id,owner_id,project_id,task_id,actor_user_id,actor_worker_id,
      event_type,body,metadata
    ) values (
      concat('event_',gen_random_uuid()::text),
      new.owner_id,new.project_id,new.id,auth.uid(),actor_worker,
      'status_changed',
      case when new.status = 'open' then new.review_note else null end,
      jsonb_build_object('from',old.status,'to',new.status)
    );
  end if;

  if old.assigned_worker_id is distinct from new.assigned_worker_id then
    insert into public.site_task_events(
      id,owner_id,project_id,task_id,actor_user_id,actor_worker_id,
      event_type,metadata
    ) values (
      concat('event_',gen_random_uuid()::text),
      new.owner_id,new.project_id,new.id,auth.uid(),actor_worker,
      'assignment_changed',
      jsonb_strip_nulls(jsonb_build_object(
        'from',old.assigned_worker_id,'to',new.assigned_worker_id
      ))
    );
  end if;

  if old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.priority is distinct from new.priority
    or old.due_date is distinct from new.due_date
    or old.plan_id is distinct from new.plan_id then
    insert into public.site_task_events(
      id,owner_id,project_id,task_id,actor_user_id,actor_worker_id,
      event_type,metadata
    ) values (
      concat('event_',gen_random_uuid()::text),
      new.owner_id,new.project_id,new.id,auth.uid(),actor_worker,
      'updated',
      jsonb_strip_nulls(jsonb_build_object(
        'priorityFrom',old.priority,'priorityTo',new.priority,
        'dueDateFrom',old.due_date,'dueDateTo',new.due_date
      ))
    );
  end if;
  return new;
end;
$$;

create trigger site_task_event_validate
  before insert on public.site_task_events
  for each row execute function public.validate_site_task_event();
create trigger site_task_event_immutable
  before update or delete on public.site_task_events
  for each row execute function public.reject_site_task_event_mutation();
create trigger site_task_timeline
  after insert or update on public.site_tasks
  for each row execute function public.track_site_task_event();

alter table public.notifications
  drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check check (
    notification_type in (
      'worker_join','material_request','request_status',
      'task_assignment','task_comment'
    )
  );

create or replace function public.notify_site_task_comment()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  task public.site_tasks;
  recipient uuid;
  related_worker uuid;
begin
  if new.event_type <> 'comment' then return new; end if;
  select * into task from public.site_tasks where id = new.task_id;
  if new.actor_worker_id is not null then
    recipient := task.owner_id;
    related_worker := new.actor_worker_id;
  else
    select worker.auth_user_id,worker.id into recipient,related_worker
    from public.project_workers worker
    where worker.id = task.assigned_worker_id
      and worker.status = 'active';
  end if;
  if recipient is not null and recipient is distinct from new.actor_user_id then
    insert into public.notifications(
      recipient_user_id,worker_id,notification_type,title,body,data
    ) values (
      recipient,related_worker,'task_comment',
      'Nový komentár k úlohe',
      left(new.body,240),
      jsonb_build_object('taskId',new.task_id,'projectId',new.project_id)
    );
  end if;
  return new;
end;
$$;

create trigger site_task_comment_notification
  after insert on public.site_task_events
  for each row execute function public.notify_site_task_comment();

-- Existing tasks start their product-facing history at their original creation.
select set_config('app.task_event_system','allowed',true);
insert into public.site_task_events(
  id,owner_id,project_id,task_id,event_type,metadata,created_at
)
select
  concat('event_backfill_',task.id),
  task.owner_id,task.project_id,task.id,'created',
  jsonb_strip_nulls(jsonb_build_object(
    'sourceChecklistId',task.source_checklist_id,
    'backfilled',true
  )),
  task.created_at
from public.site_tasks task
on conflict(id) do nothing;

alter table public.site_task_events enable row level security;

create policy site_task_events_owner_select on public.site_task_events
  for select using (
    owner_id = auth.uid()
    and public.owns_project(project_id,auth.uid())
  );
create policy site_task_events_owner_comment on public.site_task_events
  for insert with check (
    event_type = 'comment'
    and owner_id = auth.uid()
    and actor_user_id = auth.uid()
    and actor_worker_id is null
    and exists (
      select 1 from public.site_tasks task
      where task.id = site_task_events.task_id
        and task.owner_id = auth.uid()
        and task.project_id = site_task_events.project_id
    )
  );
create policy site_task_events_worker_select on public.site_task_events
  for select using (
    exists (
      select 1
      from public.site_tasks task
      join public.project_workers worker
        on worker.id = task.assigned_worker_id
      where task.id = site_task_events.task_id
        and task.project_id = site_task_events.project_id
        and worker.auth_user_id = auth.uid()
        and worker.status = 'active'
    )
  );
create policy site_task_events_worker_comment on public.site_task_events
  for insert with check (
    event_type = 'comment'
    and actor_user_id = auth.uid()
    and exists (
      select 1
      from public.site_tasks task
      join public.project_workers worker
        on worker.id = task.assigned_worker_id
      where task.id = site_task_events.task_id
        and task.project_id = site_task_events.project_id
        and task.owner_id = site_task_events.owner_id
        and worker.id = site_task_events.actor_worker_id
        and worker.auth_user_id = auth.uid()
        and worker.status = 'active'
    )
  );

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',6,
    'exportedAt',now(),
    'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
    'projects',coalesce((select jsonb_agg(to_jsonb(x)) from public.projects x where x.owner_id=auth.uid()),'[]'::jsonb),
    'diaryEntries',coalesce((select jsonb_agg(to_jsonb(x)) from public.diary_entries x where x.owner_id=auth.uid()),'[]'::jsonb),
    'delayEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.delay_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(x)) from public.attachments x where x.owner_id=auth.uid()),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(x)) from public.report_exports x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receiptCategories',coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_categories x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipts x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receiptFiles',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipt_files x where x.owner_id=auth.uid()),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_workers x where x.owner_id=auth.uid()),'[]'::jsonb),
    'materialRequests',coalesce((select jsonb_agg(to_jsonb(x)) from public.material_requests x where x.owner_id=auth.uid()),'[]'::jsonb),
    'materialRequestItems',coalesce((select jsonb_agg(to_jsonb(x)) from public.material_request_items x join public.material_requests r on r.id=x.request_id where r.owner_id=auth.uid()),'[]'::jsonb),
    'receiptRequestLinks',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipt_request_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectPlans',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_plans x where x.owner_id=auth.uid()),'[]'::jsonb),
    'siteTasks',coalesce((select jsonb_agg(to_jsonb(x)) from public.site_tasks x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectChecklists',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_checklists x where x.owner_id=auth.uid()),'[]'::jsonb),
    'siteTaskEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.site_task_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;

revoke execute on function public.validate_site_task_event() from public,anon;
revoke execute on function public.reject_site_task_event_mutation() from public,anon;
revoke execute on function public.track_site_task_event() from public,anon;
revoke execute on function public.notify_site_task_comment() from public,anon;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
