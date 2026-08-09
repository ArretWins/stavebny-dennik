import { describe, expect, it } from 'vitest';
import {
  projectProcurementCommitmentCents,
  summarizeProcurement,
  validateSupplierQuote,
} from '../src/domain/procurement';
import type {
  MaterialRequest,
  MaterialSupplierQuote,
} from '../src/domain/types';

const request: MaterialRequest = {
  id: 'request-1',
  ownerId: 'owner-1',
  projectId: 'project-1',
  workerId: 'worker-1',
  status: 'approved',
  createdAt: '2026-07-29T08:00:00Z',
  updatedAt: '2026-07-29T08:00:00Z',
};

function quote(
  id: string,
  amount: number,
  status: MaterialSupplierQuote['status'] = 'offered',
): MaterialSupplierQuote {
  return {
    id,
    ownerId: 'owner-1',
    projectId: 'project-1',
    requestId: request.id,
    supplierName: `Dodávateľ ${id}`,
    totalAmountCents: amount,
    currency: 'EUR',
    status,
    syncStatus: 'synced',
    createdAt: `2026-07-29T0${id === 'a' ? 9 : 8}:00:00Z`,
    updatedAt: '2026-07-29T10:00:00Z',
  };
}

describe('material procurement', () => {
  it('validates supplier, price and dates before an offer is recorded', () => {
    expect(
      validateSupplierQuote({
        supplierName: 'Stavmat',
        totalAmountCents: 125_000,
        deliveryDate: '2026-08-03',
      }),
    ).toBe('ok');
    expect(
      validateSupplierQuote({ supplierName: 'S', totalAmountCents: 0 }),
    ).toBe('supplier');
    expect(
      validateSupplierQuote({
        supplierName: 'Stavmat',
        totalAmountCents: 100,
        deliveryDate: '2026-02-31',
      }),
    ).toBe('delivery_date');
  });

  it('compares offers by price without silently selecting one', () => {
    const summary = summarizeProcurement({
      request,
      quotes: [quote('a', 125_000), quote('b', 110_000)],
      receiptLinks: [],
    });

    expect(summary.stage).toBe('comparison');
    expect(summary.selectedQuote).toBeUndefined();
    expect(summary.comparisons.map(item => item.quote.id)).toEqual(['b', 'a']);
    expect(summary.comparisons[1].differenceFromCheapestCents).toBe(15_000);
  });

  it('turns a selected offer into a diminishing documented commitment', () => {
    const summary = summarizeProcurement({
      request,
      quotes: [quote('a', 125_000, 'selected'), quote('b', 140_000)],
      receiptLinks: [
        {
          id: 'link-1',
          ownerId: 'owner-1',
          receiptId: 'receipt-1',
          requestId: request.id,
          allocatedAmountCents: 50_000,
          createdAt: '2026-07-30T10:00:00Z',
        },
      ],
    });

    expect(summary.stage).toBe('partially_documented');
    expect(summary.allocatedReceiptCents).toBe(50_000);
    expect(summary.remainingCommitmentCents).toBe(75_000);
    expect(summary.documentedRatio).toBe(0.4);
    expect(summary.savingsVsHighestCents).toBe(15_000);
  });

  it('adds only outstanding selected offers to the project commitment', () => {
    expect(
      projectProcurementCommitmentCents({
        projectId: 'project-1',
        requests: [request],
        quotes: [quote('a', 125_000, 'selected')],
        receiptLinks: [
          {
            id: 'link-1',
            ownerId: 'owner-1',
            receiptId: 'receipt-1',
            requestId: request.id,
            allocatedAmountCents: 125_000,
            createdAt: '2026-07-30T10:00:00Z',
          },
        ],
      }),
    ).toBe(0);
  });
});
