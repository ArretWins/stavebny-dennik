import type {
  MaterialStockMovement,
  MaterialStockMovementEvent,
} from "@/domain/types";
import { supabase } from "./supabase";

const record = (value: unknown): Record<string, unknown> => {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object")
    throw new Error("INVALID_MATERIAL_STOCK_RESPONSE");
  return item as Record<string, unknown>;
};
const movement = (x: Record<string, unknown>): MaterialStockMovement => ({
  id: String(x.id),
  ownerId: String(x.owner_id),
  projectId: String(x.project_id),
  requestId: String(x.request_id),
  requestItemId: String(x.request_item_id),
  materialName: String(x.material_name),
  unit: String(x.unit),
  movementType: x.movement_type as MaterialStockMovement["movementType"],
  quantity: Number(x.quantity),
  occurredAt: String(x.occurred_at),
  workerId: x.worker_id ? String(x.worker_id) : undefined,
  workerName: x.worker_name ? String(x.worker_name) : undefined,
  note: x.note ? String(x.note) : undefined,
  status: x.status as MaterialStockMovement["status"],
  reviewedAt: x.reviewed_at ? String(x.reviewed_at) : undefined,
  reviewedBy: x.reviewed_by ? String(x.reviewed_by) : undefined,
  rejectionReason: x.rejection_reason ? String(x.rejection_reason) : undefined,
  syncStatus: "synced",
  createdAt: String(x.created_at),
});
const event = (x: Record<string, unknown>): MaterialStockMovementEvent => ({
  id: String(x.id),
  ownerId: String(x.owner_id),
  projectId: String(x.project_id),
  movementId: String(x.movement_id),
  eventType: x.event_type as MaterialStockMovementEvent["eventType"],
  body: x.body ? String(x.body) : undefined,
  actorUserId: x.actor_user_id ? String(x.actor_user_id) : undefined,
  actorWorkerId: x.actor_worker_id ? String(x.actor_worker_id) : undefined,
  createdAt: String(x.created_at),
});

export async function listProjectMaterialStock(
  projectId: string,
): Promise<{
  movements: MaterialStockMovement[];
  events: MaterialStockMovementEvent[];
}> {
  if (!supabase) return { movements: [], events: [] };
  const [movementsResult, eventsResult] = await Promise.all([
    supabase
      .from("material_stock_movements")
      .select("*")
      .eq("project_id", projectId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("material_stock_movement_events")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
  ]);
  if (movementsResult.error) throw movementsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  return {
    movements: (movementsResult.data ?? []).map((x) =>
      movement(x as Record<string, unknown>),
    ),
    events: (eventsResult.data ?? []).map((x) =>
      event(x as Record<string, unknown>),
    ),
  };
}

export async function saveRemoteMaterialStockMovement(
  item: MaterialStockMovement,
): Promise<MaterialStockMovement> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("save_material_stock_movement", {
    p_id: item.id,
    p_request_item_id: item.requestItemId,
    p_movement_type: item.movementType,
    p_quantity: item.quantity,
    p_occurred_at: item.occurredAt,
    p_worker_id: item.workerId ?? null,
    p_note: item.note ?? null,
    p_confirmed: true,
  });
  if (error) throw error;
  return movement(record(data));
}

export async function reviewRemoteMaterialStockMovement(
  id: string,
  decision: "confirmed" | "rejected",
  reason?: string,
): Promise<MaterialStockMovement> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("review_material_stock_movement", {
    p_movement_id: id,
    p_decision: decision,
    p_rejection_reason: reason ?? null,
    p_confirmed: true,
  });
  if (error) throw error;
  return movement(record(data));
}
