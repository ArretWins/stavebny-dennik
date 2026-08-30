import type { OutboxItem, SyncStatus } from './types';
import { createId, nowIso } from './ids';

export function enqueue<T>(items: OutboxItem<T>[], type: OutboxItem['type'], localId: string, payload: T, at = nowIso()): OutboxItem<T>[] {
  const replaceableIndex = items.findIndex(item => item.localId === localId && item.type === type && (item.status === 'pending' || item.status === 'failed'));
  if (replaceableIndex >= 0) return items.map((item, index) => index === replaceableIndex ? { ...item, payload, status: 'pending', lastError: undefined, updatedAt: at } : item) as OutboxItem<T>[];
  return [...items, { id: createId('outbox'), type, localId, payload, status: 'pending', attemptCount: 0, createdAt: at, updatedAt: at }];
}

export function pendingCount(items: OutboxItem[]): number { return items.filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing').length; }

export function markSyncing<T extends OutboxItem>(item: T, at = nowIso()): T { return { ...item, status: 'syncing', attemptCount: item.attemptCount + 1, updatedAt: at }; }
export function markSynced<T extends OutboxItem>(item: T, remoteId?: string, at = nowIso()): T { return { ...item, status: 'synced', remoteId, lastError: undefined, updatedAt: at }; }
export function markFailed<T extends OutboxItem>(item: T, error: string, at = nowIso()): T { return { ...item, status: 'failed', lastError: error, updatedAt: at }; }

export async function processOutbox<T extends OutboxItem>(items: T[], handler: (item: T) => Promise<string | undefined>, at = nowIso()): Promise<T[]> {
  const next = [...items];
  for (let index = 0; index < next.length; index += 1) {
    const item = next[index];
    // A persisted `syncing` item means the previous app process was interrupted.
    // Sync runs are serialized, so it is safe and necessary to retry it here.
    if (!['pending', 'failed', 'syncing'].includes(item.status)) continue;
    const syncing = markSyncing(item, at);
    next[index] = syncing;
    try { next[index] = markSynced(syncing, await handler(syncing), at); }
    catch (error) { next[index] = markFailed(syncing, error instanceof Error ? error.message : 'SYNC_FAILED', at); }
  }
  return next;
}

export function syncStatusLabel(status: SyncStatus): string { return status === 'synced' ? 'synced' : status; }
