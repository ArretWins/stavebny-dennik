import type {
  MaterialRequest,
  MaterialSupplierQuote,
  ReceiptRequestLink,
} from './types';

export type ProcurementStage =
  | 'awaiting_approval'
  | 'awaiting_quotes'
  | 'comparison'
  | 'committed'
  | 'partially_documented'
  | 'documented'
  | 'rejected';

export interface ProcurementQuoteComparison {
  quote: MaterialSupplierQuote;
  differenceFromCheapestCents: number;
  isCheapest: boolean;
  isSelected: boolean;
}

export interface ProcurementSummary {
  stage: ProcurementStage;
  comparisons: ProcurementQuoteComparison[];
  selectedQuote?: MaterialSupplierQuote;
  cheapestQuote?: MaterialSupplierQuote;
  allocatedReceiptCents: number;
  remainingCommitmentCents: number;
  documentedRatio: number;
  savingsVsHighestCents: number;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value?: string): boolean {
  if (!value) return true;
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function validateSupplierQuote(input: {
  supplierName: string;
  totalAmountCents?: number;
  deliveryDate?: string;
  validUntil?: string;
  note?: string;
}):
  | 'ok'
  | 'supplier'
  | 'amount'
  | 'delivery_date'
  | 'valid_until'
  | 'note' {
  const supplierName = input.supplierName.trim();
  if (supplierName.length < 2 || supplierName.length > 160) return 'supplier';
  if (
    input.totalAmountCents === undefined ||
    !Number.isInteger(input.totalAmountCents) ||
    input.totalAmountCents <= 0 ||
    input.totalAmountCents > 1_000_000_000
  )
    return 'amount';
  if (!validDate(input.deliveryDate)) return 'delivery_date';
  if (!validDate(input.validUntil)) return 'valid_until';
  if ((input.note?.trim().length ?? 0) > 500) return 'note';
  return 'ok';
}

export function summarizeProcurement(input: {
  request: MaterialRequest;
  quotes: MaterialSupplierQuote[];
  receiptLinks: ReceiptRequestLink[];
}): ProcurementSummary {
  const activeQuotes = input.quotes
    .filter(
      quote =>
        quote.requestId === input.request.id && quote.status !== 'withdrawn',
    )
    .sort(
      (left, right) =>
        left.totalAmountCents - right.totalAmountCents ||
        (left.deliveryDate ?? '9999-12-31').localeCompare(
          right.deliveryDate ?? '9999-12-31',
        ) ||
        left.createdAt.localeCompare(right.createdAt),
    );
  const cheapestQuote = activeQuotes[0];
  const selectedQuote = activeQuotes.find(quote => quote.status === 'selected');
  const allocatedReceiptCents = input.receiptLinks
    .filter(link => link.requestId === input.request.id)
    .reduce((total, link) => total + (link.allocatedAmountCents ?? 0), 0);
  const remainingCommitmentCents = selectedQuote
    ? Math.max(0, selectedQuote.totalAmountCents - allocatedReceiptCents)
    : 0;
  const documentedRatio = selectedQuote
    ? Math.min(1, allocatedReceiptCents / selectedQuote.totalAmountCents)
    : 0;
  const highestAmount = activeQuotes.reduce(
    (highest, quote) => Math.max(highest, quote.totalAmountCents),
    0,
  );
  const stage: ProcurementStage =
    input.request.status === 'rejected'
      ? 'rejected'
      : input.request.status === 'new'
        ? 'awaiting_approval'
        : selectedQuote && remainingCommitmentCents === 0
          ? 'documented'
          : selectedQuote && allocatedReceiptCents > 0
            ? 'partially_documented'
            : selectedQuote
              ? 'committed'
              : activeQuotes.length > 0
                ? 'comparison'
                : 'awaiting_quotes';

  return {
    stage,
    comparisons: activeQuotes.map(quote => ({
      quote,
      differenceFromCheapestCents:
        quote.totalAmountCents - (cheapestQuote?.totalAmountCents ?? 0),
      isCheapest: quote.id === cheapestQuote?.id,
      isSelected: quote.id === selectedQuote?.id,
    })),
    selectedQuote,
    cheapestQuote,
    allocatedReceiptCents,
    remainingCommitmentCents,
    documentedRatio,
    savingsVsHighestCents: selectedQuote
      ? Math.max(0, highestAmount - selectedQuote.totalAmountCents)
      : 0,
  };
}

export function projectProcurementCommitmentCents(input: {
  projectId: string;
  requests: MaterialRequest[];
  quotes: MaterialSupplierQuote[];
  receiptLinks: ReceiptRequestLink[];
}): number {
  return input.requests
    .filter(request => request.projectId === input.projectId)
    .reduce(
      (total, request) =>
        total +
        summarizeProcurement({
          request,
          quotes: input.quotes,
          receiptLinks: input.receiptLinks,
        }).remainingCommitmentCents,
      0,
    );
}
