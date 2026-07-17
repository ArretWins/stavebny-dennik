-- Pilot controls: centrally managed plans, storage quotas and privacy-safe product analytics.
create table public.subscription_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null default 'free' check (plan_key in ('free','premium')),
  premium_until timestamptz,
  source text not null default 'pilot' check (source in ('pilot','manual','google_play','stripe')),
  updated_at timestamptz not null default now()
);

create table public.feature_entitlements (
  plan_key text not null check (plan_key in ('free','premium')),
  feature_key text not null,
  enabled boolean not null default true,
  monthly_limit bigint check (monthly_limit is null or monthly_limit >= 0),
  resource_limit bigint check (resource_limit is null or resource_limit >= 0),
  primary key(plan_key, feature_key)
);

insert into public.feature_entitlements(plan_key,feature_key,enabled,monthly_limit,resource_limit) values
  ('free','projects',true,null,3),('free','workers_per_project',true,null,20),
  ('free','receipt_storage_bytes',true,null,786432000),('free','attachment_storage_bytes',true,null,157286400),
  ('free','receipt_ocr',true,100,null),('free','receipt_exports',true,20,null),
  ('free','worker_portal',true,null,null),('free','material_requests',true,null,null),
  ('premium','projects',true,null,100),('premium','workers_per_project',true,null,500),
  ('premium','receipt_storage_bytes',true,null,107374182400),('premium','attachment_storage_bytes',true,null,107374182400),
  ('premium','receipt_ocr',true,10000,null),('premium','receipt_exports',true,null,null),
  ('premium','worker_portal',true,null,null),('premium','material_requests',true,null,null)
on conflict(plan_key,feature_key) do update set enabled=excluded.enabled,monthly_limit=excluded.monthly_limit,resource_limit=excluded.resource_limit;

create table public.feature_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  period_start date not null,
  usage_count bigint not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,feature_key,period_start)
);

create table public.analytics_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  actor_hash text not null,
  event_name text not null check (event_name in ('project_created','receipt_saved','receipt_ocr_requested','receipt_exported','worker_joined','material_requested','analytics_changed')),
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_events_name_created_idx on public.analytics_events(event_name,created_at desc);
create index analytics_events_created_idx on public.analytics_events(created_at);

create or replace function public.plan_for_user(p_user_id uuid) returns text language sql stable security definer set search_path=public as $$
  select case when s.plan_key='premium' and (s.premium_until is null or s.premium_until>now()) then 'premium' else 'free' end
  from (select coalesce((select plan_key from public.subscription_plans where user_id=p_user_id),'free') plan_key,
               (select premium_until from public.subscription_plans where user_id=p_user_id) premium_until) s;
$$;

create or replace function public.consume_feature(p_feature_key text,p_amount bigint default 1) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); plan text; entitlement public.feature_entitlements%rowtype; period date:=date_trunc('month',now())::date; used bigint;
begin
  if uid is null or p_amount<0 then raise exception 'AUTH_REQUIRED'; end if;
  plan:=public.plan_for_user(uid);
  select * into entitlement from public.feature_entitlements where plan_key=plan and feature_key=p_feature_key;
  if entitlement.feature_key is null or not entitlement.enabled then raise exception 'FEATURE_NOT_AVAILABLE'; end if;
  insert into public.feature_usage_monthly(user_id,feature_key,period_start,usage_count) values(uid,p_feature_key,period,0) on conflict do nothing;
  select usage_count into used from public.feature_usage_monthly where user_id=uid and feature_key=p_feature_key and period_start=period for update;
  if entitlement.monthly_limit is not null and used+p_amount>entitlement.monthly_limit then raise exception 'FEATURE_MONTHLY_LIMIT'; end if;
  if p_amount>0 then update public.feature_usage_monthly set usage_count=usage_count+p_amount,updated_at=now() where user_id=uid and feature_key=p_feature_key and period_start=period returning usage_count into used; end if;
  return jsonb_build_object('plan',plan,'feature',p_feature_key,'used',used,'limit',entitlement.monthly_limit,'enabled',true);
end; $$;

create or replace function public.assert_upload_allowed(p_kind text,p_bytes bigint,p_record_id text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); feature text; plan text; max_bytes bigint; used_bytes bigint;
begin
  if uid is null or p_bytes<0 then raise exception 'AUTH_REQUIRED'; end if;
  feature:=case p_kind when 'receipt' then 'receipt_storage_bytes' when 'attachment' then 'attachment_storage_bytes' else null end;
  if feature is null then raise exception 'INVALID_UPLOAD_KIND'; end if;
  plan:=public.plan_for_user(uid); select resource_limit into max_bytes from public.feature_entitlements where plan_key=plan and feature_key=feature and enabled;
  if max_bytes is null then return jsonb_build_object('allowed',true,'used',0,'limit',null); end if;
  if p_kind='receipt' then select coalesce(sum(file_size),0) into used_bytes from public.receipt_files where owner_id=uid and (p_record_id is null or id<>p_record_id);
  else select coalesce(sum(file_size),0) into used_bytes from public.attachments where owner_id=uid and (p_record_id is null or id<>p_record_id); end if;
  if used_bytes+p_bytes>max_bytes then raise exception 'STORAGE_LIMIT'; end if;
  return jsonb_build_object('allowed',true,'used',used_bytes,'limit',max_bytes,'remaining',max_bytes-used_bytes-p_bytes);
end; $$;

create or replace function public.guard_pilot_resource_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare feature text; limit_value bigint; current_value bigint; plan text:=public.plan_for_user(new.owner_id);
begin
  if tg_table_name='projects' then feature:='projects';
  elsif tg_table_name='project_workers' then
    if new.status not in ('pending','active') then return new; end if;
    feature:='workers_per_project';
  elsif tg_table_name='receipt_files' then feature:='receipt_storage_bytes';
  elsif tg_table_name='attachments' then feature:='attachment_storage_bytes';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||':'||feature,0));
  if tg_table_name='projects' then select count(*) into current_value from public.projects where owner_id=new.owner_id and id<>new.id;
  elsif tg_table_name='project_workers' then select count(*) into current_value from public.project_workers where project_id=new.project_id and status in ('pending','active') and id<>new.id;
  elsif tg_table_name='receipt_files' then select coalesce(sum(file_size),0) into current_value from public.receipt_files where owner_id=new.owner_id and id<>new.id;
  elsif tg_table_name='attachments' then select coalesce(sum(file_size),0) into current_value from public.attachments where owner_id=new.owner_id and id<>new.id;
  end if;
  select resource_limit into limit_value from public.feature_entitlements where plan_key=plan and feature_key=feature and enabled;
  if limit_value is null then return new; end if;
  if tg_table_name in ('receipt_files','attachments') then current_value:=current_value+new.file_size;
  else current_value:=current_value+1; end if;
  if current_value>limit_value then raise exception 'PLAN_RESOURCE_LIMIT'; end if;
  return new;
end; $$;
create trigger projects_pilot_limit before insert or update on public.projects for each row execute function public.guard_pilot_resource_limits();
create trigger workers_pilot_limit before insert or update on public.project_workers for each row execute function public.guard_pilot_resource_limits();
create trigger receipt_files_pilot_limit before insert or update on public.receipt_files for each row execute function public.guard_pilot_resource_limits();
create trigger attachments_pilot_limit before insert or update on public.attachments for each row execute function public.guard_pilot_resource_limits();

create or replace function public.assert_feature_for_user(p_user_id uuid,p_feature_key text) returns void
language plpgsql stable security definer set search_path=public as $$
declare available boolean;
begin
  select enabled into available from public.feature_entitlements where plan_key=public.plan_for_user(p_user_id) and feature_key=p_feature_key;
  if not coalesce(available,false) then raise exception 'FEATURE_NOT_AVAILABLE'; end if;
end; $$;

create or replace function public.join_project_as_worker(p_token text,p_first_name text,p_last_name text,p_position text)
returns uuid language plpgsql security definer set search_path=public as $$
declare invite public.project_worker_invites%rowtype; worker_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
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

create or replace function public.create_material_request(p_worker_id uuid,p_desired_date date,p_comment text,p_items jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare worker public.project_workers%rowtype; request_id text:='material-request_'||gen_random_uuid()::text; item jsonb;
begin
  select * into worker from public.project_workers where id=p_worker_id and auth_user_id=auth.uid() and status='active';
  if worker.id is null then raise exception 'WORKER_ACCESS_DENIED'; end if;
  perform public.assert_feature_for_user(worker.owner_id,'material_requests');
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'INVALID_ITEMS'; end if;
  insert into public.material_requests(id,owner_id,project_id,worker_id,desired_date,comment)
    values(request_id,worker.owner_id,worker.project_id,worker.id,p_desired_date,nullif(trim(p_comment),''));
  for item in select * from jsonb_array_elements(p_items) loop
    if char_length(trim(item->>'name')) not between 1 and 160 or coalesce((item->>'quantity')::numeric,0)<=0 or char_length(trim(item->>'unit')) not between 1 and 30 then raise exception 'INVALID_ITEM'; end if;
    insert into public.material_request_items(id,request_id,name,quantity,unit)
      values('material-item_'||gen_random_uuid()::text,request_id,trim(item->>'name'),(item->>'quantity')::numeric,trim(item->>'unit'));
  end loop;
  insert into public.notifications(recipient_user_id,worker_id,notification_type,title,body,data)
    values(worker.owner_id,worker.id,'material_request','Nová žiadosť o materiál',worker.first_name||' '||worker.last_name||' odoslal novú žiadosť.',jsonb_build_object('requestId',request_id,'projectId',worker.project_id));
  return request_id;
end; $$;

create or replace function public.set_analytics_enabled(p_enabled boolean) returns boolean language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.analytics_preferences(user_id,enabled,updated_at) values(auth.uid(),p_enabled,now()) on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
  return p_enabled;
end; $$;

create or replace function public.track_analytics_event(p_event_name text,p_properties jsonb default '{}') returns boolean
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); allowed boolean; safe_properties jsonb;
begin
  if uid is null or p_event_name not in ('project_created','receipt_saved','receipt_ocr_requested','receipt_exported','worker_joined','material_requested','analytics_changed') then return false; end if;
  select coalesce((select enabled from public.analytics_preferences where user_id=uid),true) into allowed; if not allowed then return false; end if;
  safe_properties:='{}'::jsonb;
  if p_properties->>'source' in ('app','worker_portal','edge','user_action','background') then safe_properties:=safe_properties||jsonb_build_object('source',p_properties->>'source'); end if;
  if p_properties->>'status' in ('pending','active','ready','draft','needs_review','enabled','disabled','new','approved','rejected','purchased','partially_purchased','synced') then safe_properties:=safe_properties||jsonb_build_object('status',p_properties->>'status'); end if;
  if p_properties->>'platform' in ('android','web','edge') then safe_properties:=safe_properties||jsonb_build_object('platform',p_properties->>'platform'); end if;
  if p_properties->>'plan' in ('free','premium') then safe_properties:=safe_properties||jsonb_build_object('plan',p_properties->>'plan'); end if;
  if p_properties->>'feature' in ('projects','workers_per_project','receipt_storage_bytes','attachment_storage_bytes','receipt_ocr','receipt_exports','worker_portal','material_requests') then safe_properties:=safe_properties||jsonb_build_object('feature',p_properties->>'feature'); end if;
  if jsonb_typeof(p_properties->'count')='number' then
    if (p_properties->>'count')::numeric between 0 and 10000 then safe_properties:=safe_properties||jsonb_build_object('count',(p_properties->>'count')::numeric); end if;
  end if;
  delete from public.analytics_events where created_at<now()-interval '180 days';
  insert into public.analytics_events(actor_hash,event_name,properties) values(encode(digest(uid::text||date_trunc('month',now())::text||'stavba-pilot-v1','sha256'),'hex'),p_event_name,safe_properties);
  return true;
end; $$;

alter table public.subscription_plans enable row level security; alter table public.feature_entitlements enable row level security;
alter table public.feature_usage_monthly enable row level security; alter table public.analytics_preferences enable row level security; alter table public.analytics_events enable row level security;
create policy subscription_plan_self_read on public.subscription_plans for select using(user_id=auth.uid());
create policy feature_entitlements_authenticated_read on public.feature_entitlements for select using(auth.uid() is not null);
create policy feature_usage_self_read on public.feature_usage_monthly for select using(user_id=auth.uid());
create policy analytics_preferences_self on public.analytics_preferences for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- analytics_events deliberately has no client read/write policy; only the sanitized RPC can insert.
revoke execute on function public.plan_for_user(uuid) from public,anon,authenticated;
revoke execute on function public.consume_feature(text,bigint) from public,anon;
revoke execute on function public.assert_upload_allowed(text,bigint,text) from public,anon;
revoke execute on function public.set_analytics_enabled(boolean) from public,anon;
revoke execute on function public.track_analytics_event(text,jsonb) from public,anon;
revoke execute on function public.guard_pilot_resource_limits() from public,anon,authenticated;
grant execute on function public.consume_feature(text,bigint) to authenticated;
grant execute on function public.assert_upload_allowed(text,bigint,text) to authenticated;
grant execute on function public.set_analytics_enabled(boolean) to authenticated;
grant execute on function public.track_analytics_event(text,jsonb) to authenticated;
revoke execute on function public.assert_feature_for_user(uuid,text) from public,anon,authenticated;
revoke execute on function public.join_project_as_worker(text,text,text,text) from public,anon;
revoke execute on function public.create_material_request(uuid,date,text,jsonb) from public,anon;
grant execute on function public.join_project_as_worker(text,text,text,text) to authenticated;
grant execute on function public.create_material_request(uuid,date,text,jsonb) to authenticated;
grant select on public.subscription_plans,public.feature_entitlements,public.feature_usage_monthly,public.analytics_preferences to authenticated;
