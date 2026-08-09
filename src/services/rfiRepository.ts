import type { ProjectRfi, ProjectRfiEvent } from '@/domain/types';
import { supabase } from './supabase';

function resultRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') throw new Error('INVALID_RFI_RESPONSE');
  return row as Record<string, unknown>;
}

function rfiFromRow(row: Record<string, unknown>): ProjectRfi {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    rfiNumber: Number(row.rfi_number),
    subject: String(row.subject),
    question: String(row.question),
    recipientName: String(row.recipient_name),
    dueDate: row.due_date ? String(row.due_date) : undefined,
    planId: row.plan_id ? String(row.plan_id) : undefined,
    pageNumber: row.page_number ? Number(row.page_number) : undefined,
    xRatio: row.x_ratio === null || row.x_ratio === undefined ? undefined : Number(row.x_ratio),
    yRatio: row.y_ratio === null || row.y_ratio === undefined ? undefined : Number(row.y_ratio),
    status: row.status as ProjectRfi['status'],
    answer: row.answer ? String(row.answer) : undefined,
    answeredByName: row.answered_by_name ? String(row.answered_by_name) : undefined,
    openedAt: row.opened_at ? String(row.opened_at) : undefined,
    answeredAt: row.answered_at ? String(row.answered_at) : undefined,
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function eventFromRow(row: Record<string, unknown>): ProjectRfiEvent {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    rfiId: String(row.rfi_id),
    eventType: row.event_type as ProjectRfiEvent['eventType'],
    body: row.body ? String(row.body) : undefined,
    metadata: (row.metadata ?? {}) as ProjectRfiEvent['metadata'],
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
    createdAt: String(row.created_at),
  };
}

export async function listProjectRfis(projectId: string): Promise<{
  rfis: ProjectRfi[];
  events: ProjectRfiEvent[];
}> {
  if (!supabase) return { rfis: [], events: [] };
  const [rfiResult, eventResult] = await Promise.all([
    supabase.from('project_rfis').select('*').eq('project_id', projectId)
      .order('rfi_number', { ascending: false }),
    supabase.from('project_rfi_events').select('*').eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ]);
  if (rfiResult.error) throw rfiResult.error;
  if (eventResult.error) throw eventResult.error;
  return {
    rfis: (rfiResult.data ?? []).map(row => rfiFromRow(row as Record<string, unknown>)),
    events: (eventResult.data ?? []).map(row => eventFromRow(row as Record<string, unknown>)),
  };
}

export async function saveRemoteProjectRfi(rfi: ProjectRfi): Promise<ProjectRfi> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_project_rfi', {
    p_id: rfi.id,
    p_project_id: rfi.projectId,
    p_subject: rfi.subject,
    p_question: rfi.question,
    p_recipient_name: rfi.recipientName,
    p_due_date: rfi.dueDate ?? null,
    p_plan_id: rfi.planId ?? null,
    p_page_number: rfi.pageNumber ?? null,
    p_x_ratio: rfi.xRatio ?? null,
    p_y_ratio: rfi.yRatio ?? null,
  });
  if (error) throw error;
  return rfiFromRow(resultRow(data));
}

async function action(name: string, parameters: Record<string, unknown>): Promise<ProjectRfi> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return rfiFromRow(resultRow(data));
}

export const openRemoteProjectRfi = (id: string) =>
  action('open_project_rfi', { p_rfi_id: id, p_confirmed: true });
export const answerRemoteProjectRfi = (id: string, answer: string, answeredByName: string) =>
  action('answer_project_rfi', {
    p_rfi_id: id, p_answer: answer, p_answered_by_name: answeredByName,
  });
export const closeRemoteProjectRfi = (id: string) =>
  action('close_project_rfi', { p_rfi_id: id, p_confirmed: true });
export const reopenRemoteProjectRfi = (id: string, reason: string) =>
  action('reopen_project_rfi', { p_rfi_id: id, p_reason: reason });
