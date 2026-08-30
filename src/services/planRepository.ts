import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { createId, nowIso } from '@/domain/ids';
import {
  isSupportedPlanMimeType,
  MAX_PLAN_FILE_SIZE,
} from '@/domain/planTasks';
import type { ProjectPlan, SiteTask, SiteTaskEvent } from '@/domain/types';
import { supabase } from './supabase';
import { readLocalFile } from './localFile';

function extensionFor(mimeType: ProjectPlan['mimeType']): string {
  if (mimeType === 'application/pdf') return 'pdf';
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

async function cacheRemotePlan(
  plan: ProjectPlan,
  signedUrl: string,
): Promise<string> {
  if (!FileSystem.documentDirectory) return signedUrl;
  const directory = `${FileSystem.documentDirectory}plans`;
  const localUri = `${directory}/${plan.id}.${extensionFor(plan.mimeType)}`;
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      await FileSystem.downloadAsync(signedUrl, localUri);
    }
    return localUri;
  } catch {
    return signedUrl;
  }
}

function planFromRow(row: Record<string, unknown>): ProjectPlan {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    name: String(row.name),
    localUri: String(row.local_uri ?? ''),
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    fileSize: Number(row.file_size),
    mimeType: row.mime_type as ProjectPlan['mimeType'],
    pageCount: Number(row.page_count ?? 1),
    seriesId: String(row.series_id ?? row.id),
    versionNumber: Number(row.version_number ?? 1),
    supersedesPlanId: row.supersedes_plan_id
      ? String(row.supersedes_plan_id)
      : undefined,
    isCurrent: Boolean(row.is_current ?? true),
    uploadStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function taskFromRow(row: Record<string, unknown>): SiteTask {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    planId: row.plan_id ? String(row.plan_id) : undefined,
    pageNumber: row.page_number == null ? undefined : Number(row.page_number),
    xRatio: row.x_ratio == null ? undefined : Number(row.x_ratio),
    yRatio: row.y_ratio == null ? undefined : Number(row.y_ratio),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    kind: row.kind as SiteTask['kind'],
    status: row.status as SiteTask['status'],
    priority: row.priority as SiteTask['priority'],
    assignedWorkerId: row.assigned_worker_id
      ? String(row.assigned_worker_id)
      : undefined,
    dueDate: row.due_date ? String(row.due_date) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    reviewNote: row.review_note ? String(row.review_note) : undefined,
    revisionCount: Number(row.revision_count ?? 0),
    clientVisible: Boolean(row.client_visible ?? false),
    sourceChecklistId: row.source_checklist_id
      ? String(row.source_checklist_id)
      : undefined,
    sourceChecklistItemKey: row.source_checklist_item_key
      ? String(row.source_checklist_item_key)
      : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function taskEventFromRow(row: Record<string, unknown>): SiteTaskEvent {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    taskId: String(row.task_id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
    actorWorkerId: row.actor_worker_id
      ? String(row.actor_worker_id)
      : undefined,
    eventType: row.event_type as SiteTaskEvent['eventType'],
    body: row.body ? String(row.body) : undefined,
    metadata: (row.metadata ?? {}) as SiteTaskEvent['metadata'],
    syncStatus: 'synced',
    createdAt: String(row.created_at),
  };
}

export async function pickProjectPlan(
  ownerId: string,
  projectId: string,
  previous?: ProjectPlan,
): Promise<ProjectPlan | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return undefined;
  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? '';
  if (!isSupportedPlanMimeType(mimeType)) throw new Error('PLAN_FILE_UNSUPPORTED');
  if (!asset.size || asset.size > MAX_PLAN_FILE_SIZE)
    throw new Error('PLAN_FILE_TOO_LARGE');
  if (!FileSystem.documentDirectory) throw new Error('PLAN_STORAGE_UNAVAILABLE');

  const id = createId('plan');
  const directory = `${FileSystem.documentDirectory}plans`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const localUri = `${directory}/${id}.${extensionFor(mimeType)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: localUri });
  const at = nowIso();
  return {
    id,
    ownerId,
    projectId,
    name:
      previous?.name ||
      asset.name.replace(/\.[^.]+$/, '').trim() ||
      'Plán objektu',
    localUri,
    fileSize: asset.size,
    mimeType,
    pageCount: 1,
    seriesId: previous ? previous.seriesId ?? previous.id : id,
    versionNumber: (previous?.versionNumber ?? 0) + 1,
    supersedesPlanId: previous?.id,
    isCurrent: true,
    uploadStatus: 'pending',
    createdAt: at,
    updatedAt: at,
  };
}

export async function uploadProjectPlan(plan: ProjectPlan): Promise<ProjectPlan> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const bytes = await readLocalFile(plan.localUri, 'PLAN_FILE_READ_FAILED');
  const storagePath = `${plan.ownerId}/${plan.projectId}/${plan.id}.${extensionFor(plan.mimeType)}`;
  const upload = await supabase.storage.from('plans').upload(storagePath, bytes, {
    contentType: plan.mimeType,
    upsert: true,
  });
  if (upload.error) throw upload.error;
  const { data, error } = await supabase.rpc('save_project_plan_version', {
    p_id: plan.id,
    p_project_id: plan.projectId,
    p_name: plan.name,
    p_local_uri: plan.localUri,
    p_storage_path: storagePath,
    p_file_size: plan.fileSize,
    p_mime_type: plan.mimeType,
    p_page_count: plan.pageCount,
    p_series_id: plan.seriesId ?? plan.id,
    p_version_number: plan.versionNumber ?? 1,
    p_supersedes_plan_id: plan.supersedesPlanId ?? null,
  });
  if (error) throw error;
  const saved =
    Array.isArray(data) && data[0]
      ? (data[0] as Record<string, unknown>)
      : (data as Record<string, unknown>);
  return { ...planFromRow(saved), localUri: plan.localUri, storagePath };
}

export async function upsertSiteTask(task: SiteTask): Promise<string> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase
    .from('site_tasks')
    .upsert({
      id: task.id,
      owner_id: task.ownerId,
      project_id: task.projectId,
      plan_id: task.planId ?? null,
      page_number: task.pageNumber ?? null,
      x_ratio: task.xRatio ?? null,
      y_ratio: task.yRatio ?? null,
      title: task.title.trim(),
      description: task.description?.trim() || null,
      kind: task.kind,
      status: task.status,
      priority: task.priority,
      assigned_worker_id: task.assignedWorkerId ?? null,
      due_date: task.dueDate ?? null,
      completed_at: task.completedAt ?? null,
      client_visible: task.clientVisible ?? false,
      source_checklist_id: task.sourceChecklistId ?? null,
      source_checklist_item_key: task.sourceChecklistItemKey ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function insertSiteTaskComment(
  event: SiteTaskEvent,
): Promise<string> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  if (event.eventType !== 'comment') throw new Error('INVALID_TASK_EVENT');
  const { error } = await supabase.from('site_task_events').upsert(
    {
      id: event.id,
      owner_id: event.ownerId,
      project_id: event.projectId,
      task_id: event.taskId,
      actor_user_id: event.actorUserId ?? null,
      actor_worker_id: event.actorWorkerId ?? null,
      event_type: 'comment',
      body: event.body?.trim(),
      metadata: {},
      created_at: event.createdAt,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
  return event.id;
}

export async function reviewSiteTask(
  taskId: string,
  decision: 'accept' | 'rework',
  note?: string,
): Promise<SiteTask> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('review_site_task', {
    p_task_id: taskId,
    p_decision: decision,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const row =
    Array.isArray(data) && data[0]
      ? (data[0] as Record<string, unknown>)
      : (data as Record<string, unknown>);
  return taskFromRow(row);
}

export async function setSiteTaskClientVisibility(
  taskId: string,
  visible: boolean,
): Promise<SiteTask> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(
    'set_site_task_client_visibility',
    {
      p_task_id: taskId,
      p_visible: visible,
    },
  );
  if (error) throw error;
  const row =
    Array.isArray(data) && data[0]
      ? (data[0] as Record<string, unknown>)
      : (data as Record<string, unknown>);
  return taskFromRow(row);
}

export async function listProjectPlansAndTasks(projectId: string): Promise<{
  plans: ProjectPlan[];
  tasks: SiteTask[];
  events: SiteTaskEvent[];
}> {
  const client = supabase;
  if (!client) return { plans: [], tasks: [], events: [] };
  const [plansResult, tasksResult, eventsResult] = await Promise.all([
    client
      .from('project_plans')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    client
      .from('site_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    client
      .from('site_task_events')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (eventsResult.error) throw eventsResult.error;
  const plans = await Promise.all(
    (plansResult.data ?? []).map(async row => {
      const plan = planFromRow(row);
      if (!plan.storagePath) return plan;
      const { data, error } = await client.storage
        .from('plans')
        .createSignedUrl(plan.storagePath, 60 * 60);
      if (error) return plan;
      return {
        ...plan,
        localUri: await cacheRemotePlan(plan, data.signedUrl),
      };
    }),
  );
  return {
    plans,
    tasks: (tasksResult.data ?? []).map(taskFromRow),
    events: (eventsResult.data ?? []).map(taskEventFromRow),
  };
}
