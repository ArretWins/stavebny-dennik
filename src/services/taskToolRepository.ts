import type { TaskToolRequirement } from "@/domain/types";
import { supabase } from "./supabase";

const fromRow = (row: Record<string, unknown>): TaskToolRequirement => ({
  id: String(row.id),
  ownerId: String(row.owner_id),
  projectId: String(row.project_id),
  taskId: String(row.task_id),
  toolId: String(row.tool_id),
  assetNumber: Number(row.asset_number),
  toolName: String(row.tool_name),
  category: String(row.category),
  syncStatus: "synced",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});
export async function listProjectTaskToolRequirements(
  projectId: string,
): Promise<TaskToolRequirement[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("task_tool_requirements")
    .select("*")
    .eq("project_id", projectId)
    .order("asset_number");
  if (error) throw error;
  return (data ?? []).map((row) => fromRow(row as Record<string, unknown>));
}
export async function saveRemoteTaskToolRequirements(
  taskId: string,
  toolIds: string[],
): Promise<TaskToolRequirement[]> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("save_task_tool_requirements", {
    p_task_id: taskId,
    p_tool_ids: toolIds,
    p_confirmed: true,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => fromRow(row));
}
