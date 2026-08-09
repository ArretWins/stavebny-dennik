import type { ProjectTool, ProjectToolEvent } from '@/domain/types';
import { supabase } from './supabase';

function resultRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') throw new Error('INVALID_TOOL_RESPONSE');
  return row as Record<string, unknown>;
}

function toolFromRow(row: Record<string, unknown>): ProjectTool {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    assetNumber: Number(row.asset_number),
    name: String(row.name),
    category: String(row.category),
    manufacturer: row.manufacturer ? String(row.manufacturer) : undefined,
    model: row.model ? String(row.model) : undefined,
    serialNumber: row.serial_number ? String(row.serial_number) : undefined,
    note: row.note ? String(row.note) : undefined,
    status: row.status as ProjectTool['status'],
    currentWorkerId: row.current_worker_id
      ? String(row.current_worker_id)
      : undefined,
    issuedAt: row.issued_at ? String(row.issued_at) : undefined,
    expectedReturnDate: row.expected_return_date
      ? String(row.expected_return_date)
      : undefined,
    retiredAt: row.retired_at ? String(row.retired_at) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function eventFromRow(row: Record<string, unknown>): ProjectToolEvent {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    toolId: String(row.tool_id),
    eventType: row.event_type as ProjectToolEvent['eventType'],
    workerId: row.worker_id ? String(row.worker_id) : undefined,
    body: row.body ? String(row.body) : undefined,
    metadata: (row.metadata ?? {}) as ProjectToolEvent['metadata'],
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
    createdAt: String(row.created_at),
  };
}

export async function listProjectTools(projectId: string): Promise<{
  tools: ProjectTool[];
  events: ProjectToolEvent[];
}> {
  if (!supabase) return { tools: [], events: [] };
  const [toolResult, eventResult] = await Promise.all([
    supabase
      .from('project_tools')
      .select('*')
      .eq('project_id', projectId)
      .order('asset_number'),
    supabase
      .from('project_tool_events')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ]);
  if (toolResult.error) throw toolResult.error;
  if (eventResult.error) throw eventResult.error;
  return {
    tools: (toolResult.data ?? []).map(row =>
      toolFromRow(row as Record<string, unknown>),
    ),
    events: (eventResult.data ?? []).map(row =>
      eventFromRow(row as Record<string, unknown>),
    ),
  };
}

export async function saveRemoteProjectTool(
  tool: ProjectTool,
): Promise<ProjectTool> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_project_tool', {
    p_id: tool.id,
    p_project_id: tool.projectId,
    p_name: tool.name,
    p_category: tool.category,
    p_manufacturer: tool.manufacturer ?? null,
    p_model: tool.model ?? null,
    p_serial_number: tool.serialNumber ?? null,
    p_note: tool.note ?? null,
  });
  if (error) throw error;
  return toolFromRow(resultRow(data));
}

async function action(
  name: string,
  parameters: Record<string, unknown>,
): Promise<ProjectTool> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return toolFromRow(resultRow(data));
}

export const issueRemoteProjectTool = (
  id: string,
  workerId: string,
  expectedReturnDate?: string,
  note?: string,
) =>
  action('issue_project_tool', {
    p_tool_id: id,
    p_worker_id: workerId,
    p_expected_return_date: expectedReturnDate ?? null,
    p_note: note ?? null,
  });

export const returnRemoteProjectTool = (
  id: string,
  condition: 'serviceable' | 'damaged',
  note?: string,
) =>
  action('return_project_tool', {
    p_tool_id: id,
    p_condition: condition,
    p_note: note ?? null,
  });

export const reportRemoteProjectToolIssue = (
  id: string,
  issueType: 'damaged' | 'lost',
  note: string,
) =>
  action('report_project_tool_issue', {
    p_tool_id: id,
    p_issue_type: issueType,
    p_note: note,
  });

export const restoreRemoteProjectTool = (id: string, note?: string) =>
  action('complete_project_tool_maintenance', {
    p_tool_id: id,
    p_note: note ?? null,
  });

export const retireRemoteProjectTool = (id: string, reason: string) =>
  action('retire_project_tool', {
    p_tool_id: id,
    p_reason: reason,
    p_confirmed: true,
  });
