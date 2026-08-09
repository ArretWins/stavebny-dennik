-- Keep historical records readable after an account is removed while
-- preventing nullable actor/locker references from blocking the deletion.
alter table public.diary_entries
  drop constraint diary_entries_locked_by_fkey,
  add constraint diary_entries_locked_by_fkey
    foreign key (locked_by) references auth.users(id) on delete set null;

alter table public.delay_events
  drop constraint delay_events_locked_by_fkey,
  add constraint delay_events_locked_by_fkey
    foreign key (locked_by) references auth.users(id) on delete set null;

alter table public.audit_events
  drop constraint audit_events_actor_id_fkey,
  add constraint audit_events_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.project_workers
  drop constraint project_workers_reviewed_by_fkey,
  add constraint project_workers_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null;

alter table public.material_request_status_history
  drop constraint material_request_status_history_changed_by_fkey,
  add constraint material_request_status_history_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;
