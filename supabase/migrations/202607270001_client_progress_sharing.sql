-- Selective, expiring and revocable progress sharing for clients.

alter table public.site_tasks
  add column client_visible boolean not null default false;

alter table public.site_tasks
  add constraint site_tasks_client_visibility_check
    check (not client_visible or status = 'done');

create or replace function public.hide_non_completed_task_from_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'done' then
    new.client_visible := false;
  end if;
  return new;
end;
$$;

create trigger site_task_client_visibility_guard
  before insert or update on public.site_tasks
  for each row execute function public.hide_non_completed_task_from_client();

create table public.project_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_share_link_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

create index project_share_links_owner_project_idx
  on public.project_share_links(owner_id, project_id, created_at desc);
create index project_share_links_active_idx
  on public.project_share_links(token_hash, expires_at)
  where revoked_at is null;

alter table public.project_share_links enable row level security;

create policy project_share_links_owner
  on public.project_share_links
  for select
  using (
    owner_id = auth.uid()
    and public.owns_project(project_id, auth.uid())
  );

create or replace function public.set_site_task_client_visibility(
  p_task_id text,
  p_visible boolean
)
returns public.site_tasks
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  task public.site_tasks;
begin
  select target.* into task
  from public.site_tasks target
  where target.id = p_task_id
    and target.owner_id = auth.uid()
    and public.owns_project(target.project_id, auth.uid())
  for update;

  if task.id is null then raise exception 'SITE_TASK_ACCESS_DENIED'; end if;
  if p_visible and task.status <> 'done' then
    raise exception 'ONLY_COMPLETED_TASKS_CAN_BE_SHARED';
  end if;

  update public.site_tasks
    set client_visible = p_visible
    where id = p_task_id
    returning * into task;
  return task;
end;
$$;

create or replace function public.create_project_share_link(
  p_project_id uuid,
  p_expires_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid := auth.uid();
  raw_token text;
  link public.project_share_links;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.owns_project(p_project_id, uid) then
    raise exception 'PROJECT_ACCESS_DENIED';
  end if;
  if p_expires_hours not between 1 and 720 then
    raise exception 'INVALID_SHARE_EXPIRY';
  end if;
  if (
    select count(*)
    from public.project_share_links existing
    where existing.owner_id = uid
      and existing.project_id = p_project_id
      and existing.revoked_at is null
      and existing.expires_at > now()
  ) >= 5 then
    raise exception 'TOO_MANY_ACTIVE_SHARE_LINKS';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.project_share_links(
    owner_id, project_id, token_hash, expires_at
  )
  values (
    uid,
    p_project_id,
    encode(digest(raw_token, 'sha256'), 'hex'),
    now() + make_interval(hours => p_expires_hours)
  )
  returning * into link;

  return jsonb_build_object(
    'id', link.id,
    'token', raw_token,
    'projectId', link.project_id,
    'expiresAt', link.expires_at,
    'createdAt', link.created_at
  );
end;
$$;

create or replace function public.revoke_project_share_link(
  p_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.project_share_links
    set revoked_at = coalesce(revoked_at, now())
    where id = p_link_id
      and owner_id = auth.uid();
  if not found then raise exception 'SHARE_LINK_ACCESS_DENIED'; end if;
  return true;
end;
$$;

create or replace function public.resolve_project_share_snapshot(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  link public.project_share_links;
  project public.projects;
  tasks jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select candidate.* into link
  from public.project_share_links candidate
  where candidate.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and candidate.revoked_at is null
    and candidate.expires_at > now()
  for update;
  if link.id is null then return null; end if;

  select target.* into project
  from public.projects target
  where target.id = link.project_id
    and target.status = 'active';
  if project.id is null then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', visible.id,
        'title', visible.title,
        'description', visible.description,
        'kind', visible.kind,
        'completedAt', visible.completed_at,
        'photos', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', attachment.id,
              'storagePath', attachment.storage_path
            )
            order by attachment.created_at
          )
          from public.attachments attachment
          where attachment.related_entity_type = 'site_task'
            and attachment.related_entity_id = visible.id
            and attachment.evidence_role = 'after'
            and attachment.storage_path is not null
        ), '[]'::jsonb)
      )
      order by visible.completed_at desc nulls last
    ),
    '[]'::jsonb
  ) into tasks
  from public.site_tasks visible
  where visible.project_id = project.id
    and visible.owner_id = link.owner_id
    and visible.status = 'done'
    and visible.client_visible;

  update public.project_share_links
    set view_count = view_count + 1,
        last_viewed_at = now()
    where id = link.id;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'name', project.name,
      'location', project.location,
      'address', project.address
    ),
    'tasks', tasks,
    'expiresAt', link.expires_at,
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.set_site_task_client_visibility(text, boolean)
  from public, anon;
revoke execute on function public.create_project_share_link(uuid, integer)
  from public, anon;
revoke execute on function public.revoke_project_share_link(uuid)
  from public, anon;
revoke execute on function public.resolve_project_share_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.set_site_task_client_visibility(text, boolean)
  to authenticated;
grant execute on function public.create_project_share_link(uuid, integer)
  to authenticated;
grant execute on function public.revoke_project_share_link(uuid)
  to authenticated;
grant execute on function public.resolve_project_share_snapshot(text)
  to service_role;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',4,
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
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;
