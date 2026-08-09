import type { SafetyBriefing, SafetyBriefingRecipient } from './types';

export function validateSafetyBriefing(input: { title: string; body: string; briefingDate: string }): 'ok' | 'title' | 'body' | 'date' {
  const title = input.title.trim(), body = input.body.trim();
  if (title.length < 3 || title.length > 160) return 'title';
  if (body.length < 10 || body.length > 4000) return 'body';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.briefingDate) || Number.isNaN(Date.parse(`${input.briefingDate}T12:00:00Z`))) return 'date';
  return 'ok';
}

export function canonicalSafetyBriefing(input: Pick<SafetyBriefing, 'projectId' | 'title' | 'body' | 'briefingDate'>): string {
  return JSON.stringify({ schemaVersion: 1, projectId: input.projectId, title: input.title.trim(), body: input.body.trim().replace(/\r\n/g, '\n'), briefingDate: input.briefingDate });
}

export function safetyBriefingProgress(recipients: SafetyBriefingRecipient[]): { total: number; acknowledged: number; excused: number; pending: number; percent: number } {
  const acknowledged = recipients.filter(item => item.status === 'acknowledged').length;
  const excused = recipients.filter(item => item.status === 'excused').length;
  const pending = recipients.filter(item => item.status === 'pending').length;
  const total = recipients.length;
  return { total, acknowledged, excused, pending, percent: total ? Math.round(((acknowledged + excused) / total) * 100) : 0 };
}

export function overdueSafetyBriefingRecipients(input: { briefings: SafetyBriefing[]; recipients: SafetyBriefingRecipient[]; projectId: string; today: string }): SafetyBriefingRecipient[] {
  const overdueIds = new Set(input.briefings.filter(item => item.projectId === input.projectId && item.status === 'published' && item.briefingDate < input.today).map(item => item.id));
  return input.recipients.filter(item => item.projectId === input.projectId && item.status === 'pending' && overdueIds.has(item.briefingId));
}
