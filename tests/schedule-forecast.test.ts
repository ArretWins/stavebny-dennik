import { describe, expect, it } from 'vitest';
import {
  projectScheduleForecast,
  validateProjectSchedule,
} from '../src/domain/scheduleForecast';
import type {
  ChangeOrder,
  DelayEvent,
  ProjectSchedule,
  SiteTask,
} from '../src/domain/types';

const projectId = 'project-1';
const ownerId = 'owner-1';
const schedule: ProjectSchedule = {
  projectId,
  ownerId,
  startDate: '2026-07-01',
  targetCompletionDate: '2026-08-01',
  syncStatus: 'synced',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
};
function task(id: string, dueDate: string, status: SiteTask['status']): SiteTask {
  return {
    id,
    ownerId,
    projectId,
    title: id,
    kind: 'task',
    status,
    priority: 'normal',
    dueDate,
    assignedWorkerId: status === 'open' ? 'worker-1' : undefined,
    syncStatus: 'synced',
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
function change(days: number, status: ChangeOrder['status']): ChangeOrder {
  return {
    id: `${status}-${days}`,
    ownerId,
    projectId,
    title: 'Zmena',
    description: 'Zmena',
    amountCents: 100,
    scheduleImpactDays: days,
    status,
    syncStatus: 'synced',
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
function delay(day: string, locked: boolean): DelayEvent {
  return {
    id: `delay-${day}-${locked}`,
    ownerId,
    projectId,
    eventDate: `${day}T10:00:00.000Z`,
    reason: 'bad_weather',
    evidence: { capturedAt: `${day}T10:00:00.000Z`, attachmentIds: [] },
    lockedAt: locked ? `${day}T11:00:00.000Z` : undefined,
    syncStatus: 'synced',
    createdAt: `${day}T10:00:00.000Z`,
    updatedAt: `${day}T10:00:00.000Z`,
  };
}

describe('project schedule forecast', () => {
  it('moves the forecast only by accepted days and unique confirmed delays', () => {
    const result = projectScheduleForecast({
      projectId,
      today: '2026-07-20',
      schedule,
      tasks: [task('upcoming', '2026-07-25', 'open')],
      delays: [
        delay('2026-07-10', true),
        delay('2026-07-10', true),
        delay('2026-07-11', false),
      ],
      materialRequests: [],
      changeOrders: [change(3, 'accepted'), change(5, 'pending_client')],
    });
    expect(result.contractualTargetDate).toBe('2026-08-04');
    expect(result.forecastCompletionDate).toBe('2026-08-05');
    expect(result.confirmedDelayDays).toBe(1);
    expect(result.pendingDelayDays).toBe(1);
    expect(result.pendingChangeDays).toBe(5);
    expect(result.risk).toBe('watch');
  });

  it('raises critical risk for several overdue tasks and sorts the look-ahead', () => {
    const result = projectScheduleForecast({
      projectId,
      today: '2026-07-20',
      schedule,
      tasks: [
        task('c', '2026-07-19', 'open'),
        task('a', '2026-07-17', 'open'),
        task('b', '2026-07-18', 'blocked'),
      ],
      delays: [],
      materialRequests: [],
      changeOrders: [],
    });
    expect(result.risk).toBe('critical');
    expect(result.overdueTaskCount).toBe(3);
    expect(result.lookahead.map(item => item.taskId)).toEqual(['a', 'b', 'c']);
  });

  it('validates real date-only ranges', () => {
    expect(
      validateProjectSchedule({
        startDate: '2026-07-01',
        targetCompletionDate: '2026-12-31',
      }),
    ).toBe('ok');
    expect(
      validateProjectSchedule({
        startDate: '2026-02-30',
        targetCompletionDate: '2026-12-31',
      }),
    ).toBe('start');
    expect(
      validateProjectSchedule({
        startDate: '2026-07-10',
        targetCompletionDate: '2026-07-01',
      }),
    ).toBe('range');
  });
});
