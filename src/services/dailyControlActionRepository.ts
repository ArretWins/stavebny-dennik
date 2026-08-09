import type { DailyControlAction } from '@/domain/types';
import { supabase } from './supabase';

function fromRow(row: Record<string, unknown>): DailyControlAction {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    actionDate: String(row.action_date),
    issue: String(row.issue),
    severity: row.severity as DailyControlAction['severity'],
    target: String(row.target),
    count:
      row.item_count === null || row.item_count === undefined
        ? undefined
        : Number(row.item_count),
    amountCents:
      row.amount_cents === null || row.amount_cents === undefined
        ? undefined
        : Number(row.amount_cents),
    status: row.status as DailyControlAction['status'],
    resolution: row.resolution ? String(row.resolution) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveRemoteDailyControlAction(
  action: DailyControlAction,
): Promise<DailyControlAction> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_daily_control_action', {
    p_id: action.id,
    p_project_id: action.projectId,
    p_action_date: action.actionDate,
    p_issue: action.issue,
    p_severity: action.severity,
    p_target: action.target,
    p_item_count: action.count ?? null,
    p_amount_cents: action.amountCents ?? null,
    p_resolution: action.resolution ?? null,
    p_resolve: action.status === 'resolved',
    p_confirmed: action.status === 'resolved',
  });
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function listDailyControlActions(
  projectId: string,
): Promise<DailyControlAction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('daily_control_actions')
    .select('*')
    .eq('project_id', projectId)
    .order('action_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(180);
  if (error) throw error;
  return (data ?? []).map(row => fromRow(row as Record<string, unknown>));
}
