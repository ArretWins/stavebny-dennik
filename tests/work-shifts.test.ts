import { describe, expect, it } from 'vitest';
import type { ProjectWorker, WorkShift } from '../src/domain/types';
import { hasWorkShiftOverlap, validateWorkShift, workShiftAttention, workShiftCsv, workShiftMinutes, workShiftOvertimeMinutes } from '../src/domain/workShifts';

const shift: WorkShift = {
  id: 'shift-1', ownerId: 'owner', projectId: 'project', workerId: 'worker', shiftDate: '2026-08-01',
  startedAt: '2026-08-01T05:00:00.000Z', endedAt: '2026-08-01T14:30:00.000Z', breakMinutes: 30,
  source: 'worker', status: 'completed', syncStatus: 'synced', createdAt: '2026-08-01T05:00:00.000Z', updatedAt: '2026-08-01T14:30:00.000Z',
};
const worker: ProjectWorker = { id: 'worker', ownerId: 'owner', projectId: 'project', firstName: 'Ján', lastName: 'Kováč', position: 'Tesár', status: 'active', createdAt: shift.createdAt, updatedAt: shift.createdAt };

describe('work shifts', () => {
  it('subtracts breaks and separates overtime after eight hours', () => {
    expect(workShiftMinutes(shift)).toBe(540);
    expect(workShiftOvertimeMinutes(shift)).toBe(60);
  });
  it('rejects impossible shifts and highlights forgotten clock-outs', () => {
    expect(validateWorkShift({ startedAt: shift.startedAt, endedAt: shift.startedAt, breakMinutes: 0 })).toBe('time');
    expect(validateWorkShift({ startedAt: new Date(Date.now() + 600_000).toISOString(), endedAt: new Date(Date.now() + 3_600_000).toISOString(), breakMinutes: 0 })).toBe('time');
    expect(validateWorkShift({ startedAt: shift.startedAt, endedAt: shift.endedAt!, breakMinutes: 600 })).toBe('break');
    expect(workShiftAttention({ ...shift, endedAt: undefined, status: 'active' }, Date.parse('2026-08-01T18:00:01.000Z'))).toBe('active_long');
    expect(workShiftAttention({ ...shift, endedAt: 'not-a-date' })).toBe('invalid');
  });
  it('prevents two payroll rows for the same worker and time', () => {
    expect(hasWorkShiftOverlap([shift], { projectId: shift.projectId, workerId: shift.workerId, startedAt: '2026-08-01T13:00:00.000Z', endedAt: '2026-08-01T15:00:00.000Z' })).toBe(true);
    expect(hasWorkShiftOverlap([shift], { projectId: shift.projectId, workerId: shift.workerId, startedAt: '2026-08-01T14:30:00.000Z', endedAt: '2026-08-01T15:00:00.000Z' })).toBe(false);
  });
  it('builds an Excel-friendly Slovak CSV without formula injection', () => {
    const csv = workShiftCsv({ projectName: 'Dom; sever', shifts: [{ ...shift, note: '=HYPERLINK("A")' }], workers: [worker], dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Dom; sever"');
    expect(csv).toContain('Ján Kováč');
    expect(csv).toContain('9,00;1,00');
    expect(csv).toContain('Na kontrolu');
    expect(csv).toContain("'=HYPERLINK");
  });
});
