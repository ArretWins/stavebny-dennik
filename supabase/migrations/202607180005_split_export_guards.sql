create or replace function public.guard_immutable_receipt_export_batch() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and not exists(select 1 from public.projects where id=old.project_id) then return old; end if;
  raise exception 'IMMUTABLE_RECEIPT_EXPORT';
end; $$;

create or replace function public.guard_immutable_receipt_export_item() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and (
    not exists(select 1 from public.receipt_export_batches where id=old.export_id)
    or exists(
      select 1 from public.receipt_export_batches batch
      where batch.id=old.export_id
        and not exists(select 1 from public.projects where id=batch.project_id)
    )
  ) then return old; end if;
  raise exception 'IMMUTABLE_RECEIPT_EXPORT';
end; $$;

drop trigger receipt_exports_immutable on public.receipt_export_batches;
drop trigger receipt_export_items_immutable on public.receipt_export_items;
create trigger receipt_exports_immutable before update or delete on public.receipt_export_batches for each row execute function public.guard_immutable_receipt_export_batch();
create trigger receipt_export_items_immutable before update or delete on public.receipt_export_items for each row execute function public.guard_immutable_receipt_export_item();

revoke execute on function public.guard_immutable_receipt_export_batch() from public,anon,authenticated;
revoke execute on function public.guard_immutable_receipt_export_item() from public,anon,authenticated;
