-- Project drawings and location-aware task tracking.
create table public.project_plans (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  local_uri text not null default '',
  storage_path text,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  page_count integer not null default 1 check (page_count between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_plans_project_idx
  on public.project_plans(project_id, created_at desc);

create table public.site_tasks (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id text references public.project_plans(id) on delete set null,
  page_number integer,
  x_ratio double precision,
  y_ratio double precision,
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 1500),
  kind text not null default 'task' check (kind in ('task','defect','inspection','material')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_worker_id uuid references public.project_workers(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_task_pin_complete check (
    (plan_id is null and page_number is null and x_ratio is null and y_ratio is null)
    or
    (
      plan_id is not null
      and page_number is not null and page_number >= 1
      and x_ratio is not null and x_ratio between 0 and 1
      and y_ratio is not null and y_ratio between 0 and 1
    )
  )
);
create index site_tasks_project_status_idx
  on public.site_tasks(project_id, status, due_date, created_at desc);
create index site_tasks_plan_page_idx
  on public.site_tasks(plan_id, page_number) where plan_id is not null;

create trigger project_plans_updated_at
  before update on public.project_plans
  for each row execute function public.set_updated_at();
create trigger site_tasks_updated_at
  before update on public.site_tasks
  for each row execute function public.set_updated_at();
create trigger project_plans_audit
  after insert or update or delete on public.project_plans
  for each row execute function public.audit_row();
create trigger site_tasks_audit
  after insert or update or delete on public.site_tasks
  for each row execute function public.audit_row();

alter table public.project_plans enable row level security;
alter table public.site_tasks enable row level security;

create policy project_plans_owner on public.project_plans
  for all
  using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()))
  with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));

create policy site_tasks_owner on public.site_tasks
  for all
  using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()))
  with check (
    owner_id = auth.uid()
    and public.owns_project(project_id, auth.uid())
    and (
      plan_id is null
      or exists (
        select 1 from public.project_plans p
        where p.id = plan_id and p.project_id = site_tasks.project_id and p.owner_id = auth.uid()
      )
    )
    and (
      assigned_worker_id is null
      or exists (
        select 1 from public.project_workers w
        where w.id = assigned_worker_id and w.project_id = site_tasks.project_id and w.owner_id = auth.uid()
      )
    )
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'plans',
  'plans',
  false,
  52428800,
  array['application/pdf','image/jpeg','image/png']
)
on conflict(id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy plans_storage_owner on storage.objects
  for all
  using (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'plans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',2,
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
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;

create or replace function public.delete_my_account(p_confirmation text) returns boolean
language plpgsql security definer set search_path=public,auth,storage as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_confirmation<>'DELETE' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  delete from storage.objects
    where bucket_id in ('attachments','reports','receipts','plans')
      and (storage.foldername(name))[1]=uid::text;
  delete from auth.users where id=uid;
  return true;
end; $$;

revoke execute on function public.export_my_data() from public,anon;
revoke execute on function public.delete_my_account(text) from public,anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
