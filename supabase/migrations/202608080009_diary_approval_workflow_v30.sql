-- Attributable review of one exact day-closure version through a temporary,
-- recipient-specific link. This acknowledgement is intentionally not described
-- as a qualified electronic signature.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check(notification_type in(
    'worker_join','material_request','request_status','site_task','task_review',
    'task_assignment','task_comment','client_decision','change_order_decision',
    'supplier_quote','site_incident','material_delivery','material_stock',
    'diary_approval'
  ));

create table public.diary_approval_requests(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  closure_id text not null references public.day_closures(id) on delete cascade,
  closure_hash text not null check(closure_hash~'^[a-f0-9]{64}$'),
  recipient_name text not null check(char_length(trim(recipient_name)) between 2 and 120),
  reviewer_role text not null check(reviewer_role in(
    'technical_supervisor','investor','designer','contractor','other'
  )),
  token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in(
    'pending','approved','changes_requested','revoked'
  )),
  expires_at timestamptz not null,
  opened_at timestamptz,
  view_count integer not null default 0 check(view_count>=0),
  decided_at timestamptz,
  decision_comment text check(
    decision_comment is null or char_length(trim(decision_comment)) between 1 and 1000
  ),
  confirmation_version text check(
    confirmation_version is null or confirmation_version='sk-v1'
  ),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check(expires_at>created_at and expires_at<=created_at+interval '30 days'),
  check(
    (status='pending' and decided_at is null and revoked_at is null
      and decision_comment is null and confirmation_version is null)
    or (status in('approved','changes_requested') and decided_at is not null
      and revoked_at is null and confirmation_version='sk-v1')
    or (status='revoked' and revoked_at is not null and decided_at is null)
  ),
  check(status<>'changes_requested' or char_length(trim(decision_comment))>=3)
);
create index diary_approval_owner_project_idx
  on public.diary_approval_requests(owner_id,project_id,created_at desc);
create index diary_approval_closure_idx
  on public.diary_approval_requests(closure_id,created_at desc);
create index diary_approval_public_idx
  on public.diary_approval_requests(token_hash,expires_at)
  where status='pending';
create unique index diary_approval_one_pending_recipient_idx
  on public.diary_approval_requests(
    closure_id,reviewer_role,lower(trim(recipient_name))
  ) where status='pending';

create table public.diary_approval_events(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id uuid not null references public.diary_approval_requests(id) on delete cascade,
  closure_id text not null references public.day_closures(id) on delete cascade,
  event_type text not null check(event_type in(
    'created','approved','changes_requested','revoked'
  )),
  actor_name text,
  actor_role text,
  body text check(body is null or char_length(trim(body)) between 1 and 1000),
  closure_hash text not null check(closure_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index diary_approval_events_request_idx
  on public.diary_approval_events(request_id,created_at,id);

alter table public.diary_approval_requests enable row level security;
alter table public.diary_approval_events enable row level security;
create policy diary_approval_requests_owner_select
  on public.diary_approval_requests for select using(
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );
create policy diary_approval_events_owner_select
  on public.diary_approval_events for select using(
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );
revoke insert,update,delete on public.diary_approval_requests,
  public.diary_approval_events from public,anon,authenticated;
grant select on public.diary_approval_requests,
  public.diary_approval_events to authenticated;

create or replace function public.guard_diary_approval_request()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'DIARY_APPROVAL_IMMUTABLE'; end if;
  if coalesce(current_setting('app.diary_approval_workflow',true),'')<>'allowed'
  then raise exception 'DIARY_APPROVAL_RPC_REQUIRED'; end if;
  if new.owner_id is distinct from old.owner_id
    or new.project_id is distinct from old.project_id
    or new.closure_id is distinct from old.closure_id
    or new.closure_hash is distinct from old.closure_hash
    or new.recipient_name is distinct from old.recipient_name
    or new.reviewer_role is distinct from old.reviewer_role
    or new.token_hash is distinct from old.token_hash
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then raise exception 'DIARY_APPROVAL_IMMUTABLE'; end if;
  -- Opening an already decided link may still increment the audit-only view
  -- counter. The decision itself and all decision evidence stay immutable.
  if old.status<>'pending' and (
    new.status is distinct from old.status
    or new.decided_at is distinct from old.decided_at
    or new.decision_comment is distinct from old.decision_comment
    or new.confirmation_version is distinct from old.confirmation_version
    or new.revoked_at is distinct from old.revoked_at
  ) then raise exception 'DIARY_APPROVAL_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger diary_approval_request_guard before update or delete
  on public.diary_approval_requests for each row
  execute function public.guard_diary_approval_request();

create or replace function public.reject_diary_approval_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'DIARY_APPROVAL_EVENT_IMMUTABLE'; end;
$$;
create trigger diary_approval_event_immutable before update or delete
  on public.diary_approval_events for each row
  execute function public.reject_diary_approval_event_mutation();

create or replace function public.create_diary_approval_request(
  p_closure_id text,p_recipient_name text,p_reviewer_role text,
  p_expires_hours integer default 168,p_confirmed boolean default false
)
returns jsonb language plpgsql security definer
set search_path=public,auth,extensions as $$
declare
  uid uuid:=auth.uid(); closure public.day_closures;
  item public.diary_approval_requests; raw_token text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(p_confirmed,false)
  then raise exception 'DIARY_APPROVAL_CONFIRMATION_REQUIRED'; end if;
  select target.* into closure from public.day_closures target
    where target.id=p_closure_id and target.owner_id=uid for update;
  if closure.id is null or not public.owns_project(closure.project_id,uid)
  then raise exception 'DAY_CLOSURE_ACCESS_DENIED'; end if;
  if exists(select 1 from public.day_closures newer
    where newer.project_id=closure.project_id and newer.log_date=closure.log_date
      and newer.version>closure.version)
  then raise exception 'DAY_CLOSURE_VERSION_SUPERSEDED'; end if;
  if char_length(trim(coalesce(p_recipient_name,''))) not between 2 and 120
  then raise exception 'INVALID_DIARY_APPROVAL_RECIPIENT'; end if;
  if p_reviewer_role not in(
    'technical_supervisor','investor','designer','contractor','other'
  ) then raise exception 'INVALID_DIARY_APPROVAL_ROLE'; end if;
  if p_expires_hours not between 1 and 720
  then raise exception 'INVALID_DIARY_APPROVAL_EXPIRY'; end if;
  perform set_config('app.diary_approval_workflow','allowed',true);
  with expired as(
    update public.diary_approval_requests target set
      status='revoked',revoked_at=now()
    where target.owner_id=uid and target.project_id=closure.project_id
      and target.status='pending' and target.expires_at<=now()
    returning target.*
  ) insert into public.diary_approval_events(
    owner_id,project_id,request_id,closure_id,event_type,actor_name,
    actor_role,body,closure_hash
  ) select owner_id,project_id,id,closure_id,'revoked','SystĂ©m','system',
    'PlatnosĹĄ odkazu vyprĹˇala',closure_hash from expired;
  if (select count(*) from public.diary_approval_requests active
    where active.project_id=closure.project_id and active.owner_id=uid
      and active.status='pending' and active.expires_at>now())>=10
  then raise exception 'TOO_MANY_ACTIVE_DIARY_APPROVALS'; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.diary_approval_requests(
    owner_id,project_id,closure_id,closure_hash,recipient_name,reviewer_role,
    token_hash,expires_at
  ) values(
    uid,closure.project_id,closure.id,closure.content_hash,
    trim(p_recipient_name),p_reviewer_role,
    encode(digest(raw_token,'sha256'),'hex'),
    now()+make_interval(hours=>p_expires_hours)
  ) returning * into item;
  insert into public.diary_approval_events(
    owner_id,project_id,request_id,closure_id,event_type,actor_name,
    actor_role,closure_hash,created_at
  ) values(uid,item.project_id,item.id,item.closure_id,'created',
    item.recipient_name,item.reviewer_role,item.closure_hash,item.created_at);
  return jsonb_build_object(
    'id',item.id,'token',raw_token,'ownerId',item.owner_id,
    'projectId',item.project_id,
    'closureId',item.closure_id,'closureHash',item.closure_hash,
    'recipientName',item.recipient_name,'reviewerRole',item.reviewer_role,
    'status',item.status,'expiresAt',item.expires_at,'viewCount',0,
    'createdAt',item.created_at
  );
exception when unique_violation then
  raise exception 'DIARY_APPROVAL_ALREADY_PENDING';
end;
$$;

create or replace function public.revoke_diary_approval_request(p_request_id uuid)
returns public.diary_approval_requests language plpgsql security definer
set search_path=public,auth as $$
declare item public.diary_approval_requests;
begin
  select target.* into item from public.diary_approval_requests target
    where target.id=p_request_id and target.owner_id=auth.uid() for update;
  if item.id is null then raise exception 'DIARY_APPROVAL_ACCESS_DENIED'; end if;
  if item.status<>'pending' then raise exception 'DIARY_APPROVAL_ALREADY_DECIDED'; end if;
  perform set_config('app.diary_approval_workflow','allowed',true);
  update public.diary_approval_requests set status='revoked',revoked_at=now()
    where id=item.id returning * into item;
  insert into public.diary_approval_events(
    owner_id,project_id,request_id,closure_id,event_type,actor_name,
    actor_role,closure_hash
  ) values(item.owner_id,item.project_id,item.id,item.closure_id,'revoked',
    'Vlastník projektu','owner',item.closure_hash);
  return item;
end;
$$;

create or replace function public.resolve_diary_approval(p_token text)
returns jsonb language plpgsql security definer
set search_path=public,extensions as $$
declare item public.diary_approval_requests; closure public.day_closures;
  project public.projects;
begin
  if p_token is null or p_token!~'^[0-9a-f]{64}$' then return null; end if;
  select target.* into item from public.diary_approval_requests target
    where target.token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if item.id is null or item.status='revoked' or item.expires_at<=now()
  then return null; end if;
  select target.* into closure from public.day_closures target
    where target.id=item.closure_id and target.content_hash=item.closure_hash;
  select target.* into project from public.projects target
    where target.id=item.project_id and target.status='active';
  if closure.id is null or project.id is null then return null; end if;
  perform set_config('app.diary_approval_workflow','allowed',true);
  update public.diary_approval_requests set
    view_count=view_count+1,opened_at=coalesce(opened_at,now()) where id=item.id
    returning * into item;
  return jsonb_build_object(
    'project',jsonb_build_object('name',project.name,'location',project.location,
      'address',project.address),
    'request',jsonb_build_object('id',item.id,'recipientName',item.recipient_name,
      'reviewerRole',item.reviewer_role,'status',item.status,
      'expiresAt',item.expires_at,'decidedAt',item.decided_at,
      'decisionComment',item.decision_comment),
    'closure',jsonb_build_object('id',closure.id,'logDate',closure.log_date,
      'version',closure.version,'contentHash',closure.content_hash,
      'confirmedAt',closure.confirmed_at,
      'diaryEntries',closure.snapshot_json->'diaryEntries'),
    'generatedAt',now()
  );
end;
$$;

create or replace function public.submit_diary_approval_decision(
  p_token text,p_decision text,p_signer_name text,p_comment text default null,
  p_confirmed boolean default false
)
returns jsonb language plpgsql security definer
set search_path=public,extensions as $$
declare item public.diary_approval_requests; comment text:=nullif(trim(p_comment),'');
begin
  if not coalesce(p_confirmed,false)
  then raise exception 'DIARY_APPROVAL_DECISION_CONFIRMATION_REQUIRED'; end if;
  if p_token is null or p_token!~'^[0-9a-f]{64}$'
    or p_decision not in('approved','changes_requested')
  then raise exception 'INVALID_DIARY_APPROVAL_DECISION'; end if;
  select target.* into item from public.diary_approval_requests target
    where target.token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if item.id is null or item.status='revoked' or item.expires_at<=now()
  then raise exception 'DIARY_APPROVAL_LINK_UNAVAILABLE'; end if;
  if lower(trim(coalesce(p_signer_name,'')))<>lower(trim(item.recipient_name))
  then raise exception 'DIARY_APPROVAL_SIGNER_MISMATCH'; end if;
  if char_length(coalesce(comment,''))>1000
    or (p_decision='changes_requested' and char_length(coalesce(comment,''))<3)
  then raise exception 'INVALID_DIARY_APPROVAL_COMMENT'; end if;
  if item.status<>'pending' then
    if item.status=p_decision and item.decision_comment is not distinct from comment
    then return jsonb_build_object('id',item.id,'status',item.status,
      'decidedAt',item.decided_at); end if;
    raise exception 'DIARY_APPROVAL_ALREADY_DECIDED';
  end if;
  perform set_config('app.diary_approval_workflow','allowed',true);
  update public.diary_approval_requests set status=p_decision,
    decided_at=now(),decision_comment=comment,confirmation_version='sk-v1'
    where id=item.id returning * into item;
  insert into public.diary_approval_events(
    owner_id,project_id,request_id,closure_id,event_type,actor_name,
    actor_role,body,closure_hash,created_at
  ) values(item.owner_id,item.project_id,item.id,item.closure_id,p_decision,
    item.recipient_name,item.reviewer_role,comment,item.closure_hash,item.decided_at);
  insert into public.notifications(
    recipient_user_id,notification_type,title,body,data
  ) values(item.owner_id,'diary_approval',
    case when p_decision='approved' then 'Denník bol schválený'
      else 'K denníku boli vrátené pripomienky' end,
    item.recipient_name,
    jsonb_build_object('requestId',item.id,'closureId',item.closure_id,
      'projectId',item.project_id,'status',item.status));
  return jsonb_build_object('id',item.id,'status',item.status,
    'decidedAt',item.decided_at);
end;
$$;

revoke execute on function public.create_diary_approval_request(text,text,text,integer,boolean) from public,anon;
revoke execute on function public.revoke_diary_approval_request(uuid) from public,anon;
revoke execute on function public.resolve_diary_approval(text) from public,anon,authenticated;
revoke execute on function public.submit_diary_approval_decision(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_diary_approval_request(text,text,text,integer,boolean) to authenticated;
grant execute on function public.revoke_diary_approval_request(uuid) to authenticated;
grant execute on function public.resolve_diary_approval(text) to service_role;
grant execute on function public.submit_diary_approval_decision(text,text,text,text,boolean) to service_role;

alter table public.daily_control_actions
  drop constraint if exists daily_control_actions_issue_check;
alter table public.daily_control_actions
  add constraint daily_control_actions_issue_check check(issue in(
    'sync_failed','cost_overrun','reserve_at_risk','financial_setup',
    'schedule_critical','schedule_high','schedule_setup','overdue_material',
    'overdue_rfis','answered_rfis','open_rfis','overdue_tools','lost_tools',
    'tool_maintenance','inactive_tool_custody','long_active_shifts',
    'unapproved_shifts','pending_safety_acknowledgements',
    'expired_worker_credentials','expiring_worker_credentials',
    'missing_worker_credentials','critical_site_incidents',
    'unresolved_site_incidents','delivery_discrepancies',
    'unreviewed_deliveries','negative_material_stock','low_material_stock',
    'pending_stock_reports','task_material_shortages','task_tool_shortages',
    'tomorrow_not_ready','blocked_tasks','task_reviews','new_material_requests',
    'pending_workers','receipt_reviews','draft_checklists','client_changes',
    'diary_changes_requested','pending_diary_approvals'
  ));
alter table public.daily_control_actions
  drop constraint if exists daily_control_actions_target_check;
alter table public.daily_control_actions
  add constraint daily_control_actions_target_check check(target in(
    'sync','financial','schedule','defects','task_reviews','material_requests',
    'workers','receipts','rfis','tools','timesheet','safety_briefings',
    'worker_credentials','site_incidents','material_deliveries','material_stock',
    'task_materials','task_tools','tomorrow_plan','checklists','change_orders',
    'diary_approvals'
  ));

create or replace function public.save_daily_control_action(
  p_id text,p_project_id uuid,p_action_date date,p_issue text,p_severity text,
  p_target text,p_item_count integer default null,p_amount_cents bigint default null,
  p_resolution text default null,p_resolve boolean default false,
  p_confirmed boolean default false
)
returns public.daily_control_actions language plpgsql security definer
set search_path=public,auth as $$
declare uid uuid:=auth.uid(); item public.daily_control_actions;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid)
  then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if p_id is null or char_length(p_id) not between 3 and 160
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_ID'; end if;
  if p_action_date is null or p_action_date>current_date+1
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_DATE'; end if;
  if p_issue not in(
    'sync_failed','cost_overrun','reserve_at_risk','financial_setup',
    'schedule_critical','schedule_high','schedule_setup','overdue_material',
    'overdue_rfis','answered_rfis','open_rfis','overdue_tools','lost_tools',
    'tool_maintenance','inactive_tool_custody','long_active_shifts',
    'unapproved_shifts','pending_safety_acknowledgements',
    'expired_worker_credentials','expiring_worker_credentials',
    'missing_worker_credentials','critical_site_incidents',
    'unresolved_site_incidents','delivery_discrepancies',
    'unreviewed_deliveries','negative_material_stock','low_material_stock',
    'pending_stock_reports','task_material_shortages','task_tool_shortages',
    'tomorrow_not_ready','blocked_tasks','task_reviews','new_material_requests',
    'pending_workers','receipt_reviews','draft_checklists','client_changes',
    'diary_changes_requested','pending_diary_approvals'
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_ISSUE'; end if;
  if p_severity not in('critical','high','watch')
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_SEVERITY'; end if;
  if p_target not in(
    'sync','financial','schedule','defects','task_reviews','material_requests',
    'workers','receipts','rfis','tools','timesheet','safety_briefings',
    'worker_credentials','site_incidents','material_deliveries','material_stock',
    'task_materials','task_tools','tomorrow_plan','checklists','change_orders',
    'diary_approvals'
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_TARGET'; end if;
  if p_item_count is not null and p_item_count not between 0 and 100000
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_COUNT'; end if;
  if p_amount_cents is not null
    and p_amount_cents not between -1000000000 and 1000000000
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_AMOUNT'; end if;
  if p_resolve and p_confirmed is not true
  then raise exception 'DAILY_CONTROL_ACTION_CONFIRMATION_REQUIRED'; end if;
  if p_resolve and(p_resolution is null
    or char_length(trim(p_resolution)) not between 3 and 500)
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_RESOLUTION'; end if;
  select target.* into item from public.daily_control_actions target
    where target.id=p_id for update;
  if item.id is not null and(item.owner_id<>uid or item.project_id<>p_project_id)
  then raise exception 'DAILY_CONTROL_ACTION_ACCESS_DENIED'; end if;
  if item.id is not null and item.status='resolved' then return item; end if;
  if item.id is null then
    insert into public.daily_control_actions(
      id,owner_id,project_id,action_date,issue,severity,target,item_count,amount_cents
    ) values(p_id,uid,p_project_id,p_action_date,p_issue,p_severity,p_target,
      p_item_count,p_amount_cents) returning * into item;
  end if;
  if p_resolve then
    perform set_config('app.daily_control_workflow','allowed',true);
    update public.daily_control_actions set status='resolved',
      resolution=trim(p_resolution),resolved_at=now(),resolved_by=uid,
      updated_at=now() where id=p_id returning * into item;
  end if;
  return item;
end;
$$;

alter function public.export_my_data() rename to export_my_data_v29;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$select
  case when auth.uid() is null then null else public.export_my_data_v29()
    ||jsonb_build_object(
      'schemaVersion',30,
      'diaryApprovalRequests',coalesce((select jsonb_agg(to_jsonb(x)-'token_hash')
        from public.diary_approval_requests x where x.owner_id=auth.uid()),'[]'::jsonb),
      'diaryApprovalEvents',coalesce((select jsonb_agg(to_jsonb(x))
        from public.diary_approval_events x where x.owner_id=auth.uid()),'[]'::jsonb)
    ) end
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
