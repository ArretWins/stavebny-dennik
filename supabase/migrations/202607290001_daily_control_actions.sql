-- Daily foreman decisions materialized from the control tower. Resolved rows
-- are immutable so the project keeps an attributable management history.
create table public.daily_control_actions (
  id text primary key check (char_length(id) between 3 and 160),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  action_date date not null,
  issue text not null check (issue in (
    'sync_failed','cost_overrun','reserve_at_risk','financial_setup',
    'schedule_critical','schedule_high','schedule_setup',
    'overdue_material','blocked_tasks','task_reviews',
    'new_material_requests','pending_workers','receipt_reviews',
    'draft_checklists','client_changes'
  )),
  severity text not null check (severity in ('critical','high','watch')),
  target text not null check (target in (
    'sync','financial','schedule','defects','task_reviews',
    'material_requests','workers','receipts','checklists','change_orders'
  )),
  item_count integer check (item_count is null or item_count between 0 and 100000),
  amount_cents bigint check (
    amount_cents is null or amount_cents between -1000000000 and 1000000000
  ),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (
    resolution is null or char_length(trim(resolution)) between 3 and 500
  ),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,action_date,issue),
  check (
    (status='open' and resolution is null and resolved_at is null and resolved_by is null)
    or
    (status='resolved' and resolution is not null and resolved_at is not null)
  )
);

create index daily_control_actions_project_date_idx
  on public.daily_control_actions(project_id,action_date desc,status);

alter table public.daily_control_actions enable row level security;
create policy daily_control_actions_owner_select
  on public.daily_control_actions for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );

create or replace function public.guard_daily_control_action_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'DAILY_CONTROL_ACTION_IMMUTABLE'; end if;
  if old.status='resolved' then
    raise exception 'DAILY_CONTROL_ACTION_IMMUTABLE';
  end if;
  if coalesce(current_setting('app.daily_control_workflow',true),'')<>'allowed'
  then raise exception 'DAILY_CONTROL_ACTION_WORKFLOW_REQUIRED'; end if;
  return new;
end;
$$;
create trigger daily_control_action_mutation_guard before update or delete
  on public.daily_control_actions for each row
  execute function public.guard_daily_control_action_mutation();
create trigger daily_control_actions_audit after insert or update or delete
  on public.daily_control_actions for each row execute function public.audit_row();

create or replace function public.save_daily_control_action(
  p_id text,
  p_project_id uuid,
  p_action_date date,
  p_issue text,
  p_severity text,
  p_target text,
  p_item_count integer default null,
  p_amount_cents bigint default null,
  p_resolution text default null,
  p_resolve boolean default false,
  p_confirmed boolean default false
)
returns public.daily_control_actions
language plpgsql security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  item public.daily_control_actions;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid)
  then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if p_id is null or char_length(p_id) not between 3 and 160
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_ID'; end if;
  if p_action_date is null or p_action_date>current_date+1
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_DATE'; end if;
  if p_issue not in (
    'sync_failed','cost_overrun','reserve_at_risk','financial_setup',
    'schedule_critical','schedule_high','schedule_setup',
    'overdue_material','blocked_tasks','task_reviews',
    'new_material_requests','pending_workers','receipt_reviews',
    'draft_checklists','client_changes'
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_ISSUE'; end if;
  if p_severity not in ('critical','high','watch')
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_SEVERITY'; end if;
  if p_target not in (
    'sync','financial','schedule','defects','task_reviews',
    'material_requests','workers','receipts','checklists','change_orders'
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_TARGET'; end if;
  if p_item_count is not null and p_item_count not between 0 and 100000
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_COUNT'; end if;
  if p_amount_cents is not null
    and p_amount_cents not between -1000000000 and 1000000000
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_AMOUNT'; end if;
  if p_resolve and p_confirmed is not true
  then raise exception 'DAILY_CONTROL_ACTION_CONFIRMATION_REQUIRED'; end if;
  if p_resolve and (
    p_resolution is null or char_length(trim(p_resolution)) not between 3 and 500
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_RESOLUTION'; end if;

  select target.* into item from public.daily_control_actions target
    where target.id=p_id for update;
  if item.id is not null
    and (item.owner_id<>uid or item.project_id<>p_project_id)
  then raise exception 'DAILY_CONTROL_ACTION_ACCESS_DENIED'; end if;
  if item.id is not null and item.status='resolved' then return item; end if;
  if item.id is null then
    insert into public.daily_control_actions(
      id,owner_id,project_id,action_date,issue,severity,target,
      item_count,amount_cents
    ) values (
      p_id,uid,p_project_id,p_action_date,p_issue,p_severity,p_target,
      p_item_count,p_amount_cents
    ) returning * into item;
  end if;
  if p_resolve then
    perform set_config('app.daily_control_workflow','allowed',true);
    update public.daily_control_actions set
      status='resolved',resolution=trim(p_resolution),
      resolved_at=now(),resolved_by=uid,updated_at=now()
    where id=p_id returning * into item;
  end if;
  return item;
end;
$$;

grant select on public.daily_control_actions to authenticated;
revoke execute on function public.save_daily_control_action(
  text,uuid,date,text,text,text,integer,bigint,text,boolean,boolean
) from public,anon;
grant execute on function public.save_daily_control_action(
  text,uuid,date,text,text,text,integer,bigint,text,boolean,boolean
) to authenticated;

alter function public.export_my_data() rename to export_my_data_v12;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v12() || jsonb_build_object(
      'schemaVersion',13,
      'dailyControlActions',coalesce((
        select jsonb_agg(to_jsonb(item))
        from public.daily_control_actions item
        where item.owner_id=auth.uid()
      ),'[]'::jsonb)
    )
  end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
