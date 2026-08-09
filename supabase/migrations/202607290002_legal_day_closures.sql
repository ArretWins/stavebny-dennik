-- A confirmed day is an immutable, versioned evidence snapshot. All writes go
-- through one authenticated workflow so diary locking and closure creation are
-- atomic on the server.
alter table public.diary_entries
  add column if not exists correction_reason text;

alter table public.diary_entries
  drop constraint if exists diary_entries_correction_reason_check;
alter table public.diary_entries
  add constraint diary_entries_correction_reason_check check (
    (correction_of_id is null and correction_reason is null)
    or
    (
      correction_of_id is not null
      and char_length(trim(correction_reason)) between 3 and 300
    )
  );

create table public.day_closures (
  id text primary key check (char_length(id) between 3 and 160),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  log_date date not null,
  version integer not null check (version between 1 and 10000),
  supersedes_closure_id text references public.day_closures(id),
  correction_reason text check (
    correction_reason is null
    or char_length(trim(correction_reason)) between 3 and 300
  ),
  snapshot_json jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  confirmation_version text not null default 'sk-v1'
    check (confirmation_version = 'sk-v1'),
  acknowledged_warnings text[] not null default '{}',
  confirmed_at timestamptz not null,
  confirmed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id,log_date,version),
  unique(supersedes_closure_id),
  check (
    (version=1 and supersedes_closure_id is null and correction_reason is null)
    or
    (version>1 and supersedes_closure_id is not null and correction_reason is not null)
  )
);

create index day_closures_project_date_idx
  on public.day_closures(project_id,log_date desc,version desc);

alter table public.day_closures enable row level security;
create policy day_closures_owner_select
  on public.day_closures for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );

create or replace function public.guard_day_closure_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'DAY_CLOSURE_IMMUTABLE';
end;
$$;
create trigger day_closure_immutable before update or delete
  on public.day_closures for each row
  execute function public.guard_day_closure_immutable();
create trigger day_closures_audit after insert or update or delete
  on public.day_closures for each row execute function public.audit_row();

create or replace function public.confirm_day_closure(
  p_id text,
  p_project_id uuid,
  p_log_date date,
  p_supersedes_closure_id text default null,
  p_correction_reason text default null,
  p_acknowledged_warnings text[] default '{}',
  p_confirmed boolean default false
)
returns public.day_closures
language plpgsql security definer set search_path=public,auth,extensions
as $$
declare
  uid uuid:=auth.uid();
  latest public.day_closures;
  result public.day_closures;
  next_version integer;
  snapshot jsonb;
  allowed_warnings constant text[]:=array[
    'diary','workforce','weather','photos','taskReviews','receipts'
  ];
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_confirmed is not true
  then raise exception 'DAY_CLOSURE_CONFIRMATION_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid)
  then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if p_id is null or char_length(p_id) not between 3 and 160
  then raise exception 'INVALID_DAY_CLOSURE_ID'; end if;
  if p_log_date is null or p_log_date>current_date+1
  then raise exception 'INVALID_DAY_CLOSURE_DATE'; end if;
  if exists (
    select 1 from unnest(coalesce(p_acknowledged_warnings,'{}')) warning
    where not (warning=any(allowed_warnings))
  ) then raise exception 'INVALID_DAY_CLOSURE_WARNING'; end if;

  select item.* into result from public.day_closures item where item.id=p_id;
  if result.id is not null then
    if result.owner_id<>uid or result.project_id<>p_project_id
      or result.log_date<>p_log_date
    then raise exception 'DAY_CLOSURE_ID_CONFLICT'; end if;
    return result;
  end if;

  select item.* into latest
  from public.day_closures item
  where item.project_id=p_project_id and item.log_date=p_log_date
  order by item.version desc limit 1 for update;

  if latest.id is null then
    if p_supersedes_closure_id is not null or p_correction_reason is not null
    then raise exception 'INVALID_FIRST_DAY_CLOSURE'; end if;
    next_version:=1;
  else
    if p_supersedes_closure_id is distinct from latest.id
    then raise exception 'STALE_DAY_CLOSURE_VERSION'; end if;
    if p_correction_reason is null
      or char_length(trim(p_correction_reason)) not between 3 and 300
    then raise exception 'DAY_CLOSURE_CORRECTION_REASON_REQUIRED'; end if;
    next_version:=latest.version+1;
  end if;

  if not exists (
    select 1 from public.diary_entries entry
    where entry.project_id=p_project_id
      and entry.owner_id=uid
      and entry.log_date=p_log_date
  ) then raise exception 'DAY_CLOSURE_DIARY_REQUIRED'; end if;

  snapshot:=jsonb_build_object(
    'schemaVersion',1,
    'projectId',p_project_id,
    'logDate',p_log_date,
    'diaryEntries',coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id',entry.id,
          'workDescription',trim(entry.work_description),
          'workerCount',entry.worker_count,
          'note',nullif(trim(entry.note),''),
          'correctionOfId',entry.correction_of_id,
          'correctionReason',entry.correction_reason,
          'capturedAt',entry.evidence_json->>'capturedAt',
          'attachmentIds',coalesce(entry.evidence_json->'attachmentIds','[]'::jsonb),
          'weatherCapturedAt',entry.evidence_json->'weather'->>'capturedAt',
          'createdAt',entry.created_at,
          'updatedAt',entry.updated_at
        )) order by entry.created_at,entry.id
      )
      from public.diary_entries entry
      where entry.project_id=p_project_id
        and entry.owner_id=uid
        and entry.log_date=p_log_date
    ),'[]'::jsonb),
    'workerCheckinIds',coalesce((
      select jsonb_agg(item.id order by item.id)
      from public.worker_checkins item
      where item.project_id=p_project_id
        and item.checked_in_at::date=p_log_date
    ),'[]'::jsonb),
    'attachmentIds',coalesce((
      select jsonb_agg(item.id order by item.id)
      from public.attachments item
      where item.project_id=p_project_id
        and item.owner_id=uid
        and item.created_at::date=p_log_date
    ),'[]'::jsonb),
    'completedTaskIds',coalesce((
      select jsonb_agg(item.id order by item.id)
      from public.site_tasks item
      where item.project_id=p_project_id
        and item.owner_id=uid
        and item.status='done'
        and item.completed_at::date=p_log_date
    ),'[]'::jsonb),
    'pendingTaskReviewIds',coalesce((
      select jsonb_agg(item.id order by item.id)
      from public.site_tasks item
      where item.project_id=p_project_id
        and item.owner_id=uid
        and item.status='review'
        and item.submitted_at::date=p_log_date
    ),'[]'::jsonb),
    'incompleteReceiptIds',coalesce((
      select jsonb_agg(item.id order by item.id)
      from public.receipts item
      where item.project_id=p_project_id
        and item.owner_id=uid
        and item.status<>'ready'
        and item.created_at::date=p_log_date
    ),'[]'::jsonb)
  );

  insert into public.day_closures(
    id,owner_id,project_id,log_date,version,supersedes_closure_id,
    correction_reason,snapshot_json,content_hash,confirmation_version,
    acknowledged_warnings,confirmed_at,confirmed_by
  ) values (
    p_id,uid,p_project_id,p_log_date,next_version,
    latest.id,nullif(trim(p_correction_reason),''),
    snapshot,
    encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),
    'sk-v1',coalesce(p_acknowledged_warnings,'{}'),now(),uid
  ) returning * into result;

  update public.diary_entries set locked_at=coalesce(locked_at,result.confirmed_at),
    locked_by=coalesce(locked_by,uid)
  where project_id=p_project_id and owner_id=uid and log_date=p_log_date
    and locked_at is null;

  return result;
end;
$$;

grant select on public.day_closures to authenticated;
revoke execute on function public.confirm_day_closure(
  text,uuid,date,text,text,text[],boolean
) from public,anon;
grant execute on function public.confirm_day_closure(
  text,uuid,date,text,text,text[],boolean
) to authenticated;

alter function public.export_my_data() rename to export_my_data_v13;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v13() || jsonb_build_object(
      'schemaVersion',14,
      'dayClosures',coalesce((
        select jsonb_agg(to_jsonb(item))
        from public.day_closures item
        where item.owner_id=auth.uid()
      ),'[]'::jsonb)
    )
  end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
