import type { ProjectTool, SiteTask, TaskToolRequirement } from "./types";

export type TaskToolShortageReason =
  "missing" | "unavailable" | "wrong_worker" | "reserved_elsewhere";
export interface TaskToolAllocation extends TaskToolRequirement {
  available: boolean;
  shortageReason?: TaskToolShortageReason;
  reservedByTaskId?: string;
}
export interface TaskToolReadiness {
  taskId: string;
  allocations: TaskToolAllocation[];
  requiredCount: number;
  shortageCount: number;
  ready: boolean;
}

const rank: Record<SiteTask["priority"], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
const order = (left: SiteTask, right: SiteTask) =>
  (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31") ||
  rank[left.priority] - rank[right.priority] ||
  left.createdAt.localeCompare(right.createdAt);

export function validateTaskToolRequirements(
  items: Pick<TaskToolRequirement, "toolId">[],
): "ok" | "invalid" {
  if (items.length > 100) return "invalid";
  const ids = new Set<string>();
  for (const item of items) {
    const id = item.toolId.trim();
    if (!id || ids.has(id)) return "invalid";
    ids.add(id);
  }
  return "ok";
}

export function calculateTaskToolReadiness(
  tasks: SiteTask[],
  requirements: TaskToolRequirement[],
  tools: ProjectTool[],
): TaskToolReadiness[] {
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));
  const consumed = new Map<string, string>();
  return tasks
    .filter((task) => task.status !== "done")
    .sort(order)
    .map((task) => {
      const allocations = requirements
        .filter((item) => item.taskId === task.id)
        .map((item): TaskToolAllocation => {
          const tool = toolMap.get(item.toolId);
          const reservedByTaskId = consumed.get(item.toolId);
          let shortageReason: TaskToolShortageReason | undefined;
          if (!tool) shortageReason = "missing";
          else if (reservedByTaskId) shortageReason = "reserved_elsewhere";
          else if (
            tool.status === "issued" &&
            tool.currentWorkerId !== task.assignedWorkerId
          )
            shortageReason = "wrong_worker";
          else if (tool.status !== "available" && tool.status !== "issued")
            shortageReason = "unavailable";
          if (!shortageReason) consumed.set(item.toolId, task.id);
          return {
            ...item,
            available: !shortageReason,
            shortageReason,
            reservedByTaskId,
          };
        });
      const shortageCount = allocations.filter(
        (item) => !item.available,
      ).length;
      return {
        taskId: task.id,
        allocations,
        requiredCount: allocations.length,
        shortageCount,
        ready: allocations.length > 0 && shortageCount === 0,
      };
    });
}
