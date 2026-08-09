import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppState } from "@/domain/types";
import {
  clearStateFromSqlite,
  loadStateFromSqlite,
  saveStateToSqlite,
} from "./sqliteStore";
import { SerializedStateStore } from "./serializedStateStore";

const STATE_KEY = "@stavebny-dennik/state/v1";

export function emptyAppState(): AppState {
  return {
    projects: [],
    diaryEntries: [],
    dayClosures: [],
    diaryApprovalRequests: [],
    diaryApprovalEvents: [],
    delayEvents: [],
    workerCheckins: [],
    workShifts: [],
    workShiftEvents: [],
    attachments: [],
    reports: [],
    receiptCategories: [],
    receipts: [],
    receiptFiles: [],
    receiptExports: [],
    workers: [],
    workerCredentials: [],
    workerCredentialEvents: [],
    siteIncidents: [],
    siteIncidentEvents: [],
    materialRequests: [],
    materialRequestItems: [],
    receiptRequestLinks: [],
    materialSupplierQuotes: [],
    materialDeliveries: [],
    materialDeliveryLines: [],
    materialDeliveryEvents: [],
    materialStockMovements: [],
    materialStockMovementEvents: [],
    taskMaterialRequirements: [],
    taskToolRequirements: [],
    projectPlans: [],
    projectRfis: [],
    projectRfiEvents: [],
    projectTools: [],
    projectToolEvents: [],
    siteTasks: [],
    siteTaskEvents: [],
    projectChecklists: [],
    safetyBriefings: [],
    safetyBriefingRecipients: [],
    safetyBriefingEvents: [],
    changeOrders: [],
    projectBudgets: [],
    projectSchedules: [],
    dailyControlActions: [],
    weeklyReports: [],
    notifications: [],
    outbox: [],
  };
}

export async function loadAppState(): Promise<AppState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const migrated = { ...emptyAppState(), ...parsed };
    await saveStateToSqlite(migrated);
    await AsyncStorage.removeItem(STATE_KEY);
    return migrated;
  }
  const sqliteState = await loadStateFromSqlite();
  return sqliteState ? { ...emptyAppState(), ...sqliteState } : emptyAppState();
}

export async function saveAppState(state: AppState): Promise<void> {
  await saveStateToSqlite(state);
}
export async function clearAppState(): Promise<void> {
  await clearStateFromSqlite();
  await AsyncStorage.removeItem(STATE_KEY);
}

export class LocalStore {
  private readonly store = new SerializedStateStore(
    emptyAppState(),
    saveAppState,
  );
  async hydrate(): Promise<AppState> {
    const state = await loadAppState();
    this.store.replace(state);
    return state;
  }
  get snapshot(): AppState {
    return this.store.snapshot;
  }
  update(mutator: (state: AppState) => AppState): Promise<AppState> {
    return this.store.update(mutator);
  }
}
