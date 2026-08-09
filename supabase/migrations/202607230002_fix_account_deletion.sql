-- Storage objects must be removed through the Storage API. The mobile client
-- removes every object under the authenticated user's private prefix before
-- invoking this function.
create or replace function public.delete_my_account(p_confirmation text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_confirmation <> 'DELETE' then
    raise exception 'CONFIRMATION_REQUIRED';
  end if;

  delete from auth.users where id = uid;
  return true;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
