export type ProjectStatus = "active" | "archived";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type WeatherStatus = "captured" | "pending" | "saved" | "failed";
export type EntityType =
  | "diary_entry"
  | "delay_event"
  | "worker_checkin"
  | "attachment"
  | "weather_snapshot"
  | "receipt_category"
  | "receipt"
  | "receipt_file"
  | "receipt_ocr"
  | "receipt_export"
  | "material_request"
  | "site_task"
  | "project_rfi"
  | "worker_credential"
  | "site_incident"
  | "material_delivery"
  | "material_stock_movement";

export interface Profile {
  id: string;
  email?: string;
  fullName?: string;
  locale: "sk-SK";
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
  status: "captured" | "pending" | "failed";
}

export interface WeatherSnapshot {
  id?: string;
  provider: "open-meteo";
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
  evidenceRole?: "before" | "after" | "general";
  createdByWorkerId?: string;
  captureSource?: "camera" | "library" | "worker_portal";
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  contentSha256?: string;
  integrityVersion?: "sha256-v1";
  sourceFileName?: string;
  sourceMetadata?: Record<string, string | number>;
}

export interface EvidenceBundle {
  gps?: GpsEvidence;
  weather?: WeatherSnapshot;
  capturedAt: string;
  attachmentIds: string[];
}

export type DiaryTechnicalCategory =
  | "site_inspection"
  | "authority_supervision"
  | "contractual_fact"
  | "material_delivery"
  | "product_certificate"
  | "equipment_use"
  | "work_interruption"
  | "adverse_condition"
  | "schedule_impact"
  | "site_find"
  | "foundation_acceptance"
  | "test_measurement"
  | "quality_fact"
  | "technical_inspection"
  | "safety_instruction"
  | "injury"
  | "project_deviation"
  | "waste_management"
  | "consent_other";

export interface DiaryWorkforceRole {
  role: string;
  count: number;
}

export interface DiaryTechnicalRecord {
  id: string;
  category: DiaryTechnicalCategory;
  description: string;
  reference?: string;
}

export interface DiaryEntry {
  id: string;
  ownerId: string;
  projectId: string;
  logDate: string;
  workDescription: string;
  workerCount: number;
  workStartTime?: string;
  workEndTime?: string;
  workforceRoles?: DiaryWorkforceRole[];
  technicalRecords?: DiaryTechnicalRecord[];
  note?: string;
  evidence: EvidenceBundle;
  lockedAt?: string;
  lockedBy?: string;
  correctionOfId?: string;
  correctionReason?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DayClosureSnapshot {
  schemaVersion: 1 | 2;
  projectId: string;
  logDate: string;
  diaryEntries: Array<{
    id: string;
    workDescription: string;
    workerCount: number;
    workStartTime?: string;
    workEndTime?: string;
    workforceRoles?: DiaryWorkforceRole[];
    technicalRecords?: DiaryTechnicalRecord[];
    note?: string;
    correctionOfId?: string;
    correctionReason?: string;
    capturedAt: string;
    attachmentIds: string[];
    weatherCapturedAt?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  workerCheckinIds: string[];
  attachmentIds: string[];
  completedTaskIds: string[];
  pendingTaskReviewIds: string[];
  incompleteReceiptIds: string[];
}

export interface DayClosureRecord {
  id: string;
  ownerId: string;
  projectId: string;
  logDate: string;
  version: number;
  supersedesClosureId?: string;
  correctionReason?: string;
  snapshot: DayClosureSnapshot;
  contentHash: string;
  confirmationVersion: "sk-v1";
  acknowledgedWarnings: DayClosureCheck[];
  confirmedAt: string;
  confirmedBy: string;
  syncStatus: SyncStatus;
  createdAt: string;
}

export type DiaryApprovalRole =
  | "technical_supervisor"
  | "investor"
  | "designer"
  | "contractor"
  | "other";

export type DiaryApprovalStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "revoked";

export interface DiaryApprovalRequest {
  id: string;
  ownerId: string;
  projectId: string;
  closureId: string;
  closureHash: string;
  recipientName: string;
  reviewerRole: DiaryApprovalRole;
  status: DiaryApprovalStatus;
  expiresAt: string;
  openedAt?: string;
  viewCount: number;
  decidedAt?: string;
  decisionComment?: string;
  confirmationVersion?: "sk-v1";
  revokedAt?: string;
  createdAt: string;
}

export interface DiaryApprovalEvent {
  id: string;
  ownerId: string;
  projectId: string;
  requestId: string;
  closureId: string;
  eventType: "created" | "approved" | "changes_requested" | "revoked";
  actorName?: string;
  actorRole?: string;
  body?: string;
  closureHash: string;
  createdAt: string;
}

export interface CreatedDiaryApprovalRequest extends DiaryApprovalRequest {
  token: string;
  url: string;
}

export type DayClosureCheck =
  "diary" | "workforce" | "weather" | "photos" | "taskReviews" | "receipts";

export type DelayReason = "bad_weather" | "investor_waiting";

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

export type WorkShiftStatus = "active" | "completed" | "approved";
export type WorkShiftSource = "worker" | "manual";

export interface WorkShift {
  id: string;
  ownerId: string;
  projectId: string;
  workerId: string;
  shiftDate: string;
  startedAt: string;
  endedAt?: string;
  breakMinutes: number;
  note?: string;
  source: WorkShiftSource;
  status: WorkShiftStatus;
  approvedAt?: string;
  approvedBy?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type WorkShiftEventType =
  "started" | "ended" | "created" | "corrected" | "approved" | "reopened";

export interface WorkShiftEvent {
  id: string;
  ownerId: string;
  projectId: string;
  shiftId: string;
  workerId: string;
  eventType: WorkShiftEventType;
  body?: string;
  metadata: Record<string, unknown>;
  actorUserId?: string;
  createdAt: string;
}

export interface CheckinTokenPayload {
  projectId: string;
  ownerId: string;
  date: string;
  expiresAt: string;
  action: "checkin";
  nonce: string;
}

export interface ReportExport {
  id: string;
  ownerId: string;
  projectId: string;
  type: "diary" | "delay" | "evidence_pack" | "weekly" | "tool_inventory";
  sourceEntityId?: string;
  attachmentIds?: string[];
  locale: "sk-SK";
  storagePath?: string;
  createdAt: string;
  pageCount: number;
  status: SyncStatus;
}

export type ReceiptStatus = "draft" | "needs_review" | "ready";
export type OcrStatus =
  | "not_requested"
  | "pending"
  | "processing"
  | "needs_review"
  | "completed"
  | "failed";

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
  currency: "EUR";
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

export type WorkerStatus = "pending" | "active" | "rejected" | "revoked";

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

export type WorkerCredentialType =
  | "medical_exam"
  | "bozp_training"
  | "height_work"
  | "machinery_operator"
  | "electrician"
  | "welder"
  | "driver"
  | "other";

export interface WorkerCredential {
  id: string;
  ownerId: string;
  projectId: string;
  workerId: string;
  credentialType: WorkerCredentialType;
  title: string;
  documentNumber?: string;
  issuer?: string;
  issuedDate?: string;
  expiresAt?: string;
  note?: string;
  attachmentId?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type WorkerCredentialEventType =
  "created" | "updated" | "revoked" | "restored";

export interface WorkerCredentialEvent {
  id: string;
  ownerId: string;
  projectId: string;
  credentialId: string;
  workerId: string;
  eventType: WorkerCredentialEventType;
  body?: string;
  metadata: Record<string, string | number | boolean | null>;
  actorUserId?: string;
  createdAt: string;
}

export type SiteIncidentType =
  | "near_miss"
  | "injury"
  | "property_damage"
  | "environmental"
  | "safety_observation";
export type SiteIncidentSeverity = "low" | "moderate" | "serious" | "critical";
export type SiteIncidentStatus = "reported" | "investigating" | "resolved";

export interface SiteIncident {
  id: string;
  ownerId: string;
  projectId: string;
  reporterWorkerId?: string;
  reporterName: string;
  incidentType: SiteIncidentType;
  severity: SiteIncidentSeverity;
  occurredAt: string;
  location: string;
  description: string;
  immediateAction?: string;
  peopleInvolved?: string;
  attachmentId?: string;
  status: SiteIncidentStatus;
  rootCause?: string;
  correctiveAction?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type SiteIncidentEventType =
  "reported" | "updated" | "investigation_started" | "resolved" | "reopened";
export interface SiteIncidentEvent {
  id: string;
  ownerId: string;
  projectId: string;
  incidentId: string;
  eventType: SiteIncidentEventType;
  body?: string;
  metadata: Record<string, string | number | boolean | null>;
  actorUserId?: string;
  actorWorkerId?: string;
  createdAt: string;
}

export type ProjectToolStatus =
  "available" | "issued" | "maintenance" | "lost" | "retired";

export interface ProjectTool {
  id: string;
  ownerId: string;
  projectId: string;
  assetNumber: number;
  name: string;
  category: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  note?: string;
  status: ProjectToolStatus;
  currentWorkerId?: string;
  issuedAt?: string;
  expectedReturnDate?: string;
  retiredAt?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectToolEventType =
  | "registered"
  | "updated"
  | "issued"
  | "returned"
  | "damaged"
  | "lost"
  | "maintenance_completed"
  | "retired";

export interface ProjectToolEvent {
  id: string;
  ownerId: string;
  projectId: string;
  toolId: string;
  eventType: ProjectToolEventType;
  workerId?: string;
  body?: string;
  metadata: Record<string, string | number | boolean | null>;
  actorUserId?: string;
  createdAt: string;
}

export type MaterialRequestStatus =
  "new" | "approved" | "partially_purchased" | "purchased" | "rejected";

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

export type MaterialSupplierQuoteStatus = "offered" | "selected" | "withdrawn";

export interface MaterialSupplierQuote {
  id: string;
  ownerId: string;
  projectId: string;
  requestId: string;
  supplierName: string;
  totalAmountCents: number;
  currency: "EUR";
  deliveryDate?: string;
  validUntil?: string;
  note?: string;
  status: MaterialSupplierQuoteStatus;
  selectedAt?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type MaterialDeliveryStatus =
  "reported" | "accepted" | "discrepancy" | "resolved";
export interface MaterialDelivery {
  id: string;
  ownerId: string;
  projectId: string;
  requestId: string;
  quoteId?: string;
  supplierName: string;
  deliveryNoteNumber?: string;
  deliveredAt: string;
  receiverWorkerId?: string;
  receiverName: string;
  note?: string;
  attachmentId?: string;
  status: MaterialDeliveryStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
export interface MaterialDeliveryLine {
  id: string;
  ownerId: string;
  projectId: string;
  deliveryId: string;
  requestItemId: string;
  itemName: string;
  unit: string;
  expectedQuantity: number;
  deliveredQuantity: number;
  damagedQuantity: number;
  createdAt: string;
}
export type MaterialDeliveryEventType =
  "reported" | "updated" | "accepted" | "discrepancy" | "resolved";
export interface MaterialDeliveryEvent {
  id: string;
  ownerId: string;
  projectId: string;
  deliveryId: string;
  eventType: MaterialDeliveryEventType;
  body?: string;
  metadata: Record<string, string | number | boolean | null>;
  actorUserId?: string;
  actorWorkerId?: string;
  createdAt: string;
}

export type MaterialStockMovementType =
  "usage" | "waste" | "return" | "adjustment_in" | "adjustment_out";
export type MaterialStockMovementStatus = "reported" | "confirmed" | "rejected";
export interface MaterialStockMovement {
  id: string;
  ownerId: string;
  projectId: string;
  requestId: string;
  requestItemId: string;
  materialName: string;
  unit: string;
  movementType: MaterialStockMovementType;
  quantity: number;
  occurredAt: string;
  workerId?: string;
  workerName?: string;
  note?: string;
  status: MaterialStockMovementStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  syncStatus: SyncStatus;
  createdAt: string;
}
export type MaterialStockMovementEventType =
  "reported" | "confirmed" | "rejected";
export interface MaterialStockMovementEvent {
  id: string;
  ownerId: string;
  projectId: string;
  movementId: string;
  eventType: MaterialStockMovementEventType;
  body?: string;
  actorUserId?: string;
  actorWorkerId?: string;
  createdAt: string;
}

export interface TaskMaterialRequirement {
  id: string;
  ownerId: string;
  projectId: string;
  taskId: string;
  requestId: string;
  requestItemId: string;
  materialName: string;
  unit: string;
  quantity: number;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskToolRequirement {
  id: string;
  ownerId: string;
  projectId: string;
  taskId: string;
  toolId: string;
  assetNumber: number;
  toolName: string;
  category: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
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

export interface ProjectPlan {
  id: string;
  ownerId: string;
  projectId: string;
  name: string;
  localUri: string;
  storagePath?: string;
  fileSize: number;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  pageCount: number;
  seriesId: string;
  versionNumber: number;
  supersedesPlanId?: string;
  isCurrent: boolean;
  uploadStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectRfiStatus = "draft" | "open" | "answered" | "closed";

export interface ProjectRfi {
  id: string;
  ownerId: string;
  projectId: string;
  rfiNumber: number;
  subject: string;
  question: string;
  recipientName: string;
  dueDate?: string;
  planId?: string;
  pageNumber?: number;
  xRatio?: number;
  yRatio?: number;
  status: ProjectRfiStatus;
  answer?: string;
  answeredByName?: string;
  openedAt?: string;
  answeredAt?: string;
  closedAt?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectRfiEventType =
  "created" | "updated" | "opened" | "answered" | "closed" | "reopened";

export interface ProjectRfiEvent {
  id: string;
  ownerId: string;
  projectId: string;
  rfiId: string;
  eventType: ProjectRfiEventType;
  body?: string;
  metadata: Record<string, string | number | boolean | null>;
  actorUserId?: string;
  createdAt: string;
}

export type SiteTaskKind = "task" | "defect" | "inspection" | "material";
export type SiteTaskStatus =
  "open" | "in_progress" | "blocked" | "review" | "done";
export type SiteTaskPriority = "low" | "normal" | "high" | "urgent";

export interface SiteTask {
  id: string;
  ownerId: string;
  projectId: string;
  planId?: string;
  pageNumber?: number;
  xRatio?: number;
  yRatio?: number;
  title: string;
  description?: string;
  kind: SiteTaskKind;
  status: SiteTaskStatus;
  priority: SiteTaskPriority;
  assignedWorkerId?: string;
  dueDate?: string;
  completedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  revisionCount?: number;
  clientVisible?: boolean;
  sourceChecklistId?: string;
  sourceChecklistItemKey?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type SiteTaskEventType =
  | "created"
  | "updated"
  | "status_changed"
  | "assignment_changed"
  | "comment"
  | "client_decision";

export interface SiteTaskEvent {
  id: string;
  ownerId: string;
  projectId: string;
  taskId: string;
  actorUserId?: string;
  actorWorkerId?: string;
  eventType: SiteTaskEventType;
  body?: string;
  metadata: Record<string, string | number | boolean | null>;
  syncStatus: SyncStatus;
  createdAt: string;
}

export type ChecklistCategory = "quality" | "safety";
export type ChecklistAnswerResult = "pending" | "pass" | "fail" | "na";
export type ChecklistStatus = "draft" | "completed";

export interface ChecklistAnswer {
  itemKey: string;
  label: string;
  required: boolean;
  result: ChecklistAnswerResult;
  note?: string;
}

export interface ProjectChecklist {
  id: string;
  ownerId: string;
  projectId: string;
  templateKey: string;
  templateName: string;
  category: ChecklistCategory;
  inspectionDate: string;
  answers: ChecklistAnswer[];
  status: ChecklistStatus;
  note?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type SafetyBriefingStatus = "draft" | "published" | "closed";
export type SafetyBriefingRecipientStatus =
  "pending" | "acknowledged" | "excused";

export interface SafetyBriefing {
  id: string;
  ownerId: string;
  projectId: string;
  title: string;
  body: string;
  briefingDate: string;
  status: SafetyBriefingStatus;
  contentHash?: string;
  publishedAt?: string;
  publishedBy?: string;
  closedAt?: string;
  closedBy?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyBriefingRecipient {
  id: string;
  ownerId: string;
  projectId: string;
  briefingId: string;
  workerId: string;
  workerName: string;
  position: string;
  status: SafetyBriefingRecipientStatus;
  contentHash: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  excusedAt?: string;
  excusedBy?: string;
  excuseReason?: string;
  createdAt: string;
}

export type SafetyBriefingEventType =
  "created" | "updated" | "published" | "acknowledged" | "excused" | "closed";
export interface SafetyBriefingEvent {
  id: string;
  ownerId: string;
  projectId: string;
  briefingId: string;
  eventType: SafetyBriefingEventType;
  workerId?: string;
  body?: string;
  metadata: Record<string, unknown>;
  actorUserId?: string;
  createdAt: string;
}

export interface ProjectShareLink {
  id: string;
  projectId: string;
  expiresAt: string;
  revokedAt?: string;
  viewCount: number;
  lastViewedAt?: string;
  createdAt: string;
}

export type ChangeOrderStatus =
  "draft" | "pending_client" | "accepted" | "rejected" | "cancelled";

export interface ChangeOrder {
  id: string;
  ownerId: string;
  projectId: string;
  orderNumber?: number;
  title: string;
  description: string;
  amountCents: number;
  scheduleImpactDays: number;
  relatedTaskId?: string;
  status: ChangeOrderStatus;
  submittedAt?: string;
  decidedAt?: string;
  signerName?: string;
  decisionComment?: string;
  shareLinkId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBudget {
  projectId: string;
  ownerId: string;
  baselineBudgetCents: number;
  contingencyCents: number;
  remainingCommitmentCents: number;
  note?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSchedule {
  projectId: string;
  ownerId: string;
  startDate: string;
  targetCompletionDate: string;
  note?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type DailyControlActionStatus = "open" | "resolved";

export interface DailyControlAction {
  id: string;
  ownerId: string;
  projectId: string;
  actionDate: string;
  issue: string;
  severity: "critical" | "high" | "watch";
  target: string;
  count?: number;
  amountCents?: number;
  status: DailyControlActionStatus;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type WeeklyReportStatus = "draft" | "published";

export interface WeeklyReportTaskSnapshot {
  id: string;
  title: string;
  completedAt: string;
  attachmentIds: string[];
}

export interface WeeklyReportSnapshot {
  generatedAt: string;
  completedTasks: WeeklyReportTaskSnapshot[];
  diaryEntryCount: number;
  workerDays: number;
  verifiedSpendCents: number;
  acceptedChangeCents: number;
  openTaskCount: number;
  blockedTaskCount: number;
  overdueTaskCount: number;
  materialRiskCount: number;
  scheduleRisk: "not_configured" | "on_track" | "watch" | "high" | "critical";
  forecastCompletionDate?: string;
  attachmentIds: string[];
}

export interface WeeklyReport {
  id: string;
  ownerId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  nextWeekPlan: string;
  clientNote?: string;
  snapshot: WeeklyReportSnapshot;
  status: WeeklyReportStatus;
  publishedAt?: string;
  pdfReportId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedProjectShareLink extends ProjectShareLink {
  token: string;
  url: string;
}

export interface AppNotification {
  id: string;
  type:
    | "worker_join"
    | "material_request"
    | "request_status"
    | "site_task"
    | "task_review"
    | "task_assignment"
    | "task_comment"
    | "client_decision"
    | "change_order_decision"
    | "supplier_quote"
    | "site_incident"
    | "material_delivery"
    | "material_stock"
    | "diary_approval";
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

export type PlanKey = "free" | "premium";
export interface FeatureEntitlement {
  featureKey: string;
  enabled: boolean;
  monthlyLimit?: number;
  resourceLimit?: number;
  used: number;
}
export interface PilotAccountStatus {
  plan: PlanKey;
  premiumUntil?: string;
  analyticsEnabled: boolean;
  entitlements: FeatureEntitlement[];
}

export interface OutboxItem<T = any> {
  id: string;
  type:
    | "diary_entry"
    | "day_closure"
    | "delay_event"
    | "attachment"
    | "worker_checkin"
    | "work_shift"
    | "work_shift_approve"
    | "work_shift_reopen"
    | "safety_briefing"
    | "safety_briefing_publish"
    | "safety_briefing_excuse"
    | "safety_briefing_close"
    | "worker_credential"
    | "worker_credential_revoke"
    | "worker_credential_restore"
    | "site_incident"
    | "site_incident_investigate"
    | "site_incident_resolve"
    | "site_incident_reopen"
    | "material_delivery"
    | "material_delivery_review"
    | "material_delivery_resolve"
    | "material_stock_movement"
    | "material_stock_review"
    | "weather_snapshot"
    | "receipt_category"
    | "receipt"
    | "receipt_file"
    | "receipt_ocr"
    | "receipt_export"
    | "material_request"
    | "material_supplier_quote"
    | "material_quote_selection"
    | "material_quote_withdrawal"
    | "project_plan"
    | "project_rfi"
    | "project_rfi_open"
    | "project_rfi_answer"
    | "project_rfi_close"
    | "project_rfi_reopen"
    | "project_tool"
    | "project_tool_issue"
    | "project_tool_return"
    | "project_tool_problem"
    | "project_tool_restore"
    | "project_tool_retire"
    | "site_task"
    | "project_checklist"
    | "site_task_event"
    | "change_order"
    | "project_budget"
    | "project_schedule"
    | "weekly_report"
    | "daily_control_action"
    | "task_material_requirements"
    | "task_tool_requirements";
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
  dayClosures: DayClosureRecord[];
  diaryApprovalRequests: DiaryApprovalRequest[];
  diaryApprovalEvents: DiaryApprovalEvent[];
  delayEvents: DelayEvent[];
  workerCheckins: WorkerCheckin[];
  workShifts: WorkShift[];
  workShiftEvents: WorkShiftEvent[];
  attachments: Attachment[];
  reports: ReportExport[];
  receiptCategories: ReceiptCategory[];
  receipts: Receipt[];
  receiptFiles: ReceiptFile[];
  receiptExports: ReceiptExport[];
  workers: ProjectWorker[];
  workerCredentials: WorkerCredential[];
  workerCredentialEvents: WorkerCredentialEvent[];
  siteIncidents: SiteIncident[];
  siteIncidentEvents: SiteIncidentEvent[];
  materialRequests: MaterialRequest[];
  materialRequestItems: MaterialRequestItem[];
  receiptRequestLinks: ReceiptRequestLink[];
  materialSupplierQuotes?: MaterialSupplierQuote[];
  materialDeliveries: MaterialDelivery[];
  materialDeliveryLines: MaterialDeliveryLine[];
  materialDeliveryEvents: MaterialDeliveryEvent[];
  materialStockMovements: MaterialStockMovement[];
  materialStockMovementEvents: MaterialStockMovementEvent[];
  taskMaterialRequirements: TaskMaterialRequirement[];
  taskToolRequirements: TaskToolRequirement[];
  projectPlans: ProjectPlan[];
  projectRfis: ProjectRfi[];
  projectRfiEvents: ProjectRfiEvent[];
  projectTools: ProjectTool[];
  projectToolEvents: ProjectToolEvent[];
  siteTasks: SiteTask[];
  siteTaskEvents: SiteTaskEvent[];
  projectChecklists: ProjectChecklist[];
  safetyBriefings: SafetyBriefing[];
  safetyBriefingRecipients: SafetyBriefingRecipient[];
  safetyBriefingEvents: SafetyBriefingEvent[];
  changeOrders: ChangeOrder[];
  projectBudgets: ProjectBudget[];
  projectSchedules: ProjectSchedule[];
  dailyControlActions: DailyControlAction[];
  weeklyReports: WeeklyReport[];
  notifications: AppNotification[];
  outbox: OutboxItem[];
}
