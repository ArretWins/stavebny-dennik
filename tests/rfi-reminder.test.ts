import { describe, expect, it } from 'vitest';
import {
  buildProjectRfiReminderPlan,
  projectRfiReminderIdentifier,
} from '../src/domain/rfiReminder';

const rfi = {
  id: 'rfi-1',
  projectId: 'project-1',
  rfiNumber: 7,
  subject: 'Prestup cez nosnú stenu',
  recipientName: 'Ing. Jana Nováková',
  dueDate: '2026-08-04',
  status: 'open' as const,
};

describe('project RFI deadline reminder', () => {
  it('schedules an opened RFI for 09:00 on its due date', () => {
    const plan = buildProjectRfiReminderPlan({
      ...rfi,
      now: new Date(2026, 7, 1, 12, 0),
    });

    expect(plan?.identifier).toBe(projectRfiReminderIdentifier(rfi.id));
    expect(plan?.triggerAt).toEqual(new Date(2026, 7, 4, 9, 0));
    expect(plan?.title).toContain('RFI-007');
    expect(plan?.data).toEqual({
      type: 'project_rfi_due',
      projectId: rfi.projectId,
      rfiId: rfi.id,
    });
  });

  it('uses a near-term reminder for an already overdue reopened RFI', () => {
    const now = new Date(2026, 7, 6, 11, 0);
    const plan = buildProjectRfiReminderPlan({ ...rfi, now });
    expect(plan?.triggerAt.getTime()).toBe(now.getTime() + 60_000);
  });

  it('cancels the plan after an answer or without a due date', () => {
    expect(
      buildProjectRfiReminderPlan({
        ...rfi,
        status: 'answered',
        now: new Date(),
      }),
    ).toBeUndefined();
    expect(
      buildProjectRfiReminderPlan({
        ...rfi,
        dueDate: undefined,
        now: new Date(),
      }),
    ).toBeUndefined();
  });
});
