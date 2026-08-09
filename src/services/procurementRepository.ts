import type { MaterialSupplierQuote } from '@/domain/types';
import { supabase } from './supabase';

export interface CreatedSupplierQuoteInvite {
  id: string;
  requestId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  url: string;
}

function fromRow(row: Record<string, unknown>): MaterialSupplierQuote {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    requestId: String(row.request_id),
    supplierName: String(row.supplier_name),
    totalAmountCents: Number(row.total_amount_cents),
    currency: 'EUR',
    deliveryDate: row.delivery_date ? String(row.delivery_date) : undefined,
    validUntil: row.valid_until ? String(row.valid_until) : undefined,
    note: row.note ? String(row.note) : undefined,
    status: row.status as MaterialSupplierQuote['status'],
    selectedAt: row.selected_at ? String(row.selected_at) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function resultRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object')
    throw new Error('INVALID_SUPPLIER_QUOTE_RESPONSE');
  return row as Record<string, unknown>;
}

export async function listProjectSupplierQuotes(
  projectId: string,
): Promise<MaterialSupplierQuote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('material_supplier_quotes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => fromRow(row as Record<string, unknown>));
}

export async function saveRemoteSupplierQuote(
  quote: MaterialSupplierQuote,
): Promise<MaterialSupplierQuote> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_material_supplier_quote', {
    p_id: quote.id,
    p_request_id: quote.requestId,
    p_supplier_name: quote.supplierName,
    p_total_amount_cents: quote.totalAmountCents,
    p_delivery_date: quote.deliveryDate ?? null,
    p_valid_until: quote.validUntil ?? null,
    p_note: quote.note?.trim() || null,
  });
  if (error) throw error;
  return fromRow(resultRow(data));
}

export async function selectRemoteSupplierQuote(
  quoteId: string,
): Promise<MaterialSupplierQuote> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('select_material_supplier_quote', {
    p_quote_id: quoteId,
  });
  if (error) throw error;
  return fromRow(resultRow(data));
}

export async function withdrawRemoteSupplierQuote(
  quoteId: string,
): Promise<MaterialSupplierQuote> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(
    'withdraw_material_supplier_quote',
    { p_quote_id: quoteId },
  );
  if (error) throw error;
  return fromRow(resultRow(data));
}

export async function createSupplierQuoteInvite(
  requestId: string,
  expiresHours = 72,
): Promise<CreatedSupplierQuoteInvite> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc(
    'create_material_supplier_quote_invite',
    {
      p_request_id: requestId,
      p_expires_hours: expiresHours,
    },
  );
  if (error) throw error;
  const row = resultRow(data);
  const token = String(row.token);
  const workerPortal = process.env.EXPO_PUBLIC_WORKER_PORTAL_URL?.replace(
    /\/+$/,
    '',
  );
  const base =
    process.env.EXPO_PUBLIC_SUPPLIER_QUOTE_URL ||
    (workerPortal
      ? `${workerPortal}/supplier-quote`
      : `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/supplier-quote`);
  return {
    id: String(row.id),
    requestId: String(row.requestId),
    token,
    expiresAt: String(row.expiresAt),
    createdAt: String(row.createdAt),
    url: `${base}?token=${encodeURIComponent(token)}`,
  };
}

export async function revokeSupplierQuoteInvite(
  inviteId: string,
): Promise<void> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { error } = await supabase.rpc(
    'revoke_material_supplier_quote_invite',
    { p_invite_id: inviteId },
  );
  if (error) throw error;
}
