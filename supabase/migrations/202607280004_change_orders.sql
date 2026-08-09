-- Additional work / price and schedule variations with formal client approval.
create table public.change_orders (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  order_number integer not null check (order_number > 0),
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 3 and 1200),
  amount_cents integer not null check (
    amount_cents <> 0 and abs(amount_cents::bigint) <= 100000000
  ),
  schedule_impact_days integer not null default 0 check (
    abs(schedule_impact_days) <= 365
  ),
  related_task_id text references public.site_tasks(id) on delete set null,
  status text not null default 'draft' check (
    status in ('draft','pending_client','accepted','rejected','cancelled')
  ),
  submitted_at timestamptz,
  decided_at timestamptz,
  signer_name text check (
    signer_name is null or char_length(trim(signer_name)) between 2 and 100
  ),
  decision_comment text check (
    decision_comment is null or char_length(decision_comment) between 1 and 500
  ),
  share_link_id uuid references public.project_share_links(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,order_number),
  check (
    (status='draft' and submitted_at is null and decided_at is null)
    or (status='pending_client' and submitted_at is not null and decided_at is null)
    or (status in ('accepted','rejected') and submitted_at is not null
        and decided_at is not null and signer_name is not null)
    or (status='cancelled' and submitted_at is not null)
  ),
  check (
    status <> 'rejected'
    or char_length(trim(decision_comment)) >= 3
  )
);

create index change_orders_owner_project_idx
  on public.change_orders(owner_id,project_id,order_number desc);
create index change_orders_public_idx
  on public.change_orders(project_id,status,submitted_at desc)
  where status <> 'draft';

create table public.change_order_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  change_order_id text not null references public.change_orders(id) on delete cascade,
  event_type text not null check (
    event_type in ('created','submitted','accepted','rejected','cancelled')
  ),
  signer_name text,
  body text check (body is null or char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index change_order_events_order_time_idx
  on public.change_order_events(change_order_id,created_at,id);

alter table public.change_orders enable row level security;
alter table public.change_order_events enable row level security;
create policy change_orders_owner_select on public.change_orders for select
  using (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()));
create policy change_order_events_owner_select
  on public.change_order_events for select
  using (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()));

create or replace function public.guard_change_order_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'CHANGE_ORDER_IMMUTABLE'; end if;
  if coalesce(current_setting('app.change_order_workflow',true),'') <> 'allowed'
  then raise exception 'CHANGE_ORDER_WORKFLOW_REQUIRED'; end if;
  if not (
    (old.status='draft' and new.status in ('draft','pending_client'))
    or
    (old.status='pending_client' and new.status in ('accepted','rejected','cancelled'))
  ) then raise exception 'CHANGE_ORDER_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger change_order_mutation_guard before update or delete
  on public.change_orders for each row
  execute function public.guard_change_order_mutation();

create or replace function public.reject_change_order_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'CHANGE_ORDER_EVENT_IMMUTABLE'; end;
$$;
create trigger change_order_event_immutable before update or delete
  on public.change_order_events for each row
  execute function public.reject_change_order_event_mutation();

create or replace function public.track_change_order_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare next_event text;
begin
  if tg_op='INSERT' then
    insert into public.change_order_events(
      owner_id,project_id,change_order_id,event_type,created_at
    ) values (new.owner_id,new.project_id,new.id,'created',new.created_at);
    if new.status<>'pending_client' then return new; end if;
    next_event := 'submitted';
  elsif old.status is not distinct from new.status then return new;
  else
    next_event := case when new.status='pending_client'
      then 'submitted' else new.status end;
  end if;
  insert into public.change_order_events(
    owner_id,project_id,change_order_id,event_type,signer_name,body,created_at
  ) values (
    new.owner_id,new.project_id,new.id,next_event,new.signer_name,
    case when next_event in ('accepted','rejected') then new.decision_comment end,
    case when next_event in ('accepted','rejected') then new.decided_at
      when next_event='submitted' then new.submitted_at else new.created_at end
  );
  return new;
end;
$$;
create trigger change_order_timeline after insert or update
  on public.change_orders for each row execute function public.track_change_order_event();

create or replace function public.save_change_order(
  p_id text,p_project_id uuid,p_title text,p_description text,
  p_amount_cents integer,p_schedule_impact_days integer,
  p_related_task_id text default null,p_submit boolean default false
)
returns public.change_orders
language plpgsql security definer
set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); item public.change_orders; next_number integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid)
  then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if p_id is null or char_length(p_id) not between 3 and 120
  then raise exception 'INVALID_CHANGE_ORDER_ID'; end if;
  if char_length(trim(p_title)) not between 3 and 120
  then raise exception 'INVALID_CHANGE_ORDER_TITLE'; end if;
  if char_length(trim(p_description)) not between 3 and 1200
  then raise exception 'INVALID_CHANGE_ORDER_DESCRIPTION'; end if;
  if p_amount_cents is null or p_amount_cents=0
    or abs(p_amount_cents::bigint)>100000000
  then raise exception 'INVALID_CHANGE_ORDER_AMOUNT'; end if;
  if p_schedule_impact_days is null or abs(p_schedule_impact_days)>365
  then raise exception 'INVALID_CHANGE_ORDER_SCHEDULE'; end if;
  if p_related_task_id is not null and not exists (
    select 1 from public.site_tasks task
    where task.id=p_related_task_id and task.project_id=p_project_id
      and task.owner_id=uid
  ) then raise exception 'INVALID_CHANGE_ORDER_TASK'; end if;

  select target.* into item from public.change_orders target
  where target.id=p_id for update;
  perform set_config('app.change_order_workflow','allowed',true);
  if item.id is null then
    perform pg_advisory_xact_lock(hashtext(p_project_id::text));
    select coalesce(max(order_number),0)+1 into next_number
      from public.change_orders where project_id=p_project_id;
    insert into public.change_orders(
      id,owner_id,project_id,order_number,title,description,amount_cents,
      schedule_impact_days,related_task_id,status,submitted_at
    ) values (
      p_id,uid,p_project_id,next_number,trim(p_title),trim(p_description),
      p_amount_cents,p_schedule_impact_days,p_related_task_id,
      case when p_submit then 'pending_client' else 'draft' end,
      case when p_submit then now() end
    ) returning * into item;
  else
    if item.owner_id<>uid or item.project_id<>p_project_id
    then raise exception 'CHANGE_ORDER_ACCESS_DENIED'; end if;
    if item.status<>'draft' then raise exception 'CHANGE_ORDER_IMMUTABLE'; end if;
    update public.change_orders set
      title=trim(p_title),description=trim(p_description),
      amount_cents=p_amount_cents,
      schedule_impact_days=p_schedule_impact_days,
      related_task_id=p_related_task_id,
      status=case when p_submit then 'pending_client' else 'draft' end,
      submitted_at=case when p_submit then now() end,
      updated_at=now()
    where id=p_id returning * into item;
  end if;
  return item;
end;
$$;

create or replace function public.resolve_project_share_change_orders(p_token text)
returns jsonb language plpgsql security definer
set search_path=public,extensions as $$
declare link public.project_share_links;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select candidate.* into link from public.project_share_links candidate
  join public.projects project on project.id=candidate.project_id
    and project.status='active'
  where candidate.token_hash=encode(digest(p_token,'sha256'),'hex')
    and candidate.revoked_at is null and candidate.expires_at>now();
  if link.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',item.id,'orderNumber',item.order_number,'title',item.title,
      'description',item.description,'amountCents',item.amount_cents,
      'scheduleImpactDays',item.schedule_impact_days,'status',item.status,
      'submittedAt',item.submitted_at,'decidedAt',item.decided_at,
      'signerName',item.signer_name,'decisionComment',item.decision_comment
    ) order by item.order_number desc)
    from public.change_orders item
    where item.project_id=link.project_id and item.owner_id=link.owner_id
      and item.status<>'draft' and item.status<>'cancelled'
  ),'[]'::jsonb);
end;
$$;

create or replace function public.submit_project_share_change_order_decision(
  p_token text,p_change_order_id text,p_decision text,
  p_signer_name text,p_comment text,p_confirmed boolean
)
returns jsonb language plpgsql security definer
set search_path=public,auth,extensions as $$
declare link public.project_share_links; item public.change_orders;
  signer text:=nullif(trim(p_signer_name),'');
  note text:=nullif(trim(p_comment),'');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
  then raise exception 'INVALID_SHARE_TOKEN'; end if;
  if p_decision not in ('accept','reject')
  then raise exception 'INVALID_CHANGE_ORDER_DECISION'; end if;
  if p_confirmed is not true then raise exception 'CLIENT_CONFIRMATION_REQUIRED'; end if;
  if signer is null or char_length(signer) not between 2 and 100
  then raise exception 'INVALID_CLIENT_SIGNER'; end if;
  if note is not null and char_length(note)>500
  then raise exception 'CLIENT_COMMENT_TOO_LONG'; end if;
  if p_decision='reject' and coalesce(char_length(note),0)<3
  then raise exception 'CHANGE_ORDER_REJECTION_COMMENT_REQUIRED'; end if;
  select candidate.* into link from public.project_share_links candidate
  where candidate.token_hash=encode(digest(p_token,'sha256'),'hex')
    and candidate.revoked_at is null and candidate.expires_at>now()
  for update;
  if link.id is null then raise exception 'SHARE_LINK_NOT_AVAILABLE'; end if;
  select target.* into item from public.change_orders target
  where target.id=p_change_order_id and target.project_id=link.project_id
    and target.owner_id=link.owner_id and target.status='pending_client'
  for update;
  if item.id is null then raise exception 'CHANGE_ORDER_NOT_AVAILABLE'; end if;
  perform set_config('app.change_order_workflow','allowed',true);
  update public.change_orders set
    status=case when p_decision='accept' then 'accepted' else 'rejected' end,
    decided_at=now(),signer_name=signer,decision_comment=note,
    share_link_id=link.id,updated_at=now()
  where id=item.id returning * into item;
  insert into public.notifications(
    recipient_user_id,notification_type,title,body,data
  ) values (
    item.owner_id,'change_order_decision',
    case when item.status='accepted'
      then 'Objednávateľ schválil dodatok'
      else 'Objednávateľ zamietol dodatok' end,
    concat('#',item.order_number,' ',item.title,' · ',signer),
    jsonb_build_object(
      'changeOrderId',item.id,'projectId',item.project_id,'status',item.status
    )
  );
  return jsonb_build_object(
    'id',item.id,'status',item.status,'signerName',item.signer_name,
    'decidedAt',item.decided_at
  );
end;
$$;

alter table public.notifications drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check check (
    notification_type in (
      'worker_join','material_request','request_status','site_task','task_review',
      'task_assignment','task_comment','client_decision','change_order_decision'
    )
  );

revoke execute on function public.save_change_order(
  text,uuid,text,text,integer,integer,text,boolean
) from public,anon;
grant execute on function public.save_change_order(
  text,uuid,text,text,integer,integer,text,boolean
) to authenticated;
revoke execute on function public.resolve_project_share_change_orders(text)
  from public,anon,authenticated;
grant execute on function public.resolve_project_share_change_orders(text)
  to service_role;
revoke execute on function public.submit_project_share_change_order_decision(
  text,text,text,text,text,boolean
) from public,anon,authenticated;
grant execute on function public.submit_project_share_change_order_decision(
  text,text,text,text,text,boolean
) to service_role;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',8,
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
    'projectPlans',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_plans x where x.owner_id=auth.uid()),'[]'::jsonb),
    'siteTasks',coalesce((select jsonb_agg(to_jsonb(x)) from public.site_tasks x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectChecklists',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_checklists x where x.owner_id=auth.uid()),'[]'::jsonb),
    'siteTaskEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.site_task_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'clientTaskDecisions',coalesce((select jsonb_agg(to_jsonb(x)) from public.client_task_decisions x where x.owner_id=auth.uid()),'[]'::jsonb),
    'changeOrders',coalesce((select jsonb_agg(to_jsonb(x)) from public.change_orders x where x.owner_id=auth.uid()),'[]'::jsonb),
    'changeOrderEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.change_order_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;
