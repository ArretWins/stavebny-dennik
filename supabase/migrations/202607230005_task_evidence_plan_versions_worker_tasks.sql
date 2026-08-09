-- Task evidence, drawing revisions, and a least-privilege worker task view.

alter table public.attachments
  drop constraint attachments_related_entity_type_check,
  add constraint attachments_related_entity_type_check
    check (
      related_entity_type in (
        'diary_entry',
        'delay_event',
        'worker_checkin',
        'attachment',
        'weather_snapshot',
        'site_task'
      )
    ),
  add column evidence_role text not null default 'general'
    check (evidence_role in ('before', 'after', 'general'));

create index attachments_site_task_idx
  on public.attachments(related_entity_id, evidence_role, created_at)
  where related_entity_type = 'site_task';

alter table public.project_plans
  add column series_id text,
  add column version_number integer not null default 1
    check (version_number between 1 and 10000),
  add column supersedes_plan_id text
    references public.project_plans(id) on delete set null,
  add column is_current boolean not null default true;

update public.project_plans set series_id = id where series_id is null;
alter table public.project_plans alter column series_id set not null;

create unique index project_plans_series_version_idx
  on public.project_plans(project_id, series_id, version_number);
create unique index project_plans_current_series_idx
  on public.project_plans(project_id, series_id)
  where is_current;

create or replace function public.save_project_plan_version(
  p_id text,
  p_project_id uuid,
  p_name text,
  p_local_uri text,
  p_storage_path text,
  p_file_size bigint,
  p_mime_type text,
  p_page_count integer,
  p_series_id text,
  p_version_number integer,
  p_supersedes_plan_id text default null
)
returns setof public.project_plans
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  existing_owner uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id, uid) then
    raise exception 'PROJECT_ACCESS_DENIED';
  end if;
  if nullif(trim(p_id), '') is null
    or nullif(trim(p_series_id), '') is null
    or p_version_number not between 1 and 10000 then
    raise exception 'INVALID_PLAN_VERSION';
  end if;

  select owner_id into existing_owner
  from public.project_plans where id = p_id;
  if existing_owner is not null and existing_owner <> uid then
    raise exception 'PLAN_ACCESS_DENIED';
  end if;

  if existing_owner is null and p_version_number > 1 then
    if p_supersedes_plan_id is null or not exists (
      select 1
      from public.project_plans previous
      where previous.id = p_supersedes_plan_id
        and previous.owner_id = uid
        and previous.project_id = p_project_id
        and previous.series_id = p_series_id
        and previous.version_number = p_version_number - 1
    ) then
      raise exception 'INVALID_PLAN_PREDECESSOR';
    end if;
  end if;

  if existing_owner is null then
    update public.project_plans
      set is_current = false
      where owner_id = uid
        and project_id = p_project_id
        and series_id = p_series_id
        and is_current;

    insert into public.project_plans(
      id, owner_id, project_id, name, local_uri, storage_path,
      file_size, mime_type, page_count, series_id, version_number,
      supersedes_plan_id, is_current
    )
    values (
      p_id, uid, p_project_id, trim(p_name), p_local_uri, p_storage_path,
      p_file_size, p_mime_type, p_page_count, p_series_id, p_version_number,
      p_supersedes_plan_id, true
    );
  else
    update public.project_plans
      set name = trim(p_name),
          local_uri = p_local_uri,
          storage_path = p_storage_path,
          file_size = p_file_size,
          mime_type = p_mime_type,
          page_count = p_page_count
      where id = p_id and owner_id = uid;
  end if;

  return query select * from public.project_plans where id = p_id;
end;
$$;

revoke execute on function public.save_project_plan_version(
  text, uuid, text, text, text, bigint, text, integer, text, integer, text
) from public, anon;
grant execute on function public.save_project_plan_version(
  text, uuid, text, text, text, bigint, text, integer, text, integer, text
) to authenticated;

create policy site_tasks_assigned_worker_read on public.site_tasks
  for select
  using (
    exists (
      select 1
      from public.project_workers worker
      where worker.id = site_tasks.assigned_worker_id
        and worker.auth_user_id = auth.uid()
        and worker.status = 'active'
        and worker.project_id = site_tasks.project_id
    )
  );

create or replace function public.set_my_site_task_status(
  p_task_id text,
  p_status text
)
returns public.site_tasks
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  task public.site_tasks;
begin
  if p_status not in ('open', 'in_progress', 'blocked', 'done') then
    raise exception 'INVALID_SITE_TASK_STATUS';
  end if;

  select target.* into task
  from public.site_tasks target
  join public.project_workers worker
    on worker.id = target.assigned_worker_id
  where target.id = p_task_id
    and worker.auth_user_id = auth.uid()
    and worker.status = 'active';
  if task.id is null then raise exception 'WORKER_TASK_ACCESS_DENIED'; end if;

  update public.site_tasks
    set status = p_status,
        completed_at = case when p_status = 'done' then now() else null end
    where id = p_task_id
    returning * into task;
  return task;
end;
$$;

revoke execute on function public.set_my_site_task_status(text, text)
  from public, anon;
grant execute on function public.set_my_site_task_status(text, text)
  to authenticated;

alter table public.notifications
  drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check
    check (
      notification_type in (
        'worker_join',
        'material_request',
        'request_status',
        'site_task'
      )
    );

create or replace function public.notify_site_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_worker_id is not null
    and (
      tg_op = 'INSERT'
      or old.assigned_worker_id is distinct from new.assigned_worker_id
    ) then
    insert into public.notifications(
      worker_id, notification_type, title, body, data
    )
    values (
      new.assigned_worker_id,
      'site_task',
      'Nová úloha na stavbe',
      new.title,
      jsonb_build_object('taskId', new.id, 'projectId', new.project_id)
    );
  end if;
  return new;
end;
$$;

create trigger site_task_assignment_notification
  after insert or update of assigned_worker_id on public.site_tasks
  for each row execute function public.notify_site_task_assignment();
