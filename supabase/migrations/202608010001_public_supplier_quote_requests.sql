-- Temporary no-account supplier RFQ links feeding the audited procurement ledger.

create table public.material_supplier_quote_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  submission_count integer not null default 0 check (submission_count >= 0),
  max_submissions integer not null default 25 check (max_submissions between 1 and 50),
  created_at timestamptz not null default now()
);
create index material_supplier_quote_invites_request_idx
  on public.material_supplier_quote_invites(request_id,created_at desc);
create unique index material_supplier_quote_invites_one_active_idx
  on public.material_supplier_quote_invites(request_id)
  where revoked_at is null;

create table public.material_supplier_quote_submissions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.material_supplier_quote_invites(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  quote_id text not null unique references public.material_supplier_quotes(id) on delete cascade,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique(invite_id,idempotency_key)
);

alter table public.material_supplier_quote_invites enable row level security;
alter table public.material_supplier_quote_submissions enable row level security;
create policy material_supplier_quote_invites_owner_select
  on public.material_supplier_quote_invites for select to authenticated
  using (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()));
create policy material_supplier_quote_submissions_owner_select
  on public.material_supplier_quote_submissions for select to authenticated
  using (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()));

create or replace function public.create_material_supplier_quote_invite(
  p_request_id text,
  p_expires_hours integer default 72
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  uid uuid:=auth.uid();
  req public.material_requests%rowtype;
  raw_token text:=encode(gen_random_bytes(32),'hex');
  created public.material_supplier_quote_invites%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_expires_hours not between 1 and 168
    then raise exception 'INVALID_RFQ_EXPIRY'; end if;
  select * into req from public.material_requests
    where id=p_request_id and owner_id=uid for update;
  if req.id is null or not public.owns_project(req.project_id,uid)
    then raise exception 'MATERIAL_REQUEST_SCOPE'; end if;
  if req.status not in ('approved','partially_purchased')
    then raise exception 'MATERIAL_REQUEST_NOT_APPROVED'; end if;
  if exists(
    select 1 from public.material_supplier_quotes
    where request_id=req.id and status='selected'
  ) then raise exception 'SUPPLIER_ALREADY_SELECTED'; end if;

  update public.material_supplier_quote_invites set revoked_at=now()
    where request_id=req.id and revoked_at is null;
  insert into public.material_supplier_quote_invites(
    token_hash,owner_id,project_id,request_id,expires_at
  ) values (
    encode(digest(raw_token,'sha256'),'hex'),uid,req.project_id,req.id,
    now()+make_interval(hours=>p_expires_hours)
  ) returning * into created;
  return jsonb_build_object(
    'id',created.id,
    'token',raw_token,
    'requestId',created.request_id,
    'expiresAt',created.expires_at,
    'createdAt',created.created_at
  );
end;
$$;

create or replace function public.revoke_material_supplier_quote_invite(
  p_invite_id uuid
) returns void
language plpgsql security definer set search_path=public,auth as $$
begin
  update public.material_supplier_quote_invites set revoked_at=coalesce(revoked_at,now())
    where id=p_invite_id and owner_id=auth.uid()
      and public.owns_project(project_id,auth.uid());
  if not found then raise exception 'SUPPLIER_QUOTE_INVITE_SCOPE'; end if;
end;
$$;

create or replace function public.resolve_material_supplier_quote_invite(
  p_token text
) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  invite public.material_supplier_quote_invites%rowtype;
  req public.material_requests%rowtype;
  project_name text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into invite from public.material_supplier_quote_invites
    where token_hash=encode(digest(p_token,'sha256'),'hex')
      and revoked_at is null and expires_at>now()
      and submission_count<max_submissions;
  if invite.id is null then return null; end if;
  select * into req from public.material_requests where id=invite.request_id;
  if req.status not in ('approved','partially_purchased') or exists(
    select 1 from public.material_supplier_quotes
    where request_id=req.id and status='selected'
  ) then return null; end if;
  select name into project_name from public.projects where id=invite.project_id;
  return jsonb_build_object(
    'reference',upper(substr(replace(invite.id::text,'-',''),1,8)),
    'projectName',project_name,
    'desiredDate',req.desired_date,
    'expiresAt',invite.expires_at,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',item.name,'quantity',item.quantity,'unit',item.unit
      ) order by item.created_at,item.id)
      from public.material_request_items item where item.request_id=req.id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_material_supplier_quote(
  p_token text,
  p_idempotency_key uuid,
  p_supplier_name text,
  p_total_amount_cents bigint,
  p_delivery_date date default null,
  p_valid_until date default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  invite public.material_supplier_quote_invites%rowtype;
  req public.material_requests%rowtype;
  existing_quote_id text;
  v_quote_id text:='supplier_quote_'||gen_random_uuid()::text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
    then raise exception 'INVALID_RFQ_TOKEN'; end if;
  select * into invite from public.material_supplier_quote_invites
    where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if invite.id is null or invite.revoked_at is not null
    or invite.expires_at<=now() or invite.submission_count>=invite.max_submissions
    then raise exception 'RFQ_LINK_UNAVAILABLE'; end if;
  select submission.quote_id into existing_quote_id
    from public.material_supplier_quote_submissions submission
    where submission.invite_id=invite.id
      and submission.idempotency_key=p_idempotency_key;
  if existing_quote_id is not null then
    return jsonb_build_object('quoteId',existing_quote_id,'duplicate',true);
  end if;
  select * into req from public.material_requests where id=invite.request_id for update;
  if req.status not in ('approved','partially_purchased') or exists(
    select 1 from public.material_supplier_quotes
    where request_id=req.id and status='selected'
  ) then raise exception 'RFQ_LINK_UNAVAILABLE'; end if;
  if char_length(trim(p_supplier_name)) not between 2 and 160
    or p_total_amount_cents not between 1 and 1000000000
    or char_length(coalesce(p_note,''))>500
    or (p_delivery_date is not null and p_delivery_date<current_date)
    or (p_valid_until is not null and p_valid_until<current_date)
    then raise exception 'INVALID_SUPPLIER_QUOTE'; end if;

  insert into public.material_supplier_quotes(
    id,owner_id,project_id,request_id,supplier_name,total_amount_cents,
    delivery_date,valid_until,note,status
  ) values (
    v_quote_id,invite.owner_id,invite.project_id,invite.request_id,
    trim(p_supplier_name),p_total_amount_cents,p_delivery_date,p_valid_until,
    nullif(trim(p_note),''),'offered'
  );
  insert into public.material_supplier_quote_submissions(
    invite_id,owner_id,project_id,request_id,quote_id,idempotency_key
  ) values (
    invite.id,invite.owner_id,invite.project_id,invite.request_id,
    v_quote_id,p_idempotency_key
  );
  update public.material_supplier_quote_invites
    set submission_count=submission_count+1 where id=invite.id;
  insert into public.notifications(
    recipient_user_id,notification_type,title,body,data
  ) values (
    invite.owner_id,'supplier_quote','Nová ponuka dodávateľa',
    trim(p_supplier_name)||' poslal cenu k žiadosti o materiál.',
    jsonb_build_object(
      'projectId',invite.project_id,'requestId',invite.request_id,
      'quoteId',v_quote_id
    )
  );
  return jsonb_build_object('quoteId',v_quote_id,'duplicate',false,'submittedAt',now());
end;
$$;

alter table public.notifications drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check check (
    notification_type in (
      'worker_join','material_request','request_status','site_task','task_review',
      'task_assignment','task_comment','client_decision','change_order_decision',
      'supplier_quote'
    )
  );

grant select on public.material_supplier_quote_invites,
  public.material_supplier_quote_submissions to authenticated;
revoke insert,update,delete on public.material_supplier_quote_invites,
  public.material_supplier_quote_submissions from public,anon,authenticated;
revoke execute on function public.create_material_supplier_quote_invite(text,integer)
  from public,anon;
revoke execute on function public.revoke_material_supplier_quote_invite(uuid)
  from public,anon;
grant execute on function public.create_material_supplier_quote_invite(text,integer)
  to authenticated;
grant execute on function public.revoke_material_supplier_quote_invite(uuid)
  to authenticated;
revoke execute on function public.resolve_material_supplier_quote_invite(text)
  from public,anon,authenticated;
revoke execute on function public.submit_material_supplier_quote(
  text,uuid,text,bigint,date,date,text
) from public,anon,authenticated;
grant execute on function public.resolve_material_supplier_quote_invite(text)
  to service_role;
grant execute on function public.submit_material_supplier_quote(
  text,uuid,text,bigint,date,date,text
) to service_role;

alter function public.export_my_data() rename to export_my_data_v15;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v15() || jsonb_build_object(
      'schemaVersion',16,
      'materialSupplierQuoteInvites',coalesce((
        select jsonb_agg(to_jsonb(item)-'token_hash')
        from public.material_supplier_quote_invites item
        where item.owner_id=auth.uid()
      ),'[]'::jsonb),
      'materialSupplierQuoteSubmissions',coalesce((
        select jsonb_agg(to_jsonb(item))
        from public.material_supplier_quote_submissions item
        where item.owner_id=auth.uid()
      ),'[]'::jsonb)
    )
  end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
