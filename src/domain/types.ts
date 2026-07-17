export type ProjectStatus = 'active' | 'archived';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type WeatherStatus = 'captured' | 'pending' | 'saved' | 'failed';
export type EntityType = 'diary_entry' | 'delay_event' | 'worker_checkin' | 'attachment' | 'weather_snapshot' | 'receipt_category' | 'receipt' | 'receipt_file' | 'receipt_ocr' | 'receipt_export' | 'material_request';

export interface Profile {
  id: string;
  email?: string;
  fullName?: string;
  locale: 'sk-SK';
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  location: string;
  address?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GpsEvidence {
  latitude: number;
  longitude: number;
  capturedAt: string;
  status: 'captured' | 'pending' | 'failed';
}

export interface WeatherSnapshot {
  id?: string;
  provider: 'open-meteo';
  requestUrl: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
  rawJson: Record<string, unknown>;
  temperatureC?: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  weatherCode?: number;
  status: WeatherStatus;
}

export interface Attachment {
  id: string;
  ownerId: string;
  projectId: string;
  relatedEntityType: EntityType;
  relatedEntityId?: string;
  localUri: string;
  storagePath?: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadStatus: SyncStatus;
  thumbnailPath?: string;
}

export interface EvidenceBundle {
  gps?: GpsEvidence;
  weather?: WeatherSnapshot;
  capturedAt: string;
  attachmentIds: string[];
}

export interface DiaryEntry {
  id: string;
  ownerId: string;
  projectId: string;
  logDate: string;
  workDescription: string;
  workerCount: number;
  note?: string;
  evidence: EvidenceBundle;
  lockedAt?: string;
  lockedBy?: string;
  correctionOfId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type DelayReason = 'bad_weather' | 'investor_waiting';

export interface DelayEvent {
  id: string;
  ownerId: string;
  projectId: string;
  eventDate: string;
  reason: DelayReason;
  note?: string;
  evidence: EvidenceBundle;
  lockedAt?: string;
  lockedBy?: string;
  correctionOfId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerCheckin {
  id: string;
  projectId: string;
  workerName: string;
  checkedInAt: string;
  latitude?: number;
  longitude?: number;
}

export interface CheckinTokenPayload {
  projectId: string;
  ownerId: string;
  date: string;
  expiresAt: string;
  action: 'checkin';
  nonce: string;
}

export interface ReportExport {
  id: string;
  ownerId: string;
  projectId: string;
  type: 'diary' | 'delay';
  sourceEntityId?: string;
  attachmentIds?: string[];
  locale: 'sk-SK';
  storagePath?: string;
  createdAt: string;
  pageCount: number;
  status: SyncStatus;
}

export type ReceiptStatus = 'draft' | 'needs_review' | 'ready';
export type OcrStatus = 'not_requested' | 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed';

export interface ReceiptCategory {
  id: string;
  ownerId: string;
  name: string;
  isDefault: boolean;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  ownerId: string;
  projectId: string;
  categoryId?: string;
  purchaseDate?: string;
  seller?: string;
  totalAmountCents?: number;
  currency: 'EUR';
  note?: string;
  status: ReceiptStatus;
  ocrStatus: OcrStatus;
  ocrConfidence?: number;
  ocrError?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptFile {
  id: string;
  receiptId: string;
  ownerId: string;
  projectId: string;
  localUri: string;
  storagePath?: string;
  fileSize: number;
  mimeType: string;
  pageOrder: number;
  sha256?: string;
  perceptualHash?: string;
  uploadStatus: SyncStatus;
  createdAt: string;
}

export type WorkerStatus = 'pending' | 'active' | 'rejected' | 'revoked';

export interface ProjectWorker {
  id: string;
  ownerId: string;
  projectId: string;
  authUserId?: string;
  firstName: string;
  lastName: string;
  position: string;
  status: WorkerStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type MaterialRequestStatus = 'new' | 'approved' | 'partially_purchased' | 'purchased' | 'rejected';

export interface MaterialRequest {
  id: string;
  ownerId: string;
  projectId: string;
  workerId: string;
  desiredDate?: string;
  comment?: string;
  status: MaterialRequestStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRequestItem {
  id: string;
  requestId: string;
  name: string;
  quantity: number;
  unit: string;
  createdAt: string;
}

export interface ReceiptRequestLink {
  id: string;
  ownerId: string;
  receiptId: string;
  requestId: string;
  allocatedAmountCents?: number;
  createdAt: string;
}

export interface ReceiptExport {
  id: string;
  ownerId: string;
  projectId: string;
  dateFrom: string;
  dateTo: string;
  categoryIds: string[];
  receiptIds: string[];
  version: number;
  totalAmountCents: number;
  storagePath?: string;
  checksum?: string;
  pageCount: number;
  status: SyncStatus;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: 'worker_join' | 'material_request' | 'request_status';
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export type PlanKey = 'free' | 'premium';
export interface FeatureEntitlement { featureKey: string; enabled: boolean; monthlyLimit?: number; resourceLimit?: number; used: number; }
export interface PilotAccountStatus { plan: PlanKey; premiumUntil?: string; analyticsEnabled: boolean; entitlements: FeatureEntitlement[]; }

export interface OutboxItem<T = any> {
  id: string;
  type: 'diary_entry' | 'delay_event' | 'attachment' | 'worker_checkin' | 'weather_snapshot' | 'receipt_category' | 'receipt' | 'receipt_file' | 'receipt_ocr' | 'receipt_export' | 'material_request';
  localId: string;
  remoteId?: string;
  payload: T;
  status: SyncStatus;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  activeUserId?: string;
  selectedProjectId?: string;
  projects: Project[];
  diaryEntries: DiaryEntry[];
  delayEvents: DelayEvent[];
  workerCheckins: WorkerCheckin[];
  attachments: Attachment[];
  reports: ReportExport[];
  receiptCategories: ReceiptCategory[];
  receipts: Receipt[];
  receiptFiles: ReceiptFile[];
  receiptExports: ReceiptExport[];
  workers: ProjectWorker[];
  materialRequests: MaterialRequest[];
  materialRequestItems: MaterialRequestItem[];
  receiptRequestLinks: ReceiptRequestLink[];
  notifications: AppNotification[];
  outbox: OutboxItem[];
}
