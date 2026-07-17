import { describe, expect, it } from 'vitest';
import { createCheckinToken, validateCheckinToken } from '../src/domain/qr';

describe('scoped QR tokens', () => {
  const payload = { projectId: 'project-a', ownerId: 'owner-a', date: '2026-07-11', expiresAt: '2026-07-11T23:59:59.000Z', action: 'checkin' as const, nonce: 'nonce' };
  it('accepts a valid scoped token', () => { const token = createCheckinToken(payload); expect(validateCheckinToken(token, { projectId: 'project-a', ownerId: 'owner-a', date: '2026-07-11' }, new Date('2026-07-11T12:00:00Z'))).toMatchObject({ valid: true }); });
  it('rejects malformed, expired, and wrong-scope tokens', () => { const token = createCheckinToken(payload); expect(validateCheckinToken('bad', { projectId: 'project-a' }).valid).toBe(false); expect(validateCheckinToken(token, { projectId: 'project-a' }, new Date('2026-07-12T00:00:00Z'))).toMatchObject({ valid: false, reason: 'expired' }); expect(validateCheckinToken(token, { projectId: 'project-b' }, new Date('2026-07-11T12:00:00Z'))).toMatchObject({ valid: false, reason: 'wrong_scope' }); });
});
