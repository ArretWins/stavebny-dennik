-- Task equipment reservations: owner-managed planning visible to the assigned worker.
create table public.task_tool_requirements(
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id text not null references public.site_tasks(id) on delete cascade,
  tool_id text not null references public.project_tools(id) on delete restrict,
  asset_number integer not null check(asset_number>0),
  tool_name text not null check(char_length(trim(tool_name)) between 2 and 160),
  category text not null check(char_length(trim(category)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id,tool_id)
);
create index task_tool_requirements_project_idx on public.task_tool_requirements(project_id,task_id);
create index task_tool_requirements_tool_idx on public.task_tool_requirements(tool_id,task_id);
create trigger task_tool_requirements_updated_at before update on public.task_tool_requirements for each row execute function public.set_updated_at();

alter table public.task_tool_requirements enable row level security;
create policy task_tool_requirements_participant_select on public.task_tool_requirements for select using(
  (owner_id=auth.uid() and public.owns_project(project_id,auth.uid()))or exists(
    select 1 from public.site_tasks t join public.project_workers w on w.id=t.assigned_worker_id
    where t.id=task_tool_requirements.task_id and w.auth_user_id=auth.uid()and w.status='active'
  )
);

create function public.guard_task_tool_requirement_change()returns trigger language plpgsql set search_path=public as $$begin
  if tg_op='DELETE'and(pg_trigger_depth()>1 or not exists(select 1 from public.site_tasks where id=old.task_id))then return old;end if;
  if current_setting('app.task_tool_rpc',true)is distinct from'1'then raise exception'TASK_TOOL_RPC_REQUIRED';end if;
  return case when tg_op='DELETE'then old else new end;
end$$;
create trigger task_tool_requirements_guard before insert or update or delete on public.task_tool_requirements for each row execute function public.guard_task_tool_requirement_change();

create function public.save_task_tool_requirements(p_task_id text,p_tool_ids text[],p_confirmed boolean)returns setof public.task_tool_requirements language plpgsql security definer set search_path=public,auth as $$declare
  uid uuid:=auth.uid();target public.site_tasks%rowtype;tool_id text;tool public.project_tools%rowtype;
begin
  if not coalesce(p_confirmed,false)then raise exception'TASK_TOOL_CONFIRMATION_REQUIRED';end if;
  if coalesce(array_length(p_tool_ids,1),0)>100 or coalesce(array_length(p_tool_ids,1),0)<>coalesce((select count(distinct x)from unnest(p_tool_ids)x),0)then raise exception'INVALID_TASK_TOOL_REQUIREMENTS';end if;
  select*into target from public.site_tasks where id=p_task_id and owner_id=uid and public.owns_project(project_id,uid)for update;
  if target.id is null then raise exception'TASK_TOOL_SCOPE';end if;
  foreach tool_id in array coalesce(p_tool_ids,'{}'::text[])loop
    select*into tool from public.project_tools where id=tool_id and owner_id=uid and project_id=target.project_id and status<>'retired';
    if tool.id is null then raise exception'TASK_TOOL_ITEM_SCOPE';end if;
  end loop;
  perform set_config('app.task_tool_rpc','1',true);delete from public.task_tool_requirements where task_id=target.id;
  foreach tool_id in array coalesce(p_tool_ids,'{}'::text[])loop
    select*into tool from public.project_tools where id=tool_id;
    insert into public.task_tool_requirements(id,owner_id,project_id,task_id,tool_id,asset_number,tool_name,category)
    values('task-tool-'||gen_random_uuid()::text,uid,target.project_id,target.id,tool.id,tool.asset_number,tool.name,tool.category);
  end loop;
  return query select*from public.task_tool_requirements where task_id=target.id order by asset_number,id;
end$$;

revoke insert,update,delete on public.task_tool_requirements from public,anon,authenticated;grant select on public.task_tool_requirements to authenticated;
revoke execute on function public.save_task_tool_requirements(text,text[],boolean)from public,anon;grant execute on function public.save_task_tool_requirements(text,text[],boolean)to authenticated;
create trigger task_tool_requirements_audit after insert or update or delete on public.task_tool_requirements for each row execute function public.audit_row();

alter function public.export_my_data()rename to export_my_data_v25;
create function public.export_my_data()returns jsonb language sql stable security definer set search_path=public,auth as $$select case when auth.uid()is null then null else public.export_my_data_v25()||jsonb_build_object('schemaVersion',26,'taskToolRequirements',coalesce((select jsonb_agg(to_jsonb(x)order by x.task_id,x.asset_number,x.id)from public.task_tool_requirements x where x.owner_id=auth.uid()),'[]'::jsonb))end$$;
revoke execute on function public.export_my_data()from public,anon;grant execute on function public.export_my_data()to authenticated;
