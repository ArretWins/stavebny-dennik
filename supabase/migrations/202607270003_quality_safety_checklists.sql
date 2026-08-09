-- Confirmed quality and safety inspections for each construction project.
create table public.project_checklists (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  template_key text not null check (char_length(template_key) between 1 and 80),
  template_name text not null check (char_length(template_name) between 1 and 160),
  category text not null check (category in ('quality','safety')),
  inspection_date date not null,
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','completed')),
  note text check (note is null or char_length(note) <= 1500),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_checklists_answers_array check (
    jsonb_typeof(answers) = 'array'
    and jsonb_array_length(answers) between 1 and 100
  ),
  constraint project_checklists_confirmation_complete check (
    (status = 'draft' and confirmed_at is null and confirmed_by is null)
    or
    (status = 'completed' and confirmed_at is not null and confirmed_by is not null)
  )
);

create index project_checklists_project_date_idx
  on public.project_checklists(project_id, inspection_date desc, created_at desc);

create or replace function public.validate_project_checklist()
returns trigger language plpgsql set search_path=public,auth as $$
declare answer jsonb;
begin
  for answer in select value from jsonb_array_elements(new.answers)
  loop
    if coalesce(char_length(trim(answer->>'itemKey')),0) not between 1 and 80
      or coalesce(char_length(trim(answer->>'label')),0) not between 1 and 300
      or jsonb_typeof(answer->'required') <> 'boolean'
      or coalesce(answer->>'result','') not in ('pending','pass','fail','na')
      or coalesce(char_length(answer->>'note'),0) > 500
    then
      raise exception 'INVALID_CHECKLIST_ANSWER';
    end if;
    if new.status = 'completed'
      and (answer->>'required')::boolean
      and answer->>'result' = 'pending'
    then
      raise exception 'CHECKLIST_ANSWERS_REQUIRED';
    end if;
    if new.status = 'completed'
      and answer->>'result' = 'fail'
      and coalesce(char_length(trim(answer->>'note')),0) < 3
    then
      raise exception 'FAILED_CHECKLIST_NOTE_REQUIRED';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.prevent_completed_checklist_update()
returns trigger language plpgsql set search_path=public,auth as $$
begin
  if old.status = 'completed' then
    raise exception 'COMPLETED_CHECKLIST_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger project_checklists_validate
  before insert or update on public.project_checklists
  for each row execute function public.validate_project_checklist();
create trigger project_checklists_immutable
  before update on public.project_checklists
  for each row execute function public.prevent_completed_checklist_update();
create trigger project_checklists_updated_at
  before update on public.project_checklists
  for each row execute function public.set_updated_at();
create trigger project_checklists_audit
  after insert or update or delete on public.project_checklists
  for each row execute function public.audit_row();

alter table public.project_checklists enable row level security;

create policy project_checklists_owner on public.project_checklists
  for all
  using (
    owner_id = auth.uid()
    and public.owns_project(project_id, auth.uid())
  )
  with check (
    owner_id = auth.uid()
    and public.owns_project(project_id, auth.uid())
    and (status = 'draft' or confirmed_by = auth.uid())
  );

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',5,
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
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;

revoke execute on function public.validate_project_checklist() from public,anon;
revoke execute on function public.prevent_completed_checklist_update() from public,anon;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
