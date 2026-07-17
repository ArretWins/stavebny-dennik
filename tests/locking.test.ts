import { describe, expect, it } from 'vitest';
import { assertEditable, createCorrection, lockRecord } from '../src/domain/locking';

describe('evidence lock rules', () => {
  it('rejects direct edits after locking', () => { const locked = lockRecord({ id: 'a' }, 'user-1', '2026-07-11T09:42:00.000Z'); expect(locked.lockedBy).toBe('user-1'); expect(() => assertEditable(locked)).toThrow('LOCKED_RECORD'); });
  it('preserves the original through a linked correction', () => { const original = lockRecord({ id: 'a', value: 'old' } as { id: string; value: string }, 'user-1'); const correction = createCorrection(original, { id: 'b', value: 'new' } as { id: string; value: string }); expect(original.id).toBe('a'); expect(correction.correctionOfId).toBe('a'); expect(correction.value).toBe('new'); });
  it('only allows corrections of locked records', () => { expect(() => createCorrection({ id: 'a' }, { id: 'b' })).toThrow('CORRECTION_REQUIRES_LOCKED_RECORD'); });
});
