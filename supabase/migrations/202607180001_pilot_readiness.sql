-- Pilot readiness: diagnostics, support, privacy controls and public-endpoint abuse protection.

create table public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source text not null check (source in ('app','sync','auth','edge')),
  severity text not null default 'error' check (severity in ('warning','error','fatal')),
  error_code text not null check (char_length(error_code) between 1 and 80),
  safe_message text check (safe_message is null or char_length(safe_message) <= 500),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 4096),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  platform text check (platform is null or platform in ('android','ios','web')),
  created_at timestamptz not null default now()
);
create index client_error_events_user_created_idx on public.client_error_events(user_id,created_at desc);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  status text not null check (status in ('success','partial','failed')),
  pending_before integer not null default 0 check (pending_before between 0 and 100000),
  pending_after integer not null default 0 check (pending_after between 0 and 100000),
  failed_count integer not null default 0 check (failed_count between 0 and 100000),
  duration_ms integer not null default 0 check (duration_ms between 0 and 3600000),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now()
);
create index sync_runs_user_created_idx on public.sync_runs(user_id,created_at desc);

create table public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  diagnostics jsonb not null default '{}'::jsonb check (pg_column_size(diagnostics) <= 8192),
  status text not null default 'new' check (status in ('new','reviewing','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_reports_user_created_idx on public.support_reports(user_id,created_at desc);

create table public.public_rate_limits (
  action text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key(action,key_hash,window_start)
);

alter table public.client_error_events enable row level security;
alter table public.sync_runs enable row level security;
alter table public.support_reports enable row level security;
alter table public.public_rate_limits enable row level security;

create policy client_errors_self_read on public.client_error_events for select using(user_id=auth.uid());
create policy sync_runs_self_read on public.sync_runs for select using(user_id=auth.uid());
create policy support_reports_self_read on public.support_reports for select using(user_id=auth.uid());
-- Inserts use sanitized security-definer RPCs. Rate-limit state has no client policy.

create or replace function public.consume_public_rate_limit(
  p_action text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
) returns void language plpgsql security definer set search_path=public as $$
declare
  bucket timestamptz;
  hashed text;
  current_count integer;
begin
  if p_action not in ('worker_join_device','worker_join_token','support_report')
     or char_length(p_scope) not between 1 and 300
     or p_limit not between 1 and 1000
     or p_window_seconds not between 60 and 86400 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;
  bucket:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  hashed:=encode(digest(p_scope,'sha256'),'hex');
  insert into public.public_rate_limits(action,key_hash,window_start,request_count,expires_at)
    values(p_action,hashed,bucket,1,bucket+make_interval(secs=>p_window_seconds*2))
  on conflict(action,key_hash,window_start) do update
    set request_count=public.public_rate_limits.request_count+1
  returning request_count into current_count;
  if current_count>p_limit then raise exception 'RATE_LIMITED'; end if;
  if random()<0.02 then delete from public.public_rate_limits where expires_at<now(); end if;
end; $$;

create or replace function public.record_client_error(
  p_source text,
  p_severity text,
  p_error_code text,
  p_safe_message text default null,
  p_context jsonb default '{}',
  p_project_id uuid default null,
  p_app_version text default null,
  p_platform text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare event_id uuid; safe_context jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_source not in ('app','sync','auth','edge') or p_severity not in ('warning','error','fatal') then raise exception 'INVALID_DIAGNOSTIC'; end if;
  if char_length(coalesce(p_error_code,'')) not between 1 and 80 then raise exception 'INVALID_DIAGNOSTIC'; end if;
  if p_project_id is not null and not public.owns_project(p_project_id,auth.uid()) then raise exception 'PROJECT_SCOPE'; end if;
  safe_context:=jsonb_strip_nulls(jsonb_build_object(
    'operation',left(p_context->>'operation',80),
    'entityType',left(p_context->>'entityType',60),
    'pendingCount',case when jsonb_typeof(p_context->'pendingCount')='number' then p_context->'pendingCount' end,
    'failedCount',case when jsonb_typeof(p_context->'failedCount')='number' then p_context->'failedCount' end,
    'network',case when p_context->>'network' in ('online','offline','unknown') then p_context->'network' end
  ));
  insert into public.client_error_events(user_id,project_id,source,severity,error_code,safe_message,context,app_version,platform)
    values(auth.uid(),p_project_id,p_source,p_severity,left(p_error_code,80),left(p_safe_message,500),safe_context,left(p_app_version,40),p_platform)
    returning id into event_id;
  delete from public.client_error_events where user_id=auth.uid() and created_at<now()-interval '90 days';
  return event_id;
end; $$;

create or replace function public.record_sync_run(
  p_status text,
  p_pending_before integer,
  p_pending_after integer,
  p_failed_count integer,
  p_duration_ms integer,
  p_error_code text default null,
  p_project_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare run_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_status not in ('success','partial','failed') then raise exception 'INVALID_SYNC_RUN'; end if;
  if p_project_id is not null and not public.owns_project(p_project_id,auth.uid()) then raise exception 'PROJECT_SCOPE'; end if;
  insert into public.sync_runs(user_id,project_id,status,pending_before,pending_after,failed_count,duration_ms,error_code)
    values(auth.uid(),p_project_id,p_status,greatest(0,least(p_pending_before,100000)),greatest(0,least(p_pending_after,100000)),greatest(0,least(p_failed_count,100000)),greatest(0,least(p_duration_ms,3600000)),left(p_error_code,80))
    returning id into run_id;
  delete from public.sync_runs where user_id=auth.uid() and created_at<now()-interval '90 days';
  return run_id;
end; $$;

create or replace function public.submit_support_report(
  p_subject text,
  p_description text,
  p_diagnostics jsonb default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare report_id uuid; safe_diagnostics jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.consume_public_rate_limit('support_report',auth.uid()::text,5,3600);
  if char_length(trim(p_subject)) not between 3 and 120 or char_length(trim(p_description)) not between 10 and 2000 then raise exception 'INVALID_SUPPORT_REPORT'; end if;
  safe_diagnostics:=jsonb_strip_nulls(jsonb_build_object(
    'appVersion',left(p_diagnostics->>'appVersion',40),
    'platform',case when p_diagnostics->>'platform' in ('android','ios','web') then p_diagnostics->>'platform' end,
    'pendingCount',case when jsonb_typeof(p_diagnostics->'pendingCount')='number' then p_diagnostics->'pendingCount' end,
    'failedCount',case when jsonb_typeof(p_diagnostics->'failedCount')='number' then p_diagnostics->'failedCount' end,
    'projectId',case when coalesce(p_diagnostics->>'projectId','')='' then null when public.owns_project((p_diagnostics->>'projectId')::uuid,auth.uid()) then p_diagnostics->>'projectId' end
  ));
  insert into public.support_reports(user_id,subject,description,diagnostics)
    values(auth.uid(),trim(p_subject),trim(p_description),safe_diagnostics) returning id into report_id;
  return report_id;
end; $$;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',1,
    'exportedAt',now(),
    'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
    'projects',coalesce((select jsonb_agg(to_jsonb(x)) from public.projects x where x.owner_id=auth.uid()),'[]'::jsonb),
    'diaryEntries',coalesce((select jsonb_agg(to_jsonb(x)) from public.diary_entries x where x.owner_id=auth.uid()),'[]'::jsonb),
    'delayEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.delay_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(x)) from public.attachments x where x.owner_id=auth.uid()),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(x)) from public.report_exports x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receiptCategories',coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_categories x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipts x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receiptFiles',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipt_files x where x.owner_id=auth.uid()),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_workers x where x.owner_id=auth.uid()),'[]'::jsonb),
    'materialRequests',coalesce((select jsonb_agg(to_jsonb(x)) from public.material_requests x where x.owner_id=auth.uid()),'[]'::jsonb),
    'materialRequestItems',coalesce((select jsonb_agg(to_jsonb(x)) from public.material_request_items x join public.material_requests r on r.id=x.request_id where r.owner_id=auth.uid()),'[]'::jsonb),
    'receiptRequestLinks',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipt_request_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;

create or replace function public.delete_my_account(p_confirmation text) returns boolean
language plpgsql security definer set search_path=public,auth,storage as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_confirmation<>'DELETE' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  delete from storage.objects where bucket_id in ('attachments','reports','receipts') and (storage.foldername(name))[1]=uid::text;
  delete from auth.users where id=uid;
  return true;
end; $$;

create or replace function public.join_project_as_worker(p_token text,p_first_name text,p_last_name text,p_position text)
returns uuid language plpgsql security definer set search_path=public as $$
declare invite public.project_worker_invites%rowtype; worker_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.consume_public_rate_limit('worker_join_device',auth.uid()::text,5,3600);
  perform public.consume_public_rate_limit('worker_join_token',coalesce(p_token,''),50,3600);
  select * into invite from public.project_worker_invites
    where token_hash=encode(digest(p_token,'sha256'),'hex') and expires_at>now() and revoked_at is null and use_count<max_uses
    for update;
  if invite.id is null then raise exception 'INVALID_OR_EXPIRED_INVITE'; end if;
  perform public.assert_feature_for_user(invite.owner_id,'worker_portal');
  if char_length(trim(p_first_name)) not between 1 and 80 or char_length(trim(p_last_name)) not between 1 and 80 or char_length(trim(p_position)) not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  insert into public.project_workers(owner_id,project_id,auth_user_id,first_name,last_name,position)
    values(invite.owner_id,invite.project_id,auth.uid(),trim(p_first_name),trim(p_last_name),trim(p_position)) returning id into worker_id;
  update public.project_worker_invites set use_count=use_count+1 where id=invite.id;
  insert into public.notifications(recipient_user_id,worker_id,notification_type,title,body,data)
    values(invite.owner_id,worker_id,'worker_join','Nová žiadosť pracovníka',trim(p_first_name)||' '||trim(p_last_name)||' čaká na schválenie.',jsonb_build_object('projectId',invite.project_id));
  return worker_id;
end; $$;

revoke all on public.client_error_events,public.sync_runs,public.support_reports,public.public_rate_limits from anon,authenticated;
grant select on public.client_error_events,public.sync_runs,public.support_reports to authenticated;
revoke execute on function public.consume_public_rate_limit(text,text,integer,integer) from public,anon,authenticated;
revoke execute on function public.record_client_error(text,text,text,text,jsonb,uuid,text,text) from public,anon;
revoke execute on function public.record_sync_run(text,integer,integer,integer,integer,text,uuid) from public,anon;
revoke execute on function public.submit_support_report(text,text,jsonb) from public,anon;
revoke execute on function public.export_my_data() from public,anon;
revoke execute on function public.delete_my_account(text) from public,anon;
grant execute on function public.record_client_error(text,text,text,text,jsonb,uuid,text,text) to authenticated;
grant execute on function public.record_sync_run(text,integer,integer,integer,integer,text,uuid) to authenticated;
grant execute on function public.submit_support_report(text,text,jsonb) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
