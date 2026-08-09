-- Evidence-grade metadata for the exact normalized image stored in the private
-- attachments bucket. The digest identifies stored bytes; it is not an e-signature.
alter table public.attachments
  add column if not exists capture_source text
    check(capture_source in ('camera','library','worker_portal')),
  add column if not exists captured_at timestamptz,
  add column if not exists latitude double precision check(latitude between -90 and 90),
  add column if not exists longitude double precision check(longitude between -180 and 180),
  add column if not exists content_sha256 text
    check(content_sha256 ~ '^[a-f0-9]{64}$'),
  add column if not exists integrity_version text
    check(integrity_version='sha256-v1'),
  add column if not exists source_file_name text
    check(source_file_name is null or char_length(source_file_name)<=255),
  add column if not exists source_metadata jsonb not null default '{}'::jsonb
    check(jsonb_typeof(source_metadata)='object'
      and octet_length(source_metadata::text)<=4096),
  add constraint attachments_coordinates_complete check(
    (latitude is null)=(longitude is null)
  ),
  add constraint attachments_integrity_complete check(
    (capture_source is null and content_sha256 is null and integrity_version is null)
    or (capture_source is not null and content_sha256 is not null
      and integrity_version='sha256-v1' and captured_at is not null)
  );

create or replace function public.guard_attachment_evidence_integrity()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.content_sha256 is not null and (
    new.storage_path is distinct from old.storage_path
    or new.file_size is distinct from old.file_size
    or new.mime_type is distinct from old.mime_type
    or new.capture_source is distinct from old.capture_source
    or new.captured_at is distinct from old.captured_at
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.content_sha256 is distinct from old.content_sha256
    or new.integrity_version is distinct from old.integrity_version
    or new.source_file_name is distinct from old.source_file_name
    or new.source_metadata is distinct from old.source_metadata
  ) then raise exception 'ATTACHMENT_EVIDENCE_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger attachment_evidence_integrity_guard before update
  on public.attachments for each row
  execute function public.guard_attachment_evidence_integrity();

-- A stored evidence object may be inserted, read or deleted with its record,
-- but never overwritten in-place after its digest has been recorded.
drop policy if exists attachments_storage_owner on storage.objects;
create policy attachments_storage_owner_read on storage.objects for select
  using(bucket_id='attachments'
    and (storage.foldername(name))[1]=auth.uid()::text);
create policy attachments_storage_owner_insert on storage.objects for insert
  with check(bucket_id='attachments'
    and (storage.foldername(name))[1]=auth.uid()::text);
create policy attachments_storage_owner_delete on storage.objects for delete
  using(bucket_id='attachments'
    and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.submit_my_site_task(
  p_task_id text,
  p_evidence jsonb
)
returns public.site_tasks
language plpgsql security definer set search_path=public,auth,storage
as $$
declare
  task public.site_tasks;
  worker public.project_workers;
  evidence jsonb;
  evidence_count integer;
  existing_count integer;
  expected_prefix text;
  evidence_id text;
  evidence_path text;
  evidence_size bigint;
  evidence_mime text;
  evidence_hash text;
  evidence_captured_at timestamptz;
begin
  if jsonb_typeof(p_evidence)<>'array'
    or jsonb_array_length(p_evidence) not between 1 and 6
  then raise exception 'TASK_EVIDENCE_REQUIRED'; end if;

  select target.* into task from public.site_tasks target
  join public.project_workers assigned on assigned.id=target.assigned_worker_id
  where target.id=p_task_id and assigned.auth_user_id=auth.uid()
    and assigned.status='active' for update of target;
  if task.id is null then raise exception 'WORKER_TASK_ACCESS_DENIED'; end if;
  if task.status not in ('open','in_progress','blocked')
  then raise exception 'WORKER_TASK_LOCKED'; end if;
  select assigned.* into worker from public.project_workers assigned
    where assigned.id=task.assigned_worker_id;
  select count(*) into existing_count from public.attachments attachment
    where attachment.related_entity_type='site_task'
      and attachment.related_entity_id=task.id
      and attachment.evidence_role='after'
      and attachment.created_by_worker_id=worker.id;
  evidence_count:=jsonb_array_length(p_evidence);
  if existing_count+evidence_count>6
  then raise exception 'TASK_EVIDENCE_LIMIT_EXCEEDED'; end if;
  expected_prefix:=concat(task.owner_id::text,'/',task.project_id::text,
    '/site-tasks/',task.id,'/',worker.auth_user_id::text,'/');

  for evidence in select value from jsonb_array_elements(p_evidence) loop
    evidence_id:=nullif(trim(evidence->>'id'),'');
    evidence_path:=nullif(trim(evidence->>'storagePath'),'');
    evidence_size:=nullif(evidence->>'fileSize','')::bigint;
    evidence_mime:=nullif(trim(evidence->>'mimeType'),'');
    evidence_hash:=nullif(lower(trim(evidence->>'contentSha256')),'');
    begin
      evidence_captured_at:=(evidence->>'capturedAt')::timestamptz;
    exception when others then
      raise exception 'INVALID_TASK_EVIDENCE';
    end;
    if evidence_id is null or char_length(evidence_id)>160
      or evidence_path is null or evidence_path not like expected_prefix||'%'
      or split_part(substr(evidence_path,char_length(expected_prefix)+1),'/',2)<>''
      or evidence_size not between 1 and 10485760
      or evidence_mime not in ('image/jpeg','image/png','image/webp')
      or evidence->>'captureSource'<>'worker_portal'
      or evidence->>'integrityVersion'<>'sha256-v1'
      or evidence_hash is null or evidence_hash!~'^[a-f0-9]{64}$'
      or evidence_captured_at is null
      or not exists(select 1 from storage.objects object
        where object.bucket_id='attachments' and object.name=evidence_path)
    then raise exception 'INVALID_TASK_EVIDENCE'; end if;
    insert into public.attachments(
      id,owner_id,project_id,related_entity_type,related_entity_id,
      local_uri,storage_path,file_size,mime_type,upload_status,
      evidence_role,created_by_worker_id,capture_source,captured_at,
      content_sha256,integrity_version,source_metadata
    ) values(
      evidence_id,task.owner_id,task.project_id,'site_task',task.id,
      null,evidence_path,evidence_size,evidence_mime,'synced','after',worker.id,
      'worker_portal',evidence_captured_at,evidence_hash,'sha256-v1','{}'::jsonb
    );
  end loop;

  perform set_config('app.site_task_review_workflow','allowed',true);
  update public.site_tasks set status='review',submitted_at=now(),
    reviewed_at=null,reviewed_by=null,review_note=null,completed_at=null
    where id=task.id returning * into task;
  insert into public.notifications(
    recipient_user_id,worker_id,notification_type,title,body,data
  ) values(task.owner_id,worker.id,'task_review',
    'Práca čaká na kontrolu',task.title,
    jsonb_build_object('taskId',task.id,'projectId',task.project_id,'status','review'));
  return task;
end;
$$;

alter function public.export_my_data() rename to export_my_data_v28;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$select
  case when auth.uid() is null then null else
    public.export_my_data_v28()||jsonb_build_object('schemaVersion',29)
  end
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
