-- Hosted Supabase installs pgcrypto in the trusted `extensions` schema.
-- Keep security-definer functions restricted while allowing them to resolve
-- gen_random_bytes() and digest() consistently in hosted and local Postgres.
alter function public.create_checkin_token(uuid, date)
  set search_path = public, extensions;
alter function public.create_worker_invite(uuid)
  set search_path = public, extensions;
alter function public.join_project_as_worker(text, text, text, text)
  set search_path = public, extensions;
alter function public.track_analytics_event(text, jsonb)
  set search_path = public, extensions;
