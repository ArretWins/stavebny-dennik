-- Safety incident and near-miss register with worker reporting and audited investigation.

alter table public.attachments drop constraint attachments_related_entity_type_check,
  add constraint attachments_related_entity_type_check check (related_entity_type in ('diary_entry','delay_event','worker_checkin','attachment','weather_snapshot','site_task','project_rfi','worker_credential','site_incident'));
alter table public.notifications drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check check (notification_type in ('worker_join','material_request','request_status','site_task','task_review','task_assignment','task_comment','client_decision','change_order_decision','supplier_quote','site_incident'));

create table public.site_incidents (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  reporter_worker_id uuid references public.project_workers(id) on delete set null,
  reporter_name text not null check(char_length(trim(reporter_name)) between 2 and 180),
  incident_type text not null check(incident_type in ('near_miss','injury','property_damage','environmental','safety_observation')),
  severity text not null check(severity in ('low','moderate','serious','critical')),
  occurred_at timestamptz not null,
  location text not null check(char_length(trim(location)) between 2 and 160),
  description text not null check(char_length(trim(description)) between 10 and 2000),
  immediate_action text check(immediate_action is null or char_length(trim(immediate_action)) between 1 and 1000),
  people_involved text check(people_involved is null or char_length(trim(people_involved)) between 1 and 500),
  attachment_id text references public.attachments(id) on delete set null,
  status text not null default 'reported' check(status in ('reported','investigating','resolved')),
  root_cause text check(root_cause is null or char_length(trim(root_cause)) between 5 and 2000),
  corrective_action text check(corrective_action is null or char_length(trim(corrective_action)) between 5 and 2000),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check((status<>'resolved' and root_cause is null and corrective_action is null and resolved_at is null and resolved_by is null) or (status='resolved' and root_cause is not null and corrective_action is not null and resolved_at is not null and resolved_by is not null))
);
create index site_incidents_project_status_idx on public.site_incidents(project_id,status,severity,occurred_at desc);
create index site_incidents_worker_idx on public.site_incidents(reporter_worker_id,occurred_at desc);

create table public.site_incident_events (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,project_id uuid not null references public.projects(id) on delete cascade,
  incident_id text not null references public.site_incidents(id) on delete cascade,event_type text not null check(event_type in ('reported','updated','investigation_started','resolved','reopened')),
  body text check(body is null or char_length(trim(body)) between 1 and 2000),metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,actor_worker_id uuid references public.project_workers(id) on delete set null,created_at timestamptz not null default now()
);
create index site_incident_events_timeline_idx on public.site_incident_events(incident_id,created_at,id);

alter table public.site_incidents enable row level security;alter table public.site_incident_events enable row level security;
create policy site_incidents_participant_select on public.site_incidents for select using ((owner_id=auth.uid() and public.owns_project(project_id,auth.uid())) or exists(select 1 from public.project_workers worker where worker.id=reporter_worker_id and worker.auth_user_id=auth.uid()));
create policy site_incident_events_participant_select on public.site_incident_events for select using ((owner_id=auth.uid() and public.owns_project(project_id,auth.uid())) or exists(select 1 from public.site_incidents incident join public.project_workers worker on worker.id=incident.reporter_worker_id where incident.id=site_incident_events.incident_id and worker.auth_user_id=auth.uid()));

create or replace function public.guard_site_incident_change() returns trigger language plpgsql set search_path=public as $$ begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;if tg_op='DELETE' and not exists(select 1 from public.projects where id=old.project_id) then return old; end if;
  if current_setting('app.site_incident_rpc',true) is distinct from '1' then raise exception 'SITE_INCIDENT_RPC_REQUIRED';end if;return case when tg_op='DELETE' then old else new end;end $$;
create trigger site_incidents_guard before insert or update or delete on public.site_incidents for each row execute function public.guard_site_incident_change();
create or replace function public.guard_site_incident_event_change() returns trigger language plpgsql set search_path=public as $$ begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old;end if;if tg_op='DELETE' and not exists(select 1 from public.site_incidents where id=old.incident_id) then return old;end if;raise exception 'SITE_INCIDENT_EVENT_IMMUTABLE';end $$;
create trigger site_incident_events_immutable before update or delete on public.site_incident_events for each row execute function public.guard_site_incident_event_change();

create or replace function public.save_site_incident(p_id text,p_project_id uuid,p_reporter_worker_id uuid,p_reporter_name text,p_incident_type text,p_severity text,p_occurred_at timestamptz,p_location text,p_description text,p_immediate_action text,p_people_involved text,p_attachment_id text)
returns public.site_incidents language plpgsql security definer set search_path=public,auth as $$ declare uid uuid:=auth.uid();existing public.site_incidents%rowtype;result public.site_incidents%rowtype;event_name text;begin
  if not public.owns_project(p_project_id,uid) then raise exception 'PROJECT_ACCESS_DENIED';end if;
  if p_reporter_worker_id is not null and not exists(select 1 from public.project_workers where id=p_reporter_worker_id and project_id=p_project_id and owner_id=uid) then raise exception 'WORKER_NOT_IN_PROJECT';end if;
  if nullif(trim(p_id),'') is null or p_incident_type not in ('near_miss','injury','property_damage','environmental','safety_observation') or p_severity not in ('low','moderate','serious','critical') or char_length(trim(p_reporter_name)) not between 2 and 180 or char_length(trim(p_location)) not between 2 and 160 or char_length(trim(p_description)) not between 10 and 2000 then raise exception 'INVALID_SITE_INCIDENT';end if;
  if p_attachment_id is not null and not exists(select 1 from public.attachments where id=p_attachment_id and owner_id=uid and project_id=p_project_id and related_entity_type='site_incident' and related_entity_id=p_id) then raise exception 'SITE_INCIDENT_ATTACHMENT_INVALID';end if;
  select * into existing from public.site_incidents where id=p_id for update;if existing.id is not null and (existing.owner_id<>uid or existing.project_id<>p_project_id or existing.status='resolved') then raise exception 'SITE_INCIDENT_NOT_EDITABLE';end if;
  perform set_config('app.site_incident_rpc','1',true);
  if existing.id is null then insert into public.site_incidents(id,owner_id,project_id,reporter_worker_id,reporter_name,incident_type,severity,occurred_at,location,description,immediate_action,people_involved,attachment_id) values(trim(p_id),uid,p_project_id,p_reporter_worker_id,trim(p_reporter_name),p_incident_type,p_severity,p_occurred_at,trim(p_location),trim(p_description),nullif(trim(p_immediate_action),''),nullif(trim(p_people_involved),''),p_attachment_id) returning * into result;event_name:='reported';
  else update public.site_incidents set reporter_worker_id=p_reporter_worker_id,reporter_name=trim(p_reporter_name),incident_type=p_incident_type,severity=p_severity,occurred_at=p_occurred_at,location=trim(p_location),description=trim(p_description),immediate_action=nullif(trim(p_immediate_action),''),people_involved=nullif(trim(p_people_involved),''),attachment_id=p_attachment_id,updated_at=now() where id=p_id returning * into result;event_name:='updated';end if;
  insert into public.site_incident_events(owner_id,project_id,incident_id,event_type,metadata,actor_user_id) values(uid,p_project_id,result.id,event_name,jsonb_build_object('severity',result.severity,'status',result.status),uid);return result;end $$;

create or replace function public.report_my_site_incident(p_worker_id uuid,p_incident_type text,p_severity text,p_occurred_at timestamptz,p_location text,p_description text,p_immediate_action text,p_people_involved text,p_confirmed boolean)
returns public.site_incidents language plpgsql security definer set search_path=public,auth as $$ declare uid uuid:=auth.uid();worker public.project_workers%rowtype;result public.site_incidents%rowtype;incident_id text:='incident-'||gen_random_uuid()::text;begin
  if not coalesce(p_confirmed,false) then raise exception 'SITE_INCIDENT_REPORT_CONFIRMATION_REQUIRED';end if;select * into worker from public.project_workers where id=p_worker_id and auth_user_id=uid and status='active';if worker.id is null then raise exception 'WORKER_ACCESS_DENIED';end if;
  if p_incident_type not in ('near_miss','injury','property_damage','environmental','safety_observation') or p_severity not in ('low','moderate','serious','critical') or char_length(trim(p_location)) not between 2 and 160 or char_length(trim(p_description)) not between 10 and 2000 then raise exception 'INVALID_SITE_INCIDENT';end if;
  perform set_config('app.site_incident_rpc','1',true);insert into public.site_incidents(id,owner_id,project_id,reporter_worker_id,reporter_name,incident_type,severity,occurred_at,location,description,immediate_action,people_involved) values(incident_id,worker.owner_id,worker.project_id,worker.id,trim(worker.first_name)||' '||trim(worker.last_name),p_incident_type,p_severity,p_occurred_at,trim(p_location),trim(p_description),nullif(trim(p_immediate_action),''),nullif(trim(p_people_involved),'')) returning * into result;
  insert into public.site_incident_events(owner_id,project_id,incident_id,event_type,metadata,actor_user_id,actor_worker_id) values(result.owner_id,result.project_id,result.id,'reported',jsonb_build_object('severity',result.severity,'source','worker'),uid,worker.id);
  insert into public.notifications(recipient_user_id,worker_id,notification_type,title,body,data) values(worker.owner_id,worker.id,'site_incident',case when result.severity in ('serious','critical') then 'Urgentné hlásenie zo stavby' else 'Nové hlásenie zo stavby' end,result.reporter_name||' nahlásil: '||left(result.description,180),jsonb_build_object('incidentId',result.id,'projectId',result.project_id,'severity',result.severity));return result;end $$;

create or replace function public.start_site_incident_investigation(p_incident_id text,p_confirmed boolean) returns public.site_incidents language plpgsql security definer set search_path=public,auth as $$ declare uid uuid:=auth.uid();result public.site_incidents%rowtype;begin
  if not coalesce(p_confirmed,false) then raise exception 'SITE_INCIDENT_INVESTIGATION_CONFIRMATION_REQUIRED';end if;perform set_config('app.site_incident_rpc','1',true);update public.site_incidents set status='investigating',updated_at=now() where id=p_incident_id and owner_id=uid and status='reported' and public.owns_project(project_id,uid) returning * into result;if result.id is null then raise exception 'SITE_INCIDENT_NOT_INVESTIGATABLE';end if;insert into public.site_incident_events(owner_id,project_id,incident_id,event_type,actor_user_id) values(uid,result.project_id,result.id,'investigation_started',uid);return result;end $$;
create or replace function public.resolve_site_incident(p_incident_id text,p_root_cause text,p_corrective_action text,p_confirmed boolean) returns public.site_incidents language plpgsql security definer set search_path=public,auth as $$ declare uid uuid:=auth.uid();result public.site_incidents%rowtype;begin
  if not coalesce(p_confirmed,false) then raise exception 'SITE_INCIDENT_RESOLUTION_CONFIRMATION_REQUIRED';end if;if char_length(trim(p_root_cause)) not between 5 and 2000 or char_length(trim(p_corrective_action)) not between 5 and 2000 then raise exception 'SITE_INCIDENT_RESOLUTION_REQUIRED';end if;perform set_config('app.site_incident_rpc','1',true);update public.site_incidents set status='resolved',root_cause=trim(p_root_cause),corrective_action=trim(p_corrective_action),resolved_at=now(),resolved_by=uid,updated_at=now() where id=p_incident_id and owner_id=uid and status='investigating' and public.owns_project(project_id,uid) returning * into result;if result.id is null then raise exception 'SITE_INCIDENT_NOT_RESOLVABLE';end if;insert into public.site_incident_events(owner_id,project_id,incident_id,event_type,metadata,actor_user_id) values(uid,result.project_id,result.id,'resolved',jsonb_build_object('rootCause',result.root_cause,'correctiveAction',result.corrective_action),uid);return result;end $$;
create or replace function public.reopen_site_incident(p_incident_id text,p_reason text,p_confirmed boolean) returns public.site_incidents language plpgsql security definer set search_path=public,auth as $$ declare uid uuid:=auth.uid();result public.site_incidents%rowtype;begin
  if not coalesce(p_confirmed,false) then raise exception 'SITE_INCIDENT_REOPEN_CONFIRMATION_REQUIRED';end if;if char_length(trim(p_reason)) not between 5 and 500 then raise exception 'SITE_INCIDENT_REOPEN_REASON_REQUIRED';end if;perform set_config('app.site_incident_rpc','1',true);update public.site_incidents set status='investigating',root_cause=null,corrective_action=null,resolved_at=null,resolved_by=null,updated_at=now() where id=p_incident_id and owner_id=uid and status='resolved' and public.owns_project(project_id,uid) returning * into result;if result.id is null then raise exception 'SITE_INCIDENT_NOT_REOPENABLE';end if;insert into public.site_incident_events(owner_id,project_id,incident_id,event_type,body,actor_user_id) values(uid,result.project_id,result.id,'reopened',trim(p_reason),uid);return result;end $$;

revoke insert,update,delete on public.site_incidents,public.site_incident_events from public,anon,authenticated;grant select on public.site_incidents,public.site_incident_events to authenticated;
revoke execute on function public.save_site_incident(text,uuid,uuid,text,text,text,timestamptz,text,text,text,text,text),public.report_my_site_incident(uuid,text,text,timestamptz,text,text,text,text,boolean),public.start_site_incident_investigation(text,boolean),public.resolve_site_incident(text,text,text,boolean),public.reopen_site_incident(text,text,boolean) from public,anon;
grant execute on function public.save_site_incident(text,uuid,uuid,text,text,text,timestamptz,text,text,text,text,text),public.report_my_site_incident(uuid,text,text,timestamptz,text,text,text,text,boolean),public.start_site_incident_investigation(text,boolean),public.resolve_site_incident(text,text,text,boolean),public.reopen_site_incident(text,text,boolean) to authenticated;
create trigger site_incidents_audit after insert or update or delete on public.site_incidents for each row execute function public.audit_row();create trigger site_incident_events_audit after insert or update or delete on public.site_incident_events for each row execute function public.audit_row();

alter function public.export_my_data() rename to export_my_data_v21;
create function public.export_my_data() returns jsonb language sql stable security definer set search_path=public,auth as $$ select case when auth.uid() is null then null else public.export_my_data_v21()||jsonb_build_object('schemaVersion',22,'siteIncidents',coalesce((select jsonb_agg(to_jsonb(item) order by item.occurred_at,item.id) from public.site_incidents item where item.owner_id=auth.uid()),'[]'::jsonb),'siteIncidentEvents',coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at,item.id) from public.site_incident_events item where item.owner_id=auth.uid()),'[]'::jsonb)) end $$;
revoke execute on function public.export_my_data() from public,anon;grant execute on function public.export_my_data() to authenticated;
