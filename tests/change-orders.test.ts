import { describe, expect, it } from 'vitest';
import {
  parseChangeOrderAmount,
  parseScheduleImpact,
  validateChangeOrder,
} from '../src/domain/changeOrders';

describe('change order input', () => {
  it('parses local euro amounts and negative credits without floating drift', () => {
    expect(parseChangeOrderAmount('450,25')).toBe(45025);
    expect(parseChangeOrderAmount('-120.00')).toBe(-12000);
    expect(parseChangeOrderAmount('1 250,5')).toBe(125050);
    expect(parseChangeOrderAmount('12,345')).toBeUndefined();
  });

  it('accepts only whole bounded schedule impacts', () => {
    expect(parseScheduleImpact('+3')).toBe(3);
    expect(parseScheduleImpact('-1')).toBe(-1);
    expect(parseScheduleImpact('1.5')).toBeUndefined();
  });

  it('requires a meaningful scope, non-zero price and bounded days', () => {
    expect(
      validateChangeOrder({
        title: 'Dodatočná izolácia',
        description: 'Rozsah nebol v pôvodnej objednávke.',
        amountCents: 45000,
        scheduleImpactDays: 3,
      }),
    ).toBe('ok');
    expect(
      validateChangeOrder({
        title: 'OK',
        description: 'Rozsah',
        amountCents: 45000,
        scheduleImpactDays: 3,
      }),
    ).toBe('title');
    expect(
      validateChangeOrder({
        title: 'Dodatočná izolácia',
        description: 'Rozsah',
        amountCents: 0,
        scheduleImpactDays: 3,
      }),
    ).toBe('amount');
    expect(
      validateChangeOrder({
        title: 'Dodatočná izolácia',
        description: 'Rozsah',
        amountCents: 45000,
        scheduleImpactDays: 366,
      }),
    ).toBe('schedule');
  });
});
