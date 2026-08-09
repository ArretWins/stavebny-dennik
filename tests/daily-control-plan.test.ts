import { describe, expect, it } from 'vitest';
import {
  dailyControlActionId,
  dailyControlPlanProgress,
  materializeDailyControlActions,
  morningControlBriefing,
  resolveDailyControlAction,
} from '../src/domain/dailyControlPlan';
import type { ControlTowerItem } from '../src/domain/controlTower';

const projectId = 'project-1';
const ownerId = 'owner-1';
const date = '2026-07-29';
const at = '2026-07-29T08:00:00.000Z';
const items: ControlTowerItem[] = [
  {
    id: 'cost_overrun',
    severity: 'critical',
    target: 'financial',
    amountCents: 25_000,
  },
  {
    id: 'pending_workers',
    severity: 'watch',
    target: 'workers',
    count: 2,
  },
];

describe('daily control plan', () => {
  it('materializes each tower issue once for the project day', () => {
    const first = materializeDailyControlActions({
      existing: [],
      items,
      projectId,
      ownerId,
      actionDate: date,
      at,
    });
    const second = materializeDailyControlActions({
      existing: first,
      items,
      projectId,
      ownerId,
      actionDate: date,
      at: '2026-07-29T09:00:00.000Z',
    });
    expect(second).toHaveLength(2);
    expect(second[0]).toMatchObject({
      id: dailyControlActionId(projectId, date, 'cost_overrun'),
      amountCents: 25_000,
      status: 'open',
      syncStatus: 'pending',
    });
  });

  it('keeps a resolved action immutable when the tower is prepared again', () => {
    const [created] = materializeDailyControlActions({
      existing: [],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: date,
      at,
    });
    const resolved = resolveDailyControlAction({
      action: created,
      resolution: '  Rozsah bol upravený a dodatok pripravený.  ',
      userId: ownerId,
      at: '2026-07-29T10:00:00.000Z',
    });
    const again = materializeDailyControlActions({
      existing: [resolved],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: date,
      at: '2026-07-29T11:00:00.000Z',
    });
    expect(again).toEqual([resolved]);
    expect(again[0].resolution).toBe(
      'Rozsah bol upravený a dodatok pripravený.',
    );
  });

  it('requires an attributable resolution and orders open risks by severity', () => {
    const actions = materializeDailyControlActions({
      existing: [],
      items: [items[1], items[0]],
      projectId,
      ownerId,
      actionDate: date,
      at,
    });
    expect(() =>
      resolveDailyControlAction({
        action: actions[0],
        resolution: 'x',
        userId: ownerId,
        at,
      }),
    ).toThrow('INVALID_DAILY_ACTION_RESOLUTION');
    expect(
      dailyControlPlanProgress(actions, projectId, date).open.map(
        item => item.issue,
      ),
    ).toEqual(['cost_overrun', 'pending_workers']);
  });

  it('carries an unresolved issue forward without creating a duplicate', () => {
    const [openAction] = materializeDailyControlActions({
      existing: [],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: '2026-07-27',
      at: '2026-07-27T08:00:00.000Z',
    });
    const nextDay = materializeDailyControlActions({
      existing: [openAction],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: date,
      at,
    });

    expect(nextDay).toEqual([openAction]);
    expect(nextDay[0].actionDate).toBe('2026-07-27');
  });

  it('creates a fresh issue after an earlier occurrence was resolved', () => {
    const [openAction] = materializeDailyControlActions({
      existing: [],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: '2026-07-27',
      at: '2026-07-27T08:00:00.000Z',
    });
    const resolved = resolveDailyControlAction({
      action: openAction,
      resolution: 'Rozpočet bol upravený.',
      userId: ownerId,
      at: '2026-07-27T09:00:00.000Z',
    });
    const repeated = materializeDailyControlActions({
      existing: [resolved],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: date,
      at,
    });

    expect(repeated).toHaveLength(2);
    expect(repeated[0]).toMatchObject({
      actionDate: date,
      issue: 'cost_overrun',
      status: 'open',
    });
    expect(repeated[1]).toEqual(resolved);
  });

  it('builds a morning briefing from carried, new, handled and waiting work', () => {
    const actions = materializeDailyControlActions({
      existing: [],
      items: [items[0]],
      projectId,
      ownerId,
      actionDate: '2026-07-27',
      at: '2026-07-27T08:00:00.000Z',
    });
    const withToday = materializeDailyControlActions({
      existing: actions,
      items: [items[1]],
      projectId,
      ownerId,
      actionDate: date,
      at,
    });
    const briefing = morningControlBriefing({
      actions: withToday,
      waiting: [
        {
          id: 'client_changes',
          severity: 'watch',
          target: 'change_orders',
          count: 1,
        },
      ],
      projectId,
      today: date,
    });

    expect(briefing.carriedOpen).toHaveLength(1);
    expect(briefing.carriedOpen[0]).toMatchObject({
      ageDays: 2,
      action: { issue: 'cost_overrun' },
    });
    expect(briefing.todayOpen.map(action => action.issue)).toEqual([
      'pending_workers',
    ]);
    expect(briefing.waiting.map(item => item.id)).toEqual(['client_changes']);
    expect(briefing).toMatchObject({
      openCount: 2,
      handledCount: 0,
      totalCount: 2,
    });
  });

  it('rejects impossible briefing dates', () => {
    expect(() =>
      morningControlBriefing({
        actions: [],
        waiting: [],
        projectId,
        today: '2026-02-31',
      }),
    ).toThrow('INVALID_DAILY_ACTION_DATE');
  });
});
