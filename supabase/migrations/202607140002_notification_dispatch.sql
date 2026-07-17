-- Delivery queue for in-app, Expo and standards-based Web Push notifications.
create extension if not exists pg_net with schema extensions;

alter table public.notifications add column if not exists dispatched_at timestamptz;
alter table public.notifications add column if not exists delivery_error text;

create or replace function public.dispatch_created_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare project_url text; service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if project_url is not null and service_key is not null then
    perform net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/dispatch-notifications',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body := jsonb_build_object('notificationId', new.id)
    );
  end if;
  return new;
end; $$;

create trigger notification_dispatch_after_insert after insert on public.notifications
for each row execute function public.dispatch_created_notification();
