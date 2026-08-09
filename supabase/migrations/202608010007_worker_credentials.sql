-- Worker qualification, medical and training records with expiry control.

alter table public.attachments
  drop constraint attachments_related_entity_type_check,
  add constraint attachments_related_entity_type_check check (
    related_entity_type in (
      'diary_entry','delay_event','worker_checkin','attachment',
      'weather_snapshot','site_task','project_rfi','worker_credential'
    )
  );

create table public.worker_credentials (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id uuid not null references public.project_workers(id) on delete cascade,
  credential_type text not null check (credential_type in ('medical_exam','bozp_training','height_work','machinery_operator','electrician','welder','driver','other')),
  title text not null check (char_length(trim(title)) between 2 and 120),
  document_number text check (document_number is null or char_length(trim(document_number)) between 1 and 100),
  issuer text check (issuer is null or char_length(trim(issuer)) between 1 and 160),
  issued_date date,
  expires_at date,
  note text check (note is null or char_length(trim(note)) between 1 and 500),
  attachment_id text references public.attachments(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(trim(revoke_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or issued_date is null or expires_at>=issued_date),
  check ((revoked_at is null and revoked_by is null and revoke_reason is null) or (revoked_at is not null and revoked_by is not null and revoke_reason is not null))
);
create index worker_credentials_worker_expiry_idx on public.worker_credentials(worker_id,expires_at,created_at desc);
create index worker_credentials_project_expiry_idx on public.worker_credentials(project_id,expires_at) where revoked_at is null;

create table public.worker_credential_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  credential_id text not null references public.worker_credentials(id) on delete cascade,
  worker_id uuid not null references public.project_workers(id) on delete cascade,
  event_type text not null check (event_type in ('created','updated','revoked','restored')),
  body text check (body is null or char_length(trim(body)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index worker_credential_events_timeline_idx on public.worker_credential_events(credential_id,created_at,id);

alter table public.worker_credentials enable row level security;
alter table public.worker_credential_events enable row level security;
create policy worker_credentials_participant_select on public.worker_credentials for select using (
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))
  or exists(select 1 from public.project_workers worker where worker.id=worker_id and worker.auth_user_id=auth.uid())
);
create policy worker_credential_events_owner_select on public.worker_credential_events for select using (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()));

create or replace function public.guard_worker_credential_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(select 1 from public.projects where id=old.project_id) then return old; end if;
  if current_setting('app.worker_credential_rpc',true) is distinct from '1' then raise exception 'WORKER_CREDENTIAL_RPC_REQUIRED'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger worker_credentials_guard before insert or update or delete on public.worker_credentials for each row execute function public.guard_worker_credential_change();

create or replace function public.guard_worker_credential_event_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if tg_op='DELETE' and not exists(select 1 from public.worker_credentials where id=old.credential_id) then return old; end if;
  raise exception 'WORKER_CREDENTIAL_EVENT_IMMUTABLE';
end;
$$;
create trigger worker_credential_events_immutable before update or delete on public.worker_credential_events for each row execute function public.guard_worker_credential_event_change();

create or replace function public.save_worker_credential(
  p_id text,p_project_id uuid,p_worker_id uuid,p_credential_type text,p_title text,
  p_document_number text,p_issuer text,p_issued_date date,p_expires_at date,p_note text,p_attachment_id text
) returns public.worker_credentials language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); existing public.worker_credentials%rowtype; result public.worker_credentials%rowtype; event_name text;
begin
  if not public.owns_project(p_project_id,uid) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.project_workers where id=p_worker_id and project_id=p_project_id and owner_id=uid) then raise exception 'WORKER_NOT_IN_PROJECT'; end if;
  if nullif(trim(p_id),'') is null or p_credential_type not in ('medical_exam','bozp_training','height_work','machinery_operator','electrician','welder','driver','other') or char_length(trim(p_title)) not between 2 and 120 then raise exception 'INVALID_WORKER_CREDENTIAL'; end if;
  if p_expires_at is not null and p_issued_date is not null and p_expires_at<p_issued_date then raise exception 'INVALID_WORKER_CREDENTIAL_DATES'; end if;
  if p_attachment_id is not null and not exists(select 1 from public.attachments where id=p_attachment_id and owner_id=uid and project_id=p_project_id and related_entity_type='worker_credential' and related_entity_id=p_id) then raise exception 'WORKER_CREDENTIAL_ATTACHMENT_INVALID'; end if;
  select * into existing from public.worker_credentials where id=p_id for update;
  if existing.id is not null and (existing.owner_id<>uid or existing.project_id<>p_project_id or existing.worker_id<>p_worker_id or existing.revoked_at is not null) then raise exception 'WORKER_CREDENTIAL_NOT_EDITABLE'; end if;
  perform set_config('app.worker_credential_rpc','1',true);
  if existing.id is null then
    insert into public.worker_credentials(id,owner_id,project_id,worker_id,credential_type,title,document_number,issuer,issued_date,expires_at,note,attachment_id)
      values(trim(p_id),uid,p_project_id,p_worker_id,p_credential_type,trim(p_title),nullif(trim(p_document_number),''),nullif(trim(p_issuer),''),p_issued_date,p_expires_at,nullif(trim(p_note),''),p_attachment_id) returning * into result;
    event_name:='created';
  else
    update public.worker_credentials set credential_type=p_credential_type,title=trim(p_title),document_number=nullif(trim(p_document_number),''),issuer=nullif(trim(p_issuer),''),issued_date=p_issued_date,expires_at=p_expires_at,note=nullif(trim(p_note),''),attachment_id=p_attachment_id,updated_at=now() where id=p_id returning * into result;
    event_name:='updated';
  end if;
  insert into public.worker_credential_events(owner_id,project_id,credential_id,worker_id,event_type,metadata,actor_user_id) values(uid,p_project_id,result.id,p_worker_id,event_name,jsonb_build_object('expiresAt',result.expires_at,'attachmentId',result.attachment_id),uid);
  return result;
end;
$$;

create or replace function public.revoke_worker_credential(p_credential_id text,p_reason text,p_confirmed boolean)
returns public.worker_credentials language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.worker_credentials%rowtype;
begin
  if not coalesce(p_confirmed,false) then raise exception 'WORKER_CREDENTIAL_REVOKE_CONFIRMATION_REQUIRED'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'WORKER_CREDENTIAL_REVOKE_REASON_REQUIRED'; end if;
  perform set_config('app.worker_credential_rpc','1',true);
  update public.worker_credentials set revoked_at=now(),revoked_by=uid,revoke_reason=trim(p_reason),updated_at=now() where id=p_credential_id and owner_id=uid and revoked_at is null and public.owns_project(project_id,uid) returning * into result;
  if result.id is null then raise exception 'WORKER_CREDENTIAL_NOT_REVOCABLE'; end if;
  insert into public.worker_credential_events(owner_id,project_id,credential_id,worker_id,event_type,body,actor_user_id) values(uid,result.project_id,result.id,result.worker_id,'revoked',result.revoke_reason,uid);
  return result;
end;
$$;

create or replace function public.restore_worker_credential(p_credential_id text,p_reason text,p_confirmed boolean)
returns public.worker_credentials language plpgsql security definer set search_path=public,auth as $$
declare uid uuid:=auth.uid(); result public.worker_credentials%rowtype;
begin
  if not coalesce(p_confirmed,false) then raise exception 'WORKER_CREDENTIAL_RESTORE_CONFIRMATION_REQUIRED'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'WORKER_CREDENTIAL_RESTORE_REASON_REQUIRED'; end if;
  perform set_config('app.worker_credential_rpc','1',true);
  update public.worker_credentials set revoked_at=null,revoked_by=null,revoke_reason=null,updated_at=now() where id=p_credential_id and owner_id=uid and revoked_at is not null and public.owns_project(project_id,uid) returning * into result;
  if result.id is null then raise exception 'WORKER_CREDENTIAL_NOT_RESTORABLE'; end if;
  insert into public.worker_credential_events(owner_id,project_id,credential_id,worker_id,event_type,body,actor_user_id) values(uid,result.project_id,result.id,result.worker_id,'restored',trim(p_reason),uid);
  return result;
end;
$$;

revoke insert,update,delete on public.worker_credentials,public.worker_credential_events from public,anon,authenticated;
grant select on public.worker_credentials to authenticated;
grant select on public.worker_credential_events to authenticated;
revoke execute on function public.save_worker_credential(text,uuid,uuid,text,text,text,text,date,date,text,text),public.revoke_worker_credential(text,text,boolean),public.restore_worker_credential(text,text,boolean) from public,anon;
grant execute on function public.save_worker_credential(text,uuid,uuid,text,text,text,text,date,date,text,text),public.revoke_worker_credential(text,text,boolean),public.restore_worker_credential(text,text,boolean) to authenticated;

create trigger worker_credentials_audit after insert or update or delete on public.worker_credentials for each row execute function public.audit_row();
create trigger worker_credential_events_audit after insert or update or delete on public.worker_credential_events for each row execute function public.audit_row();

alter function public.export_my_data() rename to export_my_data_v20;
create function public.export_my_data() returns jsonb language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else public.export_my_data_v20() || jsonb_build_object(
    'schemaVersion',21,
    'workerCredentials',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at,item.id) from public.worker_credentials item where item.owner_id=auth.uid()),'[]'::jsonb),
    'workerCredentialEvents',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at,item.id) from public.worker_credential_events item where item.owner_id=auth.uid()),'[]'::jsonb)
  ) end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
