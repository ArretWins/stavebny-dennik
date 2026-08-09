-- Cascading account deletion fires row-audit triggers after auth.users has
-- removed the user. Preserve the audit event but anonymise its actor.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  row_new jsonb := to_jsonb(new);
  row_old jsonb := to_jsonb(old);
  entity_id text := coalesce(row_new->>'id', row_old->>'id');
  audit_action text;
  actor uuid := auth.uid();
begin
  audit_action := case
    when tg_table_name = 'report_exports' and tg_op = 'INSERT' then 'report_generation'
    when tg_op = 'UPDATE'
      and row_old->>'locked_at' is null
      and row_new->>'locked_at' is not null then 'lock'
    when tg_op = 'INSERT' and row_new->>'correction_of_id' is not null then 'correction'
    else lower(tg_op)
  end;

  if actor is not null
    and not exists (select 1 from auth.users where id = actor) then
    actor := null;
  end if;

  insert into public.audit_events(
    actor_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    actor,
    tg_table_name,
    entity_id,
    audit_action,
    jsonb_build_object(
      'table',
      tg_table_name,
      'correction_of_id',
      row_new->>'correction_of_id'
    )
  );
  return coalesce(new, old);
end;
$$;
