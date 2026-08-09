-- Published safety briefings with immutable content evidence and personal worker acknowledgements.

create table public.safety_briefings (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 160),
  body text not null check (char_length(trim(body)) between 10 and 4000),
  briefing_date date not null,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status='draft' and content_hash is null and published_at is null and published_by is null and closed_at is null and closed_by is null)
    or (status='published' and content_hash is not null and published_at is not null and published_by is not null and closed_at is null and closed_by is null)
    or (status='closed' and content_hash is not null and published_at is not null and published_by is not null and closed_at is not null and closed_by is not null)
  )
);
create index safety_briefings_project_date_idx on public.safety_briefings(project_id,briefing_date desc,created_at desc);

create table public.safety_briefing_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  briefing_id text not null references public.safety_briefings(id) on delete cascade,
  worker_id uuid not null references public.project_workers(id) on delete restrict,
  worker_name text not null check (char_length(trim(worker_name)) between 3 and 180),
  position text not null check (char_length(trim(position)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending','acknowledged','excused')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  excused_at timestamptz,
  excused_by uuid references auth.users(id) on delete set null,
  excuse_reason text check (excuse_reason is null or char_length(trim(excuse_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  unique(briefing_id,worker_id),
  check (
    (status='pending' and acknowledged_at is null and acknowledged_by is null and excused_at is null and excused_by is null and excuse_reason is null)
    or (status='acknowledged' and acknowledged_at is not null and acknowledged_by is not null and excused_at is null and excused_by is null and excuse_reason is null)
    or (status='excused' and acknowledged_at is null and acknowledged_by is null and excused_at is not null and excused_by is not null and excuse_reason is not null)
  )
);
create index safety_briefing_recipients_worker_idx on public.safety_briefing_recipients(worker_id,status,created_at desc);
create index safety_briefing_recipients_pending_idx on public.safety_briefing_recipients(project_id,briefing_id) where status='pending';

create table public.safety_briefing_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  briefing_id text not null references public.safety_briefings(id) on delete cascade,
  event_type text not null check (event_type in ('created','updated','published','acknowledged','excused','closed')),
  worker_id uuid references public.project_workers(id) on delete set null,
  body text check (body is null or char_length(trim(body)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index safety_briefing_events_timeline_idx on public.safety_briefing_events(briefing_id,created_at,id);

alter table public.safety_briefings enable row level security;
alter table public.safety_briefing_recipients enable row level security;
alter table public.safety_briefing_events enable row level security;
create policy safety_briefings_participant_select on public.safety_briefings for select using (
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))
  or exists(select 1 from public.safety_briefing_recipients recipient join public.project_workers worker on worker.id=recipient.worker_id where recipient.briefing_id=safety_briefings.id and worker.auth_user_id=auth.uid())
);
create policy safety_briefing_recipients_participant_select on public.safety_briefing_recipients for select using (
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))
  or exists(select 1 from public.project_workers worker where worker.id=worker_id and worker.auth_user_id=auth.uid())
);
create policy safety_briefing_events_owner_select on public.safety_briefing_events for select using (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()));

create or replace function public.guard_safety_briefing_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(select 1 from public.projects where id=old.project_id) then return old; end if;
  if current_setting('app.safety_briefing_rpc',true) is distinct from '1' then raise exception 'SAFETY_BRIEFING_RPC_REQUIRED'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger safety_briefings_guard before insert or update or delete on public.safety_briefings for each row execute function public.guard_safety_briefing_change();
create trigger safety_briefing_recipients_guard before insert or update or delete on public.safety_briefing_recipients for each row execute function public.guard_safety_briefing_change();

create or replace function public.guard_safety_briefing_event_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(select 1 from public.safety_briefings where id=old.briefing_id) then return old; end if;
  raise exception 'SAFETY_BRIEFING_EVENT_IMMUTABLE';
end;
$$;
create trigger safety_briefing_events_immutable before update or delete on public.safety_briefing_events for each row execute function public.guard_safety_briefing_event_change();

create or replace function public.save_safety_briefing(p_id text,p_project_id uuid,p_title text,p_body text,p_briefing_date date)
returns public.safety_briefings language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); existing public.safety_briefings%rowtype; result public.safety_briefings%rowtype; event_name text;
begin
  if not public.owns_project(p_project_id,uid) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if nullif(trim(p_id),'') is null or char_length(trim(p_title)) not between 3 and 160 or char_length(trim(p_body)) not between 10 and 4000 then raise exception 'INVALID_SAFETY_BRIEFING'; end if;
  select * into existing from public.safety_briefings where id=p_id for update;
  if existing.id is not null and (existing.owner_id<>uid or existing.project_id<>p_project_id or existing.status<>'draft') then raise exception 'SAFETY_BRIEFING_NOT_EDITABLE'; end if;
  perform set_config('app.safety_briefing_rpc','1',true);
  if existing.id is null then
    insert into public.safety_briefings(id,owner_id,project_id,title,body,briefing_date) values(trim(p_id),uid,p_project_id,trim(p_title),trim(p_body),p_briefing_date) returning * into result;
    event_name:='created';
  else
    update public.safety_briefings set title=trim(p_title),body=trim(p_body),briefing_date=p_briefing_date,updated_at=now() where id=p_id returning * into result;
    event_name:='updated';
  end if;
  insert into public.safety_briefing_events(owner_id,project_id,briefing_id,event_type,actor_user_id) values(uid,p_project_id,result.id,event_name,uid);
  return result;
end;
$$;

create or replace function public.publish_safety_briefing(p_briefing_id text,p_confirmed boolean)
returns public.safety_briefings language plpgsql security definer set search_path=public,auth,extensions as $$
declare uid uuid:=auth.uid(); result public.safety_briefings%rowtype; digest_value text; recipient_count integer;
begin
  if not coalesce(p_confirmed,false) then raise exception 'SAFETY_BRIEFING_PUBLISH_CONFIRMATION_REQUIRED'; end if;
  select * into result from public.safety_briefings where id=p_briefing_id and owner_id=uid and status='draft' and public.owns_project(project_id,uid) for update;
  if result.id is null then raise exception 'SAFETY_BRIEFING_NOT_PUBLISHABLE'; end if;
  if result.briefing_date<current_date then raise exception 'SAFETY_BRIEFING_DATE_PASSED'; end if;
  select count(*)::integer into recipient_count from public.project_workers where project_id=result.project_id and owner_id=uid and status='active';
  if recipient_count=0 then raise exception 'ACTIVE_PROJECT_WORKER_REQUIRED'; end if;
  digest_value:=encode(digest(convert_to(jsonb_build_object('schemaVersion',1,'projectId',result.project_id,'title',result.title,'body',replace(result.body,E'\r\n',E'\n'),'briefingDate',result.briefing_date)::text,'UTF8'),'sha256'),'hex');
  perform set_config('app.safety_briefing_rpc','1',true);
  update public.safety_briefings set status='published',content_hash=digest_value,published_at=now(),published_by=uid,updated_at=now() where id=result.id returning * into result;
  insert into public.safety_briefing_recipients(owner_id,project_id,briefing_id,worker_id,worker_name,position,content_hash)
    select uid,result.project_id,result.id,worker.id,trim(worker.first_name)||' '||trim(worker.last_name),worker.position,digest_value from public.project_workers worker where worker.project_id=result.project_id and worker.owner_id=uid and worker.status='active';
  insert into public.safety_briefing_events(owner_id,project_id,briefing_id,event_type,metadata,actor_user_id) values(uid,result.project_id,result.id,'published',jsonb_build_object('contentHash',digest_value,'recipientCount',recipient_count),uid);
  return result;
end;
$$;

create or replace function public.acknowledge_my_safety_briefing(p_briefing_id text,p_confirmed boolean)
returns public.safety_briefing_recipients language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.safety_briefing_recipients%rowtype;
begin
  if not coalesce(p_confirmed,false) then raise exception 'SAFETY_BRIEFING_ACK_CONFIRMATION_REQUIRED'; end if;
  perform set_config('app.safety_briefing_rpc','1',true);
  update public.safety_briefing_recipients recipient set status='acknowledged',acknowledged_at=now(),acknowledged_by=uid
    where recipient.briefing_id=p_briefing_id and recipient.status='pending' and exists(
      select 1 from public.project_workers worker join public.safety_briefings briefing on briefing.id=recipient.briefing_id
      where worker.id=recipient.worker_id and worker.auth_user_id=uid and worker.status='active' and briefing.status='published' and briefing.content_hash=recipient.content_hash
    ) returning * into result;
  if result.id is null then raise exception 'SAFETY_BRIEFING_ACK_NOT_ALLOWED'; end if;
  insert into public.safety_briefing_events(owner_id,project_id,briefing_id,event_type,worker_id,metadata,actor_user_id) values(result.owner_id,result.project_id,result.briefing_id,'acknowledged',result.worker_id,jsonb_build_object('contentHash',result.content_hash),uid);
  return result;
end;
$$;

create or replace function public.excuse_safety_briefing_recipient(p_briefing_id text,p_worker_id uuid,p_reason text,p_confirmed boolean)
returns public.safety_briefing_recipients language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.safety_briefing_recipients%rowtype;
begin
  if not coalesce(p_confirmed,false) then raise exception 'SAFETY_BRIEFING_EXCUSE_CONFIRMATION_REQUIRED'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'SAFETY_BRIEFING_EXCUSE_REASON_REQUIRED'; end if;
  perform set_config('app.safety_briefing_rpc','1',true);
  update public.safety_briefing_recipients recipient set status='excused',excused_at=now(),excused_by=uid,excuse_reason=trim(p_reason)
    where recipient.briefing_id=p_briefing_id and recipient.worker_id=p_worker_id and recipient.owner_id=uid and recipient.status='pending' and public.owns_project(recipient.project_id,uid)
      and exists(select 1 from public.safety_briefings briefing where briefing.id=recipient.briefing_id and briefing.status='published') returning * into result;
  if result.id is null then raise exception 'SAFETY_BRIEFING_EXCUSE_NOT_ALLOWED'; end if;
  insert into public.safety_briefing_events(owner_id,project_id,briefing_id,event_type,worker_id,body,actor_user_id) values(uid,result.project_id,result.briefing_id,'excused',result.worker_id,result.excuse_reason,uid);
  return result;
end;
$$;

create or replace function public.close_safety_briefing(p_briefing_id text,p_confirmed boolean)
returns public.safety_briefings language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.safety_briefings%rowtype;
begin
  if not coalesce(p_confirmed,false) then raise exception 'SAFETY_BRIEFING_CLOSE_CONFIRMATION_REQUIRED'; end if;
  if exists(select 1 from public.safety_briefing_recipients where briefing_id=p_briefing_id and status='pending') then raise exception 'SAFETY_BRIEFING_PENDING_RECIPIENTS'; end if;
  perform set_config('app.safety_briefing_rpc','1',true);
  update public.safety_briefings set status='closed',closed_at=now(),closed_by=uid,updated_at=now() where id=p_briefing_id and owner_id=uid and status='published' and public.owns_project(project_id,uid) returning * into result;
  if result.id is null then raise exception 'SAFETY_BRIEFING_NOT_CLOSABLE'; end if;
  insert into public.safety_briefing_events(owner_id,project_id,briefing_id,event_type,actor_user_id) values(uid,result.project_id,result.id,'closed',uid);
  return result;
end;
$$;

revoke insert,update,delete on public.safety_briefings,public.safety_briefing_recipients,public.safety_briefing_events from public,anon,authenticated;
grant select on public.safety_briefings,public.safety_briefing_recipients,public.safety_briefing_events to authenticated;
revoke execute on function public.save_safety_briefing(text,uuid,text,text,date),public.publish_safety_briefing(text,boolean),public.acknowledge_my_safety_briefing(text,boolean),public.excuse_safety_briefing_recipient(text,uuid,text,boolean),public.close_safety_briefing(text,boolean) from public,anon;
grant execute on function public.save_safety_briefing(text,uuid,text,text,date),public.publish_safety_briefing(text,boolean),public.acknowledge_my_safety_briefing(text,boolean),public.excuse_safety_briefing_recipient(text,uuid,text,boolean),public.close_safety_briefing(text,boolean) to authenticated;

create trigger safety_briefings_audit after insert or update or delete on public.safety_briefings for each row execute function public.audit_row();
create trigger safety_briefing_recipients_audit after insert or update or delete on public.safety_briefing_recipients for each row execute function public.audit_row();
create trigger safety_briefing_events_audit after insert or update or delete on public.safety_briefing_events for each row execute function public.audit_row();

alter function public.export_my_data() rename to export_my_data_v19;
create function public.export_my_data() returns jsonb language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else public.export_my_data_v19() || jsonb_build_object(
    'schemaVersion',20,
    'safetyBriefings',coalesce((select jsonb_agg(to_jsonb(item) order by item.briefing_date,item.created_at) from public.safety_briefings item where item.owner_id=auth.uid()),'[]'::jsonb),
    'safetyBriefingRecipients',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at,item.id) from public.safety_briefing_recipients item where item.owner_id=auth.uid()),'[]'::jsonb),
    'safetyBriefingEvents',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at,item.id) from public.safety_briefing_events item where item.owner_id=auth.uid()),'[]'::jsonb)
  ) end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
