-- Immutable client acceptance decisions submitted through expiring project links.
create table public.client_task_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id text not null references public.site_tasks(id) on delete cascade,
  share_link_id uuid not null references public.project_share_links(id) on delete restrict,
  task_revision integer not null check (task_revision >= 0),
  decision text not null check (decision in ('accept','rework')),
  signer_name text not null check (char_length(trim(signer_name)) between 2 and 100),
  comment text check (comment is null or char_length(comment) between 1 and 500),
  confirmed_at timestamptz not null default now(),
  unique(task_id, task_revision),
  check (decision <> 'rework' or char_length(trim(comment)) >= 3)
);

create index client_task_decisions_owner_project_idx
  on public.client_task_decisions(owner_id, project_id, confirmed_at desc);

alter table public.client_task_decisions enable row level security;
create policy client_task_decisions_owner_select
  on public.client_task_decisions for select
  using (
    owner_id = auth.uid()
    and public.owns_project(project_id, auth.uid())
  );

create or replace function public.reject_client_task_decision_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'CLIENT_TASK_DECISION_IMMUTABLE';
end;
$$;

create trigger client_task_decision_immutable
  before update or delete on public.client_task_decisions
  for each row execute function public.reject_client_task_decision_mutation();

alter table public.site_task_events
  drop constraint site_task_events_event_type_check,
  add constraint site_task_events_event_type_check check (
    event_type in (
      'created','updated','status_changed','assignment_changed','comment',
      'client_decision'
    )
  );

alter table public.notifications
  drop constraint notifications_notification_type_check,
  add constraint notifications_notification_type_check check (
    notification_type in (
      'worker_join','material_request','request_status','site_task',
      'task_review','task_assignment','task_comment','client_decision'
    )
  );

create or replace function public.submit_project_share_task_decision(
  p_token text,
  p_task_id text,
  p_decision text,
  p_signer_name text,
  p_comment text,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions
as $$
declare
  link public.project_share_links;
  task public.site_tasks;
  record public.client_task_decisions;
  signer text := nullif(trim(p_signer_name),'');
  note text := nullif(trim(p_comment),'');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_SHARE_TOKEN';
  end if;
  if p_decision not in ('accept','rework') then
    raise exception 'INVALID_CLIENT_DECISION';
  end if;
  if p_confirmed is not true then raise exception 'CLIENT_CONFIRMATION_REQUIRED'; end if;
  if signer is null or char_length(signer) not between 2 and 100 then
    raise exception 'INVALID_CLIENT_SIGNER';
  end if;
  if note is not null and char_length(note) > 500 then
    raise exception 'CLIENT_COMMENT_TOO_LONG';
  end if;
  if p_decision = 'rework' and coalesce(char_length(note),0) < 3 then
    raise exception 'CLIENT_REWORK_COMMENT_REQUIRED';
  end if;

  select candidate.* into link
  from public.project_share_links candidate
  where candidate.token_hash = encode(digest(p_token,'sha256'),'hex')
    and candidate.revoked_at is null
    and candidate.expires_at > now()
  for update;
  if link.id is null then raise exception 'SHARE_LINK_NOT_AVAILABLE'; end if;

  select target.* into task
  from public.site_tasks target
  where target.id = p_task_id
    and target.project_id = link.project_id
    and target.owner_id = link.owner_id
    and target.status = 'done'
    and target.client_visible
  for update;
  if task.id is null then raise exception 'CLIENT_TASK_NOT_AVAILABLE'; end if;

  insert into public.client_task_decisions(
    owner_id,project_id,task_id,share_link_id,task_revision,
    decision,signer_name,comment
  ) values (
    task.owner_id,task.project_id,task.id,link.id,task.revision_count,
    p_decision,signer,note
  ) returning * into record;

  perform set_config('app.task_event_system','allowed',true);
  insert into public.site_task_events(
    id,owner_id,project_id,task_id,event_type,body,metadata,created_at
  ) values (
    concat('event_',gen_random_uuid()::text),
    task.owner_id,task.project_id,task.id,'client_decision',note,
    jsonb_build_object(
      'decision',p_decision,
      'signerName',signer,
      'taskRevision',task.revision_count,
      'decisionId',record.id
    ),
    record.confirmed_at
  );

  if p_decision = 'rework' then
    perform set_config('app.site_task_review_workflow','allowed',true);
    update public.site_tasks
      set status='in_progress',
          completed_at=null,
          reviewed_at=record.confirmed_at,
          reviewed_by=null,
          review_note=note,
          revision_count=revision_count + 1
      where id=task.id;
  end if;

  insert into public.notifications(
    recipient_user_id,notification_type,title,body,data
  ) values (
    task.owner_id,'client_decision',
    case when p_decision='accept'
      then 'Objednávateľ prevzal prácu'
      else 'Objednávateľ vrátil prácu'
    end,
    case when note is null then concat(signer,': ',task.title)
      else concat(signer,': ',task.title,' — ',note)
    end,
    jsonb_build_object(
      'taskId',task.id,'projectId',task.project_id,
      'decision',p_decision,'decisionId',record.id
    )
  );

  return jsonb_build_object(
    'id',record.id,
    'decision',record.decision,
    'signerName',record.signer_name,
    'confirmedAt',record.confirmed_at
  );
exception
  when unique_violation then
    raise exception 'CLIENT_DECISION_ALREADY_RECORDED';
end;
$$;

revoke execute on function public.submit_project_share_task_decision(
  text,text,text,text,text,boolean
) from public,anon,authenticated;
grant execute on function public.submit_project_share_task_decision(
  text,text,text,text,text,boolean
) to service_role;

create or replace function public.resolve_project_share_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions
as $$
declare
  link public.project_share_links;
  project public.projects;
  tasks jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select candidate.* into link
  from public.project_share_links candidate
  where candidate.token_hash=encode(digest(p_token,'sha256'),'hex')
    and candidate.revoked_at is null and candidate.expires_at > now()
  for update;
  if link.id is null then return null; end if;
  select target.* into project from public.projects target
  where target.id=link.project_id and target.status='active';
  if project.id is null then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',visible.id,'title',visible.title,'description',visible.description,
      'kind',visible.kind,'completedAt',visible.completed_at,
      'revisionCount',visible.revision_count,
      'decision',(
        select jsonb_build_object(
          'decision',decision.decision,'signerName',decision.signer_name,
          'comment',decision.comment,'confirmedAt',decision.confirmed_at
        )
        from public.client_task_decisions decision
        where decision.task_id=visible.id
          and decision.task_revision=visible.revision_count
      ),
      'photos',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',attachment.id,'storagePath',attachment.storage_path
        ) order by attachment.created_at)
        from public.attachments attachment
        where attachment.related_entity_type='site_task'
          and attachment.related_entity_id=visible.id
          and attachment.evidence_role='after'
          and attachment.storage_path is not null
      ),'[]'::jsonb)
    ) order by visible.completed_at desc nulls last
  ),'[]'::jsonb) into tasks
  from public.site_tasks visible
  where visible.project_id=project.id and visible.owner_id=link.owner_id
    and visible.status='done' and visible.client_visible;

  update public.project_share_links set
    view_count=view_count+1,last_viewed_at=now() where id=link.id;
  return jsonb_build_object(
    'project',jsonb_build_object(
      'name',project.name,'location',project.location,'address',project.address
    ),
    'tasks',tasks,'expiresAt',link.expires_at,'generatedAt',now()
  );
end;
$$;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  select jsonb_build_object(
    'schemaVersion',7,
    'exportedAt',now(),
    'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
    'projects',coalesce((select jsonb_agg(to_jsonb(x)) from public.projects x where x.owner_id=auth.uid()),'[]'::jsonb),
    'diaryEntries',coalesce((select jsonb_agg(to_jsonb(x)) from public.diary_entries x where x.owner_id=auth.uid()),'[]'::jsonb),
    'delayEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.delay_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(x)) from public.attachments x where x.owner_id=auth.uid()),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(x)) from public.report_exports x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receiptCategories',coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_categories x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipts x where x.owner_id=auth.uid()),'[]'::jsonb),
    'receiptFiles',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipt_files x where x.owner_id=auth.uid()),'[]'::jsonb),
    'workers',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_workers x where x.owner_id=auth.uid()),'[]'::jsonb),
    'materialRequests',coalesce((select jsonb_agg(to_jsonb(x)) from public.material_requests x where x.owner_id=auth.uid()),'[]'::jsonb),
    'materialRequestItems',coalesce((select jsonb_agg(to_jsonb(x)) from public.material_request_items x join public.material_requests r on r.id=x.request_id where r.owner_id=auth.uid()),'[]'::jsonb),
    'receiptRequestLinks',coalesce((select jsonb_agg(to_jsonb(x)) from public.receipt_request_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectPlans',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_plans x where x.owner_id=auth.uid()),'[]'::jsonb),
    'siteTasks',coalesce((select jsonb_agg(to_jsonb(x)) from public.site_tasks x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectChecklists',coalesce((select jsonb_agg(to_jsonb(x)) from public.project_checklists x where x.owner_id=auth.uid()),'[]'::jsonb),
    'siteTaskEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.site_task_events x where x.owner_id=auth.uid()),'[]'::jsonb),
    'clientTaskDecisions',coalesce((select jsonb_agg(to_jsonb(x)) from public.client_task_decisions x where x.owner_id=auth.uid()),'[]'::jsonb),
    'projectShareLinks',coalesce((select jsonb_agg(to_jsonb(x) - 'token_hash') from public.project_share_links x where x.owner_id=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(x)) from public.notifications x where x.recipient_user_id=auth.uid()),'[]'::jsonb)
  ) where auth.uid() is not null;
$$;
