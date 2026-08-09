import {
  calculateTaskMaterialReadiness,
  type TaskMaterialReadiness,
} from "./materialReservations";
import type { MaterialStockRow } from "./materialStock";
import { workerAdmissionSummary } from "./workerCredentials";
import {
  calculateTaskToolReadiness,
  type TaskToolReadiness,
} from "./toolReservations";
import type {
  ProjectTool,
  ProjectWorker,
  SafetyBriefing,
  SafetyBriefingRecipient,
  SiteTask,
  TaskMaterialRequirement,
  TaskToolRequirement,
  WorkerCredential,
} from "./types";

export type TomorrowPlanRisk =
  | "task_blocked"
  | "worker_missing"
  | "worker_inactive"
  | "credential_invalid"
  | "materials_unplanned"
  | "materials_shortage"
  | "tools_unplanned"
  | "tools_shortage"
  | "safety_unplanned";

export interface TomorrowTaskPlan {
  task: SiteTask;
  worker?: ProjectWorker;
  material: TaskMaterialReadiness;
  tool: TaskToolReadiness;
  briefingPrepared: boolean;
  risks: TomorrowPlanRisk[];
  readiness: "ready" | "watch" | "blocked";
}

export interface TomorrowPlan {
  planDate: string;
  tasks: TomorrowTaskPlan[];
  readyCount: number;
  watchCount: number;
  blockedCount: number;
  unscheduledTaskCount: number;
  plannedWorkerCount: number;
  availableWorkerCount: number;
  availableToolCount: number;
  unavailableToolCount: number;
  briefingCount: number;
  pendingBriefingAcknowledgementCount: number;
}

export function nextPlanningDate(today: string): string {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const priorityRank: Record<SiteTask["priority"], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};
const taskOrder = (left: SiteTask, right: SiteTask) =>
  (left.status === "blocked" ? -1 : 0) -
    (right.status === "blocked" ? -1 : 0) ||
  (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31") ||
  priorityRank[left.priority] - priorityRank[right.priority] ||
  left.createdAt.localeCompare(right.createdAt);

export function buildTomorrowPlan(input: {
  projectId: string;
  today: string;
  tasks: SiteTask[];
  workers: ProjectWorker[];
  credentials: WorkerCredential[];
  requirements: TaskMaterialRequirement[];
  toolRequirements: TaskToolRequirement[];
  stock: MaterialStockRow[];
  tools: ProjectTool[];
  safetyBriefings: SafetyBriefing[];
  safetyRecipients: SafetyBriefingRecipient[];
}): TomorrowPlan {
  const planDate = nextPlanningDate(input.today);
  const projectTasks = input.tasks.filter(
    (item) => item.projectId === input.projectId && item.status !== "done",
  );
  const candidates = projectTasks
    .filter(
      (item) =>
        item.status !== "review" &&
        (item.status === "in_progress" ||
          item.status === "blocked" ||
          (!!item.dueDate && item.dueDate <= planDate)),
    )
    .sort(taskOrder);
  const activeWorkers = input.workers.filter(
    (item) => item.projectId === input.projectId && item.status === "active",
  );
  const workers = new Map(
    input.workers
      .filter((item) => item.projectId === input.projectId)
      .map((item) => [item.id, item]),
  );
  const materials = new Map(
    calculateTaskMaterialReadiness(
      projectTasks,
      input.requirements,
      input.stock,
    ).map((item) => [item.taskId, item]),
  );
  const toolReadiness = new Map(
    calculateTaskToolReadiness(
      projectTasks,
      input.toolRequirements,
      input.tools,
    ).map((item) => [item.taskId, item]),
  );
  const briefings = input.safetyBriefings.filter(
    (item) =>
      item.projectId === input.projectId &&
      item.briefingDate === planDate &&
      item.status === "published",
  );
  const briefingIds = new Set(briefings.map((item) => item.id));
  const relevantRecipients = input.safetyRecipients.filter((item) =>
    briefingIds.has(item.briefingId),
  );
  const tasks = candidates.map((task): TomorrowTaskPlan => {
    const worker = task.assignedWorkerId
      ? workers.get(task.assignedWorkerId)
      : undefined;
    const material = materials.get(task.id) ?? {
      taskId: task.id,
      allocations: [],
      requiredCount: 0,
      shortageCount: 0,
      ready: false,
    };
    const tool = toolReadiness.get(task.id) ?? {
      taskId: task.id,
      allocations: [],
      requiredCount: 0,
      shortageCount: 0,
      ready: false,
    };
    const risks: TomorrowPlanRisk[] = [];
    if (task.status === "blocked") risks.push("task_blocked");
    if (!task.assignedWorkerId) risks.push("worker_missing");
    else if (!worker || worker.status !== "active")
      risks.push("worker_inactive");
    else if (
      !workerAdmissionSummary(worker, input.credentials, planDate).admitted
    )
      risks.push("credential_invalid");
    if (!material.requiredCount) risks.push("materials_unplanned");
    else if (material.shortageCount) risks.push("materials_shortage");
    if (!tool.requiredCount) risks.push("tools_unplanned");
    else if (tool.shortageCount) risks.push("tools_shortage");
    const briefingPrepared =
      !!worker &&
      relevantRecipients.some((item) => item.workerId === worker.id);
    if (worker && !briefingPrepared) risks.push("safety_unplanned");
    const blocking = risks.some((risk) =>
      [
        "task_blocked",
        "worker_missing",
        "worker_inactive",
        "credential_invalid",
        "materials_shortage",
        "tools_shortage",
      ].includes(risk),
    );
    return {
      task,
      worker,
      material,
      tool,
      briefingPrepared,
      risks,
      readiness: blocking ? "blocked" : risks.length ? "watch" : "ready",
    };
  });
  const plannedWorkerIds = new Set(
    tasks.flatMap((item) =>
      item.worker?.status === "active" ? [item.worker.id] : [],
    ),
  );
  const projectTools = input.tools.filter(
    (item) => item.projectId === input.projectId && item.status !== "retired",
  );
  return {
    planDate,
    tasks,
    readyCount: tasks.filter((item) => item.readiness === "ready").length,
    watchCount: tasks.filter((item) => item.readiness === "watch").length,
    blockedCount: tasks.filter((item) => item.readiness === "blocked").length,
    unscheduledTaskCount: projectTasks.filter(
      (item) => item.status === "open" && !item.dueDate,
    ).length,
    plannedWorkerCount: plannedWorkerIds.size,
    availableWorkerCount: Math.max(
      0,
      activeWorkers.length - plannedWorkerIds.size,
    ),
    availableToolCount: projectTools.filter(
      (item) => item.status === "available",
    ).length,
    unavailableToolCount: projectTools.filter(
      (item) => item.status === "maintenance" || item.status === "lost",
    ).length,
    briefingCount: briefings.length,
    pendingBriefingAcknowledgementCount: relevantRecipients.filter(
      (item) => item.status === "pending",
    ).length,
  };
}
