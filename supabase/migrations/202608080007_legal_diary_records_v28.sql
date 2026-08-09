-- Structured technical records from Annex 20 of Decree 60/2025. They remain
-- part of the diary entry lifecycle, so the existing lock/correction guards
-- apply and the complete structure is covered by the day-closure digest.
alter table public.diary_entries
  add column if not exists work_start_time time,
  add column if not exists work_end_time time,
  add column if not exists workforce_json jsonb not null default '[]'::jsonb,
  add column if not exists technical_records_json jsonb not null default '[]'::jsonb;

create or replace function public.validate_diary_legal_fields()
returns trigger language plpgsql set search_path=public as $$
declare
  item jsonb;
  role_total integer:=0;
  role_keys text[]:='{}';
  record_ids text[]:='{}';
  role_key text;
  record_id text;
  item_count integer;
  allowed_categories constant text[]:=array[
    'site_inspection','authority_supervision','contractual_fact',
    'material_delivery','product_certificate','equipment_use',
    'work_interruption','adverse_condition','schedule_impact','site_find',
    'foundation_acceptance','test_measurement','quality_fact',
    'technical_inspection','safety_instruction','injury','project_deviation',
    'waste_management','consent_other'
  ];
begin
  if (new.work_start_time is null)<>(new.work_end_time is null)
    or (new.work_start_time is not null and new.work_start_time>=new.work_end_time)
  then raise exception 'INVALID_DIARY_WORK_TIME'; end if;
  if jsonb_typeof(new.workforce_json)<>'array'
    or jsonb_array_length(new.workforce_json)>50
  then raise exception 'INVALID_DIARY_WORKFORCE'; end if;
  for item in select value from jsonb_array_elements(new.workforce_json) loop
    role_key:=lower(trim(coalesce(item->>'role','')));
    if char_length(role_key) not between 2 and 80
      or coalesce(item->>'count','')!~'^[0-9]{1,3}$'
    then raise exception 'INVALID_DIARY_WORKFORCE'; end if;
    item_count:=(item->>'count')::integer;
    if item_count not between 1 and 999 or role_key=any(role_keys)
    then raise exception 'INVALID_DIARY_WORKFORCE'; end if;
    role_keys:=array_append(role_keys,role_key);
    role_total:=role_total+item_count;
  end loop;
  if jsonb_array_length(new.workforce_json)>0 and role_total<>new.worker_count
  then raise exception 'DIARY_WORKFORCE_TOTAL_MISMATCH'; end if;

  if jsonb_typeof(new.technical_records_json)<>'array'
    or jsonb_array_length(new.technical_records_json)>50
  then raise exception 'INVALID_DIARY_TECHNICAL_RECORDS'; end if;
  for item in select value from jsonb_array_elements(new.technical_records_json) loop
    record_id:=trim(coalesce(item->>'id',''));
    if char_length(record_id) not between 3 and 160
      or record_id=any(record_ids)
      or not coalesce(item->>'category','')=any(allowed_categories)
      or char_length(trim(coalesce(item->>'description',''))) not between 3 and 500
      or char_length(trim(coalesce(item->>'reference',''))) >120
    then raise exception 'INVALID_DIARY_TECHNICAL_RECORDS'; end if;
    record_ids:=array_append(record_ids,record_id);
  end loop;
  return new;
end;
$$;
create trigger diary_legal_fields_validate before insert or update
  on public.diary_entries for each row
  execute function public.validate_diary_legal_fields();

create or replace function public.confirm_day_closure(
  p_id text,
  p_project_id uuid,
  p_log_date date,
  p_supersedes_closure_id text default null,
  p_correction_reason text default null,
  p_acknowledged_warnings text[] default '{}',
  p_confirmed boolean default false
)
returns public.day_closures
language plpgsql security definer set search_path=public,auth,extensions
as $$
declare
  uid uuid:=auth.uid();
  latest public.day_closures;
  result public.day_closures;
  next_version integer;
  snapshot jsonb;
  allowed_warnings constant text[]:=array[
    'diary','workforce','weather','photos','taskReviews','receipts'
  ];
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_confirmed is not true
  then raise exception 'DAY_CLOSURE_CONFIRMATION_REQUIRED'; end if;
  if not public.owns_project(p_project_id,uid)
  then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if p_id is null or char_length(p_id) not between 3 and 160
  then raise exception 'INVALID_DAY_CLOSURE_ID'; end if;
  if p_log_date is null or p_log_date>current_date+1
  then raise exception 'INVALID_DAY_CLOSURE_DATE'; end if;
  if exists(
    select 1 from unnest(coalesce(p_acknowledged_warnings,'{}')) warning
    where not(warning=any(allowed_warnings))
  ) then raise exception 'INVALID_DAY_CLOSURE_WARNING'; end if;

  select item.* into result from public.day_closures item where item.id=p_id;
  if result.id is not null then
    if result.owner_id<>uid or result.project_id<>p_project_id
      or result.log_date<>p_log_date
    then raise exception 'DAY_CLOSURE_ID_CONFLICT'; end if;
    return result;
  end if;
  select item.* into latest from public.day_closures item
  where item.project_id=p_project_id and item.log_date=p_log_date
  order by item.version desc limit 1 for update;
  if latest.id is null then
    if p_supersedes_closure_id is not null or p_correction_reason is not null
    then raise exception 'INVALID_FIRST_DAY_CLOSURE'; end if;
    next_version:=1;
  else
    if p_supersedes_closure_id is distinct from latest.id
    then raise exception 'STALE_DAY_CLOSURE_VERSION'; end if;
    if p_correction_reason is null
      or char_length(trim(p_correction_reason)) not between 3 and 300
    then raise exception 'DAY_CLOSURE_CORRECTION_REASON_REQUIRED'; end if;
    next_version:=latest.version+1;
  end if;
  if not exists(
    select 1 from public.diary_entries entry
    where entry.project_id=p_project_id and entry.owner_id=uid
      and entry.log_date=p_log_date
  ) then raise exception 'DAY_CLOSURE_DIARY_REQUIRED'; end if;

  snapshot:=jsonb_build_object(
    'schemaVersion',2,'projectId',p_project_id,'logDate',p_log_date,
    'diaryEntries',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',entry.id,
        'workDescription',trim(entry.work_description),
        'workerCount',entry.worker_count,
        'workStartTime',case when entry.work_start_time is null then null
          else to_char(entry.work_start_time,'HH24:MI') end,
        'workEndTime',case when entry.work_end_time is null then null
          else to_char(entry.work_end_time,'HH24:MI') end,
        'workforceRoles',entry.workforce_json,
        'technicalRecords',entry.technical_records_json,
        'note',nullif(trim(entry.note),''),
        'correctionOfId',entry.correction_of_id,
        'correctionReason',entry.correction_reason,
        'capturedAt',entry.evidence_json->>'capturedAt',
        'attachmentIds',coalesce(entry.evidence_json->'attachmentIds','[]'::jsonb),
        'weatherCapturedAt',entry.evidence_json->'weather'->>'capturedAt',
        'createdAt',entry.created_at,'updatedAt',entry.updated_at
      )) order by entry.created_at,entry.id)
      from public.diary_entries entry
      where entry.project_id=p_project_id and entry.owner_id=uid
        and entry.log_date=p_log_date
    ),'[]'::jsonb),
    'workerCheckinIds',coalesce((select jsonb_agg(item.id order by item.id)
      from public.worker_checkins item where item.project_id=p_project_id
        and item.checked_in_at::date=p_log_date),'[]'::jsonb),
    'attachmentIds',coalesce((select jsonb_agg(item.id order by item.id)
      from public.attachments item where item.project_id=p_project_id
        and item.owner_id=uid and item.created_at::date=p_log_date),'[]'::jsonb),
    'completedTaskIds',coalesce((select jsonb_agg(item.id order by item.id)
      from public.site_tasks item where item.project_id=p_project_id
        and item.owner_id=uid and item.status='done'
        and item.completed_at::date=p_log_date),'[]'::jsonb),
    'pendingTaskReviewIds',coalesce((select jsonb_agg(item.id order by item.id)
      from public.site_tasks item where item.project_id=p_project_id
        and item.owner_id=uid and item.status='review'
        and item.submitted_at::date=p_log_date),'[]'::jsonb),
    'incompleteReceiptIds',coalesce((select jsonb_agg(item.id order by item.id)
      from public.receipts item where item.project_id=p_project_id
        and item.owner_id=uid and item.status<>'ready'
        and item.created_at::date=p_log_date),'[]'::jsonb)
  );
  insert into public.day_closures(
    id,owner_id,project_id,log_date,version,supersedes_closure_id,
    correction_reason,snapshot_json,content_hash,confirmation_version,
    acknowledged_warnings,confirmed_at,confirmed_by
  ) values(
    p_id,uid,p_project_id,p_log_date,next_version,latest.id,
    nullif(trim(p_correction_reason),''),snapshot,
    encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),
    'sk-v1',coalesce(p_acknowledged_warnings,'{}'),now(),uid
  ) returning * into result;
  update public.diary_entries
    set locked_at=coalesce(locked_at,result.confirmed_at),
      locked_by=coalesce(locked_by,uid)
    where project_id=p_project_id and owner_id=uid and log_date=p_log_date
      and locked_at is null;
  return result;
end;
$$;

alter function public.export_my_data() rename to export_my_data_v27;
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public,auth as $$select
  case when auth.uid() is null then null else
    public.export_my_data_v27()||jsonb_build_object('schemaVersion',28)
  end
$$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
