-- Immutable site stock ledger derived from reviewed deliveries and confirmed usage.
alter table public.notifications drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check check(notification_type in ('worker_join','material_request','request_status','site_task','task_review','task_assignment','task_comment','client_decision','change_order_decision','supplier_quote','site_incident','material_delivery','material_stock'));

create table public.material_stock_movements(
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  request_item_id text not null references public.material_request_items(id) on delete restrict,
  material_name text not null check(char_length(trim(material_name)) between 2 and 180),
  unit text not null check(char_length(trim(unit)) between 1 and 40),
  movement_type text not null check(movement_type in('usage','waste','return','adjustment_in','adjustment_out')),
  quantity numeric not null check(quantity>0),
  occurred_at timestamptz not null,
  worker_id uuid references public.project_workers(id) on delete set null,
  worker_name text check(worker_name is null or char_length(trim(worker_name)) between 2 and 180),
  note text check(note is null or char_length(trim(note)) between 1 and 1000),
  status text not null check(status in('reported','confirmed','rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text check(rejection_reason is null or char_length(trim(rejection_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  check((status='reported' and reviewed_at is null and reviewed_by is null and rejection_reason is null)or(status='confirmed' and reviewed_at is not null and reviewed_by is not null and rejection_reason is null)or(status='rejected' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null))
);
create table public.material_stock_movement_events(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  movement_id text not null references public.material_stock_movements(id) on delete cascade,
  event_type text not null check(event_type in('reported','confirmed','rejected')),
  body text check(body is null or char_length(trim(body)) between 1 and 500),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_worker_id uuid references public.project_workers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index material_stock_project_idx on public.material_stock_movements(project_id,status,occurred_at desc);
create index material_stock_item_idx on public.material_stock_movements(request_item_id,occurred_at,id);
create index material_stock_events_idx on public.material_stock_movement_events(movement_id,created_at,id);

alter table public.material_stock_movements enable row level security;
alter table public.material_stock_movement_events enable row level security;
create policy material_stock_participant_select on public.material_stock_movements for select using(
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))or exists(select 1 from public.project_workers w where w.id=worker_id and w.auth_user_id=auth.uid())
);
create policy material_stock_events_participant_select on public.material_stock_movement_events for select using(
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))or exists(select 1 from public.material_stock_movements m join public.project_workers w on w.id=m.worker_id where m.id=material_stock_movement_events.movement_id and w.auth_user_id=auth.uid())
);

create function public.guard_material_stock_change()returns trigger language plpgsql set search_path=public as $$begin
  if tg_op='DELETE' and(pg_trigger_depth()>1 or not exists(select 1 from public.projects where id=old.project_id))then return old;end if;
  if current_setting('app.material_stock_rpc',true)is distinct from'1'then raise exception'MATERIAL_STOCK_RPC_REQUIRED';end if;
  return case when tg_op='DELETE'then old else new end;
end$$;
create trigger material_stock_guard before insert or update or delete on public.material_stock_movements for each row execute function public.guard_material_stock_change();
create function public.guard_material_stock_event_change()returns trigger language plpgsql set search_path=public as $$begin
  if tg_op='DELETE' and(pg_trigger_depth()>1 or not exists(select 1 from public.material_stock_movements where id=old.movement_id))then return old;end if;
  raise exception'MATERIAL_STOCK_EVENT_IMMUTABLE';
end$$;
create trigger material_stock_events_immutable before update or delete on public.material_stock_movement_events for each row execute function public.guard_material_stock_event_change();

create function public.material_item_has_stock(p_request_item_id text)returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.material_delivery_lines l join public.material_deliveries d on d.id=l.delivery_id where l.request_item_id=p_request_item_id and d.status in('accepted','resolved')and l.delivered_quantity-l.damaged_quantity>0)
$$;

create function public.save_material_stock_movement(p_id text,p_request_item_id text,p_movement_type text,p_quantity numeric,p_occurred_at timestamptz,p_worker_id uuid,p_note text,p_confirmed boolean)returns public.material_stock_movements language plpgsql security definer set search_path=public,auth as $$declare
  uid uuid:=auth.uid();item public.material_request_items%rowtype;req public.material_requests%rowtype;worker public.project_workers%rowtype;result public.material_stock_movements%rowtype;
begin
  if not coalesce(p_confirmed,false)then raise exception'MATERIAL_STOCK_CONFIRMATION_REQUIRED';end if;
  if p_movement_type not in('usage','waste','return','adjustment_in','adjustment_out')or p_quantity<=0 or char_length(trim(p_id))<2 or char_length(coalesce(p_note,''))>1000 then raise exception'INVALID_MATERIAL_STOCK_MOVEMENT';end if;
  select*into item from public.material_request_items where id=p_request_item_id;select*into req from public.material_requests where id=item.request_id and owner_id=uid;
  if req.id is null or not public.owns_project(req.project_id,uid)or not public.material_item_has_stock(item.id)then raise exception'MATERIAL_STOCK_ITEM_SCOPE';end if;
  if p_worker_id is not null then select*into worker from public.project_workers where id=p_worker_id and owner_id=uid and project_id=req.project_id;if worker.id is null then raise exception'WORKER_NOT_IN_PROJECT';end if;end if;
  perform set_config('app.material_stock_rpc','1',true);
  insert into public.material_stock_movements(id,owner_id,project_id,request_id,request_item_id,material_name,unit,movement_type,quantity,occurred_at,worker_id,worker_name,note,status,reviewed_at,reviewed_by)
  values(trim(p_id),uid,req.project_id,req.id,item.id,item.name,item.unit,p_movement_type,p_quantity,p_occurred_at,p_worker_id,case when worker.id is null then null else trim(worker.first_name)||' '||trim(worker.last_name)end,nullif(trim(p_note),''),'confirmed',now(),uid)returning*into result;
  insert into public.material_stock_movement_events(owner_id,project_id,movement_id,event_type,actor_user_id)values(uid,result.project_id,result.id,'confirmed',uid);return result;
end$$;

create function public.my_material_stock_options(p_worker_id uuid)returns table(request_id text,request_item_id text,material_name text,unit text)language sql stable security definer set search_path=public,auth as $$
  select distinct r.id,i.id,i.name,i.unit from public.project_workers w join public.material_requests r on r.worker_id=w.id and r.project_id=w.project_id join public.material_request_items i on i.request_id=r.id where w.id=p_worker_id and w.auth_user_id=auth.uid()and w.status='active'and r.status in('approved','partially_purchased','purchased')and public.material_item_has_stock(i.id) order by i.name
$$;

create function public.report_my_material_stock_movement(p_worker_id uuid,p_request_item_id text,p_movement_type text,p_quantity numeric,p_occurred_at timestamptz,p_note text,p_confirmed boolean)returns public.material_stock_movements language plpgsql security definer set search_path=public,auth as $$declare
  uid uuid:=auth.uid();worker public.project_workers%rowtype;item public.material_request_items%rowtype;req public.material_requests%rowtype;result public.material_stock_movements%rowtype;movement_id text:='stock-'||gen_random_uuid()::text;
begin
  if not coalesce(p_confirmed,false)then raise exception'MATERIAL_STOCK_CONFIRMATION_REQUIRED';end if;
  if p_movement_type not in('usage','waste','return')or p_quantity<=0 or char_length(coalesce(p_note,''))>1000 then raise exception'INVALID_MATERIAL_STOCK_MOVEMENT';end if;
  select*into worker from public.project_workers where id=p_worker_id and auth_user_id=uid and status='active';if worker.id is null then raise exception'WORKER_ACCESS_DENIED';end if;
  select*into item from public.material_request_items where id=p_request_item_id;select*into req from public.material_requests where id=item.request_id and worker_id=worker.id and project_id=worker.project_id and status in('approved','partially_purchased','purchased');
  if req.id is null or not public.material_item_has_stock(item.id)then raise exception'MATERIAL_STOCK_ITEM_SCOPE';end if;
  perform set_config('app.material_stock_rpc','1',true);
  insert into public.material_stock_movements(id,owner_id,project_id,request_id,request_item_id,material_name,unit,movement_type,quantity,occurred_at,worker_id,worker_name,note,status)
  values(movement_id,worker.owner_id,worker.project_id,req.id,item.id,item.name,item.unit,p_movement_type,p_quantity,p_occurred_at,worker.id,trim(worker.first_name)||' '||trim(worker.last_name),nullif(trim(p_note),''),'reported')returning*into result;
  insert into public.material_stock_movement_events(owner_id,project_id,movement_id,event_type,actor_user_id,actor_worker_id)values(result.owner_id,result.project_id,result.id,'reported',uid,worker.id);
  insert into public.notifications(recipient_user_id,worker_id,notification_type,title,body,data)values(result.owner_id,worker.id,'material_stock','Pohyb materiálu na kontrolu',result.worker_name||': '||result.material_name||' ('||result.quantity||' '||result.unit||')',jsonb_build_object('movementId',result.id,'projectId',result.project_id));return result;
end$$;

create function public.review_material_stock_movement(p_movement_id text,p_decision text,p_rejection_reason text,p_confirmed boolean)returns public.material_stock_movements language plpgsql security definer set search_path=public,auth as $$declare uid uuid:=auth.uid();result public.material_stock_movements%rowtype;begin
  if not coalesce(p_confirmed,false)then raise exception'MATERIAL_STOCK_REVIEW_CONFIRMATION_REQUIRED';end if;
  if p_decision not in('confirmed','rejected')or(p_decision='rejected'and char_length(trim(coalesce(p_rejection_reason,'')))not between 3 and 500)then raise exception'INVALID_MATERIAL_STOCK_DECISION';end if;
  perform set_config('app.material_stock_rpc','1',true);
  update public.material_stock_movements set status=p_decision,reviewed_at=now(),reviewed_by=uid,rejection_reason=case when p_decision='rejected'then trim(p_rejection_reason)else null end where id=p_movement_id and owner_id=uid and status='reported'and public.owns_project(project_id,uid)returning*into result;
  if result.id is null then raise exception'MATERIAL_STOCK_NOT_REVIEWABLE';end if;
  insert into public.material_stock_movement_events(owner_id,project_id,movement_id,event_type,body,actor_user_id)values(uid,result.project_id,result.id,p_decision,result.rejection_reason,uid);return result;
end$$;

revoke insert,update,delete on public.material_stock_movements,public.material_stock_movement_events from public,anon,authenticated;
grant select on public.material_stock_movements,public.material_stock_movement_events to authenticated;
revoke execute on function public.material_item_has_stock(text),public.save_material_stock_movement(text,text,text,numeric,timestamptz,uuid,text,boolean),public.my_material_stock_options(uuid),public.report_my_material_stock_movement(uuid,text,text,numeric,timestamptz,text,boolean),public.review_material_stock_movement(text,text,text,boolean)from public,anon;
grant execute on function public.save_material_stock_movement(text,text,text,numeric,timestamptz,uuid,text,boolean),public.my_material_stock_options(uuid),public.report_my_material_stock_movement(uuid,text,text,numeric,timestamptz,text,boolean),public.review_material_stock_movement(text,text,text,boolean)to authenticated;
create trigger material_stock_audit after insert or update or delete on public.material_stock_movements for each row execute function public.audit_row();
create trigger material_stock_events_audit after insert or update or delete on public.material_stock_movement_events for each row execute function public.audit_row();

alter function public.export_my_data()rename to export_my_data_v23;
create function public.export_my_data()returns jsonb language sql stable security definer set search_path=public,auth as $$select case when auth.uid()is null then null else public.export_my_data_v23()||jsonb_build_object('schemaVersion',24,'materialStockMovements',coalesce((select jsonb_agg(to_jsonb(x)order by x.occurred_at,x.id)from public.material_stock_movements x where x.owner_id=auth.uid()),'[]'::jsonb),'materialStockMovementEvents',coalesce((select jsonb_agg(to_jsonb(x)order by x.created_at,x.id)from public.material_stock_movement_events x where x.owner_id=auth.uid()),'[]'::jsonb))end$$;
revoke execute on function public.export_my_data()from public,anon;grant execute on function public.export_my_data()to authenticated;
