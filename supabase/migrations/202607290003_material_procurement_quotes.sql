-- Auditable supplier quote comparison and receipt-backed procurement commitments.

create table public.material_supplier_quotes (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  supplier_name text not null check (char_length(trim(supplier_name)) between 2 and 160),
  total_amount_cents bigint not null check (total_amount_cents between 1 and 1000000000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  delivery_date date,
  valid_until date,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'offered' check (status in ('offered','selected','withdrawn')),
  selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'selected' and selected_at is not null) or (status <> 'selected' and selected_at is null))
);
create index material_supplier_quotes_request_idx
  on public.material_supplier_quotes(request_id, status, total_amount_cents);
create unique index material_supplier_quotes_one_selected_idx
  on public.material_supplier_quotes(request_id) where status = 'selected';

create table public.material_supplier_quote_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  quote_id text not null references public.material_supplier_quotes(id) on delete restrict,
  previous_quote_id text references public.material_supplier_quotes(id) on delete set null,
  quote_snapshot jsonb not null,
  selected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index material_supplier_quote_decisions_request_idx
  on public.material_supplier_quote_decisions(request_id, created_at desc);

alter table public.material_supplier_quotes enable row level security;
alter table public.material_supplier_quote_decisions enable row level security;

create policy material_supplier_quotes_owner_select
  on public.material_supplier_quotes for select to authenticated
  using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));
create policy material_supplier_quote_decisions_owner_select
  on public.material_supplier_quote_decisions for select to authenticated
  using (owner_id = auth.uid() and public.owns_project(project_id, auth.uid()));

create or replace function public.save_material_supplier_quote(
  p_id text,
  p_request_id text,
  p_supplier_name text,
  p_total_amount_cents bigint,
  p_delivery_date date default null,
  p_valid_until date default null,
  p_note text default null
) returns public.material_supplier_quotes
language plpgsql security definer set search_path=public,auth as $$
declare
  uid uuid:=auth.uid();
  req public.material_requests%rowtype;
  existing public.material_supplier_quotes%rowtype;
  result public.material_supplier_quotes%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into req from public.material_requests
    where id=p_request_id and owner_id=uid for update;
  if req.id is null or not public.owns_project(req.project_id,uid)
    then raise exception 'MATERIAL_REQUEST_SCOPE'; end if;
  if req.status not in ('approved','partially_purchased')
    then raise exception 'MATERIAL_REQUEST_NOT_APPROVED'; end if;
  if char_length(trim(p_supplier_name)) not between 2 and 160
    or p_total_amount_cents not between 1 and 1000000000
    or char_length(coalesce(p_note,'')) > 500
    then raise exception 'INVALID_SUPPLIER_QUOTE'; end if;

  select * into existing from public.material_supplier_quotes
    where id=p_id for update;
  if existing.id is not null and (
    existing.owner_id<>uid or existing.request_id<>p_request_id
  ) then raise exception 'SUPPLIER_QUOTE_SCOPE'; end if;
  if existing.status='selected' then raise exception 'SELECTED_QUOTE_LOCKED'; end if;

  insert into public.material_supplier_quotes(
    id,owner_id,project_id,request_id,supplier_name,total_amount_cents,
    delivery_date,valid_until,note,status,selected_at
  ) values (
    p_id,uid,req.project_id,p_request_id,trim(p_supplier_name),
    p_total_amount_cents,p_delivery_date,p_valid_until,
    nullif(trim(p_note),''),'offered',null
  )
  on conflict(id) do update set
    supplier_name=excluded.supplier_name,
    total_amount_cents=excluded.total_amount_cents,
    delivery_date=excluded.delivery_date,
    valid_until=excluded.valid_until,
    note=excluded.note,
    status='offered',
    selected_at=null,
    updated_at=now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.select_material_supplier_quote(p_quote_id text)
returns public.material_supplier_quotes
language plpgsql security definer set search_path=public,auth as $$
declare
  uid uuid:=auth.uid();
  chosen public.material_supplier_quotes%rowtype;
  req public.material_requests%rowtype;
  previous_id text;
  result public.material_supplier_quotes%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into chosen from public.material_supplier_quotes
    where id=p_quote_id and owner_id=uid for update;
  if chosen.id is null or not public.owns_project(chosen.project_id,uid)
    then raise exception 'SUPPLIER_QUOTE_SCOPE'; end if;
  select * into req from public.material_requests
    where id=chosen.request_id and owner_id=uid for update;
  if req.status not in ('approved','partially_purchased')
    then raise exception 'MATERIAL_REQUEST_NOT_APPROVED'; end if;
  select id into previous_id from public.material_supplier_quotes
    where request_id=chosen.request_id and status='selected' for update;
  update public.material_supplier_quotes set
    status='withdrawn',selected_at=null,updated_at=now()
    where request_id=chosen.request_id and status='selected' and id<>chosen.id;
  update public.material_supplier_quotes set
    status='selected',selected_at=coalesce(selected_at,now()),updated_at=now()
    where id=chosen.id returning * into result;
  if previous_id is distinct from chosen.id then
    insert into public.material_supplier_quote_decisions(
      owner_id,project_id,request_id,quote_id,previous_quote_id,
      quote_snapshot,selected_by
    ) values (
      uid,chosen.project_id,chosen.request_id,chosen.id,previous_id,
      jsonb_build_object(
        'supplierName',chosen.supplier_name,
        'totalAmountCents',chosen.total_amount_cents,
        'currency',chosen.currency,
        'deliveryDate',chosen.delivery_date,
        'validUntil',chosen.valid_until,
        'note',chosen.note
      ),
      uid
    );
  end if;
  perform public.recompute_material_request_purchase_status(chosen.request_id);
  return result;
end;
$$;

create or replace function public.withdraw_material_supplier_quote(p_quote_id text)
returns public.material_supplier_quotes
language plpgsql security definer set search_path=public,auth as $$
declare result public.material_supplier_quotes%rowtype;
begin
  update public.material_supplier_quotes set
    status='withdrawn',selected_at=null,updated_at=now()
  where id=p_quote_id and owner_id=auth.uid() and status='offered'
    and public.owns_project(project_id,auth.uid())
  returning * into result;
  if result.id is null then raise exception 'SUPPLIER_QUOTE_NOT_WITHDRAWABLE'; end if;
  return result;
end;
$$;

create or replace function public.recompute_material_request_purchase_status(
  p_request_id text
) returns void
language plpgsql security definer set search_path=public as $$
declare
  quote_total bigint;
  allocated bigint;
  current_status text;
begin
  select total_amount_cents into quote_total
    from public.material_supplier_quotes
    where request_id=p_request_id and status='selected';
  if quote_total is null then return; end if;
  select status into current_status from public.material_requests
    where id=p_request_id for update;
  if current_status in ('new','rejected') then return; end if;
  select coalesce(sum(allocated_amount_cents),0) into allocated
    from public.receipt_request_links where request_id=p_request_id;
  update public.material_requests set
    status=case
      when allocated>=quote_total then 'purchased'
      when allocated>0 then 'partially_purchased'
      else 'approved'
    end,
    updated_at=now()
  where id=p_request_id;
end;
$$;

create or replace function public.sync_material_request_purchase_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform public.recompute_material_request_purchase_status(old.request_id);
  end if;
  if tg_op in ('INSERT','UPDATE') and (
    tg_op='INSERT' or new.request_id is distinct from old.request_id
  ) then
    perform public.recompute_material_request_purchase_status(new.request_id);
  end if;
  return coalesce(new,old);
end;
$$;
create trigger receipt_request_link_purchase_status
after insert or update or delete on public.receipt_request_links
for each row execute function public.sync_material_request_purchase_status();

grant select on public.material_supplier_quotes,
  public.material_supplier_quote_decisions to authenticated;
revoke insert,update,delete on public.material_supplier_quotes,
  public.material_supplier_quote_decisions from public,anon,authenticated;
revoke execute on function public.save_material_supplier_quote(
  text,text,text,bigint,date,date,text
) from public,anon;
revoke execute on function public.select_material_supplier_quote(text)
  from public,anon;
revoke execute on function public.withdraw_material_supplier_quote(text)
  from public,anon;
grant execute on function public.save_material_supplier_quote(
  text,text,text,bigint,date,date,text
) to authenticated;
grant execute on function public.select_material_supplier_quote(text)
  to authenticated;
grant execute on function public.withdraw_material_supplier_quote(text)
  to authenticated;

alter function public.export_my_data() rename to export_my_data_v14;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select case when auth.uid() is null then null else
    public.export_my_data_v14() || jsonb_build_object(
      'schemaVersion',15,
      'materialSupplierQuotes',coalesce((
        select jsonb_agg(to_jsonb(item))
        from public.material_supplier_quotes item
        where item.owner_id=auth.uid()
      ),'[]'::jsonb),
      'materialSupplierQuoteDecisions',coalesce((
        select jsonb_agg(to_jsonb(item))
        from public.material_supplier_quote_decisions item
        where item.owner_id=auth.uid()
      ),'[]'::jsonb)
    )
  end;
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
