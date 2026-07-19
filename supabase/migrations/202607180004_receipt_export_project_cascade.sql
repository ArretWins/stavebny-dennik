alter table public.receipt_export_items
  drop constraint receipt_export_items_receipt_id_fkey,
  add constraint receipt_export_items_receipt_id_fkey
    foreign key(receipt_id) references public.receipts(id) on delete cascade;

create or replace function public.guard_immutable_receipt_export() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and tg_table_name='receipt_export_batches'
     and not exists(select 1 from public.projects where id=old.project_id) then
    return old;
  end if;
  if tg_op='DELETE' and tg_table_name='receipt_export_items' and (
       not exists(select 1 from public.receipt_export_batches where id=old.export_id)
       or exists(
         select 1 from public.receipt_export_batches batch
         where batch.id=old.export_id
           and not exists(select 1 from public.projects where id=batch.project_id)
       )
     ) then
    return old;
  end if;
  raise exception 'IMMUTABLE_RECEIPT_EXPORT';
end; $$;
revoke execute on function public.guard_immutable_receipt_export() from public,anon,authenticated;
