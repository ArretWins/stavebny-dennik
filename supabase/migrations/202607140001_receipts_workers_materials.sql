-- Receipts, accountant exports, worker onboarding, material requests and notifications.
-- This migration is additive and can be applied after 202607110001_initial_schema.sql.

create table public.expense_categories (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index expense_categories_owner_name_idx on public.expense_categories(owner_id, lower(trim(name)));

create table public.receipts (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id text references public.expense_categories(id) on delete set null,
  purchase_date date,
  seller text check (seller is null or char_length(trim(seller)) between 1 and 200),
  total_amount_cents bigint check (total_amount_cents is null or total_amount_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'ready')),
  ocr_status text not null default 'not_requested' check (ocr_status in ('not_requested', 'pending', 'processing', 'needs_review', 'completed', 'failed')),
  ocr_confidence numeric check (ocr_confidence is null or ocr_confidence between 0 and 1),
  ocr_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receipts_project_date_idx on public.receipts(project_id, purchase_date desc);

create table public.receipt_files (
  id text primary key,
  receipt_id text not null references public.receipts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  local_uri text,
  storage_path text,
  file_size bigint not null check (file_size between 1 and 26214400),
  mime_type text not null check (mime_type like 'image/%' or mime_type = 'application/pdf'),
  page_order integer not null check (page_order >= 0),
  sha256 text,
  perceptual_hash text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'syncing', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  unique(receipt_id, page_order)
);

create table public.receipt_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_id text not null references public.receipts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  provider text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  result_json jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.receipt_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_id text not null references public.receipts(id) on delete cascade,
  candidate_receipt_id text not null references public.receipts(id) on delete cascade,
  score numeric not null check (score between 0 and 1),
  reasons text[] not null default '{}',
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  check (receipt_id <> candidate_receipt_id),
  unique(receipt_id, candidate_receipt_id)
);

create table public.receipt_export_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  date_from date not null,
  date_to date not null check (date_to >= date_from),
  category_ids text[] not null default '{}',
  version integer not null check (version > 0),
  total_amount_cents bigint not null default 0 check (total_amount_cents >= 0),
  receipt_count integer not null default 0 check (receipt_count >= 0),
  storage_path text,
  checksum text,
  page_count integer not null default 1 check (page_count > 0),
  status text not null default 'pending' check (status in ('pending', 'syncing', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  unique(project_id, date_from, date_to, version)
);

create table public.receipt_export_items (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.receipt_export_batches(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_id text not null references public.receipts(id) on delete restrict,
  purchase_date date not null,
  seller text not null,
  total_amount_cents bigint not null check (total_amount_cents >= 0),
  currency text not null check (currency = 'EUR'),
  category_name text not null,
  project_name text not null,
  file_ids text[] not null default '{}',
  position integer not null check (position >= 0),
  unique(export_id, receipt_id),
  unique(export_id, position)
);

create table public.project_workers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  position text not null check (char_length(trim(position)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'revoked')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index project_workers_device_idx on public.project_workers(project_id, auth_user_id) where auth_user_id is not null;

create table public.project_worker_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null default 100 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.material_requests (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id uuid not null references public.project_workers(id) on delete restrict,
  desired_date date,
  comment text check (comment is null or char_length(comment) <= 500),
  status text not null default 'new' check (status in ('new', 'approved', 'partially_purchased', 'purchased', 'rejected')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index material_requests_project_status_idx on public.material_requests(project_id, status, created_at desc);

create table public.material_request_items (
  id text primary key,
  request_id text not null references public.material_requests(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  quantity numeric not null check (quantity > 0),
  unit text not null check (char_length(trim(unit)) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.material_request_status_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.receipt_request_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_id text not null references public.receipts(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  allocated_amount_cents bigint check (allocated_amount_cents is null or allocated_amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique(receipt_id, request_id)
);

create or replace function public.guard_receipt_request_link() returns trigger language plpgsql as $$
declare receipt_owner uuid; receipt_project uuid; receipt_total bigint; request_owner uuid; request_project uuid; allocated bigint;
begin
  select owner_id, project_id, total_amount_cents into receipt_owner, receipt_project, receipt_total from public.receipts where id = new.receipt_id;
  select owner_id, project_id into request_owner, request_project from public.material_requests where id = new.request_id;
  if receipt_owner is null or request_owner is null or receipt_owner <> new.owner_id or request_owner <> new.owner_id or receipt_project <> request_project then raise exception 'RECEIPT_REQUEST_SCOPE'; end if;
  if new.allocated_amount_cents is not null then
    select coalesce(sum(allocated_amount_cents), 0) into allocated from public.receipt_request_links where receipt_id = new.receipt_id and id <> new.id;
    if receipt_total is null or allocated + new.allocated_amount_cents > receipt_total then raise exception 'RECEIPT_ALLOCATION_EXCEEDED'; end if;
  end if;
  return new;
end; $$;
create trigger receipt_request_link_guard before insert or update on public.receipt_request_links for each row execute function public.guard_receipt_request_link();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid references public.project_workers(id) on delete cascade,
  channel text not null check (channel in ('expo', 'web')),
  endpoint text not null,
  p256dh text,
  auth_secret text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(auth_user_id, endpoint)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  worker_id uuid references public.project_workers(id) on delete cascade,
  notification_type text not null check (notification_type in ('worker_join', 'material_request', 'request_status')),
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (recipient_user_id is not null or worker_id is not null)
);

create or replace function public.is_active_project_worker(p_project_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.project_workers where project_id = p_project_id and auth_user_id = p_user_id and status = 'active');
$$;

create or replace function public.create_receipt_export_snapshot(
  p_project_id uuid, p_date_from date, p_date_to date, p_category_ids text[], p_receipt_ids text[],
  p_version integer, p_storage_path text, p_checksum text, p_page_count integer
) returns table(id uuid, version integer, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare export_id uuid; expected_count integer := cardinality(p_receipt_ids); actual_count integer; total_cents bigint;
begin
  if auth.uid() is null or not public.owns_project(p_project_id, auth.uid()) then raise exception 'PROJECT_SCOPE'; end if;
  if p_date_to < p_date_from or expected_count is null or expected_count = 0 or p_version < 1 or p_page_count < 1 then raise exception 'INVALID_EXPORT_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtext(p_project_id::text || p_date_from::text || p_date_to::text));
  if exists(select 1 from public.receipt_export_batches b where b.project_id = p_project_id and b.date_from = p_date_from and b.date_to = p_date_to and b.version = p_version) then raise exception 'EXPORT_VERSION_CONFLICT'; end if;
  select count(*), coalesce(sum(r.total_amount_cents), 0) into actual_count, total_cents
    from public.receipts r where r.id = any(p_receipt_ids) and r.owner_id = auth.uid() and r.project_id = p_project_id
      and r.status = 'ready' and r.purchase_date between p_date_from and p_date_to and r.seller is not null and r.total_amount_cents is not null and r.category_id is not null;
  if actual_count <> expected_count then raise exception 'INVALID_EXPORT_RECEIPTS'; end if;
  insert into public.receipt_export_batches(owner_id, project_id, date_from, date_to, category_ids, version, total_amount_cents, receipt_count, storage_path, checksum, page_count, status)
    values(auth.uid(), p_project_id, p_date_from, p_date_to, coalesce(p_category_ids, '{}'), p_version, total_cents, actual_count, p_storage_path, p_checksum, p_page_count, 'synced') returning receipt_export_batches.id into export_id;
  insert into public.receipt_export_items(export_id, owner_id, receipt_id, purchase_date, seller, total_amount_cents, currency, category_name, project_name, file_ids, position)
    select export_id, auth.uid(), r.id, r.purchase_date, r.seller, r.total_amount_cents, r.currency, c.name, p.name,
      coalesce((select array_agg(f.id order by f.page_order) from public.receipt_files f where f.receipt_id = r.id), '{}'), array_position(p_receipt_ids, r.id) - 1
    from public.receipts r join public.expense_categories c on c.id = r.category_id join public.projects p on p.id = r.project_id
    where r.id = any(p_receipt_ids);
  return query select export_id, p_version, now();
end; $$;

create or replace function public.create_worker_invite(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare raw_token text := encode(gen_random_bytes(32), 'hex');
begin
  if not exists(select 1 from public.projects where id = p_project_id and owner_id = auth.uid() and status = 'active') then raise exception 'PROJECT_SCOPE'; end if;
  insert into public.project_worker_invites(token_hash, owner_id, project_id, expires_at)
  values (encode(digest(raw_token, 'sha256'), 'hex'), auth.uid(), p_project_id, now() + interval '15 minutes');
  return raw_token;
end; $$;

create or replace function public.join_project_as_worker(p_token text, p_first_name text, p_last_name text, p_position text)
returns uuid language plpgsql security definer set search_path = public as $$
declare invite public.project_worker_invites%rowtype; worker_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into invite from public.project_worker_invites
    where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expires_at > now() and revoked_at is null and use_count < max_uses
    for update;
  if invite.id is null then raise exception 'INVALID_OR_EXPIRED_INVITE'; end if;
  if char_length(trim(p_first_name)) not between 1 and 80 or char_length(trim(p_last_name)) not between 1 and 80 or char_length(trim(p_position)) not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  insert into public.project_workers(owner_id, project_id, auth_user_id, first_name, last_name, position)
    values(invite.owner_id, invite.project_id, auth.uid(), trim(p_first_name), trim(p_last_name), trim(p_position))
    returning id into worker_id;
  update public.project_worker_invites set use_count = use_count + 1 where id = invite.id;
  insert into public.notifications(recipient_user_id, worker_id, notification_type, title, body, data)
    values(invite.owner_id, worker_id, 'worker_join', 'Nová žiadosť pracovníka', trim(p_first_name) || ' ' || trim(p_last_name) || ' čaká na schválenie.', jsonb_build_object('projectId', invite.project_id));
  return worker_id;
end; $$;

create or replace function public.create_material_request(p_worker_id uuid, p_desired_date date, p_comment text, p_items jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare worker public.project_workers%rowtype; request_id text := 'material-request_' || gen_random_uuid()::text; item jsonb;
begin
  select * into worker from public.project_workers where id = p_worker_id and auth_user_id = auth.uid() and status = 'active';
  if worker.id is null then raise exception 'WORKER_ACCESS_DENIED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'INVALID_ITEMS'; end if;
  insert into public.material_requests(id, owner_id, project_id, worker_id, desired_date, comment)
    values(request_id, worker.owner_id, worker.project_id, worker.id, p_desired_date, nullif(trim(p_comment), ''));
  for item in select * from jsonb_array_elements(p_items) loop
    if char_length(trim(item->>'name')) not between 1 and 160 or coalesce((item->>'quantity')::numeric, 0) <= 0 or char_length(trim(item->>'unit')) not between 1 and 30 then raise exception 'INVALID_ITEM'; end if;
    insert into public.material_request_items(id, request_id, name, quantity, unit)
      values('material-item_' || gen_random_uuid()::text, request_id, trim(item->>'name'), (item->>'quantity')::numeric, trim(item->>'unit'));
  end loop;
  insert into public.notifications(recipient_user_id, worker_id, notification_type, title, body, data)
    values(worker.owner_id, worker.id, 'material_request', 'Nová žiadosť o materiál', worker.first_name || ' ' || worker.last_name || ' odoslal novú žiadosť.', jsonb_build_object('requestId', request_id, 'projectId', worker.project_id));
  return request_id;
end; $$;

create or replace function public.guard_material_request_update() returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id or new.project_id <> old.project_id or new.worker_id <> old.worker_id or new.created_at <> old.created_at then raise exception 'MATERIAL_REQUEST_IDENTITY_LOCKED'; end if;
  if new.status <> old.status and not ((old.status = 'new' and new.status in ('approved','rejected')) or (old.status = 'approved' and new.status in ('partially_purchased','purchased','rejected')) or (old.status = 'partially_purchased' and new.status = 'purchased')) then raise exception 'INVALID_MATERIAL_STATUS_TRANSITION'; end if;
  if new.status = 'rejected' and nullif(trim(new.rejection_reason), '') is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  return new;
end; $$;
create trigger material_request_update_guard before update on public.material_requests for each row execute function public.guard_material_request_update();

create or replace function public.notify_material_request_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.notifications(worker_id, notification_type, title, body, data)
      values(new.worker_id, 'request_status', 'Stav žiadosti sa zmenil', 'Žiadosť má stav: ' || new.status || '.', jsonb_build_object('requestId', new.id, 'status', new.status));
  end if;
  return new;
end; $$;
create trigger material_request_status_notification after update of status on public.material_requests for each row execute function public.notify_material_request_status();

create or replace function public.guard_immutable_receipt_export() returns trigger language plpgsql as $$ begin raise exception 'IMMUTABLE_RECEIPT_EXPORT'; end; $$;
create trigger receipt_exports_immutable before update or delete on public.receipt_export_batches for each row execute function public.guard_immutable_receipt_export();
create trigger receipt_export_items_immutable before update or delete on public.receipt_export_items for each row execute function public.guard_immutable_receipt_export();

create or replace function public.track_material_request_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.material_request_status_history(owner_id, request_id, from_status, to_status, reason, changed_by)
    values(new.owner_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status, new.rejection_reason, auth.uid());
  end if;
  return new;
end; $$;
create trigger material_request_status_history after insert or update of status on public.material_requests for each row execute function public.track_material_request_status();

create trigger expense_categories_updated_at before update on public.expense_categories for each row execute function public.set_updated_at();
create trigger receipts_updated_at before update on public.receipts for each row execute function public.set_updated_at();
create trigger receipt_ocr_jobs_updated_at before update on public.receipt_ocr_jobs for each row execute function public.set_updated_at();
create trigger project_workers_updated_at before update on public.project_workers for each row execute function public.set_updated_at();
create trigger material_requests_updated_at before update on public.material_requests for each row execute function public.set_updated_at();
create trigger push_subscriptions_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();

do $$ declare t text; begin foreach t in array array['expense_categories','receipts','receipt_files','receipt_export_batches','project_workers','material_requests','receipt_request_links'] loop execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t); end loop; end $$;

do $$ declare t text; begin foreach t in array array['expense_categories','receipts','receipt_files','receipt_ocr_jobs','receipt_duplicate_candidates','receipt_export_batches','receipt_export_items','project_workers','project_worker_invites','material_requests','material_request_items','material_request_status_history','receipt_request_links','push_subscriptions','notifications'] loop execute format('alter table public.%I enable row level security', t); end loop; end $$;

create policy expense_categories_owner on public.expense_categories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy receipts_owner on public.receipts for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy receipt_files_owner on public.receipt_files for all using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid())) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy receipt_ocr_jobs_owner_read on public.receipt_ocr_jobs for select using (owner_id = auth.uid());
create policy receipt_ocr_jobs_owner_insert on public.receipt_ocr_jobs for insert with check (owner_id = auth.uid() and exists(select 1 from public.receipts r where r.id = receipt_id and r.owner_id = auth.uid()));
create policy receipt_duplicates_owner on public.receipt_duplicate_candidates for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy receipt_exports_owner on public.receipt_export_batches for select using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy receipt_exports_owner_insert on public.receipt_export_batches for insert with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy receipt_export_items_owner on public.receipt_export_items for select using (owner_id = auth.uid());
create policy receipt_export_items_owner_insert on public.receipt_export_items for insert with check (owner_id = auth.uid());
create policy project_workers_owner on public.project_workers for all using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy project_workers_self_read on public.project_workers for select using (auth_user_id = auth.uid());
create policy projects_worker_read on public.projects for select using (public.is_active_project_worker(id, auth.uid()));
create policy worker_invites_owner on public.project_worker_invites for select using (owner_id = auth.uid());
create policy material_requests_owner on public.material_requests for all using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy material_requests_worker_read on public.material_requests for select using (exists(select 1 from public.project_workers w where w.id = worker_id and w.auth_user_id = auth.uid() and w.status = 'active'));
create policy material_requests_worker_insert on public.material_requests for insert with check (status = 'new' and exists(select 1 from public.project_workers w where w.id = worker_id and w.auth_user_id = auth.uid() and w.status = 'active' and w.project_id = material_requests.project_id));
create policy material_request_items_owner on public.material_request_items for all using (exists(select 1 from public.material_requests r where r.id = request_id and r.owner_id = auth.uid())) with check (exists(select 1 from public.material_requests r where r.id = request_id and r.owner_id = auth.uid()));
create policy material_request_items_worker_read on public.material_request_items for select using (exists(select 1 from public.material_requests r join public.project_workers w on w.id = r.worker_id where r.id = request_id and w.auth_user_id = auth.uid() and w.status = 'active'));
create policy material_request_items_worker_insert on public.material_request_items for insert with check (exists(select 1 from public.material_requests r join public.project_workers w on w.id = r.worker_id where r.id = request_id and r.status = 'new' and w.auth_user_id = auth.uid() and w.status = 'active'));
create policy material_history_owner on public.material_request_status_history for select using (owner_id = auth.uid());
create policy material_history_worker on public.material_request_status_history for select using (exists(select 1 from public.material_requests r join public.project_workers w on w.id = r.worker_id where r.id = request_id and w.auth_user_id = auth.uid() and w.status = 'active'));
create policy receipt_request_links_owner on public.receipt_request_links for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy push_subscriptions_self on public.push_subscriptions for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy notifications_self on public.notifications for select using (recipient_user_id = auth.uid() or exists(select 1 from public.project_workers w where w.id = worker_id and w.auth_user_id = auth.uid()));
create policy notifications_self_update on public.notifications for update using (recipient_user_id = auth.uid() or exists(select 1 from public.project_workers w where w.id = worker_id and w.auth_user_id = auth.uid())) with check (recipient_user_id = auth.uid() or exists(select 1 from public.project_workers w where w.id = worker_id and w.auth_user_id = auth.uid()));

insert into storage.buckets(id, name, public) values ('receipts', 'receipts', false) on conflict(id) do update set public = false;
create policy receipts_storage_owner on storage.objects for all using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
