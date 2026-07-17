import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AppNotification,
  Attachment,
  AppState,
  DelayEvent,
  DiaryEntry,
  EvidenceBundle,
  MaterialRequest,
  MaterialRequestStatus,
  Project,
  ProjectWorker,
  Receipt,
  ReceiptCategory,
  ReceiptExport,
  ReceiptFile,
  ReceiptRequestLink,
  ReportExport,
  WorkerCheckin,
  WorkerStatus,
} from "@/domain/types";
import { createId, nowIso } from "@/domain/ids";
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
import { registerPushSubscription } from "@/services/pushNotifications";
import { trackPilotEvent } from "@/services/pilotAccount";

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
  addReport: (report: ReportExport) => Promise<void>;
  addReceiptCategory: (name: string) => Promise<ReceiptCategory>;
  saveReceipt: (receipt: Receipt, files: ReceiptFile[]) => Promise<Receipt>;
  addReceiptExport: (report: ReceiptExport) => Promise<void>;
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
  readNotification: (id: string) => Promise<void>;
  lockDiary: (id: string) => Promise<void>;
  lockDelay: (id: string) => Promise<void>;
  syncNow: () => Promise<void>;
  refreshWorkforce: () => Promise<void>;
  refreshGallery: () => Promise<void>;
  refreshProjectData: () => Promise<void>;
  reports: ReportExport[];
};
const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [state, setState] = useState<AppState>(emptyAppState());
  const [loading, setLoading] = useState(true);
  const storeRef = React.useRef(new LocalStore());
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
      const hydrated = hydratedRaw.activeUserId === userId
        ? hydratedRaw
        : await storeRef.current.update(() => ({ ...emptyAppState(), activeUserId: userId }));
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
            selectedProjectId: remoteProjects.some(project => project.id === previous.selectedProjectId) ? previous.selectedProjectId : remoteProjects.find(project => project.status === 'active')?.id,
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
  const removeProject = useCallback(async (id: string) => {
    await persist((current) => {
      const receiptIds = new Set(current.receipts.filter(item => item.projectId === id).map(item => item.id));
      const requestIds = new Set(current.materialRequests.filter(item => item.projectId === id).map(item => item.id));
      const projects = current.projects.filter(item => item.id !== id);
      return {
        ...current,
        projects,
        selectedProjectId: current.selectedProjectId === id ? projects.find(item => item.status === 'active')?.id : current.selectedProjectId,
        diaryEntries: current.diaryEntries.filter(item => item.projectId !== id),
        delayEvents: current.delayEvents.filter(item => item.projectId !== id),
        workerCheckins: current.workerCheckins.filter(item => item.projectId !== id),
        attachments: current.attachments.filter(item => item.projectId !== id),
        reports: current.reports.filter(item => item.projectId !== id),
        receipts: current.receipts.filter(item => item.projectId !== id),
        receiptFiles: current.receiptFiles.filter(item => item.projectId !== id),
        receiptExports: current.receiptExports.filter(item => item.projectId !== id),
        workers: current.workers.filter(item => item.projectId !== id),
        materialRequests: current.materialRequests.filter(item => item.projectId !== id),
        materialRequestItems: current.materialRequestItems.filter(item => !requestIds.has(item.requestId)),
        receiptRequestLinks: current.receiptRequestLinks.filter(item => !receiptIds.has(item.receiptId) && !requestIds.has(item.requestId)),
        outbox: current.outbox.filter(item => !(item.payload && typeof item.payload === 'object' && 'projectId' in item.payload && item.payload.projectId === id)),
      };
    });
  }, [persist]);
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
      await persist((current) => ({
        ...current,
        receiptRequestLinks: [
          link,
          ...current.receiptRequestLinks.filter(
            (item) =>
              item.id !== link.id &&
              !(item.receiptId === receiptId && item.requestId === requestId),
          ),
        ],
      }));
      return link;
    },
    [persist, userId],
  );
  const unlinkReceiptRequest = useCallback(
    async (receiptId: string, requestId: string) => {
      await unlinkReceiptFromRequest(receiptId, requestId);
      await persist((current) => ({
        ...current,
        receiptRequestLinks: current.receiptRequestLinks.filter(
          (item) =>
            !(item.receiptId === receiptId && item.requestId === requestId),
        ),
      }));
    },
    [persist],
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
  const syncNow = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const snapshot = storeRef.current.snapshot;
    const resolvedWeather = new Map<
      string,
      DiaryEntry["evidence"]["weather"]
    >();
    const resolvedDelayWeather = new Map<
      string,
      DelayEvent["evidence"]["weather"]
    >();
    const uploadedReceiptFiles = new Map<string, ReceiptFile>();
    const ocrReceipts = new Map<string, Partial<Receipt>>();
    const nextOutbox = await processOutbox(snapshot.outbox, async (item) => {
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
    const statusFor = (type: AppState["outbox"][number]["type"], id: string) =>
      nextOutbox.find((item) => item.type === type && item.localId === id)
        ?.status ?? "pending";
    const processedIds = new Set(nextOutbox.map((item) => item.id));
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
    }));
  }, [persist]);
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
          ...current.materialRequests.filter((item) => item.projectId !== projectId),
          ...workforce.requests,
        ],
        materialRequestItems: [
          ...current.materialRequestItems.filter((item) => !previousRequestIds.has(item.requestId)),
          ...workforce.items,
        ],
        receiptRequestLinks: [
          ...current.receiptRequestLinks.filter((item) => !previousRequestIds.has(item.requestId)),
          ...workforce.links,
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
        (item) => item.projectId === projectId && item.uploadStatus !== 'synced',
      );
      const pendingIds = new Set(localPending.map(item => item.id));
      return {
        ...current,
        attachments: [
          ...current.attachments.filter(item => item.projectId !== projectId),
          ...localPending,
          ...remoteAttachments.filter(item => !pendingIds.has(item.id)),
        ],
      };
    });
  }, [persist, selectedProject]);
  const refreshProjectData = useCallback(async () => {
    if (!selectedProject || !supabase) return;
    const date = new Date().toISOString().slice(0, 10);
    try {
      const [entries, checkins, receiptData, workforce, notifications] =
        await Promise.all([
          listDiary(selectedProject.id, date),
          listCheckins(selectedProject.id, date),
          listReceipts(selectedProject.id),
          listProjectWorkforce(selectedProject.id),
          listNotifications(),
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
          workerCheckins: [
            ...current.workerCheckins.filter(
              (item) => item.projectId !== selectedProject.id,
            ),
            ...checkins,
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
      addReport,
      addReceiptCategory,
      saveReceipt,
      addReceiptExport,
      reviewWorker,
      updateMaterialRequest,
      linkReceiptRequest,
      unlinkReceiptRequest,
      readNotification,
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
      addDelay,
      addDiary,
      addProject,
      removeProject,
      addReceiptCategory,
      addReceiptExport,
      addReport,
      linkReceiptRequest,
      loading,
      lockDelay,
      lockDiary,
      readNotification,
      refreshWorkforce,
      refreshGallery,
      refreshProjectData,
      reviewWorker,
      saveReceipt,
      selectProject,
      selectedProject,
      state,
      syncNow,
      unlinkReceiptRequest,
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
