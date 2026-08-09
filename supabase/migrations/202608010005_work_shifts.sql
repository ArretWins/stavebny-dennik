-- Worker self-service clock-in/out and foreman-approved payroll timesheets.

create table public.work_shifts (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id uuid not null references public.project_workers(id) on delete restrict,
  shift_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  note text check (note is null or char_length(trim(note)) between 1 and 500),
  source text not null check (source in ('worker','manual')),
  status text not null check (status in ('active','completed','approved')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status='active' and ended_at is null and approved_at is null and approved_by is null)
    or (status='completed' and ended_at is not null and approved_at is null and approved_by is null)
    or (status='approved' and ended_at is not null and approved_at is not null and approved_by is not null)
  ),
  check (ended_at is null or (ended_at>started_at and ended_at<=started_at+interval '24 hours')),
  check (ended_at is null or break_minutes*interval '1 minute'<ended_at-started_at)
);
create unique index work_shifts_one_active_worker_idx
  on public.work_shifts(project_id,worker_id) where status='active';
create index work_shifts_project_date_idx
  on public.work_shifts(project_id,shift_date desc,started_at);
create index work_shifts_worker_date_idx
  on public.work_shifts(worker_id,shift_date desc);

create table public.work_shift_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  shift_id text not null references public.work_shifts(id) on delete cascade,
  worker_id uuid not null references public.project_workers(id) on delete restrict,
  event_type text not null check (event_type in ('started','ended','created','corrected','approved','reopened')),
  body text check (body is null or char_length(trim(body)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index work_shift_events_timeline_idx on public.work_shift_events(shift_id,created_at,id);

alter table public.work_shifts enable row level security;
alter table public.work_shift_events enable row level security;
create policy work_shifts_participant_select on public.work_shifts for select using (
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))
  or exists(select 1 from public.project_workers worker where worker.id=worker_id and worker.auth_user_id=auth.uid())
);
create policy work_shift_events_participant_select on public.work_shift_events for select using (
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))
  or exists(select 1 from public.project_workers worker where worker.id=worker_id and worker.auth_user_id=auth.uid())
);

create or replace function public.guard_work_shift_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(select 1 from public.projects where id=old.project_id) then return old; end if;
  if current_setting('app.work_shift_rpc',true) is distinct from '1' then raise exception 'WORK_SHIFT_RPC_REQUIRED'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger work_shifts_guard before insert or update or delete on public.work_shifts
  for each row execute function public.guard_work_shift_change();

create or replace function public.guard_work_shift_event_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(select 1 from public.work_shifts where id=old.shift_id) then return old; end if;
  raise exception 'WORK_SHIFT_EVENT_IMMUTABLE';
end;
$$;
create trigger work_shift_events_immutable before update or delete on public.work_shift_events
  for each row execute function public.guard_work_shift_event_change();

create or replace function public.start_my_work_shift(p_project_id uuid)
returns public.work_shifts language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); worker public.project_workers%rowtype; result public.work_shifts%rowtype;
begin
  select * into worker from public.project_workers
    where project_id=p_project_id and auth_user_id=uid and status='active';
  if worker.id is null then raise exception 'ACTIVE_PROJECT_WORKER_REQUIRED'; end if;
  if exists(select 1 from public.work_shifts where project_id=p_project_id and worker_id=worker.id and status='active')
    then raise exception 'WORK_SHIFT_ALREADY_ACTIVE'; end if;
  perform set_config('app.work_shift_rpc','1',true);
  insert into public.work_shifts(id,owner_id,project_id,worker_id,shift_date,started_at,source,status)
    values ('shift_'||replace(gen_random_uuid()::text,'-',''),worker.owner_id,p_project_id,worker.id,
      (now() at time zone 'Europe/Bratislava')::date,now(),'worker','active') returning * into result;
  insert into public.work_shift_events(owner_id,project_id,shift_id,worker_id,event_type,actor_user_id)
    values(result.owner_id,result.project_id,result.id,result.worker_id,'started',uid);
  return result;
exception when unique_violation then raise exception 'WORK_SHIFT_ALREADY_ACTIVE';
end;
$$;

create or replace function public.end_my_work_shift(p_shift_id text,p_break_minutes integer default 0,p_note text default null)
returns public.work_shifts language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.work_shifts%rowtype;
begin
  if p_break_minutes not between 0 and 240 or (p_note is not null and char_length(trim(p_note)) not between 1 and 500)
    then raise exception 'INVALID_WORK_SHIFT_INPUT'; end if;
  perform set_config('app.work_shift_rpc','1',true);
  update public.work_shifts shift set ended_at=now(),break_minutes=p_break_minutes,note=nullif(trim(p_note),''),status='completed',updated_at=now()
    where shift.id=p_shift_id and shift.status='active' and exists(
      select 1 from public.project_workers worker where worker.id=shift.worker_id and worker.auth_user_id=uid and worker.status='active'
    ) and now()>shift.started_at
      and p_break_minutes*interval '1 minute'<now()-shift.started_at
    returning * into result;
  if result.id is null then raise exception 'ACTIVE_WORK_SHIFT_NOT_FOUND'; end if;
  insert into public.work_shift_events(owner_id,project_id,shift_id,worker_id,event_type,body,metadata,actor_user_id)
    values(result.owner_id,result.project_id,result.id,result.worker_id,'ended',result.note,
      jsonb_build_object('breakMinutes',result.break_minutes),uid);
  return result;
end;
$$;

create or replace function public.save_work_shift(p_id text,p_project_id uuid,p_worker_id uuid,p_started_at timestamptz,p_ended_at timestamptz,p_break_minutes integer default 0,p_note text default null)
returns public.work_shifts language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); existing public.work_shifts%rowtype; result public.work_shifts%rowtype; event_name text;
begin
  if not public.owns_project(p_project_id,uid) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.project_workers where id=p_worker_id and project_id=p_project_id and owner_id=uid)
    then raise exception 'PROJECT_WORKER_SCOPE'; end if;
  if nullif(trim(p_id),'') is null or p_ended_at<=p_started_at or p_ended_at>p_started_at+interval '24 hours'
    or p_started_at>now()+interval '5 minutes' or p_ended_at>now()+interval '5 minutes'
    or p_break_minutes not between 0 and 240 or p_break_minutes*interval '1 minute'>=p_ended_at-p_started_at
    or (p_note is not null and char_length(trim(p_note)) not between 1 and 500)
    then raise exception 'INVALID_WORK_SHIFT_INPUT'; end if;
  select * into existing from public.work_shifts where id=p_id for update;
  if existing.id is not null and (existing.owner_id<>uid or existing.project_id<>p_project_id or existing.status='approved')
    then raise exception 'WORK_SHIFT_NOT_EDITABLE'; end if;
  if exists(
    select 1 from public.work_shifts shift
    where shift.project_id=p_project_id and shift.worker_id=p_worker_id
      and shift.id<>p_id
      and shift.started_at<p_ended_at
      and coalesce(shift.ended_at,'infinity'::timestamptz)>p_started_at
  ) then raise exception 'WORK_SHIFT_OVERLAP'; end if;
  perform set_config('app.work_shift_rpc','1',true);
  if existing.id is null then
    insert into public.work_shifts(id,owner_id,project_id,worker_id,shift_date,started_at,ended_at,break_minutes,note,source,status)
      values(trim(p_id),uid,p_project_id,p_worker_id,(p_started_at at time zone 'Europe/Bratislava')::date,p_started_at,p_ended_at,p_break_minutes,nullif(trim(p_note),''),'manual','completed') returning * into result;
    event_name:='created';
  else
    update public.work_shifts set worker_id=p_worker_id,shift_date=(p_started_at at time zone 'Europe/Bratislava')::date,
      started_at=p_started_at,ended_at=p_ended_at,break_minutes=p_break_minutes,note=nullif(trim(p_note),''),status='completed',updated_at=now()
      where id=p_id returning * into result;
    event_name:='corrected';
  end if;
  insert into public.work_shift_events(owner_id,project_id,shift_id,worker_id,event_type,body,metadata,actor_user_id)
    values(uid,p_project_id,result.id,result.worker_id,event_name,result.note,
      jsonb_build_object('startedAt',result.started_at,'endedAt',result.ended_at,'breakMinutes',result.break_minutes),uid);
  return result;
end;
$$;

create or replace function public.approve_work_shift(p_shift_id text)
returns public.work_shifts language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.work_shifts%rowtype;
begin
  perform set_config('app.work_shift_rpc','1',true);
  update public.work_shifts set status='approved',approved_at=now(),approved_by=uid,updated_at=now()
    where id=p_shift_id and owner_id=uid and status='completed' and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'WORK_SHIFT_NOT_APPROVABLE'; end if;
  insert into public.work_shift_events(owner_id,project_id,shift_id,worker_id,event_type,actor_user_id)
    values(uid,result.project_id,result.id,result.worker_id,'approved',uid);
  return result;
end;
$$;

create or replace function public.reopen_work_shift(p_shift_id text,p_reason text)
returns public.work_shifts language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.work_shifts%rowtype;
begin
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'WORK_SHIFT_REOPEN_REASON_REQUIRED'; end if;
  perform set_config('app.work_shift_rpc','1',true);
  update public.work_shifts set status='completed',approved_at=null,approved_by=null,updated_at=now()
    where id=p_shift_id and owner_id=uid and status='approved' and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'WORK_SHIFT_NOT_REOPENABLE'; end if;
  insert into public.work_shift_events(owner_id,project_id,shift_id,worker_id,event_type,body,actor_user_id)
    values(uid,result.project_id,result.id,result.worker_id,'reopened',trim(p_reason),uid);
  return result;
end;
$$;

revoke insert,update,delete on public.work_shifts,public.work_shift_events from public,anon,authenticated;
grant select on public.work_shifts,public.work_shift_events to authenticated;
revoke execute on function public.start_my_work_shift(uuid),public.end_my_work_shift(text,integer,text),
  public.save_work_shift(text,uuid,uuid,timestamptz,timestamptz,integer,text),
  public.approve_work_shift(text),public.reopen_work_shift(text,text) from public,anon;
grant execute on function public.start_my_work_shift(uuid),public.end_my_work_shift(text,integer,text),
  public.save_work_shift(text,uuid,uuid,timestamptz,timestamptz,integer,text),
  public.approve_work_shift(text),public.reopen_work_shift(text,text) to authenticated;

create trigger work_shifts_audit after insert or update or delete on public.work_shifts for each row execute function public.audit_row();
create trigger work_shift_events_audit after insert or update or delete on public.work_shift_events for each row execute function public.audit_row();

alter function public.export_my_data() rename to export_my_data_v18;
create function public.export_my_data() returns jsonb language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else public.export_my_data_v18() || jsonb_build_object(
    'schemaVersion',19,
    'workShifts',coalesce((select jsonb_agg(to_jsonb(item) order by item.shift_date,item.started_at) from public.work_shifts item where item.owner_id=auth.uid()),'[]'::jsonb),
    'workShiftEvents',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at,item.id) from public.work_shift_events item where item.owner_id=auth.uid()),'[]'::jsonb)
  ) end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
