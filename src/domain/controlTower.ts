import type {
  ChangeOrder,
  MaterialRequest,
  ProjectChecklist,
  ProjectRfi,
  ProjectTool,
  ProjectWorker,
  Receipt,
  SiteTask,
  WorkShift,
  SafetyBriefing,
  SafetyBriefingRecipient,
  WorkerCredential,
  SiteIncident,
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialStockMovement,
  TaskMaterialRequirement,
  TaskToolRequirement,
  DiaryApprovalRequest,
} from "./types";
import { calculateMaterialStock } from "./materialStock";
import { calculateTaskMaterialReadiness } from "./materialReservations";
import { calculateTaskToolReadiness } from "./toolReservations";
import { buildTomorrowPlan } from "./tomorrowPlan";
import { workerCredentialHealth } from "./workerCredentials";
import { unresolvedIncidentAgeHours } from "./siteIncidents";
import type { ProjectCostForecast } from "./financialControl";
import type { ScheduleForecast } from "./scheduleForecast";

export type ControlTowerSeverity = "critical" | "high" | "watch" | "clear";
export const CONTROL_TOWER_TARGETS = [
  "sync",
  "financial",
  "schedule",
  "defects",
  "task_reviews",
  "material_requests",
  "workers",
  "receipts",
  "rfis",
  "tools",
  "timesheet",
  "safety_briefings",
  "worker_credentials",
  "site_incidents",
  "material_deliveries",
  "material_stock",
  "task_materials",
  "task_tools",
  "tomorrow_plan",
  "diary_approvals",
  "checklists",
  "change_orders",
] as const;
export type ControlTowerTarget = (typeof CONTROL_TOWER_TARGETS)[number];

export const CONTROL_TOWER_ISSUES = [
  "sync_failed",
  "cost_overrun",
  "reserve_at_risk",
  "financial_setup",
  "schedule_critical",
  "schedule_high",
  "schedule_setup",
  "overdue_material",
  "overdue_rfis",
  "answered_rfis",
  "open_rfis",
  "overdue_tools",
  "lost_tools",
  "tool_maintenance",
  "inactive_tool_custody",
  "long_active_shifts",
  "unapproved_shifts",
  "pending_safety_acknowledgements",
  "expired_worker_credentials",
  "expiring_worker_credentials",
  "missing_worker_credentials",
  "critical_site_incidents",
  "unresolved_site_incidents",
  "delivery_discrepancies",
  "unreviewed_deliveries",
  "negative_material_stock",
  "low_material_stock",
  "pending_stock_reports",
  "task_material_shortages",
  "task_tool_shortages",
  "tomorrow_not_ready",
  "blocked_tasks",
  "task_reviews",
  "new_material_requests",
  "pending_workers",
  "receipt_reviews",
  "draft_checklists",
  "client_changes",
  "diary_changes_requested",
  "pending_diary_approvals",
] as const;
export type ControlTowerIssue = (typeof CONTROL_TOWER_ISSUES)[number];

export interface ControlTowerItem {
  id: ControlTowerIssue;
  severity: Exclude<ControlTowerSeverity, "clear">;
  target: ControlTowerTarget;
  count?: number;
  amountCents?: number;
}

export interface ControlTowerSignal {
  key: "money" | "schedule" | "quality" | "decisions";
  severity: ControlTowerSeverity;
  count?: number;
}

export interface ControlTowerSummary {
  severity: ControlTowerSeverity;
  actionCount: number;
  waitingCount: number;
  actions: ControlTowerItem[];
  waiting: ControlTowerItem[];
  signals: ControlTowerSignal[];
}

const severityRank: Record<ControlTowerSeverity, number> = {
  clear: 0,
  watch: 1,
  high: 2,
  critical: 3,
};

function strongest(values: ControlTowerSeverity[]): ControlTowerSeverity {
  return values.reduce<ControlTowerSeverity>(
    (result, value) =>
      severityRank[value] > severityRank[result] ? value : result,
    "clear",
  );
}

function sortItems(items: ControlTowerItem[]): ControlTowerItem[] {
  return [...items].sort(
    (left, right) =>
      severityRank[right.severity] - severityRank[left.severity] ||
      left.id.localeCompare(right.id),
  );
}

export function projectControlTower(input: {
  projectId: string;
  today: string;
  tasks: SiteTask[];
  materialRequests: MaterialRequest[];
  workers: ProjectWorker[];
  receipts: Receipt[];
  checklists: ProjectChecklist[];
  changeOrders: ChangeOrder[];
  rfis?: ProjectRfi[];
  tools?: ProjectTool[];
  workShifts?: WorkShift[];
  safetyBriefings?: SafetyBriefing[];
  safetyBriefingRecipients?: SafetyBriefingRecipient[];
  workerCredentials?: WorkerCredential[];
  siteIncidents?: SiteIncident[];
  materialDeliveries?: MaterialDelivery[];
  materialDeliveryLines?: MaterialDeliveryLine[];
  materialStockMovements?: MaterialStockMovement[];
  taskMaterialRequirements?: TaskMaterialRequirement[];
  taskToolRequirements?: TaskToolRequirement[];
  diaryApprovals?: DiaryApprovalRequest[];
  costForecast: ProjectCostForecast;
  scheduleForecast: ScheduleForecast;
  failedSyncCount?: number;
}): ControlTowerSummary {
  const tasks = input.tasks.filter(
    (item) => item.projectId === input.projectId && item.status !== "done",
  );
  const requests = input.materialRequests.filter(
    (item) => item.projectId === input.projectId,
  );
  const rfis = (input.rfis ?? []).filter(
    (item) => item.projectId === input.projectId,
  );
  const tools = (input.tools ?? []).filter(
    (item) => item.projectId === input.projectId,
  );
  const shifts = (input.workShifts ?? []).filter(
    (item) => item.projectId === input.projectId,
  );
  const safetyBriefings = (input.safetyBriefings ?? []).filter(
    (item) => item.projectId === input.projectId && item.status === "published",
  );
  const publishedSafetyIds = new Set(safetyBriefings.map((item) => item.id));
  const pendingSafetyRecipients = (input.safetyBriefingRecipients ?? []).filter(
    (item) =>
      item.projectId === input.projectId &&
      item.status === "pending" &&
      publishedSafetyIds.has(item.briefingId),
  );
  const overdueSafetyIds = new Set(
    safetyBriefings
      .filter((item) => item.briefingDate < input.today)
      .map((item) => item.id),
  );
  const dueSafetyIds = new Set(
    safetyBriefings
      .filter((item) => item.briefingDate === input.today)
      .map((item) => item.id),
  );
  const actions: ControlTowerItem[] = [];
  const waiting: ControlTowerItem[] = [];
  const failedSyncCount = Math.max(0, input.failedSyncCount ?? 0);
  const blockedTasks = tasks.filter((item) => item.status === "blocked");
  const reviewTasks = tasks.filter((item) => item.status === "review");
  const openDefects = tasks.filter((item) => item.kind === "defect");
  const newRequests = requests.filter((item) => item.status === "new");
  const overdueRequests = newRequests.filter(
    (item) => !!item.desiredDate && item.desiredDate < input.today,
  );
  const overdueRfis = rfis.filter(
    (item) =>
      item.status === "open" && !!item.dueDate && item.dueDate < input.today,
  );
  const answeredRfis = rfis.filter((item) => item.status === "answered");
  const currentOpenRfis = rfis.filter(
    (item) =>
      item.status === "open" && (!item.dueDate || item.dueDate >= input.today),
  );
  const activeWorkerIds = new Set(
    input.workers
      .filter(
        (item) =>
          item.projectId === input.projectId && item.status === "active",
      )
      .map((item) => item.id),
  );
  const credentialHealth = (input.workerCredentials ?? [])
    .filter(
      (item) =>
        item.projectId === input.projectId &&
        activeWorkerIds.has(item.workerId),
    )
    .map((item) => ({
      item,
      health: workerCredentialHealth(item, input.today),
    }));
  const invalidCredentials = credentialHealth.filter(
    (item) => item.health === "expired" || item.health === "revoked",
  );
  const expiringCredentials = credentialHealth.filter(
    (item) => item.health === "expiring",
  );
  const credentialWorkerIds = new Set(
    credentialHealth.map((item) => item.item.workerId),
  );
  const workersWithoutCredentials = input.workerCredentials
    ? [...activeWorkerIds].filter((id) => !credentialWorkerIds.has(id))
    : [];
  const openIncidents = (input.siteIncidents ?? []).filter(
    (item) => item.projectId === input.projectId && item.status !== "resolved",
  );
  const criticalIncidents = openIncidents.filter(
    (item) => item.severity === "critical" || item.severity === "serious",
  );
  const oldIncidents = openIncidents.filter(
    (item) =>
      !criticalIncidents.includes(item) &&
      unresolvedIncidentAgeHours(item) >= 24,
  );
  const deliveries = (input.materialDeliveries ?? []).filter(
    (item) => item.projectId === input.projectId,
  );
  const deliveryDiscrepancies = deliveries.filter(
    (item) => item.status === "discrepancy",
  );
  const unreviewedDeliveries = deliveries.filter(
    (item) => item.status === "reported",
  );
  const stockRows = calculateMaterialStock(
    input.projectId,
    deliveries,
    input.materialDeliveryLines ?? [],
    input.materialStockMovements ?? [],
  );
  const negativeStock = stockRows.filter((item) => item.health === "negative");
  const lowStock = stockRows.filter(
    (item) => item.health === "low" || item.health === "empty",
  );
  const pendingStockReports = (input.materialStockMovements ?? []).filter(
    (item) => item.projectId === input.projectId && item.status === "reported",
  );
  const materialShortages = calculateTaskMaterialReadiness(
    tasks,
    input.taskMaterialRequirements ?? [],
    stockRows,
  ).filter((item) => item.shortageCount > 0);
  const toolShortages = calculateTaskToolReadiness(
    tasks,
    input.taskToolRequirements ?? [],
    tools,
  ).filter((item) => item.shortageCount > 0);
  const tomorrowPlan = buildTomorrowPlan({
    projectId: input.projectId,
    today: input.today,
    tasks: input.tasks,
    workers: input.workers,
    credentials: input.workerCredentials ?? [],
    requirements: input.taskMaterialRequirements ?? [],
    toolRequirements: input.taskToolRequirements ?? [],
    stock: stockRows,
    tools,
    safetyBriefings: input.safetyBriefings ?? [],
    safetyRecipients: input.safetyBriefingRecipients ?? [],
  });
  const inactiveCustodyTools = tools.filter(
    (item) =>
      item.status === "issued" &&
      (!item.currentWorkerId || !activeWorkerIds.has(item.currentWorkerId)),
  );
  const overdueTools = tools.filter(
    (item) =>
      item.status === "issued" &&
      !!item.currentWorkerId &&
      activeWorkerIds.has(item.currentWorkerId) &&
      !!item.expectedReturnDate &&
      item.expectedReturnDate < input.today,
  );
  const lostTools = tools.filter((item) => item.status === "lost");
  const maintenanceTools = tools.filter(
    (item) => item.status === "maintenance",
  );
  const longActiveShifts = shifts.filter(
    (item) =>
      item.status === "active" &&
      Date.now() - Date.parse(item.startedAt) > 12 * 60 * 60 * 1000,
  );
  const unapprovedShifts = shifts.filter((item) => item.status === "completed");
  const pendingWorkers = input.workers.filter(
    (item) => item.projectId === input.projectId && item.status === "pending",
  );
  const receiptReviews = input.receipts.filter(
    (item) => item.projectId === input.projectId && item.status !== "ready",
  );
  const draftChecklists = input.checklists.filter(
    (item) => item.projectId === input.projectId && item.status === "draft",
  );
  const pendingClientChanges = input.changeOrders.filter(
    (item) =>
      item.projectId === input.projectId && item.status === "pending_client",
  );
  const diaryApprovals = (input.diaryApprovals ?? []).filter(
    (item) => item.projectId === input.projectId,
  );
  const requestedDiaryChanges = diaryApprovals.filter(
    (item) => item.status === "changes_requested",
  );
  const pendingDiaryApprovals = diaryApprovals.filter(
    (item) =>
      item.status === "pending" && new Date(item.expiresAt).getTime() > Date.now(),
  );

  if (failedSyncCount)
    actions.push({
      id: "sync_failed",
      severity: "critical",
      target: "sync",
      count: failedSyncCount,
    });
  if (
    input.costForecast.health === "over_budget" &&
    (input.costForecast.projectedVarianceCents ?? 0) > 0
  )
    actions.push({
      id: "cost_overrun",
      severity: "critical",
      target: "financial",
      amountCents: input.costForecast.projectedVarianceCents,
    });
  else if (input.costForecast.health === "reserve_at_risk")
    actions.push({
      id: "reserve_at_risk",
      severity: "high",
      target: "financial",
      amountCents: input.costForecast.remainingAtCompletionCents,
    });
  else if (input.costForecast.health === "unavailable")
    actions.push({
      id: "financial_setup",
      severity: "watch",
      target: "financial",
    });
  if (input.scheduleForecast.risk === "critical")
    actions.push({
      id: "schedule_critical",
      severity: "critical",
      target: "schedule",
      count: input.scheduleForecast.overdueTaskCount,
    });
  else if (input.scheduleForecast.risk === "high")
    actions.push({
      id: "schedule_high",
      severity: "high",
      target: "schedule",
      count:
        input.scheduleForecast.overdueTaskCount +
        input.scheduleForecast.blockedTaskCount +
        input.scheduleForecast.materialRiskCount,
    });
  else if (input.scheduleForecast.risk === "not_configured")
    actions.push({
      id: "schedule_setup",
      severity: "watch",
      target: "schedule",
    });
  if (overdueRequests.length)
    actions.push({
      id: "overdue_material",
      severity: "critical",
      target: "material_requests",
      count: overdueRequests.length,
    });
  if (overdueRfis.length)
    actions.push({
      id: "overdue_rfis",
      severity: "critical",
      target: "rfis",
      count: overdueRfis.length,
    });
  if (answeredRfis.length)
    actions.push({
      id: "answered_rfis",
      severity: "high",
      target: "rfis",
      count: answeredRfis.length,
    });
  if (lostTools.length)
    actions.push({
      id: "lost_tools",
      severity: "critical",
      target: "tools",
      count: lostTools.length,
    });
  if (inactiveCustodyTools.length)
    actions.push({
      id: "inactive_tool_custody",
      severity: "critical",
      target: "tools",
      count: inactiveCustodyTools.length,
    });
  if (overdueTools.length)
    actions.push({
      id: "overdue_tools",
      severity: "high",
      target: "tools",
      count: overdueTools.length,
    });
  if (maintenanceTools.length)
    actions.push({
      id: "tool_maintenance",
      severity: "watch",
      target: "tools",
      count: maintenanceTools.length,
    });
  if (longActiveShifts.length)
    actions.push({
      id: "long_active_shifts",
      severity: "critical",
      target: "timesheet",
      count: longActiveShifts.length,
    });
  if (unapprovedShifts.length)
    actions.push({
      id: "unapproved_shifts",
      severity: unapprovedShifts.some((item) => item.shiftDate < input.today)
        ? "high"
        : "watch",
      target: "timesheet",
      count: unapprovedShifts.length,
    });
  if (pendingSafetyRecipients.length)
    actions.push({
      id: "pending_safety_acknowledgements",
      severity: pendingSafetyRecipients.some((item) =>
        overdueSafetyIds.has(item.briefingId),
      )
        ? "critical"
        : pendingSafetyRecipients.some((item) =>
              dueSafetyIds.has(item.briefingId),
            )
          ? "high"
          : "watch",
      target: "safety_briefings",
      count: pendingSafetyRecipients.length,
    });
  if (invalidCredentials.length)
    actions.push({
      id: "expired_worker_credentials",
      severity: "critical",
      target: "worker_credentials",
      count: invalidCredentials.length,
    });
  if (workersWithoutCredentials.length)
    actions.push({
      id: "missing_worker_credentials",
      severity: "critical",
      target: "worker_credentials",
      count: workersWithoutCredentials.length,
    });
  if (expiringCredentials.length)
    actions.push({
      id: "expiring_worker_credentials",
      severity: "high",
      target: "worker_credentials",
      count: expiringCredentials.length,
    });
  if (criticalIncidents.length)
    actions.push({
      id: "critical_site_incidents",
      severity: "critical",
      target: "site_incidents",
      count: criticalIncidents.length,
    });
  if (oldIncidents.length)
    actions.push({
      id: "unresolved_site_incidents",
      severity: "high",
      target: "site_incidents",
      count: oldIncidents.length,
    });
  if (deliveryDiscrepancies.length)
    actions.push({
      id: "delivery_discrepancies",
      severity: "critical",
      target: "material_deliveries",
      count: deliveryDiscrepancies.length,
    });
  if (unreviewedDeliveries.length)
    actions.push({
      id: "unreviewed_deliveries",
      severity: "high",
      target: "material_deliveries",
      count: unreviewedDeliveries.length,
    });
  if (negativeStock.length)
    actions.push({
      id: "negative_material_stock",
      severity: "critical",
      target: "material_stock",
      count: negativeStock.length,
    });
  if (lowStock.length)
    actions.push({
      id: "low_material_stock",
      severity: "high",
      target: "material_stock",
      count: lowStock.length,
    });
  if (pendingStockReports.length)
    actions.push({
      id: "pending_stock_reports",
      severity: "high",
      target: "material_stock",
      count: pendingStockReports.length,
    });
  if (materialShortages.length)
    actions.push({
      id: "task_material_shortages",
      severity: "critical",
      target: "task_materials",
      count: materialShortages.length,
    });
  if (toolShortages.length)
    actions.push({
      id: "task_tool_shortages",
      severity: "critical",
      target: "task_tools",
      count: toolShortages.length,
    });
  if (tomorrowPlan.blockedCount || tomorrowPlan.watchCount)
    actions.push({
      id: "tomorrow_not_ready",
      severity: tomorrowPlan.blockedCount ? "critical" : "high",
      target: "tomorrow_plan",
      count: tomorrowPlan.blockedCount + tomorrowPlan.watchCount,
    });
  if (blockedTasks.length)
    actions.push({
      id: "blocked_tasks",
      severity: "high",
      target: "defects",
      count: blockedTasks.length,
    });
  if (reviewTasks.length)
    actions.push({
      id: "task_reviews",
      severity: "high",
      target: "task_reviews",
      count: reviewTasks.length,
    });
  const currentNewRequests = newRequests.length - overdueRequests.length;
  if (currentNewRequests > 0)
    actions.push({
      id: "new_material_requests",
      severity: "high",
      target: "material_requests",
      count: currentNewRequests,
    });
  if (pendingWorkers.length)
    actions.push({
      id: "pending_workers",
      severity: "watch",
      target: "workers",
      count: pendingWorkers.length,
    });
  if (receiptReviews.length)
    actions.push({
      id: "receipt_reviews",
      severity: "watch",
      target: "receipts",
      count: receiptReviews.length,
    });
  if (draftChecklists.length)
    actions.push({
      id: "draft_checklists",
      severity: "watch",
      target: "checklists",
      count: draftChecklists.length,
    });
  if (requestedDiaryChanges.length)
    actions.push({
      id: "diary_changes_requested",
      severity: "high",
      target: "diary_approvals",
      count: requestedDiaryChanges.length,
    });
  if (pendingClientChanges.length)
    waiting.push({
      id: "client_changes",
      severity: "watch",
      target: "change_orders",
      count: pendingClientChanges.length,
      amountCents: pendingClientChanges.reduce(
        (sum, item) => sum + item.amountCents,
        0,
      ),
    });
  if (currentOpenRfis.length)
    waiting.push({
      id: "open_rfis",
      severity: "watch",
      target: "rfis",
      count: currentOpenRfis.length,
    });
  if (pendingDiaryApprovals.length)
    waiting.push({
      id: "pending_diary_approvals",
      severity: pendingDiaryApprovals.some(
        (item) => Date.now() - Date.parse(item.createdAt) >= 24 * 60 * 60 * 1000,
      )
        ? "high"
        : "watch",
      target: "diary_approvals",
      count: pendingDiaryApprovals.length,
    });

  const moneySeverity: ControlTowerSeverity =
    input.costForecast.health === "over_budget"
      ? "critical"
      : input.costForecast.health === "reserve_at_risk"
        ? "high"
        : input.costForecast.health === "within_budget"
          ? "clear"
          : "watch";
  const scheduleSeverity: ControlTowerSeverity =
    input.scheduleForecast.risk === "critical"
      ? "critical"
      : input.scheduleForecast.risk === "high"
        ? "high"
        : input.scheduleForecast.risk === "watch" ||
            input.scheduleForecast.risk === "not_configured"
          ? "watch"
          : "clear";
  const qualitySeverity: ControlTowerSeverity = openDefects.some(
    (item) =>
      item.status === "blocked" ||
      item.priority === "urgent" ||
      (!!item.dueDate && item.dueDate < input.today),
  )
    ? "high"
    : openDefects.length
      ? "watch"
      : "clear";
  const decisionCount =
    reviewTasks.length +
    newRequests.length +
    pendingWorkers.length +
    receiptReviews.length +
    draftChecklists.length +
    answeredRfis.length;
  const diaryDecisionCount = requestedDiaryChanges.length;
  const toolDecisionCount =
    overdueTools.length +
    lostTools.length +
    maintenanceTools.length +
    inactiveCustodyTools.length;
  const shiftDecisionCount = longActiveShifts.length + unapprovedShifts.length;
  const safetyDecisionCount = pendingSafetyRecipients.length;
  const decisionSeverity: ControlTowerSeverity =
    overdueRequests.length > 0 ||
    overdueRfis.length > 0 ||
    lostTools.length > 0 ||
    inactiveCustodyTools.length > 0 ||
    longActiveShifts.length > 0 ||
    pendingSafetyRecipients.some((item) =>
      overdueSafetyIds.has(item.briefingId),
    )
      ? "critical"
      : reviewTasks.length > 0 ||
          newRequests.length > 0 ||
          answeredRfis.length > 0 ||
          overdueTools.length > 0 ||
          unapprovedShifts.some((item) => item.shiftDate < input.today) ||
          pendingSafetyRecipients.some((item) =>
            dueSafetyIds.has(item.briefingId),
          ) ||
          requestedDiaryChanges.length > 0
        ? "high"
        : decisionCount +
              diaryDecisionCount +
              shiftDecisionCount +
              safetyDecisionCount >
            0
          ? "watch"
          : "clear";
  const signals: ControlTowerSignal[] = [
    { key: "money", severity: moneySeverity },
    { key: "schedule", severity: scheduleSeverity },
    { key: "quality", severity: qualitySeverity, count: openDefects.length },
    {
      key: "decisions",
      severity: decisionSeverity,
      count:
        decisionCount +
        diaryDecisionCount +
        toolDecisionCount +
        shiftDecisionCount +
        safetyDecisionCount,
    },
  ];
  return {
    severity: strongest([
      ...actions.map((item) => item.severity),
      ...signals.map((item) => item.severity),
    ]),
    actionCount: actions.reduce(
      (sum, item) => sum + Math.max(1, item.count ?? 1),
      0,
    ),
    waitingCount: waiting.reduce(
      (sum, item) => sum + Math.max(1, item.count ?? 1),
      0,
    ),
    actions: sortItems(actions),
    waiting: sortItems(waiting),
    signals,
  };
}
