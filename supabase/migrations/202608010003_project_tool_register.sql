-- Audited tool and equipment custody register with printable QR identities.

create table public.project_tools (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_number integer not null check (asset_number between 1 and 1000000),
  name text not null check (char_length(trim(name)) between 2 and 160),
  category text not null check (char_length(trim(category)) between 2 and 80),
  manufacturer text check (
    manufacturer is null or char_length(trim(manufacturer)) between 2 and 100
  ),
  model text check (model is null or char_length(trim(model)) between 1 and 100),
  serial_number text check (
    serial_number is null or char_length(trim(serial_number)) between 1 and 120
  ),
  note text check (note is null or char_length(trim(note)) between 1 and 1000),
  status text not null default 'available' check (
    status in ('available','issued','maintenance','lost','retired')
  ),
  current_worker_id uuid references public.project_workers(id) on delete restrict,
  issued_at timestamptz,
  expected_return_date date,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,asset_number),
  check (
    (status='issued' and current_worker_id is not null and issued_at is not null)
    or (status<>'issued' and current_worker_id is null and issued_at is null
      and expected_return_date is null)
  ),
  check ((status='retired')=(retired_at is not null))
);
create unique index project_tools_serial_idx
  on public.project_tools(project_id,lower(serial_number))
  where serial_number is not null;
create index project_tools_project_status_idx
  on public.project_tools(project_id,status,asset_number);
create index project_tools_worker_idx
  on public.project_tools(current_worker_id) where current_worker_id is not null;

create table public.project_tool_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  tool_id text not null references public.project_tools(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'registered','updated','issued','returned','damaged','lost',
      'maintenance_completed','retired'
    )
  ),
  worker_id uuid references public.project_workers(id) on delete set null,
  body text check (body is null or char_length(trim(body)) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_tool_events_timeline_idx
  on public.project_tool_events(tool_id,created_at,id);

alter table public.project_tools enable row level security;
alter table public.project_tool_events enable row level security;
create policy project_tools_owner_select on public.project_tools
  for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );
create policy project_tool_events_owner_select on public.project_tool_events
  for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );

create or replace function public.reject_project_tool_direct_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(
    select 1 from public.projects where id=old.project_id
  ) then return old; end if;
  if current_setting('app.project_tool_rpc',true) is distinct from '1' then
    raise exception 'PROJECT_TOOL_RPC_REQUIRED';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger project_tools_guard
  before insert or update or delete on public.project_tools
  for each row execute function public.reject_project_tool_direct_change();

create or replace function public.reject_project_tool_event_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(
    select 1 from public.project_tools where id=old.tool_id
  ) then return old; end if;
  raise exception 'PROJECT_TOOL_EVENT_IMMUTABLE';
end;
$$;
create trigger project_tool_events_immutable
  before update or delete on public.project_tool_events
  for each row execute function public.reject_project_tool_event_change();

create or replace function public.save_project_tool(
  p_id text,
  p_project_id uuid,
  p_name text,
  p_category text,
  p_manufacturer text default null,
  p_model text default null,
  p_serial_number text default null,
  p_note text default null
) returns public.project_tools
language plpgsql security definer set search_path=public,auth as $$
declare
  uid uuid:=auth.uid();
  existing public.project_tools%rowtype;
  result public.project_tools%rowtype;
  next_number integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid) then
    raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if nullif(trim(p_id),'') is null
    or char_length(trim(p_name)) not between 2 and 160
    or char_length(trim(p_category)) not between 2 and 80
    or (p_manufacturer is not null and char_length(trim(p_manufacturer)) not between 2 and 100)
    or (p_model is not null and char_length(trim(p_model)) not between 1 and 100)
    or (p_serial_number is not null and char_length(trim(p_serial_number)) not between 1 and 120)
    or (p_note is not null and char_length(trim(p_note)) not between 1 and 1000)
    then raise exception 'INVALID_PROJECT_TOOL'; end if;
  select * into existing from public.project_tools where id=p_id for update;
  if existing.id is not null and (
    existing.owner_id<>uid or existing.project_id<>p_project_id
  ) then raise exception 'PROJECT_TOOL_SCOPE'; end if;
  if existing.status='retired' then raise exception 'PROJECT_TOOL_RETIRED'; end if;

  perform set_config('app.project_tool_rpc','1',true);
  if existing.id is null then
    perform pg_advisory_xact_lock(hashtext(p_project_id::text||':tools'));
    select coalesce(max(asset_number),0)+1 into next_number
      from public.project_tools where project_id=p_project_id;
    insert into public.project_tools(
      id,owner_id,project_id,asset_number,name,category,manufacturer,model,
      serial_number,note
    ) values (
      trim(p_id),uid,p_project_id,next_number,trim(p_name),trim(p_category),
      nullif(trim(p_manufacturer),''),nullif(trim(p_model),''),
      nullif(trim(p_serial_number),''),nullif(trim(p_note),'')
    ) returning * into result;
    insert into public.project_tool_events(
      owner_id,project_id,tool_id,event_type,actor_user_id
    ) values (uid,p_project_id,result.id,'registered',uid);
  else
    update public.project_tools set
      name=trim(p_name),category=trim(p_category),
      manufacturer=nullif(trim(p_manufacturer),''),model=nullif(trim(p_model),''),
      serial_number=nullif(trim(p_serial_number),''),note=nullif(trim(p_note),''),
      updated_at=now()
      where id=p_id returning * into result;
    insert into public.project_tool_events(
      owner_id,project_id,tool_id,event_type,actor_user_id
    ) values (uid,p_project_id,result.id,'updated',uid);
  end if;
  return result;
exception when unique_violation then
  raise exception 'PROJECT_TOOL_SERIAL_EXISTS';
end;
$$;

create or replace function public.issue_project_tool(
  p_tool_id text,p_worker_id uuid,p_expected_return_date date default null,
  p_note text default null
) returns public.project_tools
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_tools%rowtype;
begin
  if p_expected_return_date is not null and p_expected_return_date<current_date
    then raise exception 'INVALID_TOOL_RETURN_DATE'; end if;
  if p_note is not null and char_length(trim(p_note)) not between 1 and 1000
    then raise exception 'INVALID_TOOL_NOTE'; end if;
  if not exists(
    select 1 from public.project_workers worker
    join public.project_tools tool on tool.id=p_tool_id
    where worker.id=p_worker_id and worker.project_id=tool.project_id
      and worker.owner_id=uid and worker.status='active'
  ) then raise exception 'ACTIVE_PROJECT_WORKER_REQUIRED'; end if;
  perform set_config('app.project_tool_rpc','1',true);
  update public.project_tools set
    status='issued',current_worker_id=p_worker_id,issued_at=now(),
    expected_return_date=p_expected_return_date,updated_at=now()
    where id=p_tool_id and owner_id=uid and status='available'
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_TOOL_NOT_AVAILABLE'; end if;
  insert into public.project_tool_events(
    owner_id,project_id,tool_id,event_type,worker_id,body,metadata,actor_user_id
  ) values (
    uid,result.project_id,result.id,'issued',p_worker_id,nullif(trim(p_note),''),
    jsonb_build_object('expectedReturnDate',p_expected_return_date),uid
  );
  return result;
end;
$$;

create or replace function public.return_project_tool(
  p_tool_id text,p_condition text,p_note text default null
) returns public.project_tools
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_tools%rowtype; prior_worker uuid;
begin
  if p_condition not in ('serviceable','damaged') then
    raise exception 'INVALID_TOOL_RETURN_CONDITION'; end if;
  if p_note is not null and char_length(trim(p_note)) not between 1 and 1000
    then raise exception 'INVALID_TOOL_NOTE'; end if;
  select current_worker_id into prior_worker from public.project_tools
    where id=p_tool_id and owner_id=uid for update;
  perform set_config('app.project_tool_rpc','1',true);
  update public.project_tools set
    status=case when p_condition='damaged' then 'maintenance' else 'available' end,
    current_worker_id=null,issued_at=null,expected_return_date=null,updated_at=now()
    where id=p_tool_id and owner_id=uid and status='issued'
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_TOOL_NOT_ISSUED'; end if;
  insert into public.project_tool_events(
    owner_id,project_id,tool_id,event_type,worker_id,body,metadata,actor_user_id
  ) values (
    uid,result.project_id,result.id,'returned',prior_worker,nullif(trim(p_note),''),
    jsonb_build_object('condition',p_condition),uid
  );
  if p_condition='damaged' then
    insert into public.project_tool_events(
      owner_id,project_id,tool_id,event_type,worker_id,body,actor_user_id
    ) values (
      uid,result.project_id,result.id,'damaged',prior_worker,
      coalesce(nullif(trim(p_note),''),'Poškodenie zistené pri vrátení'),uid
    );
  end if;
  return result;
end;
$$;

create or replace function public.report_project_tool_issue(
  p_tool_id text,p_issue_type text,p_note text
) returns public.project_tools
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_tools%rowtype; prior_worker uuid;
begin
  if p_issue_type not in ('damaged','lost')
    or char_length(trim(p_note)) not between 3 and 1000
    then raise exception 'INVALID_PROJECT_TOOL_ISSUE'; end if;
  select current_worker_id into prior_worker from public.project_tools
    where id=p_tool_id and owner_id=uid for update;
  perform set_config('app.project_tool_rpc','1',true);
  update public.project_tools set
    status=case when p_issue_type='lost' then 'lost' else 'maintenance' end,
    current_worker_id=null,issued_at=null,expected_return_date=null,updated_at=now()
    where id=p_tool_id and owner_id=uid and status in ('available','issued')
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_TOOL_ISSUE_NOT_ALLOWED'; end if;
  insert into public.project_tool_events(
    owner_id,project_id,tool_id,event_type,worker_id,body,actor_user_id
  ) values (
    uid,result.project_id,result.id,p_issue_type,prior_worker,trim(p_note),uid
  );
  return result;
end;
$$;

create or replace function public.complete_project_tool_maintenance(
  p_tool_id text,p_note text default null
) returns public.project_tools
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_tools%rowtype;
begin
  if p_note is not null and char_length(trim(p_note)) not between 1 and 1000
    then raise exception 'INVALID_TOOL_NOTE'; end if;
  perform set_config('app.project_tool_rpc','1',true);
  update public.project_tools set status='available',updated_at=now()
    where id=p_tool_id and owner_id=uid and status in ('maintenance','lost')
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_TOOL_NOT_RESTORABLE'; end if;
  insert into public.project_tool_events(
    owner_id,project_id,tool_id,event_type,body,actor_user_id
  ) values (
    uid,result.project_id,result.id,'maintenance_completed',
    nullif(trim(p_note),''),uid
  );
  return result;
end;
$$;

create or replace function public.retire_project_tool(
  p_tool_id text,p_reason text,p_confirmed boolean
) returns public.project_tools
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_tools%rowtype;
begin
  if not coalesce(p_confirmed,false) then
    raise exception 'PROJECT_TOOL_RETIRE_CONFIRMATION_REQUIRED'; end if;
  if char_length(trim(p_reason)) not between 3 and 1000 then
    raise exception 'PROJECT_TOOL_RETIRE_REASON_REQUIRED'; end if;
  perform set_config('app.project_tool_rpc','1',true);
  update public.project_tools set status='retired',retired_at=now(),updated_at=now()
    where id=p_tool_id and owner_id=uid
      and status in ('available','maintenance','lost')
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_TOOL_NOT_RETIRABLE'; end if;
  insert into public.project_tool_events(
    owner_id,project_id,tool_id,event_type,body,actor_user_id
  ) values (uid,result.project_id,result.id,'retired',trim(p_reason),uid);
  return result;
end;
$$;

revoke insert,update,delete on public.project_tools,public.project_tool_events
  from public,anon,authenticated;
grant select on public.project_tools,public.project_tool_events to authenticated;
revoke execute on function public.save_project_tool(
  text,uuid,text,text,text,text,text,text
),public.issue_project_tool(text,uuid,date,text),
  public.return_project_tool(text,text,text),
  public.report_project_tool_issue(text,text,text),
  public.complete_project_tool_maintenance(text,text),
  public.retire_project_tool(text,text,boolean) from public,anon;
grant execute on function public.save_project_tool(
  text,uuid,text,text,text,text,text,text
),public.issue_project_tool(text,uuid,date,text),
  public.return_project_tool(text,text,text),
  public.report_project_tool_issue(text,text,text),
  public.complete_project_tool_maintenance(text,text),
  public.retire_project_tool(text,text,boolean) to authenticated;

create trigger project_tools_audit after insert or update or delete
  on public.project_tools for each row execute function public.audit_row();
create trigger project_tool_events_audit after insert or update or delete
  on public.project_tool_events for each row execute function public.audit_row();

alter function public.export_my_data() rename to export_my_data_v17;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v17() || jsonb_build_object(
      'schemaVersion',18,
      'projectTools',coalesce((
        select jsonb_agg(to_jsonb(item) order by item.project_id,item.asset_number)
        from public.project_tools item where item.owner_id=auth.uid()
      ),'[]'::jsonb),
      'projectToolEvents',coalesce((
        select jsonb_agg(to_jsonb(item) order by item.created_at,item.id)
        from public.project_tool_events item where item.owner_id=auth.uid()
      ),'[]'::jsonb)
    )
  end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
