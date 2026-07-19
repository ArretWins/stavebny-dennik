-- Immutable exports cannot be edited or deleted directly, but must not block
-- a confirmed cascade when their owning project is removed.
create or replace function public.guard_immutable_receipt_export() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and tg_table_name='receipt_export_batches'
     and not exists(select 1 from public.projects where id=old.project_id) then
    return old;
  end if;
  if tg_op='DELETE' and tg_table_name='receipt_export_items'
     and not exists(select 1 from public.receipt_export_batches where id=old.export_id) then
    return old;
  end if;
  raise exception 'IMMUTABLE_RECEIPT_EXPORT';
end; $$;
revoke execute on function public.guard_immutable_receipt_export() from public,anon,authenticated;
