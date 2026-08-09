import type {
  MaterialDelivery,
  MaterialDeliveryEvent,
  MaterialDeliveryLine,
} from "@/domain/types";
import {
  deliveryHasDiscrepancy,
  type DeliveryInputLine,
} from "@/domain/materialDeliveries";
import { supabase } from "./supabase";
const row = (value: unknown): Record<string, unknown> => {
  const x = Array.isArray(value) ? value[0] : value;
  if (!x || typeof x !== "object")
    throw new Error("INVALID_MATERIAL_DELIVERY_RESPONSE");
  return x as Record<string, unknown>;
};
const delivery = (x: Record<string, unknown>): MaterialDelivery => ({
  id: String(x.id),
  ownerId: String(x.owner_id),
  projectId: String(x.project_id),
  requestId: String(x.request_id),
  quoteId: x.quote_id ? String(x.quote_id) : undefined,
  supplierName: String(x.supplier_name),
  deliveryNoteNumber: x.delivery_note_number
    ? String(x.delivery_note_number)
    : undefined,
  deliveredAt: String(x.delivered_at),
  receiverWorkerId: x.receiver_worker_id
    ? String(x.receiver_worker_id)
    : undefined,
  receiverName: String(x.receiver_name),
  note: x.note ? String(x.note) : undefined,
  attachmentId: x.attachment_id ? String(x.attachment_id) : undefined,
  status: x.status as MaterialDelivery["status"],
  reviewedAt: x.reviewed_at ? String(x.reviewed_at) : undefined,
  reviewedBy: x.reviewed_by ? String(x.reviewed_by) : undefined,
  resolution: x.resolution ? String(x.resolution) : undefined,
  resolvedAt: x.resolved_at ? String(x.resolved_at) : undefined,
  resolvedBy: x.resolved_by ? String(x.resolved_by) : undefined,
  syncStatus: "synced",
  createdAt: String(x.created_at),
  updatedAt: String(x.updated_at),
});
const line = (x: Record<string, unknown>): MaterialDeliveryLine => ({
  id: String(x.id),
  ownerId: String(x.owner_id),
  projectId: String(x.project_id),
  deliveryId: String(x.delivery_id),
  requestItemId: String(x.request_item_id),
  itemName: String(x.item_name),
  unit: String(x.unit),
  expectedQuantity: Number(x.expected_quantity),
  deliveredQuantity: Number(x.delivered_quantity),
  damagedQuantity: Number(x.damaged_quantity),
  createdAt: String(x.created_at),
});
const event = (x: Record<string, unknown>): MaterialDeliveryEvent => ({
  id: String(x.id),
  ownerId: String(x.owner_id),
  projectId: String(x.project_id),
  deliveryId: String(x.delivery_id),
  eventType: x.event_type as MaterialDeliveryEvent["eventType"],
  body: x.body ? String(x.body) : undefined,
  metadata: (x.metadata ?? {}) as MaterialDeliveryEvent["metadata"],
  actorUserId: x.actor_user_id ? String(x.actor_user_id) : undefined,
  actorWorkerId: x.actor_worker_id ? String(x.actor_worker_id) : undefined,
  createdAt: String(x.created_at),
});
export async function listProjectMaterialDeliveries(
  projectId: string,
): Promise<{
  deliveries: MaterialDelivery[];
  lines: MaterialDeliveryLine[];
  events: MaterialDeliveryEvent[];
}> {
  if (!supabase) return { deliveries: [], lines: [], events: [] };
  const [a, b, c] = await Promise.all([
    supabase
      .from("material_deliveries")
      .select("*")
      .eq("project_id", projectId)
      .order("delivered_at", { ascending: false }),
    supabase
      .from("material_delivery_lines")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
    supabase
      .from("material_delivery_events")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  if (c.error) throw c.error;
  return {
    deliveries: (a.data ?? []).map((x) =>
      delivery(x as Record<string, unknown>),
    ),
    lines: (b.data ?? []).map((x) => line(x as Record<string, unknown>)),
    events: (c.data ?? []).map((x) => event(x as Record<string, unknown>)),
  };
}
export async function saveRemoteMaterialDelivery(
  item: MaterialDelivery,
  lines: DeliveryInputLine[],
): Promise<MaterialDelivery> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("save_material_delivery", {
    p_id: item.id,
    p_request_id: item.requestId,
    p_supplier_name: item.supplierName,
    p_delivery_note_number: item.deliveryNoteNumber ?? null,
    p_delivered_at: item.deliveredAt,
    p_receiver_worker_id: item.receiverWorkerId ?? null,
    p_receiver_name: item.receiverName,
    p_note: item.note ?? null,
    p_attachment_id: item.attachmentId ?? null,
    p_lines: lines,
    p_confirmed: true,
  });
  if (error) throw error;
  return delivery(row(data));
}
export async function reviewRemoteMaterialDelivery(
  id: string,
  lines: DeliveryInputLine[],
): Promise<MaterialDelivery> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("review_material_delivery", {
    p_delivery_id: id,
    p_decision: deliveryHasDiscrepancy(lines) ? "discrepancy" : "accepted",
    p_confirmed: true,
  });
  if (error) throw error;
  return delivery(row(data));
}
export async function resolveRemoteMaterialDelivery(
  id: string,
  resolution: string,
): Promise<MaterialDelivery> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("resolve_material_delivery", {
    p_delivery_id: id,
    p_resolution: resolution,
    p_confirmed: true,
  });
  if (error) throw error;
  return delivery(row(data));
}
