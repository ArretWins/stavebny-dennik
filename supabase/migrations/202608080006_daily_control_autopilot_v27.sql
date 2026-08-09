-- Keep the persisted foreman action queue aligned with every issue emitted by
-- the current Control Tower. Earlier releases accepted only the original
-- finance/schedule subset, so newer offline actions could fail during sync.
alter table public.daily_control_actions
  drop constraint if exists daily_control_actions_issue_check;
alter table public.daily_control_actions
  add constraint daily_control_actions_issue_check check(issue in(
    'sync_failed','cost_overrun','reserve_at_risk','financial_setup',
    'schedule_critical','schedule_high','schedule_setup',
    'overdue_material','overdue_rfis','answered_rfis','open_rfis',
    'overdue_tools','lost_tools','tool_maintenance','inactive_tool_custody',
    'long_active_shifts','unapproved_shifts','pending_safety_acknowledgements',
    'expired_worker_credentials','expiring_worker_credentials','missing_worker_credentials',
    'critical_site_incidents','unresolved_site_incidents',
    'delivery_discrepancies','unreviewed_deliveries',
    'negative_material_stock','low_material_stock','pending_stock_reports',
    'task_material_shortages','task_tool_shortages','tomorrow_not_ready',
    'blocked_tasks','task_reviews','new_material_requests','pending_workers',
    'receipt_reviews','draft_checklists','client_changes'
  ));

alter table public.daily_control_actions
  drop constraint if exists daily_control_actions_target_check;
alter table public.daily_control_actions
  add constraint daily_control_actions_target_check check(target in(
    'sync','financial','schedule','defects','task_reviews',
    'material_requests','workers','receipts','rfis','tools','timesheet',
    'safety_briefings','worker_credentials','site_incidents',
    'material_deliveries','material_stock','task_materials','task_tools',
    'tomorrow_plan','checklists','change_orders'
  ));

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
  if p_issue not in(
    'sync_failed','cost_overrun','reserve_at_risk','financial_setup',
    'schedule_critical','schedule_high','schedule_setup',
    'overdue_material','overdue_rfis','answered_rfis','open_rfis',
    'overdue_tools','lost_tools','tool_maintenance','inactive_tool_custody',
    'long_active_shifts','unapproved_shifts','pending_safety_acknowledgements',
    'expired_worker_credentials','expiring_worker_credentials','missing_worker_credentials',
    'critical_site_incidents','unresolved_site_incidents',
    'delivery_discrepancies','unreviewed_deliveries',
    'negative_material_stock','low_material_stock','pending_stock_reports',
    'task_material_shortages','task_tool_shortages','tomorrow_not_ready',
    'blocked_tasks','task_reviews','new_material_requests','pending_workers',
    'receipt_reviews','draft_checklists','client_changes'
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_ISSUE'; end if;
  if p_severity not in('critical','high','watch')
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_SEVERITY'; end if;
  if p_target not in(
    'sync','financial','schedule','defects','task_reviews',
    'material_requests','workers','receipts','rfis','tools','timesheet',
    'safety_briefings','worker_credentials','site_incidents',
    'material_deliveries','material_stock','task_materials','task_tools',
    'tomorrow_plan','checklists','change_orders'
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_TARGET'; end if;
  if p_item_count is not null and p_item_count not between 0 and 100000
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_COUNT'; end if;
  if p_amount_cents is not null
    and p_amount_cents not between -1000000000 and 1000000000
  then raise exception 'INVALID_DAILY_CONTROL_ACTION_AMOUNT'; end if;
  if p_resolve and p_confirmed is not true
  then raise exception 'DAILY_CONTROL_ACTION_CONFIRMATION_REQUIRED'; end if;
  if p_resolve and(
    p_resolution is null or char_length(trim(p_resolution)) not between 3 and 500
  ) then raise exception 'INVALID_DAILY_CONTROL_ACTION_RESOLUTION'; end if;

  select target.* into item from public.daily_control_actions target
    where target.id=p_id for update;
  if item.id is not null
    and(item.owner_id<>uid or item.project_id<>p_project_id)
  then raise exception 'DAILY_CONTROL_ACTION_ACCESS_DENIED'; end if;
  if item.id is not null and item.status='resolved' then return item; end if;
  if item.id is null then
    insert into public.daily_control_actions(
      id,owner_id,project_id,action_date,issue,severity,target,
      item_count,amount_cents
    ) values(
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

alter function public.export_my_data() rename to export_my_data_v26;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v26() || jsonb_build_object('schemaVersion',27)
  end
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
