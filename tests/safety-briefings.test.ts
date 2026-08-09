import { describe, expect, it } from 'vitest';
import type { SafetyBriefing, SafetyBriefingRecipient } from '../src/domain/types';
import { canonicalSafetyBriefing, overdueSafetyBriefingRecipients, safetyBriefingProgress, validateSafetyBriefing } from '../src/domain/safetyBriefings';

const briefing: SafetyBriefing = { id: 'b1', ownerId: 'o1', projectId: 'p1', title: 'Práca vo výške', body: 'Použite postroj a skontrolujte kotviaci bod.', briefingDate: '2026-08-01', status: 'published', syncStatus: 'synced', createdAt: '2026-08-01T05:00:00Z', updatedAt: '2026-08-01T05:00:00Z' };
const recipient = (id: string, status: SafetyBriefingRecipient['status']): SafetyBriefingRecipient => ({ id, ownerId: 'o1', projectId: 'p1', briefingId: 'b1', workerId: id, workerName: id, position: 'Tesár', status, contentHash: 'a'.repeat(64), createdAt: briefing.createdAt });

describe('safety briefings', () => {
  it('validates meaningful content and canonicalizes line endings', () => {
    expect(validateSafetyBriefing(briefing)).toBe('ok');
    expect(validateSafetyBriefing({ ...briefing, body: 'krátke' })).toBe('body');
    expect(canonicalSafetyBriefing({ ...briefing, body: 'Riadok 1\r\nRiadok 2' })).toContain('Riadok 1\\nRiadok 2');
  });
  it('treats acknowledged and explicitly excused workers as resolved', () => {
    expect(safetyBriefingProgress([recipient('w1', 'acknowledged'), recipient('w2', 'excused'), recipient('w3', 'pending')])).toEqual({ total: 3, acknowledged: 1, excused: 1, pending: 1, percent: 67 });
  });
  it('returns only overdue pending acknowledgements for the selected project', () => {
    expect(overdueSafetyBriefingRecipients({ briefings: [briefing], recipients: [recipient('w1', 'pending'), recipient('w2', 'acknowledged')], projectId: 'p1', today: '2026-08-02' }).map(item => item.workerId)).toEqual(['w1']);
  });
});
