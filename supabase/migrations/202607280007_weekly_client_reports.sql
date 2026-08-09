-- Immutable weekly progress snapshots prepared by the foreman and published
-- through the existing temporary client link.
alter type public.report_type add value if not exists 'weekly';

create table public.weekly_reports (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary text not null check (char_length(trim(summary)) between 5 and 1200),
  next_week_plan text not null
    check (char_length(trim(next_week_plan)) between 5 and 1200),
  client_note text check (
    client_note is null or char_length(trim(client_note)) between 1 and 800
  ),
  snapshot jsonb not null check (
    jsonb_typeof(snapshot)='object'
    and jsonb_typeof(snapshot->'completedTasks')='array'
    and jsonb_typeof(snapshot->'attachmentIds')='array'
    and octet_length(snapshot::text)<=200000
  ),
  status text not null default 'draft'
    check (status in ('draft','published')),
  published_at timestamptz,
  pdf_report_id uuid references public.report_exports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end=period_start+6),
  check (
    (status='draft' and published_at is null)
    or (status='published' and published_at is not null)
  )
);

create index weekly_reports_project_period_idx
  on public.weekly_reports(project_id,period_start desc,created_at desc);
create unique index weekly_reports_one_draft_per_week_idx
  on public.weekly_reports(project_id,period_start) where status='draft';

alter table public.weekly_reports enable row level security;
create policy weekly_reports_owner_select on public.weekly_reports
  for select using (
    owner_id=auth.uid() and public.owns_project(project_id,auth.uid())
  );

create or replace function public.guard_weekly_report_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'WEEKLY_REPORT_IMMUTABLE'; end if;
  if old.status='published' then raise exception 'WEEKLY_REPORT_IMMUTABLE'; end if;
  if coalesce(current_setting('app.weekly_report_workflow',true),'')<>'allowed'
  then raise exception 'WEEKLY_REPORT_WORKFLOW_REQUIRED'; end if;
  if new.status not in ('draft','published')
  then raise exception 'INVALID_WEEKLY_REPORT_STATUS'; end if;
  return new;
end;
$$;
create trigger weekly_report_mutation_guard before update or delete
  on public.weekly_reports for each row
  execute function public.guard_weekly_report_mutation();
create trigger weekly_reports_audit after insert or update or delete
  on public.weekly_reports for each row execute function public.audit_row();

create or replace function public.save_weekly_report(
  p_id text,p_project_id uuid,p_period_start date,p_period_end date,
  p_summary text,p_next_week_plan text,p_client_note text,p_snapshot jsonb,
  p_pdf_report_id uuid default null,p_publish boolean default false,
  p_confirmed boolean default false
)
returns public.weekly_reports
language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); item public.weekly_reports;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid)
  then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if p_id is null or char_length(p_id) not between 3 and 120
  then raise exception 'INVALID_WEEKLY_REPORT_ID'; end if;
  if p_period_start is null or p_period_end<>p_period_start+6
  then raise exception 'INVALID_WEEKLY_REPORT_PERIOD'; end if;
  if char_length(trim(p_summary)) not between 5 and 1200
  then raise exception 'INVALID_WEEKLY_REPORT_SUMMARY'; end if;
  if char_length(trim(p_next_week_plan)) not between 5 and 1200
  then raise exception 'INVALID_WEEKLY_REPORT_PLAN'; end if;
  if p_client_note is not null
    and char_length(trim(p_client_note)) not between 1 and 800
  then raise exception 'INVALID_WEEKLY_REPORT_NOTE'; end if;
  if jsonb_typeof(p_snapshot)<>'object'
    or jsonb_typeof(p_snapshot->'completedTasks')<>'array'
    or jsonb_typeof(p_snapshot->'attachmentIds')<>'array'
    or octet_length(p_snapshot::text)>200000
  then raise exception 'INVALID_WEEKLY_REPORT_SNAPSHOT'; end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_snapshot->'attachmentIds') selected(id)
    left join public.attachments attachment
      on attachment.id=selected.id
      and attachment.owner_id=uid
      and attachment.project_id=p_project_id
      and attachment.mime_type like 'image/%'
    where attachment.id is null
  ) then raise exception 'INVALID_WEEKLY_REPORT_ATTACHMENT'; end if;
  if p_publish and p_confirmed is not true
  then raise exception 'WEEKLY_REPORT_CONFIRMATION_REQUIRED'; end if;
  if p_pdf_report_id is not null and not exists (
    select 1 from public.report_exports report
    where report.id=p_pdf_report_id and report.owner_id=uid
      and report.project_id=p_project_id and report.report_type='weekly'
  ) then raise exception 'INVALID_WEEKLY_REPORT_PDF'; end if;

  select target.* into item from public.weekly_reports target
    where target.id=p_id for update;
  if item.id is not null
    and (item.owner_id<>uid or item.project_id<>p_project_id)
  then raise exception 'WEEKLY_REPORT_ACCESS_DENIED'; end if;
  if item.id is not null and item.status='published' then
    if p_publish then return item; end if;
    raise exception 'WEEKLY_REPORT_IMMUTABLE';
  end if;
  perform set_config('app.weekly_report_workflow','allowed',true);
  if item.id is null then
    insert into public.weekly_reports(
      id,owner_id,project_id,period_start,period_end,summary,next_week_plan,
      client_note,snapshot,status,published_at,pdf_report_id
    ) values (
      p_id,uid,p_project_id,p_period_start,p_period_end,trim(p_summary),
      trim(p_next_week_plan),nullif(trim(p_client_note),''),
      p_snapshot,case when p_publish then 'published' else 'draft' end,
      case when p_publish then now() end,p_pdf_report_id
    ) returning * into item;
  else
    update public.weekly_reports set
      period_start=p_period_start,period_end=p_period_end,
      summary=trim(p_summary),next_week_plan=trim(p_next_week_plan),
      client_note=nullif(trim(p_client_note),''),snapshot=p_snapshot,
      status=case when p_publish then 'published' else 'draft' end,
      published_at=case when p_publish then now() end,
      pdf_report_id=p_pdf_report_id,updated_at=now()
    where id=p_id returning * into item;
  end if;
  return item;
end;
$$;

create or replace function public.resolve_project_share_weekly_reports(
  p_token text
) returns jsonb language plpgsql security definer
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
      'id',report.id,'periodStart',report.period_start,
      'periodEnd',report.period_end,'summary',report.summary,
      'nextWeekPlan',report.next_week_plan,'clientNote',report.client_note,
      'snapshot',report.snapshot,'publishedAt',report.published_at
    ) order by report.period_start desc,report.created_at desc)
    from (
      select * from public.weekly_reports target
      where target.project_id=link.project_id and target.owner_id=link.owner_id
        and target.status='published'
      order by target.period_start desc,target.created_at desc limit 12
    ) report
  ),'[]'::jsonb);
end;
$$;

grant select on public.weekly_reports to authenticated;
revoke execute on function public.save_weekly_report(
  text,uuid,date,date,text,text,text,jsonb,uuid,boolean,boolean
) from public,anon;
grant execute on function public.save_weekly_report(
  text,uuid,date,date,text,text,text,jsonb,uuid,boolean,boolean
) to authenticated;
revoke execute on function public.resolve_project_share_weekly_reports(text)
  from public,anon,authenticated;
grant execute on function public.resolve_project_share_weekly_reports(text)
  to service_role;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',11,
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
    'weeklyReports',coalesce((select jsonb_agg(to_jsonb(x)) from public.weekly_reports x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;
