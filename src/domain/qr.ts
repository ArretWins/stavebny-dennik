import type { CheckinTokenPayload } from './types';

function encode(value: string): string {
  if (typeof btoa === 'function') return btoa(value);
  const BufferConstructor = (globalThis as unknown as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (BufferConstructor) return BufferConstructor.from(value, 'utf8').toString('base64');
  throw new Error('BASE64_UNAVAILABLE');
}

function decode(value: string): string {
  if (typeof atob === 'function') return atob(value);
  const BufferConstructor = (globalThis as unknown as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (BufferConstructor) return BufferConstructor.from(value, 'base64').toString('utf8');
  throw new Error('BASE64_UNAVAILABLE');
}

export function createCheckinToken(payload: CheckinTokenPayload): string { return `sd1.${encode(JSON.stringify(payload))}`; }

export type TokenValidation = { valid: true; payload: CheckinTokenPayload } | { valid: false; reason: 'malformed' | 'expired' | 'wrong_scope' | 'wrong_action' };

export function validateCheckinToken(token: string, expected: { projectId: string; ownerId?: string; date?: string }, now = new Date()): TokenValidation {
  try {
    if (!token.startsWith('sd1.')) return { valid: false, reason: 'malformed' };
    const payload = JSON.parse(decode(token.slice(4))) as CheckinTokenPayload;
    if (!payload.projectId || !payload.ownerId || !payload.date || !payload.expiresAt || !payload.nonce) return { valid: false, reason: 'malformed' };
    if (payload.action !== 'checkin') return { valid: false, reason: 'wrong_action' };
    if (new Date(payload.expiresAt).getTime() <= now.getTime()) return { valid: false, reason: 'expired' };
    if (payload.projectId !== expected.projectId || (expected.ownerId && payload.ownerId !== expected.ownerId) || (expected.date && payload.date !== expected.date)) return { valid: false, reason: 'wrong_scope' };
    return { valid: true, payload };
  } catch { return { valid: false, reason: 'malformed' }; }
}
