import { describe, expect, it } from "vitest";
import { projectControlTower } from "../src/domain/controlTower";
import type {
  ChangeOrder,
  MaterialRequest,
  ProjectWorker,
  ProjectRfi,
  ProjectTool,
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
} from "../src/domain/types";
import type { ProjectCostForecast } from "../src/domain/financialControl";
import type { ScheduleForecast } from "../src/domain/scheduleForecast";

const projectId = "project-1";
const now = "2026-07-29T08:00:00.000Z";
const cost: ProjectCostForecast = {
  available: true,
  declaredFinalCostCents: 120_000,
  forecastFinalCostCents: 120_000,
  projectedVarianceCents: 20_000,
  remainingAtCompletionCents: -20_000,
  receiptCount: 2,
  confidence: "low",
  health: "over_budget",
  source: "declared",
};
const schedule: ScheduleForecast = {
  acceptedChangeDays: 0,
  pendingChangeDays: 0,
  confirmedDelayDays: 0,
  pendingDelayDays: 0,
  openTaskCount: 1,
  overdueTaskCount: 1,
  blockedTaskCount: 1,
  unassignedTaskCount: 0,
  materialRiskCount: 0,
  risk: "critical",
  lookahead: [],
};

function base() {
  return {
    projectId,
    today: "2026-07-29",
    tasks: [] as SiteTask[],
    materialRequests: [] as MaterialRequest[],
    workers: [] as ProjectWorker[],
    receipts: [] as Receipt[],
    checklists: [],
    changeOrders: [] as ChangeOrder[],
    costForecast: {
      ...cost,
      health: "within_budget" as const,
      projectedVarianceCents: -20_000,
    },
    scheduleForecast: {
      ...schedule,
      risk: "on_track" as const,
      overdueTaskCount: 0,
      blockedTaskCount: 0,
    },
  };
}

describe("project control tower", () => {
  it("escalates returned diary days and tracks pending external approvals", () => {
    const approval = (overrides: Partial<DiaryApprovalRequest>): DiaryApprovalRequest => ({
      id: "approval-1",
      ownerId: "owner-1",
      projectId,
      closureId: "closure-1",
      closureHash: "a".repeat(64),
      recipientName: "J\u00e1n Nov\u00e1k",
      reviewerRole: "technical_supervisor",
      status: "pending",
      expiresAt: "2099-08-30T00:00:00.000Z",
      viewCount: 1,
      createdAt: "2026-07-20T00:00:00.000Z",
      ...overrides,
    });
    const result = projectControlTower({
      ...base(),
      diaryApprovals: [
        approval({}),
        approval({ id: "returned", status: "changes_requested" }),
      ],
    });
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        id: "diary_changes_requested",
        target: "diary_approvals",
        severity: "high",
      }),
    );
    expect(result.waiting).toContainEqual(
      expect.objectContaining({
        id: "pending_diary_approvals",
        target: "diary_approvals",
      }),
    );
  });

  it("sorts urgent project risks ahead of routine reviews", () => {
    const result = projectControlTower({
      ...base(),
      costForecast: cost,
      scheduleForecast: schedule,
      failedSyncCount: 2,
      materialRequests: [
        {
          id: "request-1",
          ownerId: "owner-1",
          projectId,
          workerId: "worker-1",
          desiredDate: "2026-07-28",
          status: "new",
          createdAt: now,
          updatedAt: now,
        },
      ],
      receipts: [
        {
          id: "receipt-1",
          ownerId: "owner-1",
          projectId,
          currency: "EUR",
          status: "needs_review",
          ocrStatus: "needs_review",
          syncStatus: "synced",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    expect(result.severity).toBe("critical");
    expect(result.actions.slice(0, 4).map((item) => item.id)).toEqual([
      "cost_overrun",
      "overdue_material",
      "schedule_critical",
      "sync_failed",
    ]);
    expect(result.actions.at(-1)?.id).toBe("receipt_reviews");
  });

  it("separates foreman actions from decisions waiting on the client", () => {
    const result = projectControlTower({
      ...base(),
      changeOrders: [
        {
          id: "change-1",
          ownerId: "owner-1",
          projectId,
          title: "Viacpráca",
          description: "Zmena",
          amountCents: 50_000,
          scheduleImpactDays: 2,
          status: "pending_client",
          syncStatus: "synced",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    expect(result.actions).toHaveLength(0);
    expect(result.waiting).toEqual([
      expect.objectContaining({
        id: "client_changes",
        count: 1,
        amountCents: 50_000,
      }),
    ]);
    expect(result.waitingCount).toBe(1);
  });

  it("reports a clear tower when all configured signals are healthy", () => {
    const result = projectControlTower(base());
    expect(result.severity).toBe("clear");
    expect(result.actionCount).toBe(0);
    expect(result.signals.every((signal) => signal.severity === "clear")).toBe(
      true,
    );
  });

  it("turns missing financial and schedule controls into setup actions", () => {
    const result = projectControlTower({
      ...base(),
      costForecast: {
        ...base().costForecast,
        available: false,
        health: "unavailable",
        source: "unavailable",
        forecastFinalCostCents: undefined,
        projectedVarianceCents: undefined,
      },
      scheduleForecast: {
        ...base().scheduleForecast,
        risk: "not_configured",
      },
    });
    expect(result.actions.map((item) => item.id)).toEqual([
      "financial_setup",
      "schedule_setup",
    ]);
    expect(result.actionCount).toBe(2);
    expect(result.severity).toBe("watch");
  });

  it("counts each new material request only once when it is overdue", () => {
    const request = {
      id: "request-1",
      ownerId: "owner-1",
      projectId,
      workerId: "worker-1",
      desiredDate: "2026-07-20",
      status: "new" as const,
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      materialRequests: [request],
    });
    expect(
      result.actions.filter((item) => item.target === "material_requests"),
    ).toEqual([expect.objectContaining({ id: "overdue_material", count: 1 })]);
    expect(result.actionCount).toBe(1);
  });

  it("separates overdue, answered and waiting RFI states", () => {
    const baseRfi: ProjectRfi = {
      id: "rfi-overdue",
      ownerId: "owner-1",
      projectId,
      rfiNumber: 1,
      subject: "Prestup",
      question: "Ako riešiť prestup cez nosnú stenu?",
      recipientName: "Projektant",
      dueDate: "2026-07-28",
      status: "open",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      rfis: [
        baseRfi,
        { ...baseRfi, id: "rfi-answered", rfiNumber: 2, status: "answered" },
        { ...baseRfi, id: "rfi-waiting", rfiNumber: 3, dueDate: "2026-08-03" },
        { ...baseRfi, id: "rfi-closed", rfiNumber: 4, status: "closed" },
      ],
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "overdue_rfis",
        count: 1,
        severity: "critical",
      }),
      expect.objectContaining({
        id: "answered_rfis",
        count: 1,
        severity: "high",
      }),
    ]);
    expect(result.waiting).toEqual([
      expect.objectContaining({ id: "open_rfis", count: 1, target: "rfis" }),
    ]);
    expect(result.actionCount).toBe(2);
    expect(result.waitingCount).toBe(1);
    expect(result.signals.find((item) => item.key === "decisions")).toEqual(
      expect.objectContaining({ severity: "critical", count: 1 }),
    );
  });

  it("raises lost, overdue and maintenance tool custody actions", () => {
    const baseTool: ProjectTool = {
      id: "tool-overdue",
      ownerId: "owner-1",
      projectId,
      assetNumber: 1,
      name: "Vŕtačka",
      category: "Elektrické náradie",
      status: "issued",
      currentWorkerId: "worker-1",
      issuedAt: now,
      expectedReturnDate: "2026-07-28",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      workers: [
        {
          id: "worker-1",
          ownerId: "owner-1",
          projectId,
          firstName: "Ján",
          lastName: "Novák",
          position: "Tesár",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      tools: [
        baseTool,
        {
          ...baseTool,
          id: "tool-lost",
          assetNumber: 2,
          status: "lost",
          currentWorkerId: undefined,
          issuedAt: undefined,
          expectedReturnDate: undefined,
        },
        {
          ...baseTool,
          id: "tool-service",
          assetNumber: 3,
          status: "maintenance",
          currentWorkerId: undefined,
          issuedAt: undefined,
          expectedReturnDate: undefined,
        },
      ],
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "lost_tools",
        severity: "critical",
        count: 1,
      }),
      expect.objectContaining({
        id: "overdue_tools",
        severity: "high",
        count: 1,
      }),
      expect.objectContaining({
        id: "tool_maintenance",
        severity: "watch",
        count: 1,
      }),
    ]);
    expect(result.actionCount).toBe(3);
    expect(result.severity).toBe("critical");
  });

  it("flags tools that remain assigned after worker access is revoked", () => {
    const result = projectControlTower({
      ...base(),
      workers: [
        {
          id: "worker-1",
          ownerId: "owner-1",
          projectId,
          firstName: "Ján",
          lastName: "Novák",
          position: "Tesár",
          status: "revoked",
          createdAt: now,
          updatedAt: now,
        },
      ],
      tools: [
        {
          id: "tool-1",
          ownerId: "owner-1",
          projectId,
          assetNumber: 1,
          name: "Vŕtačka",
          category: "Elektrické náradie",
          status: "issued",
          currentWorkerId: "worker-1",
          issuedAt: now,
          syncStatus: "synced",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "inactive_tool_custody",
        severity: "critical",
      }),
    ]);
  });

  it("escalates forgotten clock-outs and payroll rows waiting from a prior day", () => {
    const active: WorkShift = {
      id: "shift-active",
      ownerId: "owner-1",
      projectId,
      workerId: "worker-1",
      shiftDate: "2026-07-28",
      startedAt: "2026-07-28T05:00:00.000Z",
      breakMinutes: 0,
      source: "worker",
      status: "active",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      workShifts: [
        active,
        {
          ...active,
          id: "shift-review",
          status: "completed",
          startedAt: "2026-07-28T05:00:00.000Z",
          endedAt: "2026-07-28T13:00:00.000Z",
        },
      ],
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "long_active_shifts",
        severity: "critical",
        target: "timesheet",
      }),
      expect.objectContaining({
        id: "unapproved_shifts",
        severity: "high",
        target: "timesheet",
      }),
    ]);
    expect(result.signals.find((item) => item.key === "decisions")?.count).toBe(
      2,
    );
  });

  it("escalates overdue personal safety acknowledgements", () => {
    const briefing: SafetyBriefing = {
      id: "brief-1",
      ownerId: "owner-1",
      projectId,
      title: "Výšky",
      body: "Použite ochranný postroj.",
      briefingDate: "2026-07-28",
      status: "published",
      contentHash: "a".repeat(64),
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const recipient: SafetyBriefingRecipient = {
      id: "recipient-1",
      ownerId: "owner-1",
      projectId,
      briefingId: briefing.id,
      workerId: "worker-1",
      workerName: "Ján Novák",
      position: "Tesár",
      status: "pending",
      contentHash: briefing.contentHash!,
      createdAt: now,
    };
    const result = projectControlTower({
      ...base(),
      safetyBriefings: [briefing],
      safetyBriefingRecipients: [recipient],
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "pending_safety_acknowledgements",
        severity: "critical",
        target: "safety_briefings",
        count: 1,
      }),
    ]);
    expect(result.signals.find((item) => item.key === "decisions")?.count).toBe(
      1,
    );
  });
  it("blocks admission for expired credentials and warns 30 days before expiry", () => {
    const worker: ProjectWorker = {
      id: "worker-1",
      ownerId: "owner-1",
      projectId,
      firstName: "Ján",
      lastName: "Novák",
      position: "Tesár",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const credential: WorkerCredential = {
      id: "cred-1",
      ownerId: "owner-1",
      projectId,
      workerId: worker.id,
      credentialType: "medical_exam",
      title: "Prehliadka",
      expiresAt: "2026-07-28",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      workers: [worker],
      workerCredentials: [
        credential,
        { ...credential, id: "cred-2", expiresAt: "2026-08-10" },
      ],
    });
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "expired_worker_credentials",
          severity: "critical",
          count: 1,
        }),
        expect.objectContaining({
          id: "expiring_worker_credentials",
          severity: "high",
          count: 1,
        }),
      ]),
    );
  });
  it("treats an active worker without any credential as a critical admission gap", () => {
    const worker: ProjectWorker = {
      id: "worker-empty",
      ownerId: "owner-1",
      projectId,
      firstName: "Eva",
      lastName: "Nová",
      position: "Elektrikárka",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      workers: [worker],
      workerCredentials: [],
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        id: "missing_worker_credentials",
        severity: "critical",
        target: "worker_credentials",
        count: 1,
      }),
    ]);
  });
  it("escalates serious incidents immediately and older open near misses after 24 hours", () => {
    const incident: SiteIncident = {
      id: "inc-1",
      ownerId: "owner-1",
      projectId,
      reporterName: "Ján",
      incidentType: "injury",
      severity: "serious",
      occurredAt: now,
      location: "Strecha",
      description: "Poranenie pri práci na streche",
      status: "reported",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const old = {
      ...incident,
      id: "inc-2",
      incidentType: "near_miss" as const,
      severity: "low" as const,
      occurredAt: "2026-07-27T08:00:00.000Z",
    };
    const result = projectControlTower({
      ...base(),
      siteIncidents: [incident, old],
    });
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "critical_site_incidents",
          severity: "critical",
          target: "site_incidents",
        }),
        expect.objectContaining({
          id: "unresolved_site_incidents",
          severity: "high",
          target: "site_incidents",
        }),
      ]),
    );
  });
  it("escalates delivery discrepancies before unreviewed clean receipts", () => {
    const delivery: MaterialDelivery = {
      id: "del-1",
      ownerId: "owner-1",
      projectId,
      requestId: "req-1",
      supplierName: "Stavmat",
      deliveredAt: now,
      receiverName: "Ján",
      status: "discrepancy",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      materialDeliveries: [
        delivery,
        { ...delivery, id: "del-2", status: "reported" },
      ],
    });
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "delivery_discrepancies",
          severity: "critical",
          target: "material_deliveries",
        }),
        expect.objectContaining({
          id: "unreviewed_deliveries",
          severity: "high",
          target: "material_deliveries",
        }),
      ]),
    );
  });
  it("escalates impossible stock and worker movement reports", () => {
    const delivery: MaterialDelivery = {
      id: "del-stock",
      ownerId: "owner-1",
      projectId,
      requestId: "req-stock",
      supplierName: "Stavmat",
      deliveredAt: now,
      receiverName: "Ján",
      status: "accepted",
      reviewedAt: now,
      reviewedBy: "owner-1",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const line: MaterialDeliveryLine = {
      id: "line-stock",
      ownerId: "owner-1",
      projectId,
      deliveryId: delivery.id,
      requestItemId: "item-stock",
      itemName: "Cement",
      unit: "ks",
      expectedQuantity: 10,
      deliveredQuantity: 10,
      damagedQuantity: 0,
      createdAt: now,
    };
    const movement: MaterialStockMovement = {
      id: "move-stock",
      ownerId: "owner-1",
      projectId,
      requestId: delivery.requestId,
      requestItemId: line.requestItemId,
      materialName: line.itemName,
      unit: line.unit,
      movementType: "usage",
      quantity: 11,
      occurredAt: now,
      status: "confirmed",
      reviewedAt: now,
      reviewedBy: "owner-1",
      syncStatus: "synced",
      createdAt: now,
    };
    const report: MaterialStockMovement = {
      ...movement,
      id: "move-report",
      quantity: 1,
      status: "reported",
      reviewedAt: undefined,
      reviewedBy: undefined,
    };
    const result = projectControlTower({
      ...base(),
      materialDeliveries: [delivery],
      materialDeliveryLines: [line],
      materialStockMovements: [movement, report],
    });
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "negative_material_stock",
          severity: "critical",
          target: "material_stock",
          count: 1,
        }),
        expect.objectContaining({
          id: "pending_stock_reports",
          severity: "high",
          target: "material_stock",
          count: 1,
        }),
      ]),
    );
  });
  it("flags tasks whose reserved material exceeds available stock", () => {
    const task: SiteTask = {
      id: "task-material",
      ownerId: "owner-1",
      projectId,
      title: "Murivo",
      kind: "task",
      status: "open",
      priority: "high",
      dueDate: "2026-07-30",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const requirement: TaskMaterialRequirement = {
      id: "requirement-1",
      ownerId: "owner-1",
      projectId,
      taskId: task.id,
      requestId: "request-1",
      requestItemId: "item-1",
      materialName: "Cement",
      unit: "ks",
      quantity: 5,
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      tasks: [task],
      taskMaterialRequirements: [requirement],
    });
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        id: "task_material_shortages",
        severity: "critical",
        target: "task_materials",
        count: 1,
      }),
    );
  });
  it("flags tasks with unavailable reserved equipment", () => {
    const task: SiteTask = {
      id: "task-tool",
      ownerId: "owner-1",
      projectId,
      title: "Beton",
      kind: "task",
      status: "open",
      priority: "high",
      dueDate: "2026-07-30",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const tool: ProjectTool = {
      id: "tool-reserved",
      ownerId: "owner-1",
      projectId,
      assetNumber: 12,
      name: "Mixer",
      category: "Machine",
      status: "maintenance",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const requirement: TaskToolRequirement = {
      id: "tool-requirement",
      ownerId: "owner-1",
      projectId,
      taskId: task.id,
      toolId: tool.id,
      assetNumber: tool.assetNumber,
      toolName: tool.name,
      category: tool.category,
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };
    const result = projectControlTower({
      ...base(),
      tasks: [task],
      tools: [tool],
      taskToolRequirements: [requirement],
    });
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        id: "task_tool_shortages",
        severity: "critical",
        target: "task_tools",
        count: 1,
      }),
    );
  });

  it("turns incomplete tomorrow work into a direct foreman action", () => {
    const task: SiteTask = {
      id: "task-tomorrow",
      ownerId: "owner-1",
      projectId,
      title: "Pripraviť debnenie",
      kind: "task",
      status: "open",
      priority: "high",
      dueDate: "2026-07-30",
      syncStatus: "synced",
      createdAt: now,
      updatedAt: now,
    };

    const result = projectControlTower({ ...base(), tasks: [task] });

    expect(result.actions).toContainEqual({
      id: "tomorrow_not_ready",
      severity: "critical",
      target: "tomorrow_plan",
      count: 1,
    });
  });
});
