import * as SQLite from 'expo-sqlite';
import type {
  AppNotification,
  AppState,
  MaterialRequest,
  MaterialRequestItem,
  OutboxItem,
  ProjectWorker,
  Receipt,
  ReceiptCategory,
  ReceiptExport,
  ReceiptFile,
  ReceiptRequestLink,
} from '@/domain/types';

const DATABASE_NAME = 'stavebny-dennik.db';
let writeQueue: Promise<void> = Promise.resolve();
let database: SQLite.SQLiteDatabase | undefined;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, local_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, remote_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS receipt_categories (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, is_default INTEGER NOT NULL, sync_status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, category_id TEXT, purchase_date TEXT, seller TEXT, total_amount_cents INTEGER, currency TEXT NOT NULL, note TEXT, status TEXT NOT NULL, ocr_status TEXT NOT NULL, ocr_confidence REAL, ocr_error TEXT, sync_status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS receipts_project_date_idx ON receipts(project_id, purchase_date DESC);
  CREATE TABLE IF NOT EXISTS receipt_files (id TEXT PRIMARY KEY NOT NULL, receipt_id TEXT NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, local_uri TEXT NOT NULL, storage_path TEXT, file_size INTEGER NOT NULL, mime_type TEXT NOT NULL, page_order INTEGER NOT NULL, sha256 TEXT, perceptual_hash TEXT, upload_status TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS receipt_files_receipt_idx ON receipt_files(receipt_id, page_order);
  CREATE TABLE IF NOT EXISTS receipt_exports (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL, category_ids TEXT NOT NULL, receipt_ids TEXT NOT NULL, version INTEGER NOT NULL, total_amount_cents INTEGER NOT NULL, storage_path TEXT, checksum TEXT, page_count INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS project_workers (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, auth_user_id TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, position TEXT NOT NULL, status TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS project_workers_project_status_idx ON project_workers(project_id, status);
  CREATE TABLE IF NOT EXISTS material_requests (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, worker_id TEXT NOT NULL, desired_date TEXT, comment TEXT, status TEXT NOT NULL, rejection_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS material_requests_project_status_idx ON material_requests(project_id, status, created_at DESC);
  CREATE TABLE IF NOT EXISTS material_request_items (id TEXT PRIMARY KEY NOT NULL, request_id TEXT NOT NULL, name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS material_request_items_request_idx ON material_request_items(request_id);
  CREATE TABLE IF NOT EXISTS receipt_request_links (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, receipt_id TEXT NOT NULL, request_id TEXT NOT NULL, allocated_amount_cents INTEGER, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', read_at TEXT, created_at TEXT NOT NULL);
`;

export function openLocalDatabase(): SQLite.SQLiteDatabase {
  if (database) return database;
  database = SQLite.openDatabaseSync(DATABASE_NAME);
  database.execSync(SCHEMA);
  try {
    database.execSync(
      "ALTER TABLE notifications ADD COLUMN data TEXT NOT NULL DEFAULT '{}'",
    );
  } catch {
    /* column already exists */
  }
  return database;
}

function loadOutbox(localDatabase: SQLite.SQLiteDatabase): OutboxItem[] {
  return localDatabase.getAllSync<{
    id: string; type: OutboxItem['type']; localId: string; payload: string; status: OutboxItem['status'];
    attemptCount: number; lastError?: string; remoteId?: string; createdAt: string; updatedAt: string;
  }>('SELECT id, type, local_id AS localId, payload, status, attempt_count AS attemptCount, last_error AS lastError, remote_id AS remoteId, created_at AS createdAt, updated_at AS updatedAt FROM outbox ORDER BY created_at')
    .map(row => ({ ...row, payload: JSON.parse(row.payload) }));
}

export async function loadStateFromSqlite(): Promise<AppState | undefined> {
  const localDatabase = openLocalDatabase();
  const row = localDatabase.getFirstSync<{ value: string }>('SELECT value FROM app_state WHERE key = ?', 'snapshot');
  if (!row?.value) return undefined;
  const core = JSON.parse(row.value) as Omit<AppState, 'receiptCategories' | 'receipts' | 'receiptFiles' | 'receiptExports' | 'workers' | 'materialRequests' | 'materialRequestItems' | 'receiptRequestLinks' | 'notifications' | 'outbox'>;
  const receiptCategories = localDatabase.getAllSync<ReceiptCategory>('SELECT id, owner_id AS ownerId, name, is_default AS isDefault, sync_status AS syncStatus, created_at AS createdAt, updated_at AS updatedAt FROM receipt_categories ORDER BY name');
  const receipts = localDatabase.getAllSync<Receipt>('SELECT id, owner_id AS ownerId, project_id AS projectId, category_id AS categoryId, purchase_date AS purchaseDate, seller, total_amount_cents AS totalAmountCents, currency, note, status, ocr_status AS ocrStatus, ocr_confidence AS ocrConfidence, ocr_error AS ocrError, sync_status AS syncStatus, created_at AS createdAt, updated_at AS updatedAt FROM receipts ORDER BY created_at DESC');
  const receiptFiles = localDatabase.getAllSync<ReceiptFile>('SELECT id, receipt_id AS receiptId, owner_id AS ownerId, project_id AS projectId, local_uri AS localUri, storage_path AS storagePath, file_size AS fileSize, mime_type AS mimeType, page_order AS pageOrder, sha256, perceptual_hash AS perceptualHash, upload_status AS uploadStatus, created_at AS createdAt FROM receipt_files ORDER BY receipt_id, page_order');
  const receiptExports = localDatabase.getAllSync<Omit<ReceiptExport, 'categoryIds' | 'receiptIds'> & { categoryIds: string; receiptIds: string }>('SELECT id, owner_id AS ownerId, project_id AS projectId, date_from AS dateFrom, date_to AS dateTo, category_ids AS categoryIds, receipt_ids AS receiptIds, version, total_amount_cents AS totalAmountCents, storage_path AS storagePath, checksum, page_count AS pageCount, status, created_at AS createdAt FROM receipt_exports ORDER BY created_at DESC').map(item => ({ ...item, categoryIds: JSON.parse(item.categoryIds), receiptIds: JSON.parse(item.receiptIds) }));
  const workers = localDatabase.getAllSync<ProjectWorker>('SELECT id, owner_id AS ownerId, project_id AS projectId, auth_user_id AS authUserId, first_name AS firstName, last_name AS lastName, position, status, reviewed_at AS reviewedAt, reviewed_by AS reviewedBy, created_at AS createdAt, updated_at AS updatedAt FROM project_workers ORDER BY created_at DESC');
  const materialRequests = localDatabase.getAllSync<MaterialRequest>('SELECT id, owner_id AS ownerId, project_id AS projectId, worker_id AS workerId, desired_date AS desiredDate, comment, status, rejection_reason AS rejectionReason, created_at AS createdAt, updated_at AS updatedAt FROM material_requests ORDER BY created_at DESC');
  const materialRequestItems = localDatabase.getAllSync<MaterialRequestItem>('SELECT id, request_id AS requestId, name, quantity, unit, created_at AS createdAt FROM material_request_items ORDER BY created_at');
  const receiptRequestLinks = localDatabase.getAllSync<ReceiptRequestLink>('SELECT id, owner_id AS ownerId, receipt_id AS receiptId, request_id AS requestId, allocated_amount_cents AS allocatedAmountCents, created_at AS createdAt FROM receipt_request_links ORDER BY created_at');
  const notifications = localDatabase.getAllSync<Omit<AppNotification, 'data'> & { data: string }>('SELECT id, type, title, body, data, read_at AS readAt, created_at AS createdAt FROM notifications ORDER BY created_at DESC').map(item => ({ ...item, data: JSON.parse(item.data || '{}') }));
  return { ...core, receiptCategories, receipts, receiptFiles, receiptExports, workers, materialRequests, materialRequestItems, receiptRequestLinks, notifications, outbox: loadOutbox(localDatabase) };
}

export function saveStateToSqlite(state: AppState): Promise<void> {
  const write = writeQueue.then(async () => {
    const localDatabase = openLocalDatabase();
    const { receiptCategories, receipts, receiptFiles, receiptExports, workers, materialRequests, materialRequestItems, receiptRequestLinks, notifications, outbox, ...core } = state;
    localDatabase.withTransactionSync(() => {
      localDatabase.runSync('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'snapshot', JSON.stringify(core));
      for (const table of ['outbox', 'receipt_categories', 'receipts', 'receipt_files', 'receipt_exports', 'project_workers', 'material_requests', 'material_request_items', 'receipt_request_links', 'notifications']) localDatabase.runSync(`DELETE FROM ${table}`);
      for (const item of outbox) localDatabase.runSync('INSERT INTO outbox (id, type, local_id, payload, status, attempt_count, last_error, remote_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.type, item.localId, JSON.stringify(item.payload), item.status, item.attemptCount, item.lastError ?? null, item.remoteId ?? null, item.createdAt, item.updatedAt);
      for (const item of receiptCategories) localDatabase.runSync('INSERT INTO receipt_categories VALUES (?, ?, ?, ?, ?, ?, ?)', item.id, item.ownerId, item.name, item.isDefault ? 1 : 0, item.syncStatus, item.createdAt, item.updatedAt);
      for (const item of receipts) localDatabase.runSync('INSERT INTO receipts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.ownerId, item.projectId, item.categoryId ?? null, item.purchaseDate ?? null, item.seller ?? null, item.totalAmountCents ?? null, item.currency, item.note ?? null, item.status, item.ocrStatus, item.ocrConfidence ?? null, item.ocrError ?? null, item.syncStatus, item.createdAt, item.updatedAt);
      for (const item of receiptFiles) localDatabase.runSync('INSERT INTO receipt_files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.receiptId, item.ownerId, item.projectId, item.localUri, item.storagePath ?? null, item.fileSize, item.mimeType, item.pageOrder, item.sha256 ?? null, item.perceptualHash ?? null, item.uploadStatus, item.createdAt);
      for (const item of receiptExports) localDatabase.runSync('INSERT INTO receipt_exports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.ownerId, item.projectId, item.dateFrom, item.dateTo, JSON.stringify(item.categoryIds), JSON.stringify(item.receiptIds), item.version, item.totalAmountCents, item.storagePath ?? null, item.checksum ?? null, item.pageCount, item.status, item.createdAt);
      for (const item of workers) localDatabase.runSync(
        'INSERT INTO project_workers (id, owner_id, project_id, auth_user_id, first_name, last_name, position, status, reviewed_at, reviewed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        item.id,
        item.ownerId,
        item.projectId,
        item.authUserId ?? null,
        item.firstName,
        item.lastName,
        item.position,
        item.status,
        item.reviewedAt ?? null,
        item.reviewedBy ?? null,
        item.createdAt,
        item.updatedAt,
      );
      for (const item of materialRequests) localDatabase.runSync('INSERT INTO material_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.ownerId, item.projectId, item.workerId, item.desiredDate ?? null, item.comment ?? null, item.status, item.rejectionReason ?? null, item.createdAt, item.updatedAt);
      for (const item of materialRequestItems) localDatabase.runSync('INSERT INTO material_request_items VALUES (?, ?, ?, ?, ?, ?)', item.id, item.requestId, item.name, item.quantity, item.unit, item.createdAt);
      for (const item of receiptRequestLinks) localDatabase.runSync('INSERT INTO receipt_request_links VALUES (?, ?, ?, ?, ?, ?)', item.id, item.ownerId, item.receiptId, item.requestId, item.allocatedAmountCents ?? null, item.createdAt);
      for (const item of notifications) localDatabase.runSync('INSERT INTO notifications (id, type, title, body, data, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', item.id, item.type, item.title, item.body, JSON.stringify(item.data ?? {}), item.readAt ?? null, item.createdAt);
    });
  });
  writeQueue = write.catch(() => undefined);
  return write;
}

export function clearStateFromSqlite(): Promise<void> {
  const write = writeQueue.then(async () => {
    const localDatabase = openLocalDatabase();
    localDatabase.withTransactionSync(() => {
      for (const table of ['app_state', 'outbox', 'receipt_categories', 'receipts', 'receipt_files', 'receipt_exports', 'project_workers', 'material_requests', 'material_request_items', 'receipt_request_links', 'notifications']) localDatabase.runSync(`DELETE FROM ${table}`);
    });
  });
  writeQueue = write.catch(() => undefined);
  return write;
}
