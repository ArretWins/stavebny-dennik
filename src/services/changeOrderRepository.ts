import type { ChangeOrder } from '@/domain/types';
import { supabase } from './supabase';

function fromRow(row: Record<string, unknown>): ChangeOrder {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    orderNumber:
      row.order_number === null || row.order_number === undefined
        ? undefined
        : Number(row.order_number),
    title: String(row.title),
    description: String(row.description),
    amountCents: Number(row.amount_cents),
    scheduleImpactDays: Number(row.schedule_impact_days),
    relatedTaskId: row.related_task_id
      ? String(row.related_task_id)
      : undefined,
    status: row.status as ChangeOrder['status'],
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    decidedAt: row.decided_at ? String(row.decided_at) : undefined,
    signerName: row.signer_name ? String(row.signer_name) : undefined,
    decisionComment: row.decision_comment
      ? String(row.decision_comment)
      : undefined,
    shareLinkId: row.share_link_id ? String(row.share_link_id) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveRemoteChangeOrder(
  order: ChangeOrder,
): Promise<ChangeOrder> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_change_order', {
    p_id: order.id,
    p_project_id: order.projectId,
    p_title: order.title,
    p_description: order.description,
    p_amount_cents: order.amountCents,
    p_schedule_impact_days: order.scheduleImpactDays,
    p_related_task_id: order.relatedTaskId ?? null,
    p_submit: order.status === 'pending_client',
  });
  if (error) throw error;
  const row =
    Array.isArray(data) && data[0]
      ? (data[0] as Record<string, unknown>)
      : (data as Record<string, unknown>);
  return fromRow(row);
}

export async function listProjectChangeOrders(
  projectId: string,
): Promise<ChangeOrder[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('change_orders')
    .select('*')
    .eq('project_id', projectId)
    .order('order_number', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => fromRow(row as Record<string, unknown>));
}

