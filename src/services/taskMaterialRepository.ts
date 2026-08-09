import type { TaskMaterialRequirement } from "@/domain/types";
import { supabase } from "./supabase";

const fromRow = (row: Record<string, unknown>): TaskMaterialRequirement => ({
  id: String(row.id),
  ownerId: String(row.owner_id),
  projectId: String(row.project_id),
  taskId: String(row.task_id),
  requestId: String(row.request_id),
  requestItemId: String(row.request_item_id),
  materialName: String(row.material_name),
  unit: String(row.unit),
  quantity: Number(row.quantity),
  syncStatus: "synced",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export async function listProjectTaskMaterialRequirements(
  projectId: string,
): Promise<TaskMaterialRequirement[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("task_material_requirements")
    .select("*")
    .eq("project_id", projectId)
    .order("material_name");
  if (error) throw error;
  return (data ?? []).map((row) => fromRow(row as Record<string, unknown>));
}

export async function saveRemoteTaskMaterialRequirements(
  taskId: string,
  requirements: Pick<TaskMaterialRequirement, "requestItemId" | "quantity">[],
): Promise<TaskMaterialRequirement[]> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc(
    "save_task_material_requirements",
    {
      p_task_id: taskId,
      p_requirements: requirements.map((item) => ({
        requestItemId: item.requestItemId,
        quantity: item.quantity,
      })),
      p_confirmed: true,
    },
  );
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => fromRow(row));
}
