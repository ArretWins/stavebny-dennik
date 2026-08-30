import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { shouldAttemptSync } from "@/domain/network";
import type {
  AppNotification,
  Attachment,
  AppState,
  ChangeOrder,
  DailyControlAction,
  DayClosureRecord,
  DelayEvent,
  DiaryEntry,
  EvidenceBundle,
  MaterialRequest,
  MaterialRequestStatus,
  MaterialSupplierQuote,
  MaterialDelivery,
  MaterialDeliveryLine,
  MaterialDeliveryEvent,
  MaterialStockMovement,
  MaterialStockMovementEvent,
  TaskMaterialRequirement,
  TaskToolRequirement,
  Project,
  ProjectBudget,
  ProjectSchedule,
  SafetyBriefing,
  SafetyBriefingEvent,
  SafetyBriefingRecipient,
  ProjectChecklist,
  ProjectPlan,
  ProjectRfi,
  ProjectRfiEvent,
  ProjectTool,
  ProjectToolEvent,
  ProjectWorker,
  Receipt,
  ReceiptCategory,
  ReceiptExport,
  ReceiptFile,
  ReceiptRequestLink,
  ReportExport,
  SiteTask,
  SiteTaskEvent,
  SiteTaskStatus,
  SiteIncident,
  SiteIncidentEvent,
  WeeklyReport,
  WorkerCheckin,
  WorkerCredential,
  WorkerCredentialEvent,
  WorkerStatus,
  WorkShift,
  WorkShiftEvent,
} from "@/domain/types";
import type { ControlTowerItem } from "@/domain/controlTower";
import { createId, localDateIso, nowIso } from "@/domain/ids";
import { enqueue, pendingCount, processOutbox } from "@/domain/sync";
import {
  insertDelay,
  insertDiary,
  insertWeatherSnapshot,
  listCheckins,
  listDiary,
  listProjectAttachments,
  listProjects,
  lockDelayEvent,
  lockDiaryEntry,
} from "@/services/repositories";
import { uploadPrivateAttachment } from "@/services/attachments";
import { fetchWeather } from "@/services/evidence";
import { supabase } from "@/services/supabase";
import { LocalStore, emptyAppState } from "@/services/localStore";
import { assertEditable } from "@/domain/locking";
import { useAuth } from "./auth";
import { defaultReceiptCategories, receiptIsReady } from "@/domain/receipts";
import {
  listReceiptCategories,
  listReceipts,
  uploadReceiptFile,
  upsertReceipt,
  upsertReceiptCategory,
} from "@/services/receiptRepository";
import {
  linkReceiptToRequest,
  listNotifications,
  listProjectWorkforce,
  markNotificationRead,
  setMaterialRequestStatus,
  setProjectWorkerStatus,
  unlinkReceiptFromRequest,
} from "@/services/workforceRepository";
import {
  registerPushSubscription,
  syncProjectRfiReminder,
} from "@/services/pushNotifications";
import { trackPilotEvent } from "@/services/pilotAccount";
import { recordClientError, recordSyncRun } from "@/services/monitoring";
import {
  listProjectPlansAndTasks,
  insertSiteTaskComment,
  reviewSiteTask as reviewRemoteSiteTask,
  setSiteTaskClientVisibility as setRemoteSiteTaskClientVisibility,
  uploadProjectPlan,
  upsertSiteTask,
} from "@/services/planRepository";
import { taskStatusPatch, validateTaskInput } from "@/domain/planTasks";
import { defectsForFailedChecklist } from "@/domain/checklists";
import {
  listProjectChecklists,
  upsertProjectChecklist,
} from "@/services/checklistRepository";
import {
  listProjectChangeOrders,
  saveRemoteChangeOrder,
} from "@/services/changeOrderRepository";
import {
  getProjectBudget,
  saveRemoteProjectBudget,
} from "@/services/projectBudgetRepository";
import { validateProjectBudget } from "@/domain/financialControl";
import { validateSupplierQuote } from "@/domain/procurement";
import {
  deliveryHasDiscrepancy,
  validateMaterialDelivery,
  type DeliveryInputLine,
} from "@/domain/materialDeliveries";
import {
  saveRemoteSupplierQuote,
  selectRemoteSupplierQuote,
  withdrawRemoteSupplierQuote,
} from "@/services/procurementRepository";
import {
  listProjectMaterialDeliveries,
  resolveRemoteMaterialDelivery,
  reviewRemoteMaterialDelivery,
  saveRemoteMaterialDelivery,
} from "@/services/materialDeliveryRepository";
import { validateMaterialStockMovement } from "@/domain/materialStock";
import {
  listProjectMaterialStock,
  reviewRemoteMaterialStockMovement,
  saveRemoteMaterialStockMovement,
} from "@/services/materialStockRepository";
import { validateTaskMaterialRequirements } from "@/domain/materialReservations";
import {
  listProjectTaskMaterialRequirements,
  saveRemoteTaskMaterialRequirements,
} from "@/services/taskMaterialRepository";
import { validateTaskToolRequirements } from "@/domain/toolReservations";
import {
  listProjectTaskToolRequirements,
  saveRemoteTaskToolRequirements,
} from "@/services/taskToolRepository";
import {
  getProjectSchedule,
  saveRemoteProjectSchedule,
} from "@/services/projectScheduleRepository";
import { validateProjectSchedule } from "@/domain/scheduleForecast";
import { validateWeeklyReport } from "@/domain/weeklyReport";
import {
  listWeeklyReports,
  saveRemoteWeeklyReport,
} from "@/services/weeklyReportRepository";
import {
  listDailyControlActions,
  saveRemoteDailyControlAction,
} from "@/services/dailyControlActionRepository";
import {
  materializeDailyControlActions,
  resolveDailyControlAction as resolveDailyControlActionRecord,
} from "@/domain/dailyControlPlan";
import {
  buildDayClosureSnapshot,
  dayClosureStatus,
  summarizeDayClosure,
  validateDayClosureConfirmation,
} from "@/domain/dayClosure";
import {
  hashDayClosureSnapshot,
  listRemoteDayClosures,
  saveRemoteDayClosure,
} from "@/services/dayClosureRepository";
import { listProjectDiaryApprovals } from "@/services/diaryApprovalRepository";
import {
  answerRemoteProjectRfi,
  closeRemoteProjectRfi,
  listProjectRfis,
  openRemoteProjectRfi,
  reopenRemoteProjectRfi,
  saveRemoteProjectRfi,
} from "@/services/rfiRepository";
import { nextProjectRfiNumber, validateProjectRfiInput } from "@/domain/rfi";
import { nextProjectToolNumber, validateProjectTool } from "@/domain/tools";
import {
  issueRemoteProjectTool,
  listProjectTools,
  reportRemoteProjectToolIssue,
  restoreRemoteProjectTool,
  retireRemoteProjectTool,
  returnRemoteProjectTool,
  saveRemoteProjectTool,
} from "@/services/toolRepository";
import { hasWorkShiftOverlap, validateWorkShift } from "@/domain/workShifts";
import {
  approveRemoteWorkShift,
  listProjectWorkShifts,
  reopenRemoteWorkShift,
  saveRemoteWorkShift,
} from "@/services/workShiftRepository";
import {
  canonicalSafetyBriefing,
  validateSafetyBriefing,
} from "@/domain/safetyBriefings";
import {
  closeRemoteSafetyBriefing,
  excuseRemoteSafetyBriefingRecipient,
  listProjectSafetyBriefings,
  publishRemoteSafetyBriefing,
  saveRemoteSafetyBriefing,
} from "@/services/safetyBriefingRepository";
import { validateWorkerCredential } from "@/domain/workerCredentials";
import {
  listProjectWorkerCredentials,
  restoreRemoteWorkerCredential,
  revokeRemoteWorkerCredential,
  saveRemoteWorkerCredential,
} from "@/services/workerCredentialRepository";
import {
  validateIncidentResolution,
  validateSiteIncident,
} from "@/domain/siteIncidents";
import {
  listProjectSiteIncidents,
  reopenRemoteSiteIncident,
  resolveRemoteSiteIncident,
  saveRemoteSiteIncident,
  startRemoteIncidentInvestigation,
} from "@/services/siteIncidentRepository";

type AppContextValue = {
  loading: boolean;
  state: AppState;
  selectedProject?: Project;
  pendingCount: number;
  selectProject: (id: string) => Promise<void>;
  addProject: (project: Project) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  addDiary: (
    input: Omit<
      DiaryEntry,
      "id" | "ownerId" | "syncStatus" | "createdAt" | "updatedAt"
    >,
  ) => Promise<DiaryEntry>;
  updateDiary: (
    id: string,
    input: Omit<
      DiaryEntry,
      "id" | "ownerId" | "syncStatus" | "createdAt" | "updatedAt"
    >,
  ) => Promise<DiaryEntry>;
  addDelay: (
    input: Omit<
      DelayEvent,
      "id" | "ownerId" | "syncStatus" | "createdAt" | "updatedAt"
    >,
  ) => Promise<DelayEvent>;
  addAttachment: (attachment: Attachment) => Promise<void>;
  addCheckin: (checkin: WorkerCheckin) => Promise<void>;
  saveWorkShift: (input: {
    id?: string;
    projectId: string;
    workerId: string;
    startedAt: string;
    endedAt: string;
    breakMinutes: number;
    note?: string;
  }) => Promise<WorkShift>;
  approveWorkShift: (id: string) => Promise<WorkShift>;
  reopenWorkShift: (id: string, reason: string) => Promise<WorkShift>;
  saveSafetyBriefing: (input: {
    id?: string;
    projectId: string;
    title: string;
    body: string;
    briefingDate: string;
  }) => Promise<SafetyBriefing>;
  publishSafetyBriefing: (id: string) => Promise<SafetyBriefing>;
  excuseSafetyBriefingRecipient: (
    briefingId: string,
    workerId: string,
    reason: string,
  ) => Promise<SafetyBriefingRecipient>;
  closeSafetyBriefing: (id: string) => Promise<SafetyBriefing>;
  saveWorkerCredential: (
    input: Omit<
      WorkerCredential,
      | "id"
      | "ownerId"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
      | "revokedAt"
      | "revokedBy"
      | "revokeReason"
    > & { id?: string },
  ) => Promise<WorkerCredential>;
  revokeWorkerCredential: (
    id: string,
    reason: string,
  ) => Promise<WorkerCredential>;
  restoreWorkerCredential: (
    id: string,
    reason: string,
  ) => Promise<WorkerCredential>;
  saveSiteIncident: (
    input: Omit<
      SiteIncident,
      | "id"
      | "ownerId"
      | "status"
      | "rootCause"
      | "correctiveAction"
      | "resolvedAt"
      | "resolvedBy"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    > & { id?: string },
  ) => Promise<SiteIncident>;
  startSiteIncidentInvestigation: (id: string) => Promise<SiteIncident>;
  resolveSiteIncident: (
    id: string,
    rootCause: string,
    correctiveAction: string,
  ) => Promise<SiteIncident>;
  reopenSiteIncident: (id: string, reason: string) => Promise<SiteIncident>;
  addReport: (report: ReportExport) => Promise<void>;
  addReceiptCategory: (name: string) => Promise<ReceiptCategory>;
  saveReceipt: (receipt: Receipt, files: ReceiptFile[]) => Promise<Receipt>;
  addReceiptExport: (report: ReceiptExport) => Promise<void>;
  addProjectPlan: (plan: ProjectPlan) => Promise<void>;
  updateProjectPlanPageCount: (id: string, pageCount: number) => Promise<void>;
  saveProjectRfi: (
    input: Omit<
      ProjectRfi,
      | "id"
      | "ownerId"
      | "rfiNumber"
      | "status"
      | "answer"
      | "answeredByName"
      | "openedAt"
      | "answeredAt"
      | "closedAt"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    > & { id?: string },
  ) => Promise<ProjectRfi>;
  openProjectRfi: (id: string) => Promise<ProjectRfi>;
  answerProjectRfi: (
    id: string,
    answer: string,
    answeredByName: string,
  ) => Promise<ProjectRfi>;
  closeProjectRfi: (id: string) => Promise<ProjectRfi>;
  reopenProjectRfi: (id: string, reason: string) => Promise<ProjectRfi>;
  saveProjectTool: (
    input: Omit<
      ProjectTool,
      | "id"
      | "ownerId"
      | "assetNumber"
      | "status"
      | "currentWorkerId"
      | "issuedAt"
      | "expectedReturnDate"
      | "retiredAt"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    > & { id?: string },
  ) => Promise<ProjectTool>;
  issueProjectTool: (
    id: string,
    workerId: string,
    expectedReturnDate?: string,
    note?: string,
  ) => Promise<ProjectTool>;
  returnProjectTool: (
    id: string,
    condition: "serviceable" | "damaged",
    note?: string,
  ) => Promise<ProjectTool>;
  reportProjectToolIssue: (
    id: string,
    issueType: "damaged" | "lost",
    note: string,
  ) => Promise<ProjectTool>;
  restoreProjectTool: (id: string, note?: string) => Promise<ProjectTool>;
  retireProjectTool: (id: string, reason: string) => Promise<ProjectTool>;
  addSiteTask: (
    input: Omit<
      SiteTask,
      | "id"
      | "ownerId"
      | "submittedAt"
      | "reviewedAt"
      | "reviewedBy"
      | "reviewNote"
      | "revisionCount"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    >,
  ) => Promise<SiteTask>;
  updateSiteTask: (
    id: string,
    patch: Partial<
      Omit<SiteTask, "id" | "ownerId" | "projectId" | "createdAt" | "updatedAt">
    >,
  ) => Promise<SiteTask>;
  setSiteTaskStatus: (id: string, status: SiteTaskStatus) => Promise<SiteTask>;
  reviewSiteTask: (
    id: string,
    decision: "accept" | "rework",
    note?: string,
  ) => Promise<SiteTask>;
  setSiteTaskClientVisibility: (
    id: string,
    visible: boolean,
  ) => Promise<SiteTask>;
  saveProjectChecklist: (
    checklist: ProjectChecklist,
  ) => Promise<ProjectChecklist>;
  saveChangeOrder: (
    input: Omit<
      ChangeOrder,
      | "id"
      | "ownerId"
      | "orderNumber"
      | "submittedAt"
      | "decidedAt"
      | "signerName"
      | "decisionComment"
      | "shareLinkId"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    > & { id?: string },
  ) => Promise<ChangeOrder>;
  saveProjectBudget: (
    baselineBudgetCents: number,
    contingencyCents: number,
    remainingCommitmentCents: number,
    note?: string,
  ) => Promise<ProjectBudget>;
  saveProjectSchedule: (
    startDate: string,
    targetCompletionDate: string,
    note?: string,
  ) => Promise<ProjectSchedule>;
  saveWeeklyReport: (
    input: Omit<
      WeeklyReport,
      | "id"
      | "ownerId"
      | "status"
      | "publishedAt"
      | "pdfReportId"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    > & { id?: string },
  ) => Promise<WeeklyReport>;
  publishWeeklyReport: (
    id: string,
    pdfReportId?: string,
  ) => Promise<WeeklyReport>;
  prepareDailyControlPlan: (
    items: ControlTowerItem[],
    actionDate: string,
  ) => Promise<DailyControlAction[]>;
  resolveDailyControlAction: (
    id: string,
    resolution: string,
  ) => Promise<DailyControlAction>;
  addSiteTaskComment: (taskId: string, body: string) => Promise<SiteTaskEvent>;
  reviewWorker: (
    id: string,
    status: Exclude<WorkerStatus, "pending">,
  ) => Promise<ProjectWorker>;
  updateMaterialRequest: (
    id: string,
    status: Exclude<MaterialRequestStatus, "new">,
    rejectionReason?: string,
  ) => Promise<MaterialRequest>;
  linkReceiptRequest: (
    receiptId: string,
    requestId: string,
    allocatedAmountCents?: number,
  ) => Promise<ReceiptRequestLink>;
  unlinkReceiptRequest: (receiptId: string, requestId: string) => Promise<void>;
  saveSupplierQuote: (input: {
    id?: string;
    requestId: string;
    supplierName: string;
    totalAmountCents: number;
    deliveryDate?: string;
    validUntil?: string;
    note?: string;
  }) => Promise<MaterialSupplierQuote>;
  selectSupplierQuote: (id: string) => Promise<MaterialSupplierQuote>;
  withdrawSupplierQuote: (id: string) => Promise<MaterialSupplierQuote>;
  saveMaterialDelivery: (
    input: Omit<
      MaterialDelivery,
      | "id"
      | "ownerId"
      | "quoteId"
      | "status"
      | "reviewedAt"
      | "reviewedBy"
      | "resolution"
      | "resolvedAt"
      | "resolvedBy"
      | "syncStatus"
      | "createdAt"
      | "updatedAt"
    > & { id?: string; lines: DeliveryInputLine[] },
  ) => Promise<MaterialDelivery>;
  reviewMaterialDelivery: (id: string) => Promise<MaterialDelivery>;
  resolveMaterialDelivery: (
    id: string,
    resolution: string,
  ) => Promise<MaterialDelivery>;
  saveMaterialStockMovement: (
    input: Omit<
      MaterialStockMovement,
      | "id"
      | "ownerId"
      | "status"
      | "reviewedAt"
      | "reviewedBy"
      | "rejectionReason"
      | "syncStatus"
      | "createdAt"
    > & { id?: string },
  ) => Promise<MaterialStockMovement>;
  reviewMaterialStockMovement: (
    id: string,
    decision: "confirmed" | "rejected",
    rejectionReason?: string,
  ) => Promise<MaterialStockMovement>;
  saveTaskMaterialRequirements: (
    taskId: string,
    requirements: Pick<TaskMaterialRequirement, "requestItemId" | "quantity">[],
  ) => Promise<void>;
  saveTaskToolRequirements: (
    taskId: string,
    toolIds: string[],
  ) => Promise<void>;
  readNotification: (id: string) => Promise<void>;
  lockDiary: (id: string) => Promise<void>;
  confirmDayClosure: (input: {
    logDate: string;
    confirmed: boolean;
    correctionReason?: string;
  }) => Promise<DayClosureRecord>;
  lockDelay: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshWorkforce: () => Promise<void>;
  refreshGallery: () => Promise<void>;
  refreshProjectData: () => Promise<void>;
  reports: ReportExport[];
};
const AppContext = createContext<AppContextValue | undefined>(undefined);

function requestStatusFromProcurement(
  state: AppState,
  requestId: string,
  links: ReceiptRequestLink[],
): MaterialRequestStatus | undefined {
  const request = state.materialRequests.find((item) => item.id === requestId);
  const selected = (state.materialSupplierQuotes ?? []).find(
    (item) => item.requestId === requestId && item.status === "selected",
  );
  if (
    !request ||
    !selected ||
    request.status === "new" ||
    request.status === "rejected"
  )
    return undefined;
  const allocated = links
    .filter((item) => item.requestId === requestId)
    .reduce((total, item) => total + (item.allocatedAmountCents ?? 0), 0);
  return allocated >= selected.totalAmountCents
    ? "purchased"
    : allocated > 0
      ? "partially_purchased"
      : "approved";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [state, setState] = useState<AppState>(emptyAppState());
  const [loading, setLoading] = useState(true);
  const storeRef = React.useRef(new LocalStore());
  const syncInFlightRef = React.useRef<Promise<void> | undefined>(undefined);
  const startupSyncUserRef = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    if (userId && supabase)
      void registerPushSubscription().catch(() => undefined);
  }, [userId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      if (!userId) {
        setState(emptyAppState());
        setLoading(false);
        return;
      }
      const hydratedRaw = await storeRef.current.hydrate();
      const hydrated =
        hydratedRaw.activeUserId === userId
          ? hydratedRaw
          : await storeRef.current.update(() => ({
              ...emptyAppState(),
              activeUserId: userId,
            }));
      const hasCategories = hydrated.receiptCategories.some(
        (category) => category.ownerId === userId,
      );
      const local = hasCategories
        ? hydrated
        : await storeRef.current.update((current) => {
            const categories = defaultReceiptCategories(userId, nowIso());
            return {
              ...current,
              receiptCategories: [...current.receiptCategories, ...categories],
              outbox: categories.reduce(
                (items, category) =>
                  enqueue(items, "receipt_category", category.id, category),
                current.outbox,
              ),
            };
          });
      if (active) {
        setState(local);
        setLoading(false);
      }
      try {
        const [remoteProjects, remoteCategories] = await Promise.all([
          listProjects(userId),
          listReceiptCategories(userId),
        ]);
        if (active) {
          const next = await storeRef.current.update((previous) => ({
            ...previous,
            activeUserId: userId,
            projects: remoteProjects,
            selectedProjectId: remoteProjects.some(
              (project) => project.id === previous.selectedProjectId,
            )
              ? previous.selectedProjectId
              : remoteProjects.find((project) => project.status === "active")
                  ?.id,
            receiptCategories: remoteCategories.length
              ? remoteCategories
              : previous.receiptCategories,
          }));
          setState(next);
        }
      } catch {
        /* local-first mode */
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const persist = useCallback(
    async (mutator: (current: AppState) => AppState) => {
      const next = await storeRef.current.update(mutator);
      setState(next);
      return next;
    },
    [],
  );
  const selectedProject =
    state.projects.find(
      (project) =>
        project.id === state.selectedProjectId && project.status === "active",
    ) ?? state.projects.find((project) => project.status === "active");
  const selectProject = useCallback(
    async (id: string) => {
      await persist((current) => ({ ...current, selectedProjectId: id }));
    },
    [persist],
  );
  const addProject = useCallback(
    async (project: Project) => {
      await persist((current) => {
        const projects = [
          project,
          ...current.projects.filter((existing) => existing.id !== project.id),
        ];
        const selectedProjectId =
          project.status === "active"
            ? project.id
            : current.selectedProjectId === project.id
              ? projects.find((item) => item.status === "active")?.id
              : current.selectedProjectId;
        return { ...current, projects, selectedProjectId };
      });
      void trackPilotEvent("project_created", { platform: "android" });
    },
    [persist],
  );
  const removeProject = useCallback(
    async (id: string) => {
      await persist((current) => {
        const receiptIds = new Set(
          current.receipts
            .filter((item) => item.projectId === id)
            .map((item) => item.id),
        );
        const requestIds = new Set(
          current.materialRequests
            .filter((item) => item.projectId === id)
            .map((item) => item.id),
        );
        const quoteIds = new Set(
          (current.materialSupplierQuotes ?? [])
            .filter((item) => item.projectId === id)
            .map((item) => item.id),
        );
        const projects = current.projects.filter((item) => item.id !== id);
        return {
          ...current,
          projects,
          selectedProjectId:
            current.selectedProjectId === id
              ? projects.find((item) => item.status === "active")?.id
              : current.selectedProjectId,
          diaryEntries: current.diaryEntries.filter(
            (item) => item.projectId !== id,
          ),
          dayClosures: current.dayClosures.filter(
            (item) => item.projectId !== id,
          ),
          diaryApprovalRequests: current.diaryApprovalRequests.filter(
            (item) => item.projectId !== id,
          ),
          diaryApprovalEvents: current.diaryApprovalEvents.filter(
            (item) => item.projectId !== id,
          ),
          delayEvents: current.delayEvents.filter(
            (item) => item.projectId !== id,
          ),
          workerCheckins: current.workerCheckins.filter(
            (item) => item.projectId !== id,
          ),
          workShifts: current.workShifts.filter(
            (item) => item.projectId !== id,
          ),
          workShiftEvents: current.workShiftEvents.filter(
            (item) => item.projectId !== id,
          ),
          safetyBriefings: current.safetyBriefings.filter(
            (item) => item.projectId !== id,
          ),
          safetyBriefingRecipients: current.safetyBriefingRecipients.filter(
            (item) => item.projectId !== id,
          ),
          safetyBriefingEvents: current.safetyBriefingEvents.filter(
            (item) => item.projectId !== id,
          ),
          attachments: current.attachments.filter(
            (item) => item.projectId !== id,
          ),
          reports: current.reports.filter((item) => item.projectId !== id),
          receipts: current.receipts.filter((item) => item.projectId !== id),
          receiptFiles: current.receiptFiles.filter(
            (item) => item.projectId !== id,
          ),
          receiptExports: current.receiptExports.filter(
            (item) => item.projectId !== id,
          ),
          workers: current.workers.filter((item) => item.projectId !== id),
          workerCredentials: current.workerCredentials.filter(
            (item) => item.projectId !== id,
          ),
          workerCredentialEvents: current.workerCredentialEvents.filter(
            (item) => item.projectId !== id,
          ),
          siteIncidents: current.siteIncidents.filter(
            (item) => item.projectId !== id,
          ),
          siteIncidentEvents: current.siteIncidentEvents.filter(
            (item) => item.projectId !== id,
          ),
          materialRequests: current.materialRequests.filter(
            (item) => item.projectId !== id,
          ),
          materialRequestItems: current.materialRequestItems.filter(
            (item) => !requestIds.has(item.requestId),
          ),
          receiptRequestLinks: current.receiptRequestLinks.filter(
            (item) =>
              !receiptIds.has(item.receiptId) &&
              !requestIds.has(item.requestId),
          ),
          materialSupplierQuotes: (current.materialSupplierQuotes ?? []).filter(
            (item) => item.projectId !== id,
          ),
          materialDeliveries: current.materialDeliveries.filter(
            (item) => item.projectId !== id,
          ),
          materialDeliveryLines: current.materialDeliveryLines.filter(
            (item) => item.projectId !== id,
          ),
          materialDeliveryEvents: current.materialDeliveryEvents.filter(
            (item) => item.projectId !== id,
          ),
          materialStockMovements: current.materialStockMovements.filter(
            (item) => item.projectId !== id,
          ),
          materialStockMovementEvents:
            current.materialStockMovementEvents.filter(
              (item) => item.projectId !== id,
            ),
          taskMaterialRequirements: current.taskMaterialRequirements.filter(
            (item) => item.projectId !== id,
          ),
          taskToolRequirements: current.taskToolRequirements.filter(
            (item) => item.projectId !== id,
          ),
          projectPlans: current.projectPlans.filter(
            (item) => item.projectId !== id,
          ),
          projectRfis: current.projectRfis.filter(
            (item) => item.projectId !== id,
          ),
          projectRfiEvents: current.projectRfiEvents.filter(
            (item) => item.projectId !== id,
          ),
          projectTools: current.projectTools.filter(
            (item) => item.projectId !== id,
          ),
          projectToolEvents: current.projectToolEvents.filter(
            (item) => item.projectId !== id,
          ),
          siteTasks: current.siteTasks.filter((item) => item.projectId !== id),
          siteTaskEvents: current.siteTaskEvents.filter(
            (item) => item.projectId !== id,
          ),
          projectChecklists: current.projectChecklists.filter(
            (item) => item.projectId !== id,
          ),
          changeOrders: current.changeOrders.filter(
            (item) => item.projectId !== id,
          ),
          projectBudgets: current.projectBudgets.filter(
            (item) => item.projectId !== id,
          ),
          projectSchedules: current.projectSchedules.filter(
            (item) => item.projectId !== id,
          ),
          dailyControlActions: current.dailyControlActions.filter(
            (item) => item.projectId !== id,
          ),
          weeklyReports: current.weeklyReports.filter(
            (item) => item.projectId !== id,
          ),
          outbox: current.outbox.filter(
            (item) =>
              !quoteIds.has(item.localId) &&
              !(
                item.payload &&
                typeof item.payload === "object" &&
                "projectId" in item.payload &&
                item.payload.projectId === id
              ),
          ),
        };
      });
    },
    [persist],
  );
  const addDiary = useCallback(
    async (
      input: Omit<
        DiaryEntry,
        "id" | "ownerId" | "syncStatus" | "createdAt" | "updatedAt"
      >,
    ) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const at = nowIso();
      const entry: DiaryEntry = {
        ...input,
        id: createId("diary"),
        ownerId: userId,
        syncStatus: "pending",
        createdAt: at,
        updatedAt: at,
      };
      await persist((current) => ({
        ...current,
        diaryEntries: [entry, ...current.diaryEntries],
        outbox: enqueue(current.outbox, "diary_entry", entry.id, entry),
      }));
      return entry;
    },
    [persist, userId],
  );
  const updateDiary = useCallback(
    async (
      id: string,
      input: Omit<
        DiaryEntry,
        "id" | "ownerId" | "syncStatus" | "createdAt" | "updatedAt"
      >,
    ) => {
      let result: DiaryEntry | undefined;
      await persist((current) => {
        const existing = current.diaryEntries.find((entry) => entry.id === id);
        if (!existing) throw new Error("DIARY_NOT_FOUND");
        assertEditable(existing);
        result = {
          ...existing,
          ...input,
          correctionOfId: input.correctionOfId ?? existing.correctionOfId,
          id: existing.id,
          ownerId: existing.ownerId,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
          syncStatus: "pending",
        };
        return {
          ...current,
          diaryEntries: current.diaryEntries.map((entry) =>
            entry.id === id ? result! : entry,
          ),
          outbox: enqueue(current.outbox, "diary_entry", id, result),
        };
      });
      if (!result) throw new Error("DIARY_NOT_FOUND");
      return result;
    },
    [persist],
  );
  const addDelay = useCallback(
    async (
      input: Omit<
        DelayEvent,
        "id" | "ownerId" | "syncStatus" | "createdAt" | "updatedAt"
      >,
    ) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const at = nowIso();
      const event: DelayEvent = {
        ...input,
        id: createId("delay"),
        ownerId: userId,
        syncStatus: "pending",
        createdAt: at,
        updatedAt: at,
      };
      await persist((current) => ({
        ...current,
        delayEvents: [event, ...current.delayEvents],
        outbox: enqueue(current.outbox, "delay_event", event.id, event),
      }));
      return event;
    },
    [persist, userId],
  );
  const addAttachment = useCallback(
    async (attachment: Attachment) => {
      await persist((current) => ({
        ...current,
        attachments: [
          attachment,
          ...current.attachments.filter((item) => item.id !== attachment.id),
        ],
        outbox: enqueue(
          current.outbox,
          "attachment",
          attachment.id,
          attachment,
        ),
      }));
    },
    [persist],
  );
  const addCheckin = useCallback(
    async (checkin: WorkerCheckin) => {
      await persist((current) => ({
        ...current,
        workerCheckins: [
          checkin,
          ...current.workerCheckins.filter((item) => item.id !== checkin.id),
        ],
        outbox: userId
          ? enqueue(current.outbox, "worker_checkin", checkin.id, checkin)
          : current.outbox,
      }));
    },
    [persist, userId],
  );
  const saveWorkShift = useCallback<AppContextValue["saveWorkShift"]>(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateWorkShift(input) !== "ok")
        throw new Error("INVALID_WORK_SHIFT_INPUT");
      let result: WorkShift | undefined;
      await persist((current) => {
        const worker = current.workers.find(
          (item) => item.id === input.workerId,
        );
        const existing = input.id
          ? current.workShifts.find((item) => item.id === input.id)
          : undefined;
        if (!worker || worker.projectId !== input.projectId)
          throw new Error("PROJECT_WORKER_SCOPE");
        if (existing?.status === "approved")
          throw new Error("WORK_SHIFT_NOT_EDITABLE");
        if (hasWorkShiftOverlap(current.workShifts, input))
          throw new Error("WORK_SHIFT_OVERLAP");
        const at = nowIso();
        const dateParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Bratislava",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date(input.startedAt));
        const part = (type: string) =>
          dateParts.find((item) => item.type === type)?.value ?? "";
        result = {
          ...existing,
          id: existing?.id ?? createId("shift"),
          ownerId: userId,
          projectId: input.projectId,
          workerId: input.workerId,
          shiftDate: `${part("year")}-${part("month")}-${part("day")}`,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          breakMinutes: input.breakMinutes,
          note: input.note?.trim() || undefined,
          source: existing?.source ?? "manual",
          status: "completed",
          approvedAt: undefined,
          approvedBy: undefined,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        const event: WorkShiftEvent = {
          id: createId("shift-event"),
          ownerId: userId,
          projectId: input.projectId,
          shiftId: result.id,
          workerId: input.workerId,
          eventType: existing ? "corrected" : "created",
          metadata: {
            startedAt: result.startedAt,
            endedAt: result.endedAt,
            breakMinutes: result.breakMinutes,
          },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          workShifts: [
            result!,
            ...current.workShifts.filter((item) => item.id !== result!.id),
          ],
          workShiftEvents: [...current.workShiftEvents, event],
          outbox: enqueue(current.outbox, "work_shift", result!.id, result!),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const approveWorkShift = useCallback<AppContextValue["approveWorkShift"]>(
    async (id) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      let result: WorkShift | undefined;
      await persist((current) => {
        const existing = current.workShifts.find((item) => item.id === id);
        if (!existing || existing.status !== "completed")
          throw new Error("WORK_SHIFT_NOT_APPROVABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "approved",
          approvedAt: at,
          approvedBy: userId,
          updatedAt: at,
          syncStatus: "pending",
        };
        const event: WorkShiftEvent = {
          id: createId("shift-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          shiftId: id,
          workerId: existing.workerId,
          eventType: "approved",
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          workShifts: current.workShifts.map((item) =>
            item.id === id ? result! : item,
          ),
          workShiftEvents: [...current.workShiftEvents, event],
          outbox: enqueue(current.outbox, "work_shift_approve", id, {
            shiftId: id,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const reopenWorkShift = useCallback<AppContextValue["reopenWorkShift"]>(
    async (id, reason) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const safeReason = reason.trim();
      if (safeReason.length < 3 || safeReason.length > 500)
        throw new Error("WORK_SHIFT_REOPEN_REASON_REQUIRED");
      let result: WorkShift | undefined;
      await persist((current) => {
        const existing = current.workShifts.find((item) => item.id === id);
        if (!existing || existing.status !== "approved")
          throw new Error("WORK_SHIFT_NOT_REOPENABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "completed",
          approvedAt: undefined,
          approvedBy: undefined,
          updatedAt: at,
          syncStatus: "pending",
        };
        const event: WorkShiftEvent = {
          id: createId("shift-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          shiftId: id,
          workerId: existing.workerId,
          eventType: "reopened",
          body: safeReason,
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          workShifts: current.workShifts.map((item) =>
            item.id === id ? result! : item,
          ),
          workShiftEvents: [...current.workShiftEvents, event],
          outbox: enqueue(current.outbox, "work_shift_reopen", id, {
            shiftId: id,
            reason: safeReason,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const saveSafetyBriefing = useCallback<AppContextValue["saveSafetyBriefing"]>(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateSafetyBriefing(input) !== "ok")
        throw new Error("INVALID_SAFETY_BRIEFING");
      let result: SafetyBriefing | undefined;
      await persist((current) => {
        const existing = input.id
          ? current.safetyBriefings.find((item) => item.id === input.id)
          : undefined;
        if (!current.projects.some((item) => item.id === input.projectId))
          throw new Error("PROJECT_NOT_FOUND");
        if (
          existing &&
          (existing.projectId !== input.projectId ||
            existing.status !== "draft")
        )
          throw new Error("SAFETY_BRIEFING_NOT_EDITABLE");
        const at = nowIso();
        result = {
          ...existing,
          id: existing?.id ?? createId("safety-briefing"),
          ownerId: userId,
          projectId: input.projectId,
          title: input.title.trim(),
          body: input.body.trim(),
          briefingDate: input.briefingDate,
          status: "draft",
          contentHash: undefined,
          publishedAt: undefined,
          publishedBy: undefined,
          closedAt: undefined,
          closedBy: undefined,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        const event: SafetyBriefingEvent = {
          id: createId("safety-event"),
          ownerId: userId,
          projectId: input.projectId,
          briefingId: result.id,
          eventType: existing ? "updated" : "created",
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          safetyBriefings: [
            result!,
            ...current.safetyBriefings.filter((item) => item.id !== result!.id),
          ],
          safetyBriefingEvents: [...current.safetyBriefingEvents, event],
          outbox: enqueue(
            current.outbox,
            "safety_briefing",
            result!.id,
            result!,
          ),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const publishSafetyBriefing = useCallback<
    AppContextValue["publishSafetyBriefing"]
  >(
    async (id) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const snapshot = storeRef.current.snapshot;
      const existing = snapshot.safetyBriefings.find((item) => item.id === id);
      if (!existing || existing.status !== "draft")
        throw new Error("SAFETY_BRIEFING_NOT_PUBLISHABLE");
      const workers = snapshot.workers.filter(
        (item) =>
          item.projectId === existing.projectId && item.status === "active",
      );
      if (!workers.length) throw new Error("ACTIVE_PROJECT_WORKER_REQUIRED");
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        canonicalSafetyBriefing(existing),
      );
      let result: SafetyBriefing | undefined;
      await persist((current) => {
        const currentBriefing = current.safetyBriefings.find(
          (item) => item.id === id,
        );
        if (!currentBriefing || currentBriefing.status !== "draft")
          throw new Error("SAFETY_BRIEFING_NOT_PUBLISHABLE");
        const at = nowIso();
        result = {
          ...currentBriefing,
          status: "published",
          contentHash: hash,
          publishedAt: at,
          publishedBy: userId,
          updatedAt: at,
          syncStatus: "pending",
        };
        const recipients: SafetyBriefingRecipient[] = workers.map((worker) => ({
          id: createId("safety-recipient"),
          ownerId: userId,
          projectId: currentBriefing.projectId,
          briefingId: id,
          workerId: worker.id,
          workerName: `${worker.firstName} ${worker.lastName}`,
          position: worker.position,
          status: "pending",
          contentHash: hash,
          createdAt: at,
        }));
        const event: SafetyBriefingEvent = {
          id: createId("safety-event"),
          ownerId: userId,
          projectId: currentBriefing.projectId,
          briefingId: id,
          eventType: "published",
          metadata: { contentHash: hash, recipientCount: recipients.length },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          safetyBriefings: current.safetyBriefings.map((item) =>
            item.id === id ? result! : item,
          ),
          safetyBriefingRecipients: [
            ...current.safetyBriefingRecipients.filter(
              (item) => item.briefingId !== id,
            ),
            ...recipients,
          ],
          safetyBriefingEvents: [...current.safetyBriefingEvents, event],
          outbox: enqueue(current.outbox, "safety_briefing_publish", id, {
            briefingId: id,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const excuseSafetyBriefingRecipient = useCallback<
    AppContextValue["excuseSafetyBriefingRecipient"]
  >(
    async (briefingId, workerId, reason) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const safeReason = reason.trim();
      if (safeReason.length < 3 || safeReason.length > 500)
        throw new Error("SAFETY_BRIEFING_EXCUSE_REASON_REQUIRED");
      let result: SafetyBriefingRecipient | undefined;
      await persist((current) => {
        const existing = current.safetyBriefingRecipients.find(
          (item) =>
            item.briefingId === briefingId && item.workerId === workerId,
        );
        if (!existing || existing.status !== "pending")
          throw new Error("SAFETY_BRIEFING_EXCUSE_NOT_ALLOWED");
        const at = nowIso();
        result = {
          ...existing,
          status: "excused",
          excusedAt: at,
          excusedBy: userId,
          excuseReason: safeReason,
        };
        const event: SafetyBriefingEvent = {
          id: createId("safety-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          briefingId,
          eventType: "excused",
          workerId,
          body: safeReason,
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          safetyBriefingRecipients: current.safetyBriefingRecipients.map(
            (item) => (item.id === existing.id ? result! : item),
          ),
          safetyBriefingEvents: [...current.safetyBriefingEvents, event],
          outbox: enqueue(
            current.outbox,
            "safety_briefing_excuse",
            existing.id,
            { briefingId, workerId, reason: safeReason },
          ),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const closeSafetyBriefing = useCallback<
    AppContextValue["closeSafetyBriefing"]
  >(
    async (id) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      let result: SafetyBriefing | undefined;
      await persist((current) => {
        const existing = current.safetyBriefings.find((item) => item.id === id);
        if (!existing || existing.status !== "published")
          throw new Error("SAFETY_BRIEFING_NOT_CLOSABLE");
        if (
          current.safetyBriefingRecipients.some(
            (item) => item.briefingId === id && item.status === "pending",
          )
        )
          throw new Error("SAFETY_BRIEFING_PENDING_RECIPIENTS");
        const at = nowIso();
        result = {
          ...existing,
          status: "closed",
          closedAt: at,
          closedBy: userId,
          updatedAt: at,
          syncStatus: "pending",
        };
        const event: SafetyBriefingEvent = {
          id: createId("safety-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          briefingId: id,
          eventType: "closed",
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          safetyBriefings: current.safetyBriefings.map((item) =>
            item.id === id ? result! : item,
          ),
          safetyBriefingEvents: [...current.safetyBriefingEvents, event],
          outbox: enqueue(current.outbox, "safety_briefing_close", id, {
            briefingId: id,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const saveWorkerCredential = useCallback<
    AppContextValue["saveWorkerCredential"]
  >(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateWorkerCredential(input) !== "ok")
        throw new Error("INVALID_WORKER_CREDENTIAL");
      let result: WorkerCredential | undefined;
      await persist((current) => {
        const existing = input.id
          ? current.workerCredentials.find((item) => item.id === input.id)
          : undefined;
        if (!current.projects.some((item) => item.id === input.projectId))
          throw new Error("PROJECT_NOT_FOUND");
        if (
          !current.workers.some(
            (item) =>
              item.id === input.workerId && item.projectId === input.projectId,
          )
        )
          throw new Error("WORKER_NOT_IN_PROJECT");
        if (
          existing &&
          (existing.workerId !== input.workerId || !!existing.revokedAt)
        )
          throw new Error("WORKER_CREDENTIAL_NOT_EDITABLE");
        const at = nowIso();
        result = {
          ...existing,
          id: existing?.id ?? createId("worker-credential"),
          ownerId: userId,
          projectId: input.projectId,
          workerId: input.workerId,
          credentialType: input.credentialType,
          title: input.title.trim(),
          documentNumber: input.documentNumber?.trim() || undefined,
          issuer: input.issuer?.trim() || undefined,
          issuedDate: input.issuedDate,
          expiresAt: input.expiresAt,
          note: input.note?.trim() || undefined,
          attachmentId: input.attachmentId,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        const event: WorkerCredentialEvent = {
          id: createId("credential-event"),
          ownerId: userId,
          projectId: input.projectId,
          credentialId: result.id,
          workerId: input.workerId,
          eventType: existing ? "updated" : "created",
          metadata: {
            expiresAt: result.expiresAt ?? null,
            attachmentId: result.attachmentId ?? null,
          },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          workerCredentials: [
            result!,
            ...current.workerCredentials.filter(
              (item) => item.id !== result!.id,
            ),
          ],
          workerCredentialEvents: [...current.workerCredentialEvents, event],
          outbox: enqueue(
            current.outbox,
            "worker_credential",
            result!.id,
            result!,
          ),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const revokeWorkerCredential = useCallback<
    AppContextValue["revokeWorkerCredential"]
  >(
    async (id, reason) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const safeReason = reason.trim();
      if (safeReason.length < 3 || safeReason.length > 500)
        throw new Error("WORKER_CREDENTIAL_REVOKE_REASON_REQUIRED");
      let result: WorkerCredential | undefined;
      await persist((current) => {
        const existing = current.workerCredentials.find(
          (item) => item.id === id,
        );
        if (!existing || existing.revokedAt)
          throw new Error("WORKER_CREDENTIAL_NOT_REVOCABLE");
        const at = nowIso();
        result = {
          ...existing,
          revokedAt: at,
          revokedBy: userId,
          revokeReason: safeReason,
          updatedAt: at,
          syncStatus: "pending",
        };
        const event: WorkerCredentialEvent = {
          id: createId("credential-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          credentialId: id,
          workerId: existing.workerId,
          eventType: "revoked",
          body: safeReason,
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          workerCredentials: current.workerCredentials.map((item) =>
            item.id === id ? result! : item,
          ),
          workerCredentialEvents: [...current.workerCredentialEvents, event],
          outbox: enqueue(current.outbox, "worker_credential_revoke", id, {
            credentialId: id,
            reason: safeReason,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const restoreWorkerCredential = useCallback<
    AppContextValue["restoreWorkerCredential"]
  >(
    async (id, reason) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const safeReason = reason.trim();
      if (safeReason.length < 3 || safeReason.length > 500)
        throw new Error("WORKER_CREDENTIAL_RESTORE_REASON_REQUIRED");
      let result: WorkerCredential | undefined;
      await persist((current) => {
        const existing = current.workerCredentials.find(
          (item) => item.id === id,
        );
        if (!existing || !existing.revokedAt)
          throw new Error("WORKER_CREDENTIAL_NOT_RESTORABLE");
        const at = nowIso();
        result = {
          ...existing,
          revokedAt: undefined,
          revokedBy: undefined,
          revokeReason: undefined,
          updatedAt: at,
          syncStatus: "pending",
        };
        const event: WorkerCredentialEvent = {
          id: createId("credential-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          credentialId: id,
          workerId: existing.workerId,
          eventType: "restored",
          body: safeReason,
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          workerCredentials: current.workerCredentials.map((item) =>
            item.id === id ? result! : item,
          ),
          workerCredentialEvents: [...current.workerCredentialEvents, event],
          outbox: enqueue(current.outbox, "worker_credential_restore", id, {
            credentialId: id,
            reason: safeReason,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const saveSiteIncident = useCallback<AppContextValue["saveSiteIncident"]>(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateSiteIncident(input) !== "ok")
        throw new Error("INVALID_SITE_INCIDENT");
      let result: SiteIncident | undefined;
      await persist((current) => {
        const existing = input.id
          ? current.siteIncidents.find((item) => item.id === input.id)
          : undefined;
        if (!current.projects.some((item) => item.id === input.projectId))
          throw new Error("PROJECT_NOT_FOUND");
        if (existing?.status === "resolved")
          throw new Error("SITE_INCIDENT_NOT_EDITABLE");
        const at = nowIso();
        result = {
          ...existing,
          ...input,
          id: existing?.id ?? createId("incident"),
          ownerId: userId,
          reporterName: input.reporterName.trim(),
          location: input.location.trim(),
          description: input.description.trim(),
          immediateAction: input.immediateAction?.trim() || undefined,
          peopleInvolved: input.peopleInvolved?.trim() || undefined,
          status: existing?.status ?? "reported",
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        const event: SiteIncidentEvent = {
          id: createId("incident-event"),
          ownerId: userId,
          projectId: input.projectId,
          incidentId: result.id,
          eventType: existing ? "updated" : "reported",
          metadata: { severity: result.severity, status: result.status },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          siteIncidents: [
            result!,
            ...current.siteIncidents.filter((item) => item.id !== result!.id),
          ],
          siteIncidentEvents: [...current.siteIncidentEvents, event],
          outbox: enqueue(current.outbox, "site_incident", result!.id, result!),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const startSiteIncidentInvestigation = useCallback<
    AppContextValue["startSiteIncidentInvestigation"]
  >(
    async (id) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      let result: SiteIncident | undefined;
      await persist((current) => {
        const existing = current.siteIncidents.find((item) => item.id === id);
        if (!existing || existing.status !== "reported")
          throw new Error("SITE_INCIDENT_NOT_INVESTIGATABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "investigating",
          syncStatus: "pending",
          updatedAt: at,
        };
        const event: SiteIncidentEvent = {
          id: createId("incident-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          incidentId: id,
          eventType: "investigation_started",
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          siteIncidents: current.siteIncidents.map((item) =>
            item.id === id ? result! : item,
          ),
          siteIncidentEvents: [...current.siteIncidentEvents, event],
          outbox: enqueue(current.outbox, "site_incident_investigate", id, {
            incidentId: id,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const resolveSiteIncident = useCallback<
    AppContextValue["resolveSiteIncident"]
  >(
    async (id, rootCause, correctiveAction) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (!validateIncidentResolution(rootCause, correctiveAction))
        throw new Error("SITE_INCIDENT_RESOLUTION_REQUIRED");
      let result: SiteIncident | undefined;
      await persist((current) => {
        const existing = current.siteIncidents.find((item) => item.id === id);
        if (!existing || existing.status !== "investigating")
          throw new Error("SITE_INCIDENT_NOT_RESOLVABLE");
        const at = nowIso();
        const safeRootCause = rootCause.trim(),
          safeCorrectiveAction = correctiveAction.trim();
        result = {
          ...existing,
          status: "resolved",
          rootCause: safeRootCause,
          correctiveAction: safeCorrectiveAction,
          resolvedAt: at,
          resolvedBy: userId,
          syncStatus: "pending",
          updatedAt: at,
        };
        const event: SiteIncidentEvent = {
          id: createId("incident-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          incidentId: id,
          eventType: "resolved",
          metadata: {
            rootCause: safeRootCause,
            correctiveAction: safeCorrectiveAction,
          },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          siteIncidents: current.siteIncidents.map((item) =>
            item.id === id ? result! : item,
          ),
          siteIncidentEvents: [...current.siteIncidentEvents, event],
          outbox: enqueue(current.outbox, "site_incident_resolve", id, {
            incidentId: id,
            rootCause: safeRootCause,
            correctiveAction: safeCorrectiveAction,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const reopenSiteIncident = useCallback<AppContextValue["reopenSiteIncident"]>(
    async (id, reason) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const safeReason = reason.trim();
      if (safeReason.length < 5 || safeReason.length > 500)
        throw new Error("SITE_INCIDENT_REOPEN_REASON_REQUIRED");
      let result: SiteIncident | undefined;
      await persist((current) => {
        const existing = current.siteIncidents.find((item) => item.id === id);
        if (!existing || existing.status !== "resolved")
          throw new Error("SITE_INCIDENT_NOT_REOPENABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "investigating",
          rootCause: undefined,
          correctiveAction: undefined,
          resolvedAt: undefined,
          resolvedBy: undefined,
          syncStatus: "pending",
          updatedAt: at,
        };
        const event: SiteIncidentEvent = {
          id: createId("incident-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          incidentId: id,
          eventType: "reopened",
          body: safeReason,
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          siteIncidents: current.siteIncidents.map((item) =>
            item.id === id ? result! : item,
          ),
          siteIncidentEvents: [...current.siteIncidentEvents, event],
          outbox: enqueue(current.outbox, "site_incident_reopen", id, {
            incidentId: id,
            reason: safeReason,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const addReport = useCallback(
    async (report: ReportExport) => {
      await persist((current) => ({
        ...current,
        reports: [
          report,
          ...current.reports.filter((item) => item.id !== report.id),
        ],
      }));
    },
    [persist],
  );
  const addReceiptCategory = useCallback(
    async (name: string) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("CATEGORY_NAME_REQUIRED");
      const at = nowIso();
      const category: ReceiptCategory = {
        id: createId("receipt-category"),
        ownerId: userId,
        name: trimmed,
        isDefault: false,
        syncStatus: "pending",
        createdAt: at,
        updatedAt: at,
      };
      await persist((current) => ({
        ...current,
        receiptCategories: [...current.receiptCategories, category],
        outbox: enqueue(
          current.outbox,
          "receipt_category",
          category.id,
          category,
        ),
      }));
      return category;
    },
    [persist, userId],
  );
  const saveReceipt = useCallback(
    async (receipt: Receipt, files: ReceiptFile[]) => {
      if (!userId || receipt.ownerId !== userId)
        throw new Error("NOT_AUTHENTICATED");
      const at = nowIso();
      const nextReceipt: Receipt = {
        ...receipt,
        seller: receipt.seller?.trim() || undefined,
        note: receipt.note?.trim() || undefined,
        status: receiptIsReady(receipt, files)
          ? "ready"
          : receipt.ocrStatus === "not_requested"
            ? "draft"
            : "needs_review",
        syncStatus: "pending",
        updatedAt: at,
      };
      await persist((current) => {
        let outbox = enqueue(
          current.outbox,
          "receipt",
          nextReceipt.id,
          nextReceipt,
        );
        for (const file of files)
          outbox = enqueue(outbox, "receipt_file", file.id, file);
        if (nextReceipt.status !== "ready")
          outbox = enqueue(outbox, "receipt_ocr", nextReceipt.id, {
            receiptId: nextReceipt.id,
          });
        return {
          ...current,
          receipts: [
            nextReceipt,
            ...current.receipts.filter((item) => item.id !== nextReceipt.id),
          ],
          receiptFiles: [
            ...files,
            ...current.receiptFiles.filter(
              (item) => item.receiptId !== nextReceipt.id,
            ),
          ],
          outbox,
        };
      });
      void trackPilotEvent("receipt_saved", {
        platform: "android",
        status: nextReceipt.status,
        count: files.length,
      });
      return nextReceipt;
    },
    [persist, userId],
  );
  const addReceiptExport = useCallback(
    async (report: ReceiptExport) => {
      await persist((current) => ({
        ...current,
        receiptExports: [
          report,
          ...current.receiptExports.filter((item) => item.id !== report.id),
        ],
      }));
    },
    [persist],
  );
  const addProjectPlan = useCallback(
    async (plan: ProjectPlan) => {
      if (!userId || plan.ownerId !== userId)
        throw new Error("NOT_AUTHENTICATED");
      await persist((current) => ({
        ...current,
        projectPlans: [
          plan,
          ...current.projectPlans.filter((item) => item.id !== plan.id),
        ],
        outbox: enqueue(current.outbox, "project_plan", plan.id, plan),
      }));
    },
    [persist, userId],
  );
  const updateProjectPlanPageCount = useCallback(
    async (id: string, pageCount: number) => {
      const safePageCount = Math.max(1, Math.min(1000, Math.round(pageCount)));
      await persist((current) => {
        const plan = current.projectPlans.find((item) => item.id === id);
        if (!plan || plan.pageCount === safePageCount) return current;
        const updated = {
          ...plan,
          pageCount: safePageCount,
          uploadStatus: "pending" as const,
          updatedAt: nowIso(),
        };
        return {
          ...current,
          projectPlans: current.projectPlans.map((item) =>
            item.id === id ? updated : item,
          ),
          outbox: enqueue(current.outbox, "project_plan", id, updated),
        };
      });
    },
    [persist],
  );
  const saveProjectRfi = useCallback<AppContextValue["saveProjectRfi"]>(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateProjectRfiInput(input) !== "ok")
        throw new Error("INVALID_PROJECT_RFI");
      let saved: ProjectRfi | undefined;
      await persist((current) => {
        const existing = input.id
          ? current.projectRfis.find((item) => item.id === input.id)
          : undefined;
        if (existing && existing.status !== "draft")
          throw new Error("OPEN_PROJECT_RFI_IMMUTABLE");
        const at = nowIso();
        saved = {
          ...input,
          id: existing?.id ?? createId("rfi"),
          ownerId: userId,
          rfiNumber:
            existing?.rfiNumber ??
            nextProjectRfiNumber(current.projectRfis, input.projectId),
          subject: input.subject.trim(),
          question: input.question.trim(),
          recipientName: input.recipientName.trim(),
          status: "draft",
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          projectRfis: [
            saved!,
            ...current.projectRfis.filter((item) => item.id !== saved!.id),
          ],
          outbox: enqueue(current.outbox, "project_rfi", saved.id, saved),
        };
      });
      if (!saved) throw new Error("PROJECT_RFI_SAVE_FAILED");
      return saved;
    },
    [persist, userId],
  );
  const openProjectRfi = useCallback(
    async (id: string) => {
      let result: ProjectRfi | undefined;
      await persist((current) => {
        const existing = current.projectRfis.find((item) => item.id === id);
        if (!existing || existing.status !== "draft")
          throw new Error("PROJECT_RFI_NOT_OPENABLE");
        result = {
          ...existing,
          status: "open",
          openedAt: nowIso(),
          updatedAt: nowIso(),
          syncStatus: "pending",
        };
        return {
          ...current,
          projectRfis: current.projectRfis.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_rfi_open", id, {
            rfiId: id,
          }),
        };
      });
      if (result) void syncProjectRfiReminder(result).catch(() => undefined);
      return result!;
    },
    [persist],
  );
  const answerProjectRfi = useCallback(
    async (id: string, answer: string, answeredByName: string) => {
      if (
        answer.trim().length < 3 ||
        answer.trim().length > 4000 ||
        answeredByName.trim().length < 2 ||
        answeredByName.trim().length > 160
      )
        throw new Error("INVALID_RFI_ANSWER");
      let result: ProjectRfi | undefined;
      await persist((current) => {
        const existing = current.projectRfis.find((item) => item.id === id);
        if (!existing || existing.status !== "open")
          throw new Error("PROJECT_RFI_NOT_ANSWERABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "answered",
          answer: answer.trim(),
          answeredByName: answeredByName.trim(),
          answeredAt: at,
          closedAt: undefined,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectRfis: current.projectRfis.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_rfi_answer", id, {
            rfiId: id,
            answer: result!.answer,
            answeredByName: result!.answeredByName,
          }),
        };
      });
      if (result) void syncProjectRfiReminder(result).catch(() => undefined);
      return result!;
    },
    [persist],
  );
  const closeProjectRfi = useCallback(
    async (id: string) => {
      let result: ProjectRfi | undefined;
      await persist((current) => {
        const existing = current.projectRfis.find((item) => item.id === id);
        if (!existing || existing.status !== "answered")
          throw new Error("PROJECT_RFI_NOT_CLOSABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "closed",
          closedAt: at,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectRfis: current.projectRfis.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_rfi_close", id, {
            rfiId: id,
          }),
        };
      });
      if (result) void syncProjectRfiReminder(result).catch(() => undefined);
      return result!;
    },
    [persist],
  );
  const reopenProjectRfi = useCallback(
    async (id: string, reason: string) => {
      if (reason.trim().length < 5 || reason.trim().length > 500)
        throw new Error("RFI_REOPEN_REASON_REQUIRED");
      let result: ProjectRfi | undefined;
      await persist((current) => {
        const existing = current.projectRfis.find((item) => item.id === id);
        if (!existing || !["answered", "closed"].includes(existing.status))
          throw new Error("PROJECT_RFI_NOT_REOPENABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "open",
          closedAt: undefined,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectRfis: current.projectRfis.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_rfi_reopen", id, {
            rfiId: id,
            reason: reason.trim(),
          }),
        };
      });
      if (result) void syncProjectRfiReminder(result).catch(() => undefined);
      return result!;
    },
    [persist],
  );
  const saveProjectTool = useCallback<AppContextValue["saveProjectTool"]>(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateProjectTool(input) !== "ok")
        throw new Error("INVALID_PROJECT_TOOL");
      let saved: ProjectTool | undefined;
      await persist((current) => {
        if (!current.projects.some((project) => project.id === input.projectId))
          throw new Error("PROJECT_NOT_FOUND");
        const existing = input.id
          ? current.projectTools.find((item) => item.id === input.id)
          : undefined;
        if (existing && existing.projectId !== input.projectId)
          throw new Error("PROJECT_TOOL_SCOPE");
        if (existing?.status === "retired")
          throw new Error("PROJECT_TOOL_RETIRED");
        const at = nowIso();
        saved = {
          ...existing,
          id: existing?.id ?? createId("tool"),
          ownerId: userId,
          projectId: input.projectId,
          assetNumber:
            existing?.assetNumber ??
            nextProjectToolNumber(current.projectTools, input.projectId),
          name: input.name.trim(),
          category: input.category.trim(),
          manufacturer: input.manufacturer?.trim() || undefined,
          model: input.model?.trim() || undefined,
          serialNumber: input.serialNumber?.trim() || undefined,
          note: input.note?.trim() || undefined,
          status: existing?.status ?? "available",
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          projectTools: [
            saved!,
            ...current.projectTools.filter((item) => item.id !== saved!.id),
          ],
          outbox: enqueue(current.outbox, "project_tool", saved.id, saved),
        };
      });
      if (!saved) throw new Error("PROJECT_TOOL_SAVE_FAILED");
      return saved;
    },
    [persist, userId],
  );
  const issueProjectTool = useCallback<AppContextValue["issueProjectTool"]>(
    async (id, workerId, expectedReturnDate, note) => {
      if (
        expectedReturnDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(expectedReturnDate) ||
          expectedReturnDate < localDateIso())
      )
        throw new Error("INVALID_TOOL_RETURN_DATE");
      if (note && note.trim().length > 1000)
        throw new Error("INVALID_TOOL_NOTE");
      let result: ProjectTool | undefined;
      await persist((current) => {
        const existing = current.projectTools.find((item) => item.id === id);
        const worker = current.workers.find((item) => item.id === workerId);
        if (!existing || existing.status !== "available")
          throw new Error("PROJECT_TOOL_NOT_AVAILABLE");
        if (
          !worker ||
          worker.projectId !== existing.projectId ||
          worker.status !== "active"
        )
          throw new Error("ACTIVE_PROJECT_WORKER_REQUIRED");
        const at = nowIso();
        result = {
          ...existing,
          status: "issued",
          currentWorkerId: workerId,
          issuedAt: at,
          expectedReturnDate,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectTools: current.projectTools.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_tool_issue", id, {
            toolId: id,
            workerId,
            expectedReturnDate,
            note: note?.trim() || undefined,
          }),
        };
      });
      return result!;
    },
    [persist],
  );
  const returnProjectTool = useCallback<AppContextValue["returnProjectTool"]>(
    async (id, condition, note) => {
      if (note && note.trim().length > 1000)
        throw new Error("INVALID_TOOL_NOTE");
      let result: ProjectTool | undefined;
      await persist((current) => {
        const existing = current.projectTools.find((item) => item.id === id);
        if (!existing || existing.status !== "issued")
          throw new Error("PROJECT_TOOL_NOT_ISSUED");
        const at = nowIso();
        result = {
          ...existing,
          status: condition === "damaged" ? "maintenance" : "available",
          currentWorkerId: undefined,
          issuedAt: undefined,
          expectedReturnDate: undefined,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectTools: current.projectTools.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_tool_return", id, {
            toolId: id,
            condition,
            note: note?.trim() || undefined,
          }),
        };
      });
      return result!;
    },
    [persist],
  );
  const reportProjectToolIssue = useCallback<
    AppContextValue["reportProjectToolIssue"]
  >(
    async (id, issueType, note) => {
      const safeNote = note.trim();
      if (safeNote.length < 3 || safeNote.length > 1000)
        throw new Error("INVALID_PROJECT_TOOL_ISSUE");
      let result: ProjectTool | undefined;
      await persist((current) => {
        const existing = current.projectTools.find((item) => item.id === id);
        if (!existing || !["available", "issued"].includes(existing.status))
          throw new Error("PROJECT_TOOL_ISSUE_NOT_ALLOWED");
        const at = nowIso();
        result = {
          ...existing,
          status: issueType === "lost" ? "lost" : "maintenance",
          currentWorkerId: undefined,
          issuedAt: undefined,
          expectedReturnDate: undefined,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectTools: current.projectTools.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_tool_problem", id, {
            toolId: id,
            issueType,
            note: safeNote,
          }),
        };
      });
      return result!;
    },
    [persist],
  );
  const restoreProjectTool = useCallback<AppContextValue["restoreProjectTool"]>(
    async (id, note) => {
      if (note && note.trim().length > 1000)
        throw new Error("INVALID_TOOL_NOTE");
      let result: ProjectTool | undefined;
      await persist((current) => {
        const existing = current.projectTools.find((item) => item.id === id);
        if (!existing || !["maintenance", "lost"].includes(existing.status))
          throw new Error("PROJECT_TOOL_NOT_RESTORABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "available",
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectTools: current.projectTools.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_tool_restore", id, {
            toolId: id,
            note: note?.trim() || undefined,
          }),
        };
      });
      return result!;
    },
    [persist],
  );
  const retireProjectTool = useCallback<AppContextValue["retireProjectTool"]>(
    async (id, reason) => {
      const safeReason = reason.trim();
      if (safeReason.length < 3 || safeReason.length > 1000)
        throw new Error("PROJECT_TOOL_RETIRE_REASON_REQUIRED");
      let result: ProjectTool | undefined;
      await persist((current) => {
        const existing = current.projectTools.find((item) => item.id === id);
        if (
          !existing ||
          !["available", "maintenance", "lost"].includes(existing.status)
        )
          throw new Error("PROJECT_TOOL_NOT_RETIRABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "retired",
          retiredAt: at,
          updatedAt: at,
          syncStatus: "pending",
        };
        return {
          ...current,
          projectTools: current.projectTools.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "project_tool_retire", id, {
            toolId: id,
            reason: safeReason,
          }),
        };
      });
      return result!;
    },
    [persist],
  );
  const addSiteTask = useCallback(
    async (
      input: Omit<
        SiteTask,
        | "id"
        | "ownerId"
        | "submittedAt"
        | "reviewedAt"
        | "reviewedBy"
        | "reviewNote"
        | "revisionCount"
        | "syncStatus"
        | "createdAt"
        | "updatedAt"
      >,
    ) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateTaskInput(input) !== "ok")
        throw new Error("INVALID_SITE_TASK");
      const at = nowIso();
      const task: SiteTask = {
        ...input,
        revisionCount: 0,
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        id: createId("task"),
        ownerId: userId,
        syncStatus: "pending",
        createdAt: at,
        updatedAt: at,
      };
      await persist((current) => ({
        ...current,
        siteTasks: [task, ...current.siteTasks],
        outbox: enqueue(current.outbox, "site_task", task.id, task),
      }));
      return task;
    },
    [persist, userId],
  );
  const updateSiteTask = useCallback(
    async (
      id: string,
      patch: Partial<
        Omit<
          SiteTask,
          "id" | "ownerId" | "projectId" | "createdAt" | "updatedAt"
        >
      >,
    ) => {
      let result: SiteTask | undefined;
      await persist((current) => {
        const existing = current.siteTasks.find((item) => item.id === id);
        if (!existing) throw new Error("SITE_TASK_NOT_FOUND");
        result = {
          ...existing,
          ...patch,
          title: (patch.title ?? existing.title).trim(),
          description:
            patch.description === undefined
              ? existing.description
              : patch.description.trim() || undefined,
          syncStatus: "pending",
          updatedAt: nowIso(),
        };
        if (validateTaskInput(result) !== "ok")
          throw new Error("INVALID_SITE_TASK");
        return {
          ...current,
          siteTasks: current.siteTasks.map((item) =>
            item.id === id ? result! : item,
          ),
          outbox: enqueue(current.outbox, "site_task", id, result),
        };
      });
      if (!result) throw new Error("SITE_TASK_NOT_FOUND");
      return result;
    },
    [persist],
  );
  const setSiteTaskStatus = useCallback(
    (id: string, status: SiteTaskStatus) =>
      updateSiteTask(id, taskStatusPatch(status, nowIso())),
    [updateSiteTask],
  );
  const reviewSiteTask = useCallback(
    async (id: string, decision: "accept" | "rework", note?: string) => {
      const task = await reviewRemoteSiteTask(id, decision, note);
      await persist((current) => ({
        ...current,
        siteTasks: current.siteTasks.map((item) =>
          item.id === id ? task : item,
        ),
      }));
      return task;
    },
    [persist],
  );
  const setSiteTaskClientVisibility = useCallback(
    async (id: string, visible: boolean) => {
      const task = await setRemoteSiteTaskClientVisibility(id, visible);
      await persist((current) => ({
        ...current,
        siteTasks: current.siteTasks.map((item) =>
          item.id === id ? task : item,
        ),
      }));
      return task;
    },
    [persist],
  );
  const saveProjectChecklist = useCallback(
    async (checklist: ProjectChecklist) => {
      if (!userId || checklist.ownerId !== userId)
        throw new Error("NOT_AUTHENTICATED");
      let saved: ProjectChecklist | undefined;
      await persist((current) => {
        const existing = current.projectChecklists.find(
          (item) => item.id === checklist.id,
        );
        if (existing?.status === "completed")
          throw new Error("COMPLETED_CHECKLIST_IMMUTABLE");
        const at = nowIso();
        saved = {
          ...checklist,
          templateName: checklist.templateName.trim(),
          note: checklist.note?.trim() || undefined,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? checklist.createdAt ?? at,
          updatedAt: at,
        };
        const generatedDefects = defectsForFailedChecklist(saved, at).filter(
          (defect) =>
            !current.siteTasks.some(
              (existingTask) => existingTask.id === defect.id,
            ),
        );
        let outbox = enqueue(
          current.outbox,
          "project_checklist",
          checklist.id,
          saved,
        );
        for (const defect of generatedDefects)
          outbox = enqueue(outbox, "site_task", defect.id, defect);
        return {
          ...current,
          projectChecklists: [
            saved!,
            ...current.projectChecklists.filter(
              (item) => item.id !== checklist.id,
            ),
          ],
          siteTasks: [...generatedDefects, ...current.siteTasks],
          outbox,
        };
      });
      if (!saved) throw new Error("CHECKLIST_SAVE_FAILED");
      return saved;
    },
    [persist, userId],
  );
  const saveChangeOrder = useCallback(
    async (
      input: Omit<
        ChangeOrder,
        | "id"
        | "ownerId"
        | "orderNumber"
        | "submittedAt"
        | "decidedAt"
        | "signerName"
        | "decisionComment"
        | "shareLinkId"
        | "syncStatus"
        | "createdAt"
        | "updatedAt"
      > & { id?: string },
    ) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const title = input.title.trim();
      const description = input.description.trim();
      if (title.length < 3 || title.length > 120)
        throw new Error("INVALID_CHANGE_ORDER_TITLE");
      if (description.length < 3 || description.length > 1200)
        throw new Error("INVALID_CHANGE_ORDER_DESCRIPTION");
      if (
        !Number.isInteger(input.amountCents) ||
        input.amountCents === 0 ||
        Math.abs(input.amountCents) > 100_000_000
      )
        throw new Error("INVALID_CHANGE_ORDER_AMOUNT");
      if (
        !Number.isInteger(input.scheduleImpactDays) ||
        Math.abs(input.scheduleImpactDays) > 365
      )
        throw new Error("INVALID_CHANGE_ORDER_SCHEDULE");
      if (!["draft", "pending_client"].includes(input.status))
        throw new Error("INVALID_CHANGE_ORDER_STATUS");
      let saved: ChangeOrder | undefined;
      await persist((current) => {
        const id = input.id ?? createId("change");
        const existing = current.changeOrders.find((item) => item.id === id);
        if (existing && existing.status !== "draft")
          throw new Error("CHANGE_ORDER_IMMUTABLE");
        const at = nowIso();
        saved = {
          ...input,
          id,
          ownerId: userId,
          title,
          description,
          relatedTaskId: input.relatedTaskId || undefined,
          submittedAt:
            input.status === "pending_client"
              ? (existing?.submittedAt ?? at)
              : undefined,
          orderNumber: existing?.orderNumber,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          changeOrders: [
            saved!,
            ...current.changeOrders.filter((item) => item.id !== id),
          ],
          outbox: enqueue(current.outbox, "change_order", id, saved),
        };
      });
      if (!saved) throw new Error("CHANGE_ORDER_SAVE_FAILED");
      return saved;
    },
    [persist, userId],
  );
  const saveProjectBudget = useCallback(
    async (
      baselineBudgetCents: number,
      contingencyCents: number,
      remainingCommitmentCents: number,
      note?: string,
    ) => {
      if (!userId || !selectedProject) throw new Error("NOT_AUTHENTICATED");
      const validation = validateProjectBudget({
        baselineBudgetCents,
        contingencyCents,
        remainingCommitmentCents,
        note,
      });
      if (validation !== "ok")
        throw new Error(`INVALID_PROJECT_BUDGET_${validation.toUpperCase()}`);
      let saved: ProjectBudget | undefined;
      await persist((current) => {
        const existing = current.projectBudgets.find(
          (item) => item.projectId === selectedProject.id,
        );
        const at = nowIso();
        saved = {
          projectId: selectedProject.id,
          ownerId: userId,
          baselineBudgetCents,
          contingencyCents,
          remainingCommitmentCents,
          note: note?.trim() || undefined,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          projectBudgets: [
            saved!,
            ...current.projectBudgets.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
          ],
          outbox: enqueue(
            current.outbox,
            "project_budget",
            selectedProject.id,
            saved,
          ),
        };
      });
      if (!saved) throw new Error("PROJECT_BUDGET_SAVE_FAILED");
      return saved;
    },
    [persist, selectedProject, userId],
  );
  const saveProjectSchedule = useCallback(
    async (startDate: string, targetCompletionDate: string, note?: string) => {
      if (!userId || !selectedProject) throw new Error("NOT_AUTHENTICATED");
      const validation = validateProjectSchedule({
        startDate,
        targetCompletionDate,
        note,
      });
      if (validation !== "ok")
        throw new Error(`INVALID_PROJECT_SCHEDULE_${validation.toUpperCase()}`);
      let saved: ProjectSchedule | undefined;
      await persist((current) => {
        const existing = current.projectSchedules.find(
          (item) => item.projectId === selectedProject.id,
        );
        const at = nowIso();
        saved = {
          projectId: selectedProject.id,
          ownerId: userId,
          startDate,
          targetCompletionDate,
          note: note?.trim() || undefined,
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          projectSchedules: [
            saved!,
            ...current.projectSchedules.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
          ],
          outbox: enqueue(
            current.outbox,
            "project_schedule",
            selectedProject.id,
            saved,
          ),
        };
      });
      if (!saved) throw new Error("PROJECT_SCHEDULE_SAVE_FAILED");
      return saved;
    },
    [persist, selectedProject, userId],
  );
  const saveWeeklyReport = useCallback(
    async (
      input: Omit<
        WeeklyReport,
        | "id"
        | "ownerId"
        | "status"
        | "publishedAt"
        | "pdfReportId"
        | "syncStatus"
        | "createdAt"
        | "updatedAt"
      > & { id?: string },
    ) => {
      if (!userId || !selectedProject) throw new Error("NOT_AUTHENTICATED");
      if (input.projectId !== selectedProject.id)
        throw new Error("WEEKLY_REPORT_PROJECT_MISMATCH");
      const validation = validateWeeklyReport(input);
      if (validation !== "ok")
        throw new Error(`INVALID_WEEKLY_REPORT_${validation.toUpperCase()}`);
      let saved: WeeklyReport | undefined;
      await persist((current) => {
        const existing = input.id
          ? current.weeklyReports.find((item) => item.id === input.id)
          : current.weeklyReports.find(
              (item) =>
                item.projectId === input.projectId &&
                item.periodStart === input.periodStart &&
                item.status === "draft",
            );
        if (existing?.status === "published")
          throw new Error("WEEKLY_REPORT_IMMUTABLE");
        const id = existing?.id ?? input.id ?? createId("weekly-report");
        const at = nowIso();
        saved = {
          ...input,
          id,
          ownerId: userId,
          summary: input.summary.trim(),
          nextWeekPlan: input.nextWeekPlan.trim(),
          clientNote: input.clientNote?.trim() || undefined,
          status: "draft",
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          weeklyReports: [
            saved!,
            ...current.weeklyReports.filter((item) => item.id !== id),
          ],
          outbox: enqueue(current.outbox, "weekly_report", id, saved),
        };
      });
      if (!saved) throw new Error("WEEKLY_REPORT_SAVE_FAILED");
      return saved;
    },
    [persist, selectedProject, userId],
  );
  const publishWeeklyReport = useCallback(
    async (id: string, pdfReportId?: string) => {
      let published: WeeklyReport | undefined;
      await persist((current) => {
        const existing = current.weeklyReports.find((item) => item.id === id);
        if (!existing) throw new Error("WEEKLY_REPORT_NOT_FOUND");
        if (existing.status === "published") return current;
        const validation = validateWeeklyReport(existing);
        if (validation !== "ok")
          throw new Error(`INVALID_WEEKLY_REPORT_${validation.toUpperCase()}`);
        const at = nowIso();
        published = {
          ...existing,
          status: "published",
          publishedAt: at,
          pdfReportId,
          syncStatus: "pending",
          updatedAt: at,
        };
        return {
          ...current,
          weeklyReports: [
            published!,
            ...current.weeklyReports.filter((item) => item.id !== id),
          ],
          outbox: enqueue(current.outbox, "weekly_report", id, published),
        };
      });
      if (!published) {
        const existing = storeRef.current.snapshot.weeklyReports.find(
          (item) => item.id === id,
        );
        if (existing?.status === "published") return existing;
        throw new Error("WEEKLY_REPORT_PUBLISH_FAILED");
      }
      return published;
    },
    [persist],
  );
  const prepareDailyControlPlan = useCallback(
    async (items: ControlTowerItem[], actionDate: string) => {
      if (!userId || !selectedProject) throw new Error("NOT_AUTHENTICATED");
      let plan: DailyControlAction[] = [];
      await persist((current) => {
        const knownIds = new Set(
          current.dailyControlActions.map((item) => item.id),
        );
        const materialized = materializeDailyControlActions({
          existing: current.dailyControlActions,
          items,
          projectId: selectedProject.id,
          ownerId: userId,
          actionDate,
          at: nowIso(),
        });
        const additions = materialized.filter((item) => !knownIds.has(item.id));
        let outbox = current.outbox;
        for (const action of additions)
          outbox = enqueue(outbox, "daily_control_action", action.id, action);
        plan = materialized.filter(
          (item) =>
            item.projectId === selectedProject.id &&
            item.actionDate === actionDate,
        );
        return {
          ...current,
          dailyControlActions: materialized,
          outbox,
        };
      });
      return plan;
    },
    [persist, selectedProject, userId],
  );
  const resolveDailyControlAction = useCallback(
    async (id: string, resolution: string) => {
      if (!userId || !selectedProject) throw new Error("NOT_AUTHENTICATED");
      let resolved: DailyControlAction | undefined;
      await persist((current) => {
        const existing = current.dailyControlActions.find(
          (item) =>
            item.id === id &&
            item.projectId === selectedProject.id &&
            item.ownerId === userId,
        );
        if (!existing) throw new Error("DAILY_CONTROL_ACTION_NOT_FOUND");
        resolved = resolveDailyControlActionRecord({
          action: existing,
          resolution,
          userId,
          at: nowIso(),
        });
        return {
          ...current,
          dailyControlActions: current.dailyControlActions.map((item) =>
            item.id === id ? resolved! : item,
          ),
          outbox: enqueue(current.outbox, "daily_control_action", id, resolved),
        };
      });
      if (!resolved) throw new Error("DAILY_CONTROL_ACTION_RESOLVE_FAILED");
      return resolved;
    },
    [persist, selectedProject, userId],
  );
  const addSiteTaskComment = useCallback(
    async (taskId: string, body: string) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const trimmed = body.trim();
      if (!trimmed || trimmed.length > 1000)
        throw new Error("INVALID_TASK_COMMENT");
      let event: SiteTaskEvent | undefined;
      await persist((current) => {
        const task = current.siteTasks.find((item) => item.id === taskId);
        if (!task) throw new Error("SITE_TASK_NOT_FOUND");
        const at = nowIso();
        event = {
          id: createId("task_event"),
          ownerId: task.ownerId,
          projectId: task.projectId,
          taskId,
          actorUserId: userId,
          eventType: "comment",
          body: trimmed,
          metadata: {},
          syncStatus: "pending",
          createdAt: at,
        };
        return {
          ...current,
          siteTaskEvents: [event!, ...current.siteTaskEvents],
          outbox: enqueue(current.outbox, "site_task_event", event.id, event),
        };
      });
      if (!event) throw new Error("TASK_COMMENT_SAVE_FAILED");
      return event;
    },
    [persist, userId],
  );
  const reviewWorker = useCallback(
    async (id: string, status: Exclude<WorkerStatus, "pending">) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const worker = await setProjectWorkerStatus(id, status, userId);
      await persist((current) => ({
        ...current,
        workers: current.workers.map((item) =>
          item.id === id ? worker : item,
        ),
      }));
      return worker;
    },
    [persist, userId],
  );
  const updateMaterialRequest = useCallback(
    async (
      id: string,
      status: Exclude<MaterialRequestStatus, "new">,
      rejectionReason?: string,
    ) => {
      const request = await setMaterialRequestStatus(
        id,
        status,
        rejectionReason,
      );
      await persist((current) => ({
        ...current,
        materialRequests: current.materialRequests.map((item) =>
          item.id === id ? request : item,
        ),
      }));
      return request;
    },
    [persist],
  );
  const linkReceiptRequest = useCallback(
    async (
      receiptId: string,
      requestId: string,
      allocatedAmountCents?: number,
    ) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const link = await linkReceiptToRequest({
        ownerId: userId,
        receiptId,
        requestId,
        allocatedAmountCents,
      });
      await persist((current) => {
        const links = [
          link,
          ...current.receiptRequestLinks.filter(
            (item) =>
              item.id !== link.id &&
              !(item.receiptId === receiptId && item.requestId === requestId),
          ),
        ];
        const nextStatus = requestStatusFromProcurement(
          current,
          requestId,
          links,
        );
        return {
          ...current,
          receiptRequestLinks: links,
          materialRequests: nextStatus
            ? current.materialRequests.map((item) =>
                item.id === requestId
                  ? { ...item, status: nextStatus, updatedAt: nowIso() }
                  : item,
              )
            : current.materialRequests,
        };
      });
      return link;
    },
    [persist, userId],
  );
  const unlinkReceiptRequest = useCallback(
    async (receiptId: string, requestId: string) => {
      await unlinkReceiptFromRequest(receiptId, requestId);
      await persist((current) => {
        const links = current.receiptRequestLinks.filter(
          (item) =>
            !(item.receiptId === receiptId && item.requestId === requestId),
        );
        const nextStatus = requestStatusFromProcurement(
          current,
          requestId,
          links,
        );
        return {
          ...current,
          receiptRequestLinks: links,
          materialRequests: nextStatus
            ? current.materialRequests.map((item) =>
                item.id === requestId
                  ? { ...item, status: nextStatus, updatedAt: nowIso() }
                  : item,
              )
            : current.materialRequests,
        };
      });
    },
    [persist],
  );
  const saveSupplierQuote = useCallback(
    async (input: {
      id?: string;
      requestId: string;
      supplierName: string;
      totalAmountCents: number;
      deliveryDate?: string;
      validUntil?: string;
      note?: string;
    }) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateSupplierQuote(input) !== "ok")
        throw new Error("INVALID_SUPPLIER_QUOTE");
      let saved: MaterialSupplierQuote | undefined;
      await persist((current) => {
        const request = current.materialRequests.find(
          (item) => item.id === input.requestId && item.ownerId === userId,
        );
        if (
          !request ||
          !["approved", "partially_purchased"].includes(request.status)
        )
          throw new Error("MATERIAL_REQUEST_NOT_APPROVED");
        const existing = input.id
          ? (current.materialSupplierQuotes ?? []).find(
              (item) => item.id === input.id,
            )
          : undefined;
        if (
          existing &&
          (existing.requestId !== request.id || existing.status === "selected")
        )
          throw new Error("SUPPLIER_QUOTE_LOCKED");
        const at = nowIso();
        saved = {
          id: existing?.id ?? createId("supplier_quote"),
          ownerId: userId,
          projectId: request.projectId,
          requestId: request.id,
          supplierName: input.supplierName.trim(),
          totalAmountCents: input.totalAmountCents,
          currency: "EUR",
          deliveryDate: input.deliveryDate,
          validUntil: input.validUntil,
          note: input.note?.trim() || undefined,
          status: "offered",
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        return {
          ...current,
          materialSupplierQuotes: [
            saved!,
            ...(current.materialSupplierQuotes ?? []).filter(
              (item) => item.id !== saved!.id,
            ),
          ],
          outbox: enqueue(
            current.outbox,
            "material_supplier_quote",
            saved.id,
            saved,
          ),
        };
      });
      if (!saved) throw new Error("SUPPLIER_QUOTE_SAVE_FAILED");
      return saved;
    },
    [persist, userId],
  );
  const selectSupplierQuote = useCallback(
    async (id: string) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      let selected: MaterialSupplierQuote | undefined;
      await persist((current) => {
        const existing = (current.materialSupplierQuotes ?? []).find(
          (item) => item.id === id && item.ownerId === userId,
        );
        const request = existing
          ? current.materialRequests.find(
              (item) => item.id === existing.requestId,
            )
          : undefined;
        if (
          !existing ||
          !request ||
          !["approved", "partially_purchased"].includes(request.status) ||
          existing.status === "withdrawn"
        )
          throw new Error("SUPPLIER_QUOTE_NOT_SELECTABLE");
        const at = nowIso();
        selected = {
          ...existing,
          status: "selected",
          selectedAt: existing.selectedAt ?? at,
          syncStatus: "pending",
          updatedAt: at,
        };
        const allocated = current.receiptRequestLinks
          .filter((item) => item.requestId === existing.requestId)
          .reduce((total, item) => total + (item.allocatedAmountCents ?? 0), 0);
        const requestStatus: MaterialRequestStatus =
          allocated >= existing.totalAmountCents
            ? "purchased"
            : allocated > 0
              ? "partially_purchased"
              : "approved";
        return {
          ...current,
          materialSupplierQuotes: (current.materialSupplierQuotes ?? []).map(
            (item) =>
              item.requestId !== existing.requestId
                ? item
                : item.id === id
                  ? selected!
                  : item.status === "selected"
                    ? {
                        ...item,
                        status: "withdrawn" as const,
                        selectedAt: undefined,
                        updatedAt: at,
                      }
                    : item,
          ),
          materialRequests: current.materialRequests.map((item) =>
            item.id === existing.requestId
              ? { ...item, status: requestStatus, updatedAt: at }
              : item,
          ),
          outbox: enqueue(current.outbox, "material_quote_selection", id, {
            quoteId: id,
          }),
        };
      });
      if (!selected) throw new Error("SUPPLIER_QUOTE_SELECT_FAILED");
      return selected;
    },
    [persist, userId],
  );
  const withdrawSupplierQuote = useCallback(
    async (id: string) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      let withdrawn: MaterialSupplierQuote | undefined;
      await persist((current) => {
        const existing = (current.materialSupplierQuotes ?? []).find(
          (item) =>
            item.id === id &&
            item.ownerId === userId &&
            item.status === "offered",
        );
        if (!existing) throw new Error("SUPPLIER_QUOTE_NOT_WITHDRAWABLE");
        const at = nowIso();
        withdrawn = {
          ...existing,
          status: "withdrawn",
          syncStatus: "pending",
          updatedAt: at,
        };
        return {
          ...current,
          materialSupplierQuotes: (current.materialSupplierQuotes ?? []).map(
            (item) => (item.id === id ? withdrawn! : item),
          ),
          outbox: enqueue(current.outbox, "material_quote_withdrawal", id, {
            quoteId: id,
          }),
        };
      });
      if (!withdrawn) throw new Error("SUPPLIER_QUOTE_WITHDRAW_FAILED");
      return withdrawn;
    },
    [persist, userId],
  );
  const saveMaterialDelivery = useCallback<
    AppContextValue["saveMaterialDelivery"]
  >(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const { lines, ...fields } = input;
      if (validateMaterialDelivery(fields, lines) !== "ok")
        throw new Error("INVALID_MATERIAL_DELIVERY");
      let result: MaterialDelivery | undefined;
      await persist((current) => {
        const request = current.materialRequests.find(
          (x) => x.id === input.requestId && x.projectId === input.projectId,
        );
        const existing = input.id
          ? current.materialDeliveries.find((x) => x.id === input.id)
          : undefined;
        if (
          !request ||
          !["approved", "partially_purchased", "purchased"].includes(
            request.status,
          )
        )
          throw new Error("MATERIAL_REQUEST_NOT_APPROVED");
        if (existing && existing.status !== "reported")
          throw new Error("MATERIAL_DELIVERY_NOT_EDITABLE");
        const at = nowIso();
        const id = existing?.id ?? createId("delivery");
        const quote = (current.materialSupplierQuotes ?? []).find(
          (x) => x.requestId === input.requestId && x.status === "selected",
        );
        result = {
          ...existing,
          ...fields,
          id,
          ownerId: userId,
          quoteId: quote?.id,
          supplierName: input.supplierName.trim(),
          receiverName: input.receiverName.trim(),
          deliveryNoteNumber: input.deliveryNoteNumber?.trim() || undefined,
          note: input.note?.trim() || undefined,
          status: "reported",
          syncStatus: "pending",
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        const localLines: MaterialDeliveryLine[] = lines.map((x) => ({
          id: createId("delivery-line"),
          ownerId: userId,
          projectId: input.projectId,
          deliveryId: id,
          ...x,
          createdAt: at,
        }));
        const event: MaterialDeliveryEvent = {
          id: createId("delivery-event"),
          ownerId: userId,
          projectId: input.projectId,
          deliveryId: id,
          eventType: existing ? "updated" : "reported",
          metadata: { lineCount: lines.length },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          materialDeliveries: [
            result!,
            ...current.materialDeliveries.filter((x) => x.id !== id),
          ],
          materialDeliveryLines: [
            ...current.materialDeliveryLines.filter((x) => x.deliveryId !== id),
            ...localLines,
          ],
          materialDeliveryEvents: [...current.materialDeliveryEvents, event],
          outbox: enqueue(current.outbox, "material_delivery", id, {
            delivery: result!,
            lines,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const reviewMaterialDelivery = useCallback<
    AppContextValue["reviewMaterialDelivery"]
  >(
    async (id) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      let result: MaterialDelivery | undefined;
      await persist((current) => {
        const existing = current.materialDeliveries.find((x) => x.id === id);
        if (!existing || existing.status !== "reported")
          throw new Error("MATERIAL_DELIVERY_NOT_REVIEWABLE");
        const lines = current.materialDeliveryLines.filter(
          (x) => x.deliveryId === id,
        );
        const status = deliveryHasDiscrepancy(lines)
          ? "discrepancy"
          : "accepted";
        const at = nowIso();
        result = {
          ...existing,
          status,
          reviewedAt: at,
          reviewedBy: userId,
          syncStatus: "pending",
          updatedAt: at,
        };
        const event: MaterialDeliveryEvent = {
          id: createId("delivery-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          deliveryId: id,
          eventType: status,
          metadata: { hasDiscrepancy: status === "discrepancy" },
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          materialDeliveries: current.materialDeliveries.map((x) =>
            x.id === id ? result! : x,
          ),
          materialDeliveryEvents: [...current.materialDeliveryEvents, event],
          outbox: enqueue(current.outbox, "material_delivery_review", id, {
            deliveryId: id,
            lines,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const resolveMaterialDelivery = useCallback<
    AppContextValue["resolveMaterialDelivery"]
  >(
    async (id, resolution) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const safe = resolution.trim();
      if (safe.length < 5 || safe.length > 1000)
        throw new Error("DELIVERY_RESOLUTION_REQUIRED");
      let result: MaterialDelivery | undefined;
      await persist((current) => {
        const existing = current.materialDeliveries.find((x) => x.id === id);
        if (!existing || existing.status !== "discrepancy")
          throw new Error("MATERIAL_DELIVERY_NOT_RESOLVABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: "resolved",
          resolution: safe,
          resolvedAt: at,
          resolvedBy: userId,
          syncStatus: "pending",
          updatedAt: at,
        };
        const event: MaterialDeliveryEvent = {
          id: createId("delivery-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          deliveryId: id,
          eventType: "resolved",
          body: safe,
          metadata: {},
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          materialDeliveries: current.materialDeliveries.map((x) =>
            x.id === id ? result! : x,
          ),
          materialDeliveryEvents: [...current.materialDeliveryEvents, event],
          outbox: enqueue(current.outbox, "material_delivery_resolve", id, {
            deliveryId: id,
            resolution: safe,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );

  const saveMaterialStockMovement = useCallback<
    AppContextValue["saveMaterialStockMovement"]
  >(
    async (input) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateMaterialStockMovement(input) !== "ok")
        throw new Error("INVALID_MATERIAL_STOCK_MOVEMENT");
      let result: MaterialStockMovement | undefined;
      await persist((current) => {
        const request = current.materialRequests.find(
          (item) =>
            item.id === input.requestId && item.projectId === input.projectId,
        );
        const requestItem = current.materialRequestItems.find(
          (item) =>
            item.id === input.requestItemId &&
            item.requestId === input.requestId,
        );
        const hasReviewedDelivery = current.materialDeliveryLines.some(
          (line) =>
            line.requestItemId === input.requestItemId &&
            current.materialDeliveries.some(
              (delivery) =>
                delivery.id === line.deliveryId &&
                (delivery.status === "accepted" ||
                  delivery.status === "resolved"),
            ),
        );
        if (!request || !requestItem || !hasReviewedDelivery)
          throw new Error("MATERIAL_STOCK_ITEM_SCOPE");
        const at = nowIso();
        const worker = input.workerId
          ? current.workers.find((item) => item.id === input.workerId)
          : undefined;
        result = {
          ...input,
          id: input.id ?? createId("stock"),
          ownerId: userId,
          materialName: requestItem.name,
          unit: requestItem.unit,
          workerName: worker
            ? `${worker.firstName} ${worker.lastName}`
            : undefined,
          status: "confirmed",
          reviewedAt: at,
          reviewedBy: userId,
          syncStatus: "pending",
          createdAt: at,
        };
        const event: MaterialStockMovementEvent = {
          id: createId("stock-event"),
          ownerId: userId,
          projectId: input.projectId,
          movementId: result.id,
          eventType: "confirmed",
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          materialStockMovements: [result!, ...current.materialStockMovements],
          materialStockMovementEvents: [
            ...current.materialStockMovementEvents,
            event,
          ],
          outbox: enqueue(
            current.outbox,
            "material_stock_movement",
            result!.id,
            result!,
          ),
        };
      });
      return result!;
    },
    [persist, userId],
  );

  const reviewMaterialStockMovement = useCallback<
    AppContextValue["reviewMaterialStockMovement"]
  >(
    async (id, decision, rejectionReason) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      const reason = rejectionReason?.trim();
      if (
        decision === "rejected" &&
        (!reason || reason.length < 3 || reason.length > 500)
      )
        throw new Error("MATERIAL_STOCK_REJECTION_REQUIRED");
      let result: MaterialStockMovement | undefined;
      await persist((current) => {
        const existing = current.materialStockMovements.find(
          (item) => item.id === id,
        );
        if (!existing || existing.status !== "reported")
          throw new Error("MATERIAL_STOCK_NOT_REVIEWABLE");
        const at = nowIso();
        result = {
          ...existing,
          status: decision,
          reviewedAt: at,
          reviewedBy: userId,
          rejectionReason: decision === "rejected" ? reason : undefined,
          syncStatus: "pending",
        };
        const event: MaterialStockMovementEvent = {
          id: createId("stock-event"),
          ownerId: existing.ownerId,
          projectId: existing.projectId,
          movementId: id,
          eventType: decision,
          body: result.rejectionReason,
          actorUserId: userId,
          createdAt: at,
        };
        return {
          ...current,
          materialStockMovements: current.materialStockMovements.map((item) =>
            item.id === id ? result! : item,
          ),
          materialStockMovementEvents: [
            ...current.materialStockMovementEvents,
            event,
          ],
          outbox: enqueue(current.outbox, "material_stock_review", id, {
            movementId: id,
            decision,
            rejectionReason: reason,
          }),
        };
      });
      return result!;
    },
    [persist, userId],
  );
  const saveTaskMaterialRequirements = useCallback<
    AppContextValue["saveTaskMaterialRequirements"]
  >(
    async (taskId, requirements) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (validateTaskMaterialRequirements(requirements) !== "ok")
        throw new Error("INVALID_TASK_MATERIAL_REQUIREMENTS");
      await persist((current) => {
        const task = current.siteTasks.find(
          (item) => item.id === taskId && item.ownerId === userId,
        );
        if (!task) throw new Error("TASK_MATERIAL_SCOPE");
        const at = nowIso();
        const rows = requirements.map((input) => {
          const requestItem = current.materialRequestItems.find(
            (item) => item.id === input.requestItemId,
          );
          const request = requestItem
            ? current.materialRequests.find(
                (item) =>
                  item.id === requestItem.requestId &&
                  item.projectId === task.projectId,
              )
            : undefined;
          if (!requestItem || !request)
            throw new Error("TASK_MATERIAL_ITEM_SCOPE");
          return {
            id: createId("task-material"),
            ownerId: userId,
            projectId: task.projectId,
            taskId,
            requestId: request.id,
            requestItemId: requestItem.id,
            materialName: requestItem.name,
            unit: requestItem.unit,
            quantity: input.quantity,
            syncStatus: "pending" as const,
            createdAt: at,
            updatedAt: at,
          };
        });
        return {
          ...current,
          taskMaterialRequirements: [
            ...current.taskMaterialRequirements.filter(
              (item) => item.taskId !== taskId,
            ),
            ...rows,
          ],
          outbox: enqueue(
            current.outbox,
            "task_material_requirements",
            taskId,
            { taskId, requirements },
          ),
        };
      });
    },
    [persist, userId],
  );
  const saveTaskToolRequirements = useCallback<
    AppContextValue["saveTaskToolRequirements"]
  >(
    async (taskId, toolIds) => {
      if (!userId) throw new Error("NOT_AUTHENTICATED");
      if (
        validateTaskToolRequirements(toolIds.map((toolId) => ({ toolId }))) !==
        "ok"
      )
        throw new Error("INVALID_TASK_TOOL_REQUIREMENTS");
      await persist((current) => {
        const task = current.siteTasks.find(
          (item) => item.id === taskId && item.ownerId === userId,
        );
        if (!task) throw new Error("TASK_TOOL_SCOPE");
        const at = nowIso();
        const rows = toolIds.map((toolId): TaskToolRequirement => {
          const tool = current.projectTools.find(
            (item) =>
              item.id === toolId &&
              item.projectId === task.projectId &&
              item.status !== "retired",
          );
          if (!tool) throw new Error("TASK_TOOL_ITEM_SCOPE");
          return {
            id: createId("task-tool"),
            ownerId: userId,
            projectId: task.projectId,
            taskId,
            toolId: tool.id,
            assetNumber: tool.assetNumber,
            toolName: tool.name,
            category: tool.category,
            syncStatus: "pending",
            createdAt: at,
            updatedAt: at,
          };
        });
        return {
          ...current,
          taskToolRequirements: [
            ...current.taskToolRequirements.filter(
              (item) => item.taskId !== taskId,
            ),
            ...rows,
          ],
          outbox: enqueue(current.outbox, "task_tool_requirements", taskId, {
            taskId,
            toolIds,
          }),
        };
      });
    },
    [persist, userId],
  );
  const readNotification = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
      await persist((current) => ({
        ...current,
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, readAt: nowIso() } : item,
        ),
      }));
    },
    [persist],
  );
  const confirmDayClosure = useCallback(
    async (input: {
      logDate: string;
      confirmed: boolean;
      correctionReason?: string;
    }) => {
      if (!userId || !selectedProject) throw new Error("NOT_AUTHENTICATED");
      const current = storeRef.current.snapshot;
      const summary = summarizeDayClosure(
        current,
        selectedProject.id,
        input.logDate,
      );
      const status = dayClosureStatus(
        current,
        selectedProject.id,
        input.logDate,
      );
      const validation = validateDayClosureConfirmation({
        summary,
        status,
        confirmed: input.confirmed,
        correctionReason: input.correctionReason,
      });
      if (validation) throw new Error(validation.toUpperCase());

      const snapshot = buildDayClosureSnapshot(
        current,
        selectedProject.id,
        input.logDate,
      );
      const confirmedAt = nowIso();
      const record: DayClosureRecord = {
        id: createId("closure"),
        ownerId: userId,
        projectId: selectedProject.id,
        logDate: input.logDate,
        version: (status.latest?.version ?? 0) + 1,
        supersedesClosureId: status.latest?.id,
        correctionReason: status.latest
          ? input.correctionReason?.trim()
          : undefined,
        snapshot,
        contentHash: await hashDayClosureSnapshot(snapshot),
        confirmationVersion: "sk-v1",
        acknowledgedWarnings: summary.checks
          .filter((check) => !check.complete)
          .map((check) => check.key),
        confirmedAt,
        confirmedBy: userId,
        syncStatus: "pending",
        createdAt: confirmedAt,
      };
      const sealedIds = new Set(snapshot.diaryEntries.map((entry) => entry.id));
      await persist((latest) => ({
        ...latest,
        diaryEntries: latest.diaryEntries.map((entry) =>
          sealedIds.has(entry.id)
            ? {
                ...entry,
                lockedAt: entry.lockedAt ?? confirmedAt,
                lockedBy: entry.lockedBy ?? userId,
              }
            : entry,
        ),
        dayClosures: [
          record,
          ...latest.dayClosures.filter((item) => item.id !== record.id),
        ],
        outbox: enqueue(latest.outbox, "day_closure", record.id, record),
      }));
      return record;
    },
    [persist, selectedProject, userId],
  );
  const lockDiary = useCallback(
    async (id: string) => {
      if (userId) await lockDiaryEntry(id, userId);
      await persist((current) => ({
        ...current,
        diaryEntries: current.diaryEntries.map((entry) =>
          entry.id === id
            ? { ...entry, lockedAt: nowIso(), lockedBy: userId }
            : entry,
        ),
      }));
    },
    [persist, userId],
  );
  const lockDelay = useCallback(
    async (id: string) => {
      if (userId) await lockDelayEvent(id, userId);
      await persist((current) => ({
        ...current,
        delayEvents: current.delayEvents.map((event) =>
          event.id === id
            ? { ...event, lockedAt: nowIso(), lockedBy: userId }
            : event,
        ),
      }));
    },
    [persist, userId],
  );
  const performSync = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const snapshot = storeRef.current.snapshot;
    const startedAt = Date.now();
    const resolvedWeather = new Map<
      string,
      DiaryEntry["evidence"]["weather"]
    >();
    const resolvedDelayWeather = new Map<
      string,
      DelayEvent["evidence"]["weather"]
    >();
    const uploadedReceiptFiles = new Map<string, ReceiptFile>();
    const uploadedPlans = new Map<string, ProjectPlan>();
    const resolvedProjectRfis = new Map<string, ProjectRfi>();
    const resolvedProjectTools = new Map<string, ProjectTool>();
    const resolvedWorkShifts = new Map<string, WorkShift>();
    const resolvedSafetyBriefings = new Map<string, SafetyBriefing>();
    const resolvedSafetyRecipients = new Map<string, SafetyBriefingRecipient>();
    const resolvedWorkerCredentials = new Map<string, WorkerCredential>();
    const resolvedSiteIncidents = new Map<string, SiteIncident>();
    const resolvedChangeOrders = new Map<string, ChangeOrder>();
    const resolvedProjectBudgets = new Map<string, ProjectBudget>();
    const resolvedProjectSchedules = new Map<string, ProjectSchedule>();
    const resolvedWeeklyReports = new Map<string, WeeklyReport>();
    const resolvedDailyControlActions = new Map<string, DailyControlAction>();
    const resolvedDayClosures = new Map<string, DayClosureRecord>();
    const resolvedSupplierQuotes = new Map<string, MaterialSupplierQuote>();
    const resolvedMaterialDeliveries = new Map<string, MaterialDelivery>();
    const resolvedMaterialStockMovements = new Map<
      string,
      MaterialStockMovement
    >();
    const resolvedTaskMaterials = new Map<string, TaskMaterialRequirement[]>();
    const resolvedTaskTools = new Map<string, TaskToolRequirement[]>();
    const ocrReceipts = new Map<string, Partial<Receipt>>();
    let nextOutbox: AppState["outbox"];
    try {
      nextOutbox = await processOutbox(snapshot.outbox, async (item) => {
        if (item.type === "diary_entry") {
          const entry = item.payload as DiaryEntry;
          if (
            entry.evidence.weather?.status === "pending" &&
            entry.evidence.gps
          ) {
            try {
              entry.evidence.weather = await fetchWeather(entry.evidence.gps);
              resolvedWeather.set(entry.id, entry.evidence.weather);
            } catch {
              /* keep pending for the next retry */
            }
          }
          const remoteId = await insertDiary(entry);
          if (entry.evidence.weather)
            await insertWeatherSnapshot(
              entry.ownerId,
              entry.projectId,
              entry.evidence.weather,
            );
          return remoteId;
        }
        if (item.type === "day_closure") {
          const closure = await saveRemoteDayClosure(
            item.payload as DayClosureRecord,
          );
          resolvedDayClosures.set(closure.id, closure);
          return closure.id;
        }
        if (item.type === "delay_event") {
          const event = item.payload as DelayEvent;
          if (
            event.evidence.weather?.status === "pending" &&
            event.evidence.gps
          ) {
            try {
              event.evidence.weather = await fetchWeather(event.evidence.gps);
              resolvedDelayWeather.set(event.id, event.evidence.weather);
            } catch {
              /* keep pending for the next retry */
            }
          }
          const remoteId = await insertDelay(event);
          if (event.evidence.weather)
            await insertWeatherSnapshot(
              event.ownerId,
              event.projectId,
              event.evidence.weather,
            );
          return remoteId;
        }
        if (item.type === "attachment") {
          const uploaded = await uploadPrivateAttachment(
            item.payload as Attachment,
          );
          return uploaded.id;
        }
        if (item.type === "receipt_category")
          return upsertReceiptCategory(item.payload as ReceiptCategory);
        if (item.type === "receipt")
          return upsertReceipt(item.payload as Receipt);
        if (item.type === "receipt_file") {
          const uploaded = await uploadReceiptFile(item.payload as ReceiptFile);
          uploadedReceiptFiles.set(uploaded.id, uploaded);
          return uploaded.id;
        }
        if (item.type === "material_supplier_quote") {
          const quote = await saveRemoteSupplierQuote(
            item.payload as MaterialSupplierQuote,
          );
          resolvedSupplierQuotes.set(quote.id, quote);
          return quote.id;
        }
        if (item.type === "material_quote_selection") {
          const quote = await selectRemoteSupplierQuote(
            String((item.payload as { quoteId: string }).quoteId),
          );
          resolvedSupplierQuotes.set(quote.id, quote);
          return quote.id;
        }
        if (item.type === "material_quote_withdrawal") {
          const quote = await withdrawRemoteSupplierQuote(
            String((item.payload as { quoteId: string }).quoteId),
          );
          resolvedSupplierQuotes.set(quote.id, quote);
          return quote.id;
        }
        if (item.type === "material_delivery") {
          const payload = item.payload as {
            delivery: MaterialDelivery;
            lines: DeliveryInputLine[];
          };
          const saved = await saveRemoteMaterialDelivery(
            payload.delivery,
            payload.lines,
          );
          resolvedMaterialDeliveries.set(saved.id, saved);
          return saved.id;
        }
        if (item.type === "material_delivery_review") {
          const payload = item.payload as {
            deliveryId: string;
            lines: DeliveryInputLine[];
          };
          const saved = await reviewRemoteMaterialDelivery(
            payload.deliveryId,
            payload.lines,
          );
          resolvedMaterialDeliveries.set(saved.id, saved);
          return saved.id;
        }
        if (item.type === "material_delivery_resolve") {
          const payload = item.payload as {
            deliveryId: string;
            resolution: string;
          };
          const saved = await resolveRemoteMaterialDelivery(
            payload.deliveryId,
            payload.resolution,
          );
          resolvedMaterialDeliveries.set(saved.id, saved);
          return saved.id;
        }
        if (item.type === "material_stock_movement") {
          const saved = await saveRemoteMaterialStockMovement(
            item.payload as MaterialStockMovement,
          );
          resolvedMaterialStockMovements.set(saved.id, saved);
          return saved.id;
        }
        if (item.type === "material_stock_review") {
          const payload = item.payload as {
            movementId: string;
            decision: "confirmed" | "rejected";
            rejectionReason?: string;
          };
          const saved = await reviewRemoteMaterialStockMovement(
            payload.movementId,
            payload.decision,
            payload.rejectionReason,
          );
          resolvedMaterialStockMovements.set(saved.id, saved);
          return saved.id;
        }
        if (item.type === "task_material_requirements") {
          const payload = item.payload as {
            taskId: string;
            requirements: Pick<
              TaskMaterialRequirement,
              "requestItemId" | "quantity"
            >[];
          };
          const saved = await saveRemoteTaskMaterialRequirements(
            payload.taskId,
            payload.requirements,
          );
          resolvedTaskMaterials.set(payload.taskId, saved);
          return payload.taskId;
        }
        if (item.type === "task_tool_requirements") {
          const payload = item.payload as { taskId: string; toolIds: string[] };
          const saved = await saveRemoteTaskToolRequirements(
            payload.taskId,
            payload.toolIds,
          );
          resolvedTaskTools.set(payload.taskId, saved);
          return payload.taskId;
        }
        if (item.type === "project_plan") {
          const uploaded = await uploadProjectPlan(item.payload as ProjectPlan);
          uploadedPlans.set(uploaded.id, uploaded);
          return uploaded.id;
        }
        if (item.type === "project_rfi") {
          const rfi = await saveRemoteProjectRfi(item.payload as ProjectRfi);
          resolvedProjectRfis.set(rfi.id, rfi);
          return rfi.id;
        }
        if (item.type === "project_rfi_open") {
          const rfi = await openRemoteProjectRfi(
            String((item.payload as { rfiId: string }).rfiId),
          );
          resolvedProjectRfis.set(rfi.id, rfi);
          return rfi.id;
        }
        if (item.type === "project_rfi_answer") {
          const payload = item.payload as {
            rfiId: string;
            answer: string;
            answeredByName: string;
          };
          const rfi = await answerRemoteProjectRfi(
            payload.rfiId,
            payload.answer,
            payload.answeredByName,
          );
          resolvedProjectRfis.set(rfi.id, rfi);
          return rfi.id;
        }
        if (item.type === "project_rfi_close") {
          const rfi = await closeRemoteProjectRfi(
            String((item.payload as { rfiId: string }).rfiId),
          );
          resolvedProjectRfis.set(rfi.id, rfi);
          return rfi.id;
        }
        if (item.type === "project_rfi_reopen") {
          const payload = item.payload as { rfiId: string; reason: string };
          const rfi = await reopenRemoteProjectRfi(
            payload.rfiId,
            payload.reason,
          );
          resolvedProjectRfis.set(rfi.id, rfi);
          return rfi.id;
        }
        if (item.type === "project_tool") {
          const tool = await saveRemoteProjectTool(item.payload as ProjectTool);
          resolvedProjectTools.set(tool.id, tool);
          return tool.id;
        }
        if (item.type === "project_tool_issue") {
          const payload = item.payload as {
            toolId: string;
            workerId: string;
            expectedReturnDate?: string;
            note?: string;
          };
          const tool = await issueRemoteProjectTool(
            payload.toolId,
            payload.workerId,
            payload.expectedReturnDate,
            payload.note,
          );
          resolvedProjectTools.set(tool.id, tool);
          return tool.id;
        }
        if (item.type === "project_tool_return") {
          const payload = item.payload as {
            toolId: string;
            condition: "serviceable" | "damaged";
            note?: string;
          };
          const tool = await returnRemoteProjectTool(
            payload.toolId,
            payload.condition,
            payload.note,
          );
          resolvedProjectTools.set(tool.id, tool);
          return tool.id;
        }
        if (item.type === "project_tool_problem") {
          const payload = item.payload as {
            toolId: string;
            issueType: "damaged" | "lost";
            note: string;
          };
          const tool = await reportRemoteProjectToolIssue(
            payload.toolId,
            payload.issueType,
            payload.note,
          );
          resolvedProjectTools.set(tool.id, tool);
          return tool.id;
        }
        if (item.type === "project_tool_restore") {
          const payload = item.payload as { toolId: string; note?: string };
          const tool = await restoreRemoteProjectTool(
            payload.toolId,
            payload.note,
          );
          resolvedProjectTools.set(tool.id, tool);
          return tool.id;
        }
        if (item.type === "project_tool_retire") {
          const payload = item.payload as { toolId: string; reason: string };
          const tool = await retireRemoteProjectTool(
            payload.toolId,
            payload.reason,
          );
          resolvedProjectTools.set(tool.id, tool);
          return tool.id;
        }
        if (item.type === "work_shift") {
          const shift = await saveRemoteWorkShift(item.payload as WorkShift);
          resolvedWorkShifts.set(shift.id, shift);
          return shift.id;
        }
        if (item.type === "work_shift_approve") {
          const shift = await approveRemoteWorkShift(
            String((item.payload as { shiftId: string }).shiftId),
          );
          resolvedWorkShifts.set(shift.id, shift);
          return shift.id;
        }
        if (item.type === "work_shift_reopen") {
          const payload = item.payload as { shiftId: string; reason: string };
          const shift = await reopenRemoteWorkShift(
            payload.shiftId,
            payload.reason,
          );
          resolvedWorkShifts.set(shift.id, shift);
          return shift.id;
        }
        if (item.type === "safety_briefing") {
          const briefing = await saveRemoteSafetyBriefing(
            item.payload as SafetyBriefing,
          );
          resolvedSafetyBriefings.set(briefing.id, briefing);
          return briefing.id;
        }
        if (item.type === "safety_briefing_publish") {
          const briefing = await publishRemoteSafetyBriefing(
            String((item.payload as { briefingId: string }).briefingId),
          );
          resolvedSafetyBriefings.set(briefing.id, briefing);
          return briefing.id;
        }
        if (item.type === "safety_briefing_excuse") {
          const payload = item.payload as {
            briefingId: string;
            workerId: string;
            reason: string;
          };
          const recipient = await excuseRemoteSafetyBriefingRecipient(
            payload.briefingId,
            payload.workerId,
            payload.reason,
          );
          resolvedSafetyRecipients.set(
            `${recipient.briefingId}:${recipient.workerId}`,
            recipient,
          );
          return recipient.id;
        }
        if (item.type === "safety_briefing_close") {
          const briefing = await closeRemoteSafetyBriefing(
            String((item.payload as { briefingId: string }).briefingId),
          );
          resolvedSafetyBriefings.set(briefing.id, briefing);
          return briefing.id;
        }
        if (item.type === "worker_credential") {
          const credential = await saveRemoteWorkerCredential(
            item.payload as WorkerCredential,
          );
          resolvedWorkerCredentials.set(credential.id, credential);
          return credential.id;
        }
        if (item.type === "worker_credential_revoke") {
          const payload = item.payload as {
            credentialId: string;
            reason: string;
          };
          const credential = await revokeRemoteWorkerCredential(
            payload.credentialId,
            payload.reason,
          );
          resolvedWorkerCredentials.set(credential.id, credential);
          return credential.id;
        }
        if (item.type === "worker_credential_restore") {
          const payload = item.payload as {
            credentialId: string;
            reason: string;
          };
          const credential = await restoreRemoteWorkerCredential(
            payload.credentialId,
            payload.reason,
          );
          resolvedWorkerCredentials.set(credential.id, credential);
          return credential.id;
        }
        if (item.type === "site_incident") {
          const incident = await saveRemoteSiteIncident(
            item.payload as SiteIncident,
          );
          resolvedSiteIncidents.set(incident.id, incident);
          return incident.id;
        }
        if (item.type === "site_incident_investigate") {
          const incident = await startRemoteIncidentInvestigation(
            String((item.payload as { incidentId: string }).incidentId),
          );
          resolvedSiteIncidents.set(incident.id, incident);
          return incident.id;
        }
        if (item.type === "site_incident_resolve") {
          const payload = item.payload as {
            incidentId: string;
            rootCause: string;
            correctiveAction: string;
          };
          const incident = await resolveRemoteSiteIncident(
            payload.incidentId,
            payload.rootCause,
            payload.correctiveAction,
          );
          resolvedSiteIncidents.set(incident.id, incident);
          return incident.id;
        }
        if (item.type === "site_incident_reopen") {
          const payload = item.payload as {
            incidentId: string;
            reason: string;
          };
          const incident = await reopenRemoteSiteIncident(
            payload.incidentId,
            payload.reason,
          );
          resolvedSiteIncidents.set(incident.id, incident);
          return incident.id;
        }
        if (item.type === "site_task")
          return upsertSiteTask(item.payload as SiteTask);
        if (item.type === "project_checklist")
          return upsertProjectChecklist(item.payload as ProjectChecklist);
        if (item.type === "site_task_event")
          return insertSiteTaskComment(item.payload as SiteTaskEvent);
        if (item.type === "change_order") {
          const order = await saveRemoteChangeOrder(
            item.payload as ChangeOrder,
          );
          resolvedChangeOrders.set(order.id, order);
          return order.id;
        }
        if (item.type === "project_budget") {
          const budget = await saveRemoteProjectBudget(
            item.payload as ProjectBudget,
          );
          resolvedProjectBudgets.set(budget.projectId, budget);
          return budget.projectId;
        }
        if (item.type === "project_schedule") {
          const schedule = await saveRemoteProjectSchedule(
            item.payload as ProjectSchedule,
          );
          resolvedProjectSchedules.set(schedule.projectId, schedule);
          return schedule.projectId;
        }
        if (item.type === "weekly_report") {
          const report = await saveRemoteWeeklyReport(
            item.payload as WeeklyReport,
          );
          resolvedWeeklyReports.set(report.id, report);
          return report.id;
        }
        if (item.type === "daily_control_action") {
          const action = await saveRemoteDailyControlAction(
            item.payload as DailyControlAction,
          );
          resolvedDailyControlActions.set(action.id, action);
          return action.id;
        }
        if (item.type === "receipt_ocr") {
          const receiptId = String(
            (item.payload as { receiptId: string }).receiptId,
          );
          const result = await client.functions.invoke("process-receipt-ocr", {
            body: { receiptId },
          });
          if (result.error) throw result.error;
          if (result.data?.receipt)
            ocrReceipts.set(receiptId, result.data.receipt);
          return receiptId;
        }
        if (item.type === "worker_checkin") {
          const checkin = item.payload as WorkerCheckin;
          const { data, error } = await client
            .from("worker_checkins")
            .upsert(
              {
                id: checkin.id,
                project_id: checkin.projectId,
                worker_name: checkin.workerName,
                checked_in_at: checkin.checkedInAt,
                latitude: checkin.latitude,
                longitude: checkin.longitude,
              },
              { onConflict: "id" },
            )
            .select("id")
            .single();
          if (error) throw error;
          return String(data.id);
        }
        return item.localId;
      });
    } catch (error) {
      void recordClientError({
        source: "sync",
        error,
        safeMessage: "Synchronizácia sa neočakávane prerušila.",
        context: {
          operation: "process_outbox",
          pendingCount: snapshot.outbox.length,
        },
        projectId: snapshot.selectedProjectId,
      });
      void recordSyncRun({
        status: "failed",
        pendingBefore: snapshot.outbox.length,
        pendingAfter: snapshot.outbox.length,
        failedCount: snapshot.outbox.filter((item) => item.status === "failed")
          .length,
        durationMs: Date.now() - startedAt,
        error,
        projectId: snapshot.selectedProjectId,
      });
      throw error;
    }
    const statusFor = (type: AppState["outbox"][number]["type"], id: string) =>
      nextOutbox.find((item) => item.type === type && item.localId === id)
        ?.status ?? "pending";
    const processedIds = new Set(nextOutbox.map((item) => item.id));
    const rfiStatusFor = (id: string) => {
      const queue = nextOutbox.filter(
        (item) => item.localId === id && item.type.startsWith("project_rfi"),
      );
      return queue.length ? queue[queue.length - 1].status : "pending";
    };
    const toolStatusFor = (id: string) => {
      const queue = nextOutbox.filter(
        (item) => item.localId === id && item.type.startsWith("project_tool"),
      );
      return queue.length ? queue[queue.length - 1].status : "pending";
    };
    const shiftStatusFor = (id: string) => {
      const queue = nextOutbox.filter(
        (item) => item.localId === id && item.type.startsWith("work_shift"),
      );
      return queue.length ? queue[queue.length - 1].status : "pending";
    };
    const safetyStatusFor = (id: string) => {
      const queue = nextOutbox.filter(
        (item) =>
          item.localId === id && item.type.startsWith("safety_briefing"),
      );
      return queue.length ? queue[queue.length - 1].status : "pending";
    };
    const credentialStatusFor = (id: string) => {
      const queue = nextOutbox.filter(
        (item) =>
          item.localId === id && item.type.startsWith("worker_credential"),
      );
      return queue.length ? queue[queue.length - 1].status : "pending";
    };
    const incidentStatusFor = (id: string) => {
      const queue = nextOutbox.filter(
        (item) => item.localId === id && item.type.startsWith("site_incident"),
      );
      return queue.length ? queue[queue.length - 1].status : "pending";
    };
    await persist((current) => ({
      ...current,
      outbox: [
        ...nextOutbox,
        ...current.outbox.filter((item) => !processedIds.has(item.id)),
      ],
      diaryEntries: current.diaryEntries.map((entry) => ({
        ...entry,
        evidence: resolvedWeather.has(entry.id)
          ? { ...entry.evidence, weather: resolvedWeather.get(entry.id) }
          : entry.evidence,
        syncStatus: statusFor("diary_entry", entry.id),
      })),
      dayClosures: current.dayClosures.map(
        (closure) =>
          resolvedDayClosures.get(closure.id) ?? {
            ...closure,
            syncStatus: statusFor("day_closure", closure.id),
          },
      ),
      delayEvents: current.delayEvents.map((event) => ({
        ...event,
        evidence: resolvedDelayWeather.has(event.id)
          ? { ...event.evidence, weather: resolvedDelayWeather.get(event.id) }
          : event.evidence,
        syncStatus: statusFor("delay_event", event.id),
      })),
      attachments: current.attachments.map((attachment) => ({
        ...attachment,
        uploadStatus: statusFor("attachment", attachment.id),
      })),
      receiptCategories: current.receiptCategories.map((category) => ({
        ...category,
        syncStatus: statusFor("receipt_category", category.id),
      })),
      receipts: current.receipts.map((receipt) => ({
        ...receipt,
        ...(ocrReceipts.get(receipt.id) ?? {}),
        syncStatus: statusFor("receipt", receipt.id),
      })),
      receiptFiles: current.receiptFiles.map(
        (file) =>
          uploadedReceiptFiles.get(file.id) ?? {
            ...file,
            uploadStatus: statusFor("receipt_file", file.id),
          },
      ),
      materialSupplierQuotes: (current.materialSupplierQuotes ?? []).map(
        (quote) =>
          resolvedSupplierQuotes.get(quote.id) ?? {
            ...quote,
            syncStatus: statusFor(
              quote.status === "selected"
                ? "material_quote_selection"
                : quote.status === "withdrawn"
                  ? "material_quote_withdrawal"
                  : "material_supplier_quote",
              quote.id,
            ),
          },
      ),
      materialDeliveries: current.materialDeliveries.map(
        (delivery) =>
          resolvedMaterialDeliveries.get(delivery.id) ?? {
            ...delivery,
            syncStatus: statusFor(
              delivery.status === "reported"
                ? "material_delivery"
                : delivery.status === "discrepancy" ||
                    delivery.status === "accepted"
                  ? "material_delivery_review"
                  : "material_delivery_resolve",
              delivery.id,
            ),
          },
      ),
      materialStockMovements: current.materialStockMovements.map(
        (movement) =>
          resolvedMaterialStockMovements.get(movement.id) ?? {
            ...movement,
            syncStatus: statusFor(
              movement.status === "reported"
                ? "material_stock_review"
                : movement.createdAt === movement.reviewedAt
                  ? "material_stock_movement"
                  : "material_stock_review",
              movement.id,
            ),
          },
      ),
      taskMaterialRequirements: [
        ...current.taskMaterialRequirements.filter(
          (item) => !resolvedTaskMaterials.has(item.taskId),
        ),
        ...[...resolvedTaskMaterials.values()].flat(),
      ],
      taskToolRequirements: [
        ...current.taskToolRequirements.filter(
          (item) => !resolvedTaskTools.has(item.taskId),
        ),
        ...[...resolvedTaskTools.values()].flat(),
      ],
      projectPlans: current.projectPlans.map(
        (plan) =>
          uploadedPlans.get(plan.id) ?? {
            ...plan,
            uploadStatus: statusFor("project_plan", plan.id),
          },
      ),
      projectRfis: current.projectRfis.map(
        (rfi) =>
          resolvedProjectRfis.get(rfi.id) ?? {
            ...rfi,
            syncStatus: rfiStatusFor(rfi.id),
          },
      ),
      projectTools: current.projectTools.map(
        (tool) =>
          resolvedProjectTools.get(tool.id) ?? {
            ...tool,
            syncStatus: toolStatusFor(tool.id),
          },
      ),
      workShifts: current.workShifts.map(
        (shift) =>
          resolvedWorkShifts.get(shift.id) ?? {
            ...shift,
            syncStatus: shiftStatusFor(shift.id),
          },
      ),
      safetyBriefings: current.safetyBriefings.map(
        (briefing) =>
          resolvedSafetyBriefings.get(briefing.id) ?? {
            ...briefing,
            syncStatus: safetyStatusFor(briefing.id),
          },
      ),
      safetyBriefingRecipients: current.safetyBriefingRecipients.map(
        (recipient) =>
          resolvedSafetyRecipients.get(
            `${recipient.briefingId}:${recipient.workerId}`,
          ) ?? recipient,
      ),
      workerCredentials: current.workerCredentials.map(
        (credential) =>
          resolvedWorkerCredentials.get(credential.id) ?? {
            ...credential,
            syncStatus: credentialStatusFor(credential.id),
          },
      ),
      siteIncidents: current.siteIncidents.map(
        (incident) =>
          resolvedSiteIncidents.get(incident.id) ?? {
            ...incident,
            syncStatus: incidentStatusFor(incident.id),
          },
      ),
      siteTasks: current.siteTasks.map((task) => ({
        ...task,
        syncStatus: statusFor("site_task", task.id),
      })),
      projectChecklists: current.projectChecklists.map((checklist) => ({
        ...checklist,
        syncStatus: statusFor("project_checklist", checklist.id),
      })),
      siteTaskEvents: current.siteTaskEvents.map((event) => ({
        ...event,
        syncStatus: statusFor("site_task_event", event.id),
      })),
      changeOrders: current.changeOrders.map(
        (order) =>
          resolvedChangeOrders.get(order.id) ?? {
            ...order,
            syncStatus: statusFor("change_order", order.id),
          },
      ),
      projectBudgets: current.projectBudgets.map(
        (budget) =>
          resolvedProjectBudgets.get(budget.projectId) ?? {
            ...budget,
            syncStatus: statusFor("project_budget", budget.projectId),
          },
      ),
      projectSchedules: current.projectSchedules.map(
        (schedule) =>
          resolvedProjectSchedules.get(schedule.projectId) ?? {
            ...schedule,
            syncStatus: statusFor("project_schedule", schedule.projectId),
          },
      ),
      weeklyReports: current.weeklyReports.map(
        (report) =>
          resolvedWeeklyReports.get(report.id) ?? {
            ...report,
            syncStatus: statusFor("weekly_report", report.id),
          },
      ),
      dailyControlActions: current.dailyControlActions.map(
        (action) =>
          resolvedDailyControlActions.get(action.id) ?? {
            ...action,
            syncStatus: statusFor("daily_control_action", action.id),
          },
      ),
    }));
    const failedCount = nextOutbox.filter(
      (item) => item.status === "failed",
    ).length;
    const pendingAfter = nextOutbox.filter(
      (item) => item.status !== "synced",
    ).length;
    const firstFailure = nextOutbox.find(
      (item) => item.status === "failed" && item.lastError,
    );
    void recordSyncRun({
      status: failedCount ? "partial" : "success",
      pendingBefore: snapshot.outbox.length,
      pendingAfter,
      failedCount,
      durationMs: Date.now() - startedAt,
      error: firstFailure?.lastError
        ? new Error(firstFailure.lastError)
        : undefined,
      projectId: snapshot.selectedProjectId,
    });
  }, [persist]);
  const syncNow = useCallback((): Promise<void> => {
    if (syncInFlightRef.current) return syncInFlightRef.current;
    const operation = performSync().finally(() => {
      if (syncInFlightRef.current === operation)
        syncInFlightRef.current = undefined;
    });
    syncInFlightRef.current = operation;
    return operation;
  }, [performSync]);
  useEffect(() => {
    if (!userId || !supabase) return;
    return NetInfo.addEventListener((network) => {
      if (
        shouldAttemptSync(network) &&
        pendingCount(storeRef.current.snapshot.outbox) > 0
      )
        void syncNow().catch(() => undefined);
    });
  }, [syncNow, userId]);
  useEffect(() => {
    if (!userId) {
      startupSyncUserRef.current = undefined;
      return;
    }
    if (loading || !supabase || startupSyncUserRef.current === userId) return;
    startupSyncUserRef.current = userId;
    if (pendingCount(storeRef.current.snapshot.outbox) > 0)
      void NetInfo.fetch()
        .then((network) => {
          if (shouldAttemptSync(network))
            return syncNow();
        })
        .catch(() => undefined);
  }, [loading, syncNow, userId]);
  const refreshWorkforce = useCallback(async () => {
    if (!selectedProject || !supabase) return;
    const projectId = selectedProject.id;
    const workforce = await listProjectWorkforce(projectId);
    await persist((current) => {
      const previousRequestIds = new Set(
        current.materialRequests
          .filter((item) => item.projectId === projectId)
          .map((item) => item.id),
      );
      return {
        ...current,
        workers: [
          ...current.workers.filter((item) => item.projectId !== projectId),
          ...workforce.workers,
        ],
        materialRequests: [
          ...current.materialRequests.filter(
            (item) => item.projectId !== projectId,
          ),
          ...workforce.requests,
        ],
        materialRequestItems: [
          ...current.materialRequestItems.filter(
            (item) => !previousRequestIds.has(item.requestId),
          ),
          ...workforce.items,
        ],
        receiptRequestLinks: [
          ...current.receiptRequestLinks.filter(
            (item) => !previousRequestIds.has(item.requestId),
          ),
          ...workforce.links,
        ],
        materialSupplierQuotes: [
          ...(current.materialSupplierQuotes ?? []).filter(
            (item) =>
              item.projectId !== projectId || item.syncStatus !== "synced",
          ),
          ...workforce.quotes.filter(
            (remote) =>
              !(current.materialSupplierQuotes ?? []).some(
                (local) =>
                  local.id === remote.id && local.syncStatus !== "synced",
              ),
          ),
        ],
      };
    });
  }, [persist, selectedProject]);
  const refreshGallery = useCallback(async () => {
    if (!selectedProject || !supabase) return;
    const projectId = selectedProject.id;
    const remoteAttachments = await listProjectAttachments(projectId);
    await persist((current) => {
      const localPending = current.attachments.filter(
        (item) =>
          item.projectId === projectId && item.uploadStatus !== "synced",
      );
      const pendingIds = new Set(localPending.map((item) => item.id));
      return {
        ...current,
        attachments: [
          ...current.attachments.filter((item) => item.projectId !== projectId),
          ...localPending,
          ...remoteAttachments.filter((item) => !pendingIds.has(item.id)),
        ],
      };
    });
  }, [persist, selectedProject]);
  const refreshProjectData = useCallback(async () => {
    if (!selectedProject || !supabase) return;
    const date = localDateIso();
    try {
      const [
        entries,
        dayClosures,
        checkins,
        receiptData,
        workforce,
        notifications,
        planning,
        rfiData,
        toolData,
        checklists,
        changeOrders,
        projectBudget,
        projectSchedule,
        weeklyReports,
        dailyControlActions,
        workShiftData,
        safetyData,
        credentialData,
        incidentData,
        deliveryData,
        stockData,
        taskMaterialData,
        taskToolData,
        approvalData,
      ] = await Promise.all([
        listDiary(selectedProject.id, date),
        listRemoteDayClosures(selectedProject.id),
        listCheckins(selectedProject.id, date),
        listReceipts(selectedProject.id),
        listProjectWorkforce(selectedProject.id),
        listNotifications(),
        listProjectPlansAndTasks(selectedProject.id),
        listProjectRfis(selectedProject.id),
        listProjectTools(selectedProject.id),
        listProjectChecklists(selectedProject.id),
        listProjectChangeOrders(selectedProject.id),
        getProjectBudget(selectedProject.id),
        getProjectSchedule(selectedProject.id),
        listWeeklyReports(selectedProject.id),
        listDailyControlActions(selectedProject.id),
        listProjectWorkShifts(selectedProject.id),
        listProjectSafetyBriefings(selectedProject.id),
        listProjectWorkerCredentials(selectedProject.id),
        listProjectSiteIncidents(selectedProject.id),
        listProjectMaterialDeliveries(selectedProject.id),
        listProjectMaterialStock(selectedProject.id),
        listProjectTaskMaterialRequirements(selectedProject.id),
        listProjectTaskToolRequirements(selectedProject.id),
        listProjectDiaryApprovals(selectedProject.id),
      ]);
      await persist((current) => {
        const previousRequestIds = new Set(
          current.materialRequests
            .filter((item) => item.projectId === selectedProject.id)
            .map((item) => item.id),
        );
        return {
          ...current,
          diaryEntries: [
            ...current.diaryEntries.filter(
              (entry) =>
                entry.projectId !== selectedProject.id ||
                entry.logDate !== date,
            ),
            ...entries,
          ],
          dayClosures: [
            ...current.dayClosures.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...dayClosures.filter(
              (remote) =>
                !current.dayClosures.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          diaryApprovalRequests: [
            ...current.diaryApprovalRequests.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...approvalData.requests,
          ],
          diaryApprovalEvents: [
            ...current.diaryApprovalEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...approvalData.events,
          ],
          workerCheckins: [
            ...current.workerCheckins.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...checkins,
          ],
          workShifts: [
            ...current.workShifts.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...workShiftData.shifts.filter(
              (remote) =>
                !current.workShifts.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          workShiftEvents: [
            ...current.workShiftEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...workShiftData.events,
          ],
          safetyBriefings: [
            ...current.safetyBriefings.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...safetyData.briefings.filter(
              (remote) =>
                !current.safetyBriefings.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          safetyBriefingRecipients: [
            ...current.safetyBriefingRecipients.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                current.safetyBriefings.some(
                  (briefing) =>
                    briefing.id === item.briefingId &&
                    briefing.syncStatus !== "synced",
                ),
            ),
            ...safetyData.recipients.filter(
              (remote) =>
                !current.safetyBriefingRecipients.some(
                  (local) =>
                    local.briefingId === remote.briefingId &&
                    local.workerId === remote.workerId &&
                    current.safetyBriefings.some(
                      (briefing) =>
                        briefing.id === local.briefingId &&
                        briefing.syncStatus !== "synced",
                    ),
                ),
            ),
          ],
          safetyBriefingEvents: [
            ...current.safetyBriefingEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...safetyData.events,
          ],
          workerCredentials: [
            ...current.workerCredentials.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...credentialData.credentials.filter(
              (remote) =>
                !current.workerCredentials.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          workerCredentialEvents: [
            ...current.workerCredentialEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...credentialData.events,
          ],
          siteIncidents: [
            ...current.siteIncidents.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...incidentData.incidents.filter(
              (remote) =>
                !current.siteIncidents.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          siteIncidentEvents: [
            ...current.siteIncidentEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...incidentData.events,
          ],
          materialDeliveries: [
            ...current.materialDeliveries.filter(
              (x) =>
                x.projectId !== selectedProject.id || x.syncStatus !== "synced",
            ),
            ...deliveryData.deliveries.filter(
              (remote) =>
                !current.materialDeliveries.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          materialDeliveryLines: [
            ...current.materialDeliveryLines.filter(
              (x) =>
                x.projectId !== selectedProject.id ||
                current.materialDeliveries.some(
                  (d) => d.id === x.deliveryId && d.syncStatus !== "synced",
                ),
            ),
            ...deliveryData.lines.filter(
              (remote) =>
                !current.materialDeliveryLines.some(
                  (local) =>
                    local.deliveryId === remote.deliveryId &&
                    current.materialDeliveries.some(
                      (d) =>
                        d.id === local.deliveryId && d.syncStatus !== "synced",
                    ),
                ),
            ),
          ],
          materialDeliveryEvents: [
            ...current.materialDeliveryEvents.filter(
              (x) => x.projectId !== selectedProject.id,
            ),
            ...deliveryData.events,
          ],
          materialStockMovements: [
            ...current.materialStockMovements.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...stockData.movements.filter(
              (remote) =>
                !current.materialStockMovements.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          materialStockMovementEvents: [
            ...current.materialStockMovementEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...stockData.events,
          ],
          taskMaterialRequirements: [
            ...current.taskMaterialRequirements.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...taskMaterialData.filter(
              (remote) =>
                !current.taskMaterialRequirements.some(
                  (local) =>
                    local.taskId === remote.taskId &&
                    local.syncStatus !== "synced",
                ),
            ),
          ],
          taskToolRequirements: [
            ...current.taskToolRequirements.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...taskToolData.filter(
              (remote) =>
                !current.taskToolRequirements.some(
                  (local) =>
                    local.taskId === remote.taskId &&
                    local.syncStatus !== "synced",
                ),
            ),
          ],
          receipts: [
            ...current.receipts.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...receiptData.receipts,
          ],
          receiptFiles: [
            ...current.receiptFiles.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...receiptData.files,
          ],
          workers: [
            ...current.workers.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...workforce.workers,
          ],
          materialRequests: [
            ...current.materialRequests.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...workforce.requests,
          ],
          materialRequestItems: [
            ...current.materialRequestItems.filter(
              (item) => !previousRequestIds.has(item.requestId),
            ),
            ...workforce.items,
          ],
          receiptRequestLinks: [
            ...current.receiptRequestLinks.filter(
              (item) => !previousRequestIds.has(item.requestId),
            ),
            ...workforce.links,
          ],
          materialSupplierQuotes: [
            ...(current.materialSupplierQuotes ?? []).filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...workforce.quotes.filter(
              (remote) =>
                !(current.materialSupplierQuotes ?? []).some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          projectPlans: [
            ...current.projectPlans.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.uploadStatus !== "synced",
            ),
            ...planning.plans.filter(
              (remote) =>
                !current.projectPlans.some(
                  (local) =>
                    local.id === remote.id && local.uploadStatus !== "synced",
                ),
            ),
          ],
          projectRfis: [
            ...current.projectRfis.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...rfiData.rfis.filter(
              (remote) =>
                !current.projectRfis.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          projectRfiEvents: [
            ...current.projectRfiEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...rfiData.events,
          ],
          projectTools: [
            ...current.projectTools.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...toolData.tools.filter(
              (remote) =>
                !current.projectTools.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          projectToolEvents: [
            ...current.projectToolEvents.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...toolData.events,
          ],
          siteTasks: [
            ...current.siteTasks.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...planning.tasks.filter(
              (remote) =>
                !current.siteTasks.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          siteTaskEvents: [
            ...current.siteTaskEvents.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...planning.events.filter(
              (remote) =>
                !current.siteTaskEvents.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          projectChecklists: [
            ...current.projectChecklists.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...checklists.filter(
              (remote) =>
                !current.projectChecklists.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          changeOrders: [
            ...current.changeOrders.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...changeOrders.filter(
              (remote) =>
                !current.changeOrders.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          projectBudgets: [
            ...current.projectBudgets.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...(projectBudget &&
            !current.projectBudgets.some(
              (local) =>
                local.projectId === projectBudget.projectId &&
                local.syncStatus !== "synced",
            )
              ? [projectBudget]
              : []),
          ],
          projectSchedules: [
            ...current.projectSchedules.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...(projectSchedule &&
            !current.projectSchedules.some(
              (local) =>
                local.projectId === projectSchedule.projectId &&
                local.syncStatus !== "synced",
            )
              ? [projectSchedule]
              : []),
          ],
          weeklyReports: [
            ...current.weeklyReports.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...weeklyReports.filter(
              (remote) =>
                !current.weeklyReports.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          dailyControlActions: [
            ...current.dailyControlActions.filter(
              (item) =>
                item.projectId !== selectedProject.id ||
                item.syncStatus !== "synced",
            ),
            ...dailyControlActions.filter(
              (remote) =>
                !current.dailyControlActions.some(
                  (local) =>
                    local.id === remote.id && local.syncStatus !== "synced",
                ),
            ),
          ],
          notifications,
        };
      });
    } catch {
      /* local-first mode */
    }
  }, [persist, selectedProject]);
  const value = useMemo(
    () => ({
      loading,
      state,
      selectedProject,
      pendingCount: pendingCount(state.outbox),
      selectProject,
      addProject,
      removeProject,
      addDiary,
      updateDiary,
      addDelay,
      addAttachment,
      addCheckin,
      saveWorkShift,
      approveWorkShift,
      reopenWorkShift,
      saveSafetyBriefing,
      publishSafetyBriefing,
      excuseSafetyBriefingRecipient,
      closeSafetyBriefing,
      saveWorkerCredential,
      revokeWorkerCredential,
      restoreWorkerCredential,
      saveSiteIncident,
      startSiteIncidentInvestigation,
      resolveSiteIncident,
      reopenSiteIncident,
      addReport,
      addReceiptCategory,
      saveReceipt,
      addReceiptExport,
      addProjectPlan,
      updateProjectPlanPageCount,
      saveProjectRfi,
      openProjectRfi,
      answerProjectRfi,
      closeProjectRfi,
      reopenProjectRfi,
      saveProjectTool,
      issueProjectTool,
      returnProjectTool,
      reportProjectToolIssue,
      restoreProjectTool,
      retireProjectTool,
      addSiteTask,
      updateSiteTask,
      setSiteTaskStatus,
      reviewSiteTask,
      setSiteTaskClientVisibility,
      saveProjectChecklist,
      saveChangeOrder,
      saveProjectBudget,
      saveProjectSchedule,
      saveWeeklyReport,
      publishWeeklyReport,
      prepareDailyControlPlan,
      resolveDailyControlAction,
      addSiteTaskComment,
      reviewWorker,
      updateMaterialRequest,
      linkReceiptRequest,
      unlinkReceiptRequest,
      saveSupplierQuote,
      selectSupplierQuote,
      withdrawSupplierQuote,
      saveMaterialDelivery,
      reviewMaterialDelivery,
      resolveMaterialDelivery,
      saveMaterialStockMovement,
      reviewMaterialStockMovement,
      saveTaskMaterialRequirements,
      saveTaskToolRequirements,
      readNotification,
      confirmDayClosure,
      lockDiary,
      lockDelay,
      syncNow,
      refreshWorkforce,
      refreshGallery,
      refreshProjectData,
      reports: state.reports,
    }),
    [
      addAttachment,
      addCheckin,
      saveWorkShift,
      approveWorkShift,
      reopenWorkShift,
      saveSafetyBriefing,
      publishSafetyBriefing,
      excuseSafetyBriefingRecipient,
      closeSafetyBriefing,
      saveWorkerCredential,
      revokeWorkerCredential,
      restoreWorkerCredential,
      saveSiteIncident,
      startSiteIncidentInvestigation,
      resolveSiteIncident,
      reopenSiteIncident,
      addDelay,
      addDiary,
      addProject,
      removeProject,
      addReceiptCategory,
      addReceiptExport,
      addProjectPlan,
      updateProjectPlanPageCount,
      saveProjectRfi,
      openProjectRfi,
      answerProjectRfi,
      closeProjectRfi,
      reopenProjectRfi,
      saveProjectTool,
      issueProjectTool,
      returnProjectTool,
      reportProjectToolIssue,
      restoreProjectTool,
      retireProjectTool,
      addSiteTask,
      updateSiteTask,
      setSiteTaskStatus,
      reviewSiteTask,
      setSiteTaskClientVisibility,
      saveProjectChecklist,
      saveChangeOrder,
      saveProjectBudget,
      saveProjectSchedule,
      saveWeeklyReport,
      publishWeeklyReport,
      prepareDailyControlPlan,
      resolveDailyControlAction,
      addSiteTaskComment,
      addReport,
      linkReceiptRequest,
      loading,
      confirmDayClosure,
      lockDelay,
      lockDiary,
      readNotification,
      refreshWorkforce,
      refreshGallery,
      refreshProjectData,
      reviewWorker,
      saveReceipt,
      saveSupplierQuote,
      selectProject,
      selectSupplierQuote,
      selectedProject,
      state,
      syncNow,
      unlinkReceiptRequest,
      withdrawSupplierQuote,
      saveMaterialDelivery,
      reviewMaterialDelivery,
      resolveMaterialDelivery,
      saveMaterialStockMovement,
      reviewMaterialStockMovement,
      saveTaskMaterialRequirements,
      saveTaskToolRequirements,
      updateDiary,
      updateMaterialRequest,
    ],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider missing");
  return context;
}
