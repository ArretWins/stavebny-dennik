-- Worker completion evidence and an explicit foreman acceptance workflow.

alter table public.site_tasks
  drop constraint site_tasks_status_check,
  add constraint site_tasks_status_check
    check (status in ('open','in_progress','blocked','review','done')),
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_note text
    check (review_note is null or char_length(review_note) <= 500),
  add column revision_count integer not null default 0
    check (revision_count between 0 and 1000);

alter table public.attachments
  add column created_by_worker_id uuid
    references public.project_workers(id) on delete set null;

create index attachments_worker_task_evidence_idx
  on public.attachments(created_by_worker_id, related_entity_id, created_at)
  where related_entity_type = 'site_task' and evidence_role = 'after';

create policy attachments_assigned_worker_read
  on public.attachments
  for select
  using (
    related_entity_type = 'site_task'
    and evidence_role = 'after'
    and exists (
      select 1
      from public.site_tasks task
      join public.project_workers worker
        on worker.id = task.assigned_worker_id
      where task.id = attachments.related_entity_id
        and task.project_id = attachments.project_id
        and worker.id = attachments.created_by_worker_id
        and worker.auth_user_id = auth.uid()
        and worker.status = 'active'
    )
  );

create or replace function public.worker_task_evidence_path_allowed(
  p_name text,
  p_operation text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, storage
as $$
  select exists (
    select 1
    from public.site_tasks task
    join public.project_workers worker
      on worker.id = task.assigned_worker_id
    where task.owner_id::text = split_part(p_name, '/', 1)
      and task.project_id::text = split_part(p_name, '/', 2)
      and split_part(p_name, '/', 3) = 'site-tasks'
      and task.id = split_part(p_name, '/', 4)
      and worker.auth_user_id::text = split_part(p_name, '/', 5)
      and split_part(p_name, '/', 6) <> ''
      and split_part(p_name, '/', 7) = ''
      and worker.auth_user_id = auth.uid()
      and worker.status = 'active'
      and (
        p_operation = 'read'
        or task.status in ('open','in_progress','blocked')
      )
      and (
        p_operation <> 'insert'
        or (
          select count(*)
          from storage.objects existing
          where existing.bucket_id = 'attachments'
            and existing.name like
              concat(
                task.owner_id::text, '/',
                task.project_id::text, '/site-tasks/',
                task.id, '/',
                worker.auth_user_id::text, '/%'
              )
        ) < 6
      )
  );
$$;

revoke execute on function public.worker_task_evidence_path_allowed(text, text)
  from public, anon;
grant execute on function public.worker_task_evidence_path_allowed(text, text)
  to authenticated;

create policy attachments_storage_worker_task_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and public.worker_task_evidence_path_allowed(name, 'insert')
  );

create policy attachments_storage_worker_task_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.worker_task_evidence_path_allowed(name, 'read')
  );

create policy attachments_storage_worker_task_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.worker_task_evidence_path_allowed(name, 'delete')
  );

create or replace function public.enforce_site_task_review_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    (
      tg_op = 'INSERT'
      and new.assigned_worker_id is not null
      and new.status in ('review','done')
    )
    or (
      tg_op = 'UPDATE'
      and old.status is distinct from new.status
      and (
        old.status = 'review'
        or new.status = 'review'
        or (
          new.status = 'done'
          and new.assigned_worker_id is not null
        )
      )
    )
  )
    and coalesce(
      current_setting('app.site_task_review_workflow', true),
      ''
    ) <> 'allowed' then
    raise exception 'SITE_TASK_REVIEW_WORKFLOW_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger site_task_review_workflow_guard
  before insert or update on public.site_tasks
  for each row execute function public.enforce_site_task_review_workflow();

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
  if p_status not in ('open', 'in_progress', 'blocked') then
    raise exception 'INVALID_WORKER_TASK_STATUS';
  end if;

  select target.* into task
  from public.site_tasks target
  join public.project_workers worker
    on worker.id = target.assigned_worker_id
  where target.id = p_task_id
    and worker.auth_user_id = auth.uid()
    and worker.status = 'active'
  for update of target;

  if task.id is null then raise exception 'WORKER_TASK_ACCESS_DENIED'; end if;
  if task.status in ('review', 'done') then
    raise exception 'WORKER_TASK_LOCKED';
  end if;

  update public.site_tasks
    set status = p_status,
        completed_at = null
    where id = p_task_id
    returning * into task;
  return task;
end;
$$;

create or replace function public.submit_my_site_task(
  p_task_id text,
  p_evidence jsonb
)
returns public.site_tasks
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  task public.site_tasks;
  worker public.project_workers;
  evidence jsonb;
  evidence_count integer;
  existing_count integer;
  expected_prefix text;
  evidence_id text;
  evidence_path text;
  evidence_size bigint;
  evidence_mime text;
begin
  if jsonb_typeof(p_evidence) <> 'array'
    or jsonb_array_length(p_evidence) not between 1 and 6 then
    raise exception 'TASK_EVIDENCE_REQUIRED';
  end if;

  select target.* into task
  from public.site_tasks target
  join public.project_workers assigned
    on assigned.id = target.assigned_worker_id
  where target.id = p_task_id
    and assigned.auth_user_id = auth.uid()
    and assigned.status = 'active'
  for update of target;

  if task.id is null then raise exception 'WORKER_TASK_ACCESS_DENIED'; end if;
  if task.status not in ('open','in_progress','blocked') then
    raise exception 'WORKER_TASK_LOCKED';
  end if;

  select assigned.* into worker
  from public.project_workers assigned
  where assigned.id = task.assigned_worker_id;

  select count(*) into existing_count
  from public.attachments attachment
  where attachment.related_entity_type = 'site_task'
    and attachment.related_entity_id = task.id
    and attachment.evidence_role = 'after'
    and attachment.created_by_worker_id = worker.id;

  evidence_count := jsonb_array_length(p_evidence);
  if existing_count + evidence_count > 6 then
    raise exception 'TASK_EVIDENCE_LIMIT_EXCEEDED';
  end if;

  expected_prefix := concat(
    task.owner_id::text, '/',
    task.project_id::text, '/site-tasks/',
    task.id, '/',
    worker.auth_user_id::text, '/'
  );

  for evidence in select value from jsonb_array_elements(p_evidence)
  loop
    evidence_id := nullif(trim(evidence->>'id'), '');
    evidence_path := nullif(trim(evidence->>'storagePath'), '');
    evidence_size := nullif(evidence->>'fileSize', '')::bigint;
    evidence_mime := nullif(trim(evidence->>'mimeType'), '');

    if evidence_id is null
      or char_length(evidence_id) > 160
      or evidence_path is null
      or evidence_path not like expected_prefix || '%'
      or split_part(substr(evidence_path, char_length(expected_prefix) + 1), '/', 2) <> ''
      or evidence_size not between 1 and 10485760
      or evidence_mime not in ('image/jpeg','image/png','image/webp')
      or not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'attachments'
          and object.name = evidence_path
      ) then
      raise exception 'INVALID_TASK_EVIDENCE';
    end if;

    insert into public.attachments(
      id, owner_id, project_id, related_entity_type, related_entity_id,
      local_uri, storage_path, file_size, mime_type, upload_status,
      evidence_role, created_by_worker_id
    )
    values (
      evidence_id, task.owner_id, task.project_id, 'site_task', task.id,
      null, evidence_path, evidence_size, evidence_mime, 'synced',
      'after', worker.id
    );
  end loop;

  perform set_config('app.site_task_review_workflow', 'allowed', true);
  update public.site_tasks
    set status = 'review',
        submitted_at = now(),
        reviewed_at = null,
        reviewed_by = null,
        review_note = null,
        completed_at = null
    where id = task.id
    returning * into task;

  insert into public.notifications(
    recipient_user_id, worker_id, notification_type, title, body, data
  )
  values (
    task.owner_id, worker.id, 'task_review',
    'Práca čaká na kontrolu',
    task.title,
    jsonb_build_object(
      'taskId', task.id,
      'projectId', task.project_id,
      'status', 'review'
    )
  );

  return task;
end;
$$;

create or replace function public.review_site_task(
  p_task_id text,
  p_decision text,
  p_note text default null
)
returns public.site_tasks
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  task public.site_tasks;
  note text := nullif(trim(p_note), '');
begin
  if p_decision not in ('accept', 'rework') then
    raise exception 'INVALID_TASK_REVIEW_DECISION';
  end if;
  if p_decision = 'rework' and (note is null or char_length(note) < 3) then
    raise exception 'TASK_REWORK_NOTE_REQUIRED';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'TASK_REVIEW_NOTE_TOO_LONG';
  end if;

  select target.* into task
  from public.site_tasks target
  where target.id = p_task_id
    and target.owner_id = auth.uid()
    and public.owns_project(target.project_id, auth.uid())
  for update;

  if task.id is null then raise exception 'SITE_TASK_ACCESS_DENIED'; end if;
  if task.status <> 'review' then raise exception 'SITE_TASK_NOT_IN_REVIEW'; end if;

  perform set_config('app.site_task_review_workflow', 'allowed', true);
  update public.site_tasks
    set status = case when p_decision = 'accept' then 'done' else 'in_progress' end,
        completed_at = case when p_decision = 'accept' then now() else null end,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        review_note = note,
        revision_count = revision_count
          + case when p_decision = 'rework' then 1 else 0 end
    where id = task.id
    returning * into task;

  insert into public.notifications(
    worker_id, notification_type, title, body, data
  )
  values (
    task.assigned_worker_id, 'task_review',
    case
      when p_decision = 'accept' then 'Práca bola prijatá'
      else 'Práca bola vrátená na dopracovanie'
    end,
    case
      when p_decision = 'accept' then task.title
      else concat(task.title, ': ', note)
    end,
    jsonb_build_object(
      'taskId', task.id,
      'projectId', task.project_id,
      'status', task.status
    )
  );

  return task;
end;
$$;

revoke execute on function public.set_my_site_task_status(text, text)
  from public, anon;
revoke execute on function public.submit_my_site_task(text, jsonb)
  from public, anon;
revoke execute on function public.review_site_task(text, text, text)
  from public, anon;
grant execute on function public.set_my_site_task_status(text, text)
  to authenticated;
grant execute on function public.submit_my_site_task(text, jsonb)
  to authenticated;
grant execute on function public.review_site_task(text, text, text)
  to authenticated;

alter table public.notifications
  drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check
    check (
      notification_type in (
        'worker_join',
        'material_request',
        'request_status',
        'site_task',
        'task_review'
      )
    );
