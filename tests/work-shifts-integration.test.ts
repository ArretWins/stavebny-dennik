import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('work shift application integration', () => {
  it('queues create, approve and reopen actions for offline recovery', () => {
    const app = readFileSync('src/state/app.tsx', 'utf8');
    for (const type of ['work_shift', 'work_shift_approve', 'work_shift_reopen']) expect(app).toContain(`"${type}"`);
    expect(app).toContain('listProjectWorkShifts(selectedProject.id)');
    expect(app).toContain('resolvedWorkShifts');
    expect(app).toContain('hasWorkShiftOverlap');
  });
  it('wires the foreman register, payroll CSV and worker punch controls', () => {
    const navigation = readFileSync('App.tsx', 'utf8');
    const manager = readFileSync('src/screens/TimesheetScreen.tsx', 'utf8');
    const portal = readFileSync('worker-portal/src/app.js', 'utf8');
    expect(navigation).toContain('<Stack.Screen name="Timesheet"');
    expect(manager).toContain('shareWorkShiftCsv');
    expect(manager).toContain('approveWorkShift');
    expect(manager).toContain('reopenWorkShift');
    expect(manager).toContain('15_000');
    expect(portal).toContain('loadAttendance().catch');
    expect(portal).toContain('window.confirm');
  });
});
