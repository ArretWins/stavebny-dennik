-- Trace failed quality controls into actionable defects without duplicates.
alter table public.site_tasks
  add column source_checklist_id text
    references public.project_checklists(id) on delete set null,
  add column source_checklist_item_key text
    check (
      source_checklist_item_key is null
      or char_length(source_checklist_item_key) between 1 and 80
    ),
  add constraint site_tasks_checklist_source_complete check (
    (source_checklist_id is null and source_checklist_item_key is null)
    or
    (source_checklist_id is not null and source_checklist_item_key is not null)
  );

create unique index site_tasks_checklist_source_unique
  on public.site_tasks(source_checklist_id, source_checklist_item_key)
  where source_checklist_id is not null;

create or replace function public.validate_site_task_checklist_source()
returns trigger language plpgsql set search_path=public,auth as $$
begin
  if new.source_checklist_id is not null and not exists (
    select 1
    from public.project_checklists checklist
    where checklist.id = new.source_checklist_id
      and checklist.project_id = new.project_id
      and checklist.owner_id = new.owner_id
      and checklist.status = 'completed'
      and exists (
        select 1
        from jsonb_array_elements(checklist.answers) answer
        where answer->>'itemKey' = new.source_checklist_item_key
          and answer->>'result' = 'fail'
      )
  ) then
    raise exception 'INVALID_CHECKLIST_DEFECT_SOURCE';
  end if;
  return new;
end;
$$;

create trigger site_task_checklist_source_guard
  before insert or update on public.site_tasks
  for each row execute function public.validate_site_task_checklist_source();

revoke execute on function public.validate_site_task_checklist_source()
  from public,anon;
