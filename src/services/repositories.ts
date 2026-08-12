import type {
  Attachment,
  DelayEvent,
  DiaryEntry,
  Project,
  ReportExport,
  WeatherSnapshot,
  WorkerCheckin,
} from "@/domain/types";
import { supabase } from "./supabase";

function projectFromRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    location: String(row.location),
    address: row.address ? String(row.address) : undefined,
    status: row.status as Project["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function diaryFromRow(row: Record<string, any>): DiaryEntry {
  const evidence = row.evidence_json as DiaryEntry["evidence"];
  if (evidence?.weather?.provider === "manual" && !evidence.weather.manualDescription) {
    const description = evidence.weather.rawJson?.description;
    if (typeof description === "string") evidence.weather.manualDescription = description;
  }
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    logDate: String(row.log_date),
    workDescription: String(row.work_description),
    workerCount: Number(row.worker_count),
    workStartTime: row.work_start_time
      ? String(row.work_start_time).slice(0, 5)
      : undefined,
    workEndTime: row.work_end_time
      ? String(row.work_end_time).slice(0, 5)
      : undefined,
    workforceRoles: Array.isArray(row.workforce_json) ? row.workforce_json : [],
    technicalRecords: Array.isArray(row.technical_records_json)
      ? row.technical_records_json
      : [],
    note: row.note ? String(row.note) : undefined,
    evidence,
    lockedAt: row.locked_at ? String(row.locked_at) : undefined,
    lockedBy: row.locked_by ? String(row.locked_by) : undefined,
    correctionOfId: row.correction_of_id
      ? String(row.correction_of_id)
      : undefined,
    correctionReason: row.correction_reason
      ? String(row.correction_reason)
      : undefined,
    syncStatus: "synced",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listProjects(ownerId: string): Promise<Project[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(projectFromRow);
}

export async function createProject(
  ownerId: string,
  input: Pick<Project, "name" | "location" | "address">,
): Promise<Project> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: ownerId,
      name: input.name.trim(),
      location: input.location.trim(),
      address: input.address?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return projectFromRow(data);
}

export async function updateProject(
  id: string,
  input: Partial<Pick<Project, "name" | "location" | "address" | "status">>,
): Promise<Project> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: input.name?.trim(),
      location: input.location?.trim(),
      address: input.address?.trim() || null,
      status: input.status,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return projectFromRow(data);
}

export async function deleteProject(id: string): Promise<void> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const [attachments, receiptFiles, reports, receiptReports, plans] =
    await Promise.all([
      supabase.from("attachments").select("storage_path").eq("project_id", id),
      supabase
        .from("receipt_files")
        .select("storage_path")
        .eq("project_id", id),
      supabase
        .from("report_exports")
        .select("storage_path")
        .eq("project_id", id),
      supabase
        .from("receipt_export_batches")
        .select("storage_path")
        .eq("project_id", id),
      supabase
        .from("project_plans")
        .select("storage_path")
        .eq("project_id", id),
    ]);
  for (const result of [
    attachments,
    receiptFiles,
    reports,
    receiptReports,
    plans,
  ])
    if (result.error) throw result.error;
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
  const paths = (rows: Array<{ storage_path: string | null }> | null) =>
    (rows ?? [])
      .map((row) => row.storage_path)
      .filter((path): path is string => !!path);
  const attachmentPaths = paths(attachments.data);
  const receiptPaths = paths(receiptFiles.data);
  const reportPaths = [
    ...new Set([...paths(reports.data), ...paths(receiptReports.data)]),
  ];
  await Promise.all([
    attachmentPaths.length
      ? supabase.storage.from("attachments").remove(attachmentPaths)
      : Promise.resolve(),
    receiptPaths.length
      ? supabase.storage.from("receipts").remove(receiptPaths)
      : Promise.resolve(),
    reportPaths.length
      ? supabase.storage.from("reports").remove(reportPaths)
      : Promise.resolve(),
    paths(plans.data).length
      ? supabase.storage.from("plans").remove(paths(plans.data))
      : Promise.resolve(),
  ]);
}

export async function insertDiary(entry: DiaryEntry): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const log = await supabase.from("daily_logs").upsert(
    {
      owner_id: entry.ownerId,
      project_id: entry.projectId,
      log_date: entry.logDate,
    },
    { onConflict: "project_id,log_date" },
  );
  if (log.error) throw log.error;
  const { data, error } = await supabase
    .from("diary_entries")
    .upsert(
      {
        id: entry.id,
        owner_id: entry.ownerId,
        project_id: entry.projectId,
        log_date: entry.logDate,
        work_description: entry.workDescription,
        worker_count: entry.workerCount,
        work_start_time: entry.workStartTime ?? null,
        work_end_time: entry.workEndTime ?? null,
        workforce_json: entry.workforceRoles ?? [],
        technical_records_json: entry.technicalRecords ?? [],
        note: entry.note ?? null,
        evidence_json: entry.evidence,
        correction_of_id: entry.correctionOfId ?? null,
        correction_reason: entry.correctionReason ?? null,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function insertDelay(event: DelayEvent): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("delay_events")
    .upsert(
      {
        id: event.id,
        owner_id: event.ownerId,
        project_id: event.projectId,
        event_date: event.eventDate,
        reason: event.reason,
        note: event.note ?? null,
        evidence_json: event.evidence,
        correction_of_id: event.correctionOfId ?? null,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function insertWeatherSnapshot(
  ownerId: string,
  projectId: string,
  snapshot: WeatherSnapshot,
): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("weather_snapshots")
    .insert({
      id: snapshot.id,
      owner_id: ownerId,
      project_id: projectId,
      provider: snapshot.provider,
      request_url: snapshot.requestUrl,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      captured_at: snapshot.capturedAt,
      raw_json: snapshot.rawJson,
      temperature_c: snapshot.temperatureC,
      precipitation_mm: snapshot.precipitationMm,
      wind_speed_kmh: snapshot.windSpeedKmh,
      weather_code: snapshot.weatherCode,
      status: snapshot.status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function lockDiaryEntry(
  id: string,
  actorId: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("diary_entries")
    .update({ locked_at: new Date().toISOString(), locked_by: actorId })
    .eq("id", id)
    .eq("owner_id", actorId);
  if (error) throw error;
}

export async function lockDelayEvent(
  id: string,
  actorId: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("delay_events")
    .update({ locked_at: new Date().toISOString(), locked_by: actorId })
    .eq("id", id)
    .eq("owner_id", actorId);
  if (error) throw error;
}

export async function listDiary(
  projectId: string,
  date: string,
): Promise<DiaryEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("diary_entries")
    .select("*")
    .eq("project_id", projectId)
    .eq("log_date", date)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => diaryFromRow(row));
}

export async function listDiaryRange(
  projectId: string,
  dateFrom: string,
  dateTo: string,
): Promise<DiaryEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("diary_entries")
    .select("*")
    .eq("project_id", projectId)
    .gte("log_date", dateFrom)
    .lte("log_date", dateTo)
    .order("log_date")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => diaryFromRow(row));
}

export async function listProjectAttachments(
  projectId: string,
): Promise<Attachment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    relatedEntityType:
      row.related_entity_type as Attachment["relatedEntityType"],
    relatedEntityId: row.related_entity_id
      ? String(row.related_entity_id)
      : undefined,
    localUri: row.local_uri ? String(row.local_uri) : "",
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    fileSize: Number(row.file_size),
    mimeType: String(row.mime_type),
    createdAt: String(row.created_at),
    uploadStatus: (row.upload_status ?? "synced") as Attachment["uploadStatus"],
    thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : undefined,
    evidenceRole: (row.evidence_role ??
      "general") as Attachment["evidenceRole"],
    createdByWorkerId: row.created_by_worker_id
      ? String(row.created_by_worker_id)
      : undefined,
    captureSource: row.capture_source
      ? (String(row.capture_source) as Attachment["captureSource"])
      : undefined,
    capturedAt: row.captured_at ? String(row.captured_at) : undefined,
    latitude:
      row.latitude === null || row.latitude === undefined
        ? undefined
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? undefined
        : Number(row.longitude),
    contentSha256: row.content_sha256 ? String(row.content_sha256) : undefined,
    integrityVersion: row.integrity_version
      ? (String(row.integrity_version) as Attachment["integrityVersion"])
      : undefined,
    sourceFileName: row.source_file_name
      ? String(row.source_file_name)
      : undefined,
    sourceMetadata:
      row.source_metadata && typeof row.source_metadata === "object"
        ? (row.source_metadata as Record<string, string | number>)
        : undefined,
  }));
}

export async function listCheckins(
  projectId: string,
  date: string,
): Promise<WorkerCheckin[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("worker_checkins")
    .select("*")
    .eq("project_id", projectId)
    .gte("checked_in_at", `${date}T00:00:00.000Z`)
    .lt("checked_in_at", `${date}T23:59:59.999Z`)
    .order("checked_in_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    workerName: String(row.worker_name),
    checkedInAt: String(row.checked_in_at),
    latitude: row.latitude ? Number(row.latitude) : undefined,
    longitude: row.longitude ? Number(row.longitude) : undefined,
  }));
}

export async function listReports(projectId: string): Promise<ReportExport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("report_exports")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    type: row.report_type as ReportExport["type"],
    sourceEntityId: row.source_entity_id
      ? String(row.source_entity_id)
      : undefined,
    attachmentIds: Array.isArray(row.attachment_ids)
      ? row.attachment_ids.map(String)
      : [],
    locale: "sk-SK",
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    createdAt: String(row.created_at),
    pageCount: Number(row.page_count ?? 1),
    status: row.status as ReportExport["status"],
  }));
}
