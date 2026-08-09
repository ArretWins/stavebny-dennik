-- Baseline schedule used by the deterministic look-ahead forecast.
create table public.project_schedules (
  project_id uuid primary key references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  target_completion_date date not null,
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_completion_date >= start_date)
);

alter table public.project_schedules enable row level security;
create policy project_schedules_owner_select on public.project_schedules
  for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );
create policy project_schedules_owner_insert on public.project_schedules
  for insert with check (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );
create policy project_schedules_owner_update on public.project_schedules
  for update using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  ) with check (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );

create trigger project_schedules_updated before update on public.project_schedules
  for each row execute function public.set_updated_at();
create trigger project_schedules_audit after insert or update or delete
  on public.project_schedules for each row execute function public.audit_row();
grant select,insert,update on public.project_schedules to authenticated;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',10,
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
    'projectBudgets',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_budgets x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectSchedules',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_schedules x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;
