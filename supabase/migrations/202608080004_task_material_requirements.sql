-- Task material kits: an atomic, owner-managed plan visible to the assigned worker.
create table public.task_material_requirements(
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id text not null references public.site_tasks(id) on delete cascade,
  request_id text not null references public.material_requests(id) on delete cascade,
  request_item_id text not null references public.material_request_items(id) on delete restrict,
  material_name text not null check(char_length(trim(material_name)) between 2 and 180),
  unit text not null check(char_length(trim(unit)) between 1 and 40),
  quantity numeric not null check(quantity>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id,request_item_id)
);
create index task_material_requirements_project_idx on public.task_material_requirements(project_id,task_id);
create index task_material_requirements_item_idx on public.task_material_requirements(request_item_id,task_id);
create trigger task_material_requirements_updated_at before update on public.task_material_requirements for each row execute function public.set_updated_at();

alter table public.task_material_requirements enable row level security;
create policy task_material_requirements_participant_select on public.task_material_requirements for select using(
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))or exists(
    select 1 from public.site_tasks t join public.project_workers w on w.id=t.assigned_worker_id
    where t.id=task_material_requirements.task_id and w.auth_user_id=auth.uid() and w.status='active'
  )
);

create function public.guard_task_material_requirement_change()returns trigger language plpgsql set search_path=public as $$begin
  if tg_op='DELETE' and(pg_trigger_depth()>1 or not exists(select 1 from public.site_tasks where id=old.task_id))then return old;end if;
  if current_setting('app.task_material_rpc',true)is distinct from'1'then raise exception'TASK_MATERIAL_RPC_REQUIRED';end if;
  return case when tg_op='DELETE'then old else new end;
end$$;
create trigger task_material_requirements_guard before insert or update or delete on public.task_material_requirements for each row execute function public.guard_task_material_requirement_change();

create function public.save_task_material_requirements(p_task_id text,p_requirements jsonb,p_confirmed boolean)returns setof public.task_material_requirements language plpgsql security definer set search_path=public,auth as $$declare
  uid uuid:=auth.uid();target public.site_tasks%rowtype;line jsonb;item public.material_request_items%rowtype;req public.material_requests%rowtype;ids text[]:='{}';
begin
  if not coalesce(p_confirmed,false)then raise exception'TASK_MATERIAL_CONFIRMATION_REQUIRED';end if;
  if jsonb_typeof(p_requirements)<>'array'or jsonb_array_length(p_requirements)>100 then raise exception'INVALID_TASK_MATERIAL_REQUIREMENTS';end if;
  select*into target from public.site_tasks where id=p_task_id and owner_id=uid and public.owns_project(project_id,uid) for update;
  if target.id is null then raise exception'TASK_MATERIAL_SCOPE';end if;
  for line in select value from jsonb_array_elements(p_requirements)loop
    if coalesce(line->>'requestItemId','')=''or coalesce((line->>'quantity')::numeric,0)<=0 or line->>'requestItemId'=any(ids)then raise exception'INVALID_TASK_MATERIAL_REQUIREMENTS';end if;
    select*into item from public.material_request_items where id=line->>'requestItemId';
    select*into req from public.material_requests where id=item.request_id and owner_id=uid and project_id=target.project_id;
    if req.id is null or not public.material_item_has_stock(item.id)then raise exception'TASK_MATERIAL_ITEM_SCOPE';end if;
    ids:=array_append(ids,item.id);
  end loop;
  perform set_config('app.task_material_rpc','1',true);
  delete from public.task_material_requirements where task_id=target.id;
  for line in select value from jsonb_array_elements(p_requirements)loop
    select*into item from public.material_request_items where id=line->>'requestItemId';select*into req from public.material_requests where id=item.request_id;
    insert into public.task_material_requirements(id,owner_id,project_id,task_id,request_id,request_item_id,material_name,unit,quantity)
    values('task-material-'||gen_random_uuid()::text,uid,target.project_id,target.id,req.id,item.id,item.name,item.unit,(line->>'quantity')::numeric);
  end loop;
  return query select*from public.task_material_requirements where task_id=target.id order by material_name,id;
end$$;

revoke insert,update,delete on public.task_material_requirements from public,anon,authenticated;
grant select on public.task_material_requirements to authenticated;
revoke execute on function public.save_task_material_requirements(text,jsonb,boolean)from public,anon;
grant execute on function public.save_task_material_requirements(text,jsonb,boolean)to authenticated;
create trigger task_material_requirements_audit after insert or update or delete on public.task_material_requirements for each row execute function public.audit_row();

alter function public.export_my_data()rename to export_my_data_v24;
create function public.export_my_data()returns jsonb language sql stable security definer set search_path=public,auth as $$select case when auth.uid()is null then null else public.export_my_data_v24()||jsonb_build_object('schemaVersion',25,'taskMaterialRequirements',coalesce((select jsonb_agg(to_jsonb(x)order by x.task_id,x.material_name,x.id)from public.task_material_requirements x where x.owner_id=auth.uid()),'[]'::jsonb))end$$;
revoke execute on function public.export_my_data()from public,anon;grant execute on function public.export_my_data()to authenticated;
