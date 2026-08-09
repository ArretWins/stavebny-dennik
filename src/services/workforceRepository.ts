import type { AppNotification, MaterialRequest, MaterialRequestItem, MaterialRequestStatus, MaterialSupplierQuote, ProjectWorker, ReceiptRequestLink, WorkerStatus } from '@/domain/types';
import { supabase } from './supabase';
import { listProjectSupplierQuotes } from './procurementRepository';

function workerFromRow(row: Record<string, unknown>): ProjectWorker {
  return {
    id: String(row.id), ownerId: String(row.owner_id), projectId: String(row.project_id), authUserId: row.auth_user_id ? String(row.auth_user_id) : undefined,
    firstName: String(row.first_name), lastName: String(row.last_name), position: String(row.position), status: row.status as WorkerStatus,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined, reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function requestFromRow(row: Record<string, unknown>): MaterialRequest {
  return {
    id: String(row.id), ownerId: String(row.owner_id), projectId: String(row.project_id), workerId: String(row.worker_id),
    desiredDate: row.desired_date ? String(row.desired_date) : undefined, comment: row.comment ? String(row.comment) : undefined,
    status: row.status as MaterialRequestStatus, rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function createProjectWorkerInvite(projectId: string): Promise<{ token: string; expiresAt: string }> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('create_worker_invite', { p_project_id: projectId });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('INVALID_INVITE_RESPONSE');
  return { token: data, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
}

export async function listProjectWorkforce(projectId: string): Promise<{ workers: ProjectWorker[]; requests: MaterialRequest[]; items: MaterialRequestItem[]; links: ReceiptRequestLink[]; quotes: MaterialSupplierQuote[] }> {
  if (!supabase) return { workers: [], requests: [], items: [], links: [], quotes: [] };
  const [workerResult, requestResult, quotes] = await Promise.all([
    supabase.from('project_workers').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('material_requests').select('*, material_request_items(*), receipt_request_links(*)').eq('project_id', projectId).order('created_at', { ascending: false }),
    listProjectSupplierQuotes(projectId),
  ]);
  if (workerResult.error) throw workerResult.error;
  if (requestResult.error) throw requestResult.error;
  const requests = (requestResult.data ?? []).map(requestFromRow);
  const items: MaterialRequestItem[] = (requestResult.data ?? []).flatMap(row => (row.material_request_items ?? []).map((item: Record<string, unknown>) => ({ id: String(item.id), requestId: String(item.request_id), name: String(item.name), quantity: Number(item.quantity), unit: String(item.unit), createdAt: String(item.created_at) })));
  const links: ReceiptRequestLink[] = (requestResult.data ?? []).flatMap(row => (row.receipt_request_links ?? []).map((link: Record<string, unknown>) => ({ id: String(link.id), ownerId: String(link.owner_id), receiptId: String(link.receipt_id), requestId: String(link.request_id), allocatedAmountCents: link.allocated_amount_cents === null || link.allocated_amount_cents === undefined ? undefined : Number(link.allocated_amount_cents), createdAt: String(link.created_at) })));
  return { workers: (workerResult.data ?? []).map(workerFromRow), requests, items, links, quotes };
}

export async function setProjectWorkerStatus(workerId: string, status: Exclude<WorkerStatus, 'pending'>, reviewerId: string): Promise<ProjectWorker> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.from('project_workers').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId }).eq('id', workerId).select('*').single();
  if (error) throw error;
  return workerFromRow(data);
}

export async function setMaterialRequestStatus(requestId: string, status: Exclude<MaterialRequestStatus, 'new'>, rejectionReason?: string): Promise<MaterialRequest> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.from('material_requests').update({ status, rejection_reason: status === 'rejected' ? rejectionReason?.trim() || null : null }).eq('id', requestId).select('*').single();
  if (error) throw error;
  return requestFromRow(data);
}

export async function linkReceiptToRequest(input: { ownerId: string; receiptId: string; requestId: string; allocatedAmountCents?: number }): Promise<ReceiptRequestLink> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.from('receipt_request_links').upsert({ owner_id: input.ownerId, receipt_id: input.receiptId, request_id: input.requestId, allocated_amount_cents: input.allocatedAmountCents ?? null }, { onConflict: 'receipt_id,request_id' }).select('*').single();
  if (error) throw error;
  return { id: String(data.id), ownerId: String(data.owner_id), receiptId: String(data.receipt_id), requestId: String(data.request_id), allocatedAmountCents: data.allocated_amount_cents === null ? undefined : Number(data.allocated_amount_cents), createdAt: String(data.created_at) };
}

export async function unlinkReceiptFromRequest(receiptId: string, requestId: string): Promise<void> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { error } = await supabase.from('receipt_request_links').delete().eq('receipt_id', receiptId).eq('request_id', requestId);
  if (error) throw error;
}

export async function listNotifications(): Promise<AppNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map(row => ({ id: String(row.id), type: row.notification_type as AppNotification['type'], title: String(row.title), body: String(row.body), data: (row.data ?? {}) as Record<string, unknown>, readAt: row.read_at ? String(row.read_at) : undefined, createdAt: String(row.created_at) }));
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
