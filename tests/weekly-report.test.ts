import { describe, expect, it } from 'vitest';
import {
  buildWeeklyReportSnapshot,
  shiftWeeklyPeriod,
  validateWeeklyReport,
  weeklyPeriodForDate,
} from '../src/domain/weeklyReport';
import type {
  Attachment,
  ChangeOrder,
  DiaryEntry,
  Receipt,
  SiteTask,
} from '../src/domain/types';
import { t } from '../src/i18n';

const at = '2026-07-28T10:00:00.000Z';
const evidence = { capturedAt: at, attachmentIds: [] };

describe('weekly client report', () => {
  it('uses an ISO Monday to Sunday period and shifts full weeks', () => {
    expect(weeklyPeriodForDate('2026-07-30')).toEqual({
      periodStart: '2026-07-27',
      periodEnd: '2026-08-02',
    });
    expect(shiftWeeklyPeriod('2026-07-27', -1)).toEqual({
      periodStart: '2026-07-20',
      periodEnd: '2026-07-26',
    });
  });

  it('freezes completed work, evidence, worker-days, costs and live risks', () => {
    const task: SiteTask = {
      id: 'task-1', ownerId: 'owner-1', projectId: 'project-1',
      title: 'Betonáž základov', kind: 'task', status: 'done',
      priority: 'normal', completedAt: '2026-07-29T14:00:00Z',
      syncStatus: 'synced', createdAt: at, updatedAt: at,
    };
    const blocked: SiteTask = {
      ...task, id: 'task-2', title: 'Strecha', status: 'blocked',
      completedAt: undefined, dueDate: '2026-07-28',
    };
    const attachment: Attachment = {
      id: 'photo-1', ownerId: 'owner-1', projectId: 'project-1',
      relatedEntityType: 'site_task', relatedEntityId: task.id,
      localUri: 'file://photo.jpg', fileSize: 100, mimeType: 'image/jpeg',
      createdAt: at, uploadStatus: 'synced',
    };
    const diary: DiaryEntry = {
      id: 'diary-1', ownerId: 'owner-1', projectId: 'project-1',
      logDate: '2026-07-29', workDescription: 'Základy', workerCount: 4,
      evidence, syncStatus: 'synced', createdAt: at, updatedAt: at,
    };
    const receipt: Receipt = {
      id: 'receipt-1', ownerId: 'owner-1', projectId: 'project-1',
      purchaseDate: '2026-07-30', totalAmountCents: 12500, currency: 'EUR',
      status: 'ready', ocrStatus: 'completed', syncStatus: 'synced',
      createdAt: at, updatedAt: at,
    };
    const change: ChangeOrder = {
      id: 'change-1', ownerId: 'owner-1', projectId: 'project-1',
      title: 'Výkop navyše', description: 'Skala', amountCents: 30000,
      scheduleImpactDays: 1, status: 'accepted', decidedAt: '2026-07-31T09:00:00Z',
      syncStatus: 'synced', createdAt: at, updatedAt: at,
    };
    const snapshot = buildWeeklyReportSnapshot({
      projectId: 'project-1', periodStart: '2026-07-27',
      periodEnd: '2026-08-02', generatedAt: at, today: '2026-07-30',
      tasks: [task, blocked], diaryEntries: [diary], receipts: [receipt],
      attachments: [attachment], changeOrders: [change], delays: [],
      materialRequests: [],
    });
    expect(snapshot.completedTasks).toEqual([{
      id: task.id, title: task.title, completedAt: task.completedAt,
      attachmentIds: [attachment.id],
    }]);
    expect(snapshot.workerDays).toBe(4);
    expect(snapshot.verifiedSpendCents).toBe(12500);
    expect(snapshot.acceptedChangeCents).toBe(30000);
    expect(snapshot.blockedTaskCount).toBe(1);
    expect(snapshot.scheduleRisk).toBe('not_configured');
  });

  it('requires a seven-day period and meaningful confirmed text', () => {
    expect(validateWeeklyReport({
      periodStart: '2026-07-27', periodEnd: '2026-08-02',
      summary: 'Dokončili sme základy.', nextWeekPlan: 'Začneme murivo.',
    })).toBe('ok');
    expect(validateWeeklyReport({
      periodStart: '2026-07-27', periodEnd: '2026-08-01',
      summary: 'Dokončili sme základy.', nextWeekPlan: 'Začneme murivo.',
    })).toBe('period');
    expect(validateWeeklyReport({
      periodStart: '2026-07-27', periodEnd: '2026-08-02',
      summary: 'x', nextWeekPlan: 'Začneme murivo.',
    })).toBe('summary');
  });

  it('ships readable Slovak interface copy', () => {
    expect(t('weeklyReport.title')).toBe('Týždenný report');
    expect(t('weeklyReport.publish')).toBe('Publikovať pre objednávateľa');
  });
});
