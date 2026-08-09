import { describe, expect, it } from 'vitest';
import {
  projectCostForecast,
  projectFinancialSummary,
  validateProjectBudget,
} from '../src/domain/financialControl';
import type {
  ChangeOrder,
  ProjectBudget,
  Receipt,
  ReceiptCategory,
} from '../src/domain/types';

const budget: ProjectBudget = {
  projectId: 'project-1',
  ownerId: 'owner-1',
  baselineBudgetCents: 10_000_00,
  contingencyCents: 1_000_00,
  remainingCommitmentCents: 0,
  syncStatus: 'synced',
  createdAt: '2026-07-28T10:00:00.000Z',
  updatedAt: '2026-07-28T10:00:00.000Z',
};
const categories: ReceiptCategory[] = [
  {
    id: 'materials',
    ownerId: 'owner-1',
    name: 'Materiál',
    isDefault: true,
    syncStatus: 'synced',
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  },
];
function receipt(
  id: string,
  amount: number,
  status: Receipt['status'],
): Receipt {
  return {
    id,
    ownerId: 'owner-1',
    projectId: 'project-1',
    categoryId: 'materials',
    totalAmountCents: amount,
    currency: 'EUR',
    status,
    ocrStatus: status === 'ready' ? 'completed' : 'needs_review',
    syncStatus: 'synced',
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
}
function change(
  id: string,
  amount: number,
  status: ChangeOrder['status'],
): ChangeOrder {
  return {
    id,
    ownerId: 'owner-1',
    projectId: 'project-1',
    title: id,
    description: id,
    amountCents: amount,
    scheduleImpactDays: 0,
    status,
    syncStatus: 'synced',
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
}

describe('project financial control', () => {
  it('separates verified and review receipts and adjusts budget only by accepted changes', () => {
    const summary = projectFinancialSummary({
      budget,
      receipts: [
        receipt('verified', 3_000_00, 'ready'),
        receipt('review', 500_00, 'needs_review'),
      ],
      categories,
      changeOrders: [
        change('accepted', 2_000_00, 'accepted'),
        change('pending', 750_00, 'pending_client'),
      ],
    });
    expect(summary.adjustedBudgetCents).toBe(12_000_00);
    expect(summary.verifiedSpendCents).toBe(3_000_00);
    expect(summary.reviewSpendCents).toBe(500_00);
    expect(summary.pendingChangeCents).toBe(750_00);
    expect(summary.forecastRemainingCents).toBe(8_500_00);
    expect(summary.remainingAfterReserveCents).toBe(7_500_00);
    expect(summary.categories[0]).toMatchObject({
      name: 'Materiál',
      amountCents: 3_000_00,
      share: 1,
    });
  });

  it('marks reserve pressure and actual overrun separately', () => {
    const watch = projectFinancialSummary({
      budget,
      receipts: [receipt('watch', 9_500_00, 'ready')],
      categories,
      changeOrders: [],
    });
    expect(watch.health).toBe('watch');
    const over = projectFinancialSummary({
      budget,
      receipts: [receipt('over', 10_500_00, 'ready')],
      categories,
      changeOrders: [],
    });
    expect(over.health).toBe('over');
  });

  it('requires a positive baseline and reserve within that baseline', () => {
    expect(
      validateProjectBudget({
        baselineBudgetCents: 10_000_00,
        contingencyCents: 1_000_00,
      }),
    ).toBe('ok');
    expect(
      validateProjectBudget({
        baselineBudgetCents: 0,
        contingencyCents: 0,
      }),
    ).toBe('baseline');
    expect(
      validateProjectBudget({
        baselineBudgetCents: 10_000_00,
        contingencyCents: 11_000_00,
      }),
    ).toBe('contingency');
    expect(
      validateProjectBudget({
        baselineBudgetCents: 10_000_00,
        contingencyCents: 1_000_00,
        remainingCommitmentCents: -1,
      }),
    ).toBe('commitments');
  });

  it('forecasts final cost from declared commitments and a transparent pace scenario', () => {
    const dated = Array.from({ length: 6 }, (_, index) => ({
      ...receipt(`dated-${index}`, 1_000_00, 'ready'),
      purchaseDate: `2026-01-${String(index + 2).padStart(2, '0')}`,
    }));
    const forecastBudget = {
      ...budget,
      remainingCommitmentCents: 8_000_00,
    };
    const summary = projectFinancialSummary({
      budget: forecastBudget,
      receipts: dated,
      categories,
      changeOrders: [],
    });
    const forecast = projectCostForecast({
      summary,
      budget: forecastBudget,
      receipts: dated,
      today: '2026-01-20',
      scheduleStartDate: '2026-01-01',
      forecastCompletionDate: '2026-02-09',
    });
    expect(forecast.declaredFinalCostCents).toBe(14_000_00);
    expect(forecast.paceProjectedFinalCents).toBe(12_000_00);
    expect(forecast.forecastFinalCostCents).toBe(14_000_00);
    expect(forecast.projectedVarianceCents).toBe(4_000_00);
    expect(forecast.health).toBe('over_budget');
    expect(forecast.confidence).toBe('medium');
    expect(forecast.source).toBe('declared');
  });

  it('adds outstanding selected supplier offers to declared commitments', () => {
    const forecastBudget = {
      ...budget,
      remainingCommitmentCents: 2_000_00,
    };
    const summary = projectFinancialSummary({
      budget: forecastBudget,
      receipts: [receipt('documented', 3_000_00, 'ready')],
      categories,
      changeOrders: [],
      procurementCommitmentCents: 4_500_00,
    });
    const forecast = projectCostForecast({
      summary,
      budget: forecastBudget,
      receipts: [],
      today: '2026-01-20',
    });

    expect(summary.manualCommitmentCents).toBe(2_000_00);
    expect(summary.procurementCommitmentCents).toBe(4_500_00);
    expect(summary.totalCommitmentCents).toBe(6_500_00);
    expect(forecast.declaredFinalCostCents).toBe(9_500_00);
  });

  it('does not invent a final cost without commitments or a usable schedule', () => {
    const summary = projectFinancialSummary({
      budget,
      receipts: [receipt('undated', 1_000_00, 'ready')],
      categories,
      changeOrders: [],
    });
    const forecast = projectCostForecast({
      summary,
      budget,
      receipts: [],
      today: '2026-01-20',
    });
    expect(forecast.available).toBe(false);
    expect(forecast.health).toBe('unavailable');
    expect(forecast.forecastFinalCostCents).toBeUndefined();
  });

  it('excludes future-dated receipts and rejects impossible schedule dates', () => {
    const current = {
      ...receipt('current', 2_000_00, 'ready'),
      purchaseDate: '2026-01-10',
    };
    const future = {
      ...receipt('future', 8_000_00, 'ready'),
      purchaseDate: '2026-02-10',
    };
    const summary = projectFinancialSummary({
      budget,
      receipts: [current, future],
      categories,
      changeOrders: [],
    });
    const valid = projectCostForecast({
      summary,
      budget,
      receipts: [current, future],
      today: '2026-01-20',
      scheduleStartDate: '2026-01-01',
      forecastCompletionDate: '2026-02-09',
    });
    expect(valid.receiptCount).toBe(1);
    expect(valid.dailyVerifiedSpendCents).toBe(10_000);
    expect(valid.paceProjectedFinalCents).toBe(10_000_00);

    const impossible = projectCostForecast({
      summary,
      budget,
      receipts: [current],
      today: '2026-02-31',
      scheduleStartDate: '2026-01-01',
      forecastCompletionDate: '2026-03-31',
    });
    expect(impossible.available).toBe(false);
    expect(impossible.paceProjectedFinalCents).toBeUndefined();
  });
});
