import type { MaterialStockRow } from "./materialStock";
import type { SiteTask, TaskMaterialRequirement } from "./types";

export interface TaskMaterialAllocation extends TaskMaterialRequirement {
  availableBefore: number;
  allocatedQuantity: number;
  shortageQuantity: number;
}

export interface TaskMaterialReadiness {
  taskId: string;
  allocations: TaskMaterialAllocation[];
  requiredCount: number;
  shortageCount: number;
  ready: boolean;
}

const priorityRank: Record<SiteTask["priority"], number> = {
  urgent: -1,
  high: 0,
  normal: 1,
  low: 2,
};

function compareTasks(left: SiteTask, right: SiteTask): number {
  const leftDue = left.dueDate || "9999-12-31";
  const rightDue = right.dueDate || "9999-12-31";
  return (
    leftDue.localeCompare(rightDue) ||
    priorityRank[left.priority] - priorityRank[right.priority] ||
    left.createdAt.localeCompare(right.createdAt)
  );
}

export function validateTaskMaterialRequirements(
  items: Pick<TaskMaterialRequirement, "requestItemId" | "quantity">[],
): "ok" | "invalid" {
  if (items.length > 100) return "invalid";
  const ids = new Set<string>();
  for (const item of items) {
    const id = item.requestItemId.trim();
    if (
      !id ||
      ids.has(id) ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0
    )
      return "invalid";
    ids.add(id);
  }
  return "ok";
}

export function calculateTaskMaterialReadiness(
  tasks: SiteTask[],
  requirements: TaskMaterialRequirement[],
  stock: MaterialStockRow[],
): TaskMaterialReadiness[] {
  const balances = new Map(
    stock.map((row) => [row.requestItemId, row.balanceQuantity]),
  );
  return tasks
    .filter((task) => task.status !== "done")
    .sort(compareTasks)
    .map((task) => {
      const allocations = requirements
        .filter((item) => item.taskId === task.id)
        .map((item): TaskMaterialAllocation => {
          const availableBefore = Math.max(
            0,
            balances.get(item.requestItemId) ?? 0,
          );
          const allocatedQuantity = Math.min(item.quantity, availableBefore);
          const shortageQuantity = Math.max(
            0,
            item.quantity - allocatedQuantity,
          );
          balances.set(item.requestItemId, availableBefore - allocatedQuantity);
          return {
            ...item,
            availableBefore,
            allocatedQuantity,
            shortageQuantity,
          };
        });
      const shortageCount = allocations.filter(
        (item) => item.shortageQuantity > 0,
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
