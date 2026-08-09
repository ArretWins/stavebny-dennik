-- Hosted Supabase keeps pgcrypto helpers in the trusted extensions schema.
alter function public.create_project_share_link(uuid, integer)
  set search_path = public, auth, extensions;
alter function public.resolve_project_share_snapshot(text)
  set search_path = public, auth, extensions;
