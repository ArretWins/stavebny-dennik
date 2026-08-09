-- Formal requests for information tied to an exact drawing revision and point.

alter table public.attachments
  drop constraint attachments_related_entity_type_check,
  add constraint attachments_related_entity_type_check check (
    related_entity_type in (
      'diary_entry','delay_event','worker_checkin','attachment',
      'weather_snapshot','site_task','project_rfi'
    )
  );

create table public.project_rfis (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  rfi_number integer not null check (rfi_number between 1 and 1000000),
  subject text not null check (char_length(trim(subject)) between 3 and 160),
  question text not null check (char_length(trim(question)) between 10 and 4000),
  recipient_name text not null
    check (char_length(trim(recipient_name)) between 2 and 160),
  due_date date,
  plan_id text references public.project_plans(id) on delete set null,
  page_number integer check (page_number between 1 and 10000),
  x_ratio double precision check (x_ratio between 0 and 1),
  y_ratio double precision check (y_ratio between 0 and 1),
  status text not null default 'draft'
    check (status in ('draft','open','answered','closed')),
  answer text check (
    answer is null or char_length(trim(answer)) between 3 and 4000
  ),
  answered_by_name text check (
    answered_by_name is null
    or char_length(trim(answered_by_name)) between 2 and 160
  ),
  opened_at timestamptz,
  answered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,rfi_number),
  check (
    (plan_id is null and page_number is null and x_ratio is null and y_ratio is null)
    or
    (plan_id is not null and page_number is not null and x_ratio is not null and y_ratio is not null)
  ),
  check (
    (status='draft' and opened_at is null)
    or (status<>'draft' and opened_at is not null)
  ),
  check (
    (status in ('draft','open') and answered_at is null)
    or (status in ('answered','closed') and answered_at is not null
      and answer is not null and answered_by_name is not null)
    or (status='open' and answered_at is not null)
  ),
  check ((status='closed')=(closed_at is not null))
);

create index project_rfis_project_status_due_idx
  on public.project_rfis(project_id,status,due_date,rfi_number);
create index project_rfis_plan_pin_idx
  on public.project_rfis(plan_id,page_number)
  where plan_id is not null;

create table public.project_rfi_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  rfi_id text not null references public.project_rfis(id) on delete cascade,
  event_type text not null
    check (event_type in ('created','updated','opened','answered','closed','reopened')),
  body text check (body is null or char_length(body) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_rfi_events_timeline_idx
  on public.project_rfi_events(rfi_id,created_at,id);

alter table public.project_rfis enable row level security;
alter table public.project_rfi_events enable row level security;
create policy project_rfis_owner_select on public.project_rfis
  for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );
create policy project_rfi_events_owner_select on public.project_rfi_events
  for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );

create or replace function public.reject_project_rfi_direct_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(
    select 1 from public.projects where id=old.project_id
  ) then return old; end if;
  if current_setting('app.project_rfi_rpc',true) is distinct from '1' then
    raise exception 'PROJECT_RFI_RPC_REQUIRED';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger project_rfis_guard
  before insert or update or delete on public.project_rfis
  for each row execute function public.reject_project_rfi_direct_change();

create or replace function public.reject_project_rfi_event_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(
    select 1 from public.project_rfis where id=old.rfi_id
  ) then return old; end if;
  raise exception 'PROJECT_RFI_EVENT_IMMUTABLE';
end;
$$;
create trigger project_rfi_events_immutable
  before update or delete on public.project_rfi_events
  for each row execute function public.reject_project_rfi_event_change();

create or replace function public.validate_rfi_plan_pin(
  p_owner_id uuid,
  p_project_id uuid,
  p_plan_id text,
  p_page_number integer,
  p_x_ratio double precision,
  p_y_ratio double precision
) returns void language plpgsql stable set search_path=public as $$
begin
  if p_plan_id is null and p_page_number is null
    and p_x_ratio is null and p_y_ratio is null then return; end if;
  if p_plan_id is null or p_page_number is null
    or p_x_ratio is null or p_y_ratio is null
    or p_page_number not between 1 and 10000
    or p_x_ratio not between 0 and 1 or p_y_ratio not between 0 and 1
    or not exists(
      select 1 from public.project_plans plan
      where plan.id=p_plan_id and plan.project_id=p_project_id
        and plan.owner_id=p_owner_id and p_page_number<=plan.page_count
    ) then raise exception 'INVALID_RFI_PLAN_PIN'; end if;
end;
$$;

create or replace function public.save_project_rfi(
  p_id text,
  p_project_id uuid,
  p_subject text,
  p_question text,
  p_recipient_name text,
  p_due_date date default null,
  p_plan_id text default null,
  p_page_number integer default null,
  p_x_ratio double precision default null,
  p_y_ratio double precision default null
) returns public.project_rfis
language plpgsql security definer set search_path=public,auth as $$
declare
  uid uuid:=auth.uid();
  existing public.project_rfis%rowtype;
  result public.project_rfis%rowtype;
  next_number integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid) then
    raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if nullif(trim(p_id),'') is null
    or char_length(trim(p_subject)) not between 3 and 160
    or char_length(trim(p_question)) not between 10 and 4000
    or char_length(trim(p_recipient_name)) not between 2 and 160
    or (p_due_date is not null and p_due_date<current_date)
    then raise exception 'INVALID_PROJECT_RFI'; end if;
  perform public.validate_rfi_plan_pin(
    uid,p_project_id,p_plan_id,p_page_number,p_x_ratio,p_y_ratio
  );
  select * into existing from public.project_rfis where id=p_id for update;
  if existing.id is not null and (
    existing.owner_id<>uid or existing.project_id<>p_project_id
  ) then raise exception 'PROJECT_RFI_SCOPE'; end if;
  if existing.id is not null and existing.status<>'draft' then
    raise exception 'OPEN_PROJECT_RFI_IMMUTABLE'; end if;

  if existing.id is null then
    perform pg_advisory_xact_lock(hashtext(p_project_id::text||':rfi'));
    select coalesce(max(rfi_number),0)+1 into next_number
      from public.project_rfis where project_id=p_project_id;
    perform set_config('app.project_rfi_rpc','1',true);
    insert into public.project_rfis(
      id,owner_id,project_id,rfi_number,subject,question,recipient_name,
      due_date,plan_id,page_number,x_ratio,y_ratio
    ) values (
      p_id,uid,p_project_id,next_number,trim(p_subject),trim(p_question),
      trim(p_recipient_name),p_due_date,p_plan_id,p_page_number,p_x_ratio,p_y_ratio
    ) returning * into result;
    insert into public.project_rfi_events(
      owner_id,project_id,rfi_id,event_type,actor_user_id
    ) values (uid,p_project_id,p_id,'created',uid);
  else
    perform set_config('app.project_rfi_rpc','1',true);
    update public.project_rfis set
      subject=trim(p_subject),question=trim(p_question),
      recipient_name=trim(p_recipient_name),due_date=p_due_date,
      plan_id=p_plan_id,page_number=p_page_number,x_ratio=p_x_ratio,y_ratio=p_y_ratio,
      updated_at=now()
      where id=p_id returning * into result;
    insert into public.project_rfi_events(
      owner_id,project_id,rfi_id,event_type,actor_user_id
    ) values (uid,p_project_id,p_id,'updated',uid);
  end if;
  return result;
end;
$$;

create or replace function public.open_project_rfi(
  p_rfi_id text,p_confirmed boolean
) returns public.project_rfis
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_rfis%rowtype;
begin
  if not coalesce(p_confirmed,false) then
    raise exception 'RFI_OPEN_CONFIRMATION_REQUIRED'; end if;
  perform set_config('app.project_rfi_rpc','1',true);
  update public.project_rfis set status='open',opened_at=now(),updated_at=now()
    where id=p_rfi_id and owner_id=uid and status='draft'
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_RFI_NOT_OPENABLE'; end if;
  insert into public.project_rfi_events(
    owner_id,project_id,rfi_id,event_type,actor_user_id
  ) values (uid,result.project_id,result.id,'opened',uid);
  return result;
end;
$$;

create or replace function public.answer_project_rfi(
  p_rfi_id text,p_answer text,p_answered_by_name text
) returns public.project_rfis
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_rfis%rowtype;
begin
  if char_length(trim(p_answer)) not between 3 and 4000
    or char_length(trim(p_answered_by_name)) not between 2 and 160
    then raise exception 'INVALID_RFI_ANSWER'; end if;
  perform set_config('app.project_rfi_rpc','1',true);
  update public.project_rfis set
    status='answered',answer=trim(p_answer),answered_by_name=trim(p_answered_by_name),
    answered_at=now(),closed_at=null,updated_at=now()
    where id=p_rfi_id and owner_id=uid and status='open'
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_RFI_NOT_ANSWERABLE'; end if;
  insert into public.project_rfi_events(
    owner_id,project_id,rfi_id,event_type,body,metadata,actor_user_id
  ) values (
    uid,result.project_id,result.id,'answered',result.answer,
    jsonb_build_object('answeredByName',result.answered_by_name),uid
  );
  return result;
end;
$$;

create or replace function public.close_project_rfi(
  p_rfi_id text,p_confirmed boolean
) returns public.project_rfis
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_rfis%rowtype;
begin
  if not coalesce(p_confirmed,false) then
    raise exception 'RFI_CLOSE_CONFIRMATION_REQUIRED'; end if;
  perform set_config('app.project_rfi_rpc','1',true);
  update public.project_rfis set status='closed',closed_at=now(),updated_at=now()
    where id=p_rfi_id and owner_id=uid and status='answered'
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_RFI_NOT_CLOSABLE'; end if;
  insert into public.project_rfi_events(
    owner_id,project_id,rfi_id,event_type,actor_user_id
  ) values (uid,result.project_id,result.id,'closed',uid);
  return result;
end;
$$;

create or replace function public.reopen_project_rfi(
  p_rfi_id text,p_reason text
) returns public.project_rfis
language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.project_rfis%rowtype;
begin
  if char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'RFI_REOPEN_REASON_REQUIRED'; end if;
  perform set_config('app.project_rfi_rpc','1',true);
  update public.project_rfis set status='open',closed_at=null,updated_at=now()
    where id=p_rfi_id and owner_id=uid and status in ('answered','closed')
      and public.owns_project(project_id,uid)
    returning * into result;
  if result.id is null then raise exception 'PROJECT_RFI_NOT_REOPENABLE'; end if;
  insert into public.project_rfi_events(
    owner_id,project_id,rfi_id,event_type,body,actor_user_id
  ) values (uid,result.project_id,result.id,'reopened',trim(p_reason),uid);
  return result;
end;
$$;

revoke insert,update,delete on public.project_rfis,public.project_rfi_events
  from public,anon,authenticated;
grant select on public.project_rfis,public.project_rfi_events to authenticated;
revoke execute on function public.save_project_rfi(
  text,uuid,text,text,text,date,text,integer,double precision,double precision
) from public,anon;
revoke execute on function public.open_project_rfi(text,boolean),
  public.answer_project_rfi(text,text,text),
  public.close_project_rfi(text,boolean),public.reopen_project_rfi(text,text)
  from public,anon;
grant execute on function public.save_project_rfi(
  text,uuid,text,text,text,date,text,integer,double precision,double precision
) to authenticated;
grant execute on function public.open_project_rfi(text,boolean),
  public.answer_project_rfi(text,text,text),
  public.close_project_rfi(text,boolean),public.reopen_project_rfi(text,text)
  to authenticated;

create trigger project_rfis_audit after insert or update or delete
  on public.project_rfis for each row execute function public.audit_row();
create trigger project_rfi_events_audit after insert or update or delete
  on public.project_rfi_events for each row execute function public.audit_row();

alter function public.export_my_data() rename to export_my_data_v16;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v16() || jsonb_build_object(
      'schemaVersion',17,
      'projectRfis',coalesce((
        select jsonb_agg(to_jsonb(item) order by item.project_id,item.rfi_number)
        from public.project_rfis item where item.owner_id=auth.uid()
      ),'[]'::jsonb),
      'projectRfiEvents',coalesce((
        select jsonb_agg(to_jsonb(item) order by item.created_at,item.id)
        from public.project_rfi_events item where item.owner_id=auth.uid()
      ),'[]'::jsonb)
    )
  end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
