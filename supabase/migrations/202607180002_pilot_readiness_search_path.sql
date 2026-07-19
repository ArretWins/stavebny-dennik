-- Supabase installs pgcrypto in the extensions schema.
alter function public.consume_public_rate_limit(text,text,integer,integer) set search_path=public,extensions;
alter function public.join_project_as_worker(text,text,text,text) set search_path=public,extensions;
