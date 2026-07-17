create extension if not exists pgcrypto;

create type public.project_status as enum ('active', 'archived');
create type public.delay_reason as enum ('bad_weather', 'investor_waiting');
create type public.report_type as enum ('diary', 'delay');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  locale text not null default 'sk-SK' check (locale = 'sk-SK'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  location text not null check (char_length(trim(location)) between 1 and 160),
  address text,
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (project_id, log_date)
);

create table public.diary_entries (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  log_date date not null,
  work_description text not null check (char_length(work_description) between 1 and 500),
  worker_count integer not null default 0 check (worker_count between 0 and 999),
  note text check (note is null or char_length(note) <= 300),
  evidence_json jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  correction_of_id text references public.diary_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delay_events (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_date timestamptz not null,
  reason public.delay_reason not null,
  note text check (note is null or char_length(note) <= 300),
  evidence_json jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  correction_of_id text references public.delay_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null default 'open-meteo',
  request_url text not null,
  latitude double precision not null,
  longitude double precision not null,
  captured_at timestamptz not null,
  raw_json jsonb not null,
  temperature_c numeric,
  precipitation_mm numeric,
  wind_speed_kmh numeric,
  weather_code integer,
  status text not null default 'saved' check (status in ('captured', 'pending', 'saved', 'failed')),
  created_at timestamptz not null default now()
);

create table public.attachments (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  related_entity_type text not null check (related_entity_type in ('diary_entry', 'delay_event', 'worker_checkin', 'attachment', 'weather_snapshot')),
  related_entity_id text,
  local_uri text,
  storage_path text,
  file_size bigint not null check (file_size between 0 and 10485760),
  mime_type text not null check (mime_type like 'image/%'),
  thumbnail_path text,
  upload_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.worker_checkins (
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_name text not null check (char_length(trim(worker_name)) between 1 and 120),
  checked_in_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table public.checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  expires_at timestamptz not null,
  action text not null default 'checkin' check (action = 'checkin'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  report_type public.report_type not null,
  source_entity_id text,
  attachment_ids text[] not null default '{}'::text[],
  locale text not null default 'sk-SK' check (locale = 'sk-SK'),
  storage_path text,
  page_count integer not null default 1,
  status text not null default 'synced',
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  if to_jsonb(old)->>'locked_at' is null then new.updated_at = now(); end if;
  return new;
end; $$;
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_new jsonb := to_jsonb(new);
  row_old jsonb := to_jsonb(old);
  entity_id text := coalesce(row_new->>'id', row_old->>'id');
  audit_action text;
begin
  audit_action := case
    when TG_TABLE_NAME = 'report_exports' and TG_OP = 'INSERT' then 'report_generation'
    when TG_OP = 'UPDATE' and row_old->>'locked_at' is null and row_new->>'locked_at' is not null then 'lock'
    when TG_OP = 'INSERT' and row_new->>'correction_of_id' is not null then 'correction'
    else lower(TG_OP)
  end;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), TG_TABLE_NAME, entity_id, audit_action, jsonb_build_object('table', TG_TABLE_NAME, 'correction_of_id', row_new->>'correction_of_id'));
  return coalesce(new, old);
end; $$;
create or replace function public.reject_locked_update() returns trigger language plpgsql as $$
begin
  if old.locked_at is not null and new is distinct from old then raise exception 'LOCKED_RECORD'; end if;
  return new;
end; $$;
create or replace function public.validate_correction_target() returns trigger language plpgsql as $$
declare target_owner uuid; target_project uuid; target_locked_at timestamptz;
begin
  if new.correction_of_id is null then return new; end if;
  if new.correction_of_id = new.id then raise exception 'INVALID_CORRECTION_TARGET'; end if;
  execute format('select owner_id, project_id, locked_at from public.%I where id = $1', TG_TABLE_NAME)
    into target_owner, target_project, target_locked_at using new.correction_of_id;
  if target_owner is null or target_owner <> new.owner_id or target_project <> new.project_id or target_locked_at is null then
    raise exception 'INVALID_CORRECTION_TARGET';
  end if;
  return new;
end; $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles(id, email) values (new.id, new.email) on conflict (id) do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger diary_updated_at before update on public.diary_entries for each row execute function public.set_updated_at();
create trigger delay_updated_at before update on public.delay_events for each row execute function public.set_updated_at();
create trigger diary_correction_guard before insert or update on public.diary_entries for each row execute function public.validate_correction_target();
create trigger delay_correction_guard before insert or update on public.delay_events for each row execute function public.validate_correction_target();
create trigger diary_lock_guard before update on public.diary_entries for each row execute function public.reject_locked_update();
create trigger delay_lock_guard before update on public.delay_events for each row execute function public.reject_locked_update();

do $$ declare t text; begin foreach t in array array['profiles','projects','daily_logs','diary_entries','delay_events','weather_snapshots','attachments','worker_checkins','report_exports'] loop execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t); end loop; end $$;

create or replace function public.create_checkin_token(p_project_id uuid, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare raw_token text := encode(gen_random_bytes(32), 'hex'); begin
  if not exists (select 1 from projects where id = p_project_id and owner_id = auth.uid() and status = 'active') then raise exception 'PROJECT_SCOPE'; end if;
  insert into checkin_tokens(token_hash, project_id, owner_id, checkin_date, expires_at) values (encode(digest(raw_token, 'sha256'), 'hex'), p_project_id, auth.uid(), p_date, (p_date + interval '1 day' - interval '1 second'));
  return raw_token;
end; $$;
create or replace function public.owns_project(p_project_id uuid, p_owner_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.projects where id = p_project_id and owner_id = p_owner_id); $$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.daily_logs enable row level security;
alter table public.diary_entries enable row level security;
alter table public.delay_events enable row level security;
alter table public.weather_snapshots enable row level security;
alter table public.attachments enable row level security;
alter table public.worker_checkins enable row level security;
alter table public.checkin_tokens enable row level security;
alter table public.report_exports enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_owner on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy projects_owner on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy daily_logs_owner on public.daily_logs for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy diary_owner on public.diary_entries for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy delay_owner on public.delay_events for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy weather_owner on public.weather_snapshots for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy attachments_owner on public.attachments for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy checkins_owner_read on public.worker_checkins for select using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy tokens_owner on public.checkin_tokens for select using (owner_id = auth.uid());
create policy reports_owner on public.report_exports for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy audit_owner_read on public.audit_events for select using (actor_id = auth.uid());

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false), ('reports', 'reports', false) on conflict (id) do update set public = false;
create policy attachments_storage_owner on storage.objects for all using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy reports_storage_owner on storage.objects for all using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
