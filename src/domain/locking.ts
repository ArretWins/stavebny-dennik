export interface LockableRecord { lockedAt?: string; lockedBy?: string; correctionOfId?: string; id: string; }

export function isLocked(record: LockableRecord): boolean { return Boolean(record.lockedAt); }

export function assertEditable(record: LockableRecord): void {
  if (isLocked(record)) throw new Error('LOCKED_RECORD');
}

export function lockRecord<T extends LockableRecord>(record: T, actorId: string, at = new Date().toISOString()): T & Pick<LockableRecord, 'lockedAt' | 'lockedBy'> {
  assertEditable(record);
  return { ...record, lockedAt: at, lockedBy: actorId };
}

export function createCorrection<T extends LockableRecord>(original: T, correction: T): T & Pick<LockableRecord, 'correctionOfId'> {
  if (!isLocked(original)) throw new Error('CORRECTION_REQUIRES_LOCKED_RECORD');
  return { ...correction, correctionOfId: original.id, lockedAt: undefined, lockedBy: undefined };
}
