import type {
  ChangeOrder,
  ProjectBudget,
  Receipt,
  ReceiptCategory,
} from './types';

export type BudgetHealth = 'not_configured' | 'healthy' | 'watch' | 'over';
export type CostForecastHealth =
  | 'unavailable'
  | 'within_budget'
  | 'reserve_at_risk'
  | 'over_budget';
export type CostForecastConfidence = 'unavailable' | 'low' | 'medium' | 'high';

export interface FinancialCategoryTotal {
  categoryId?: string;
  name: string;
  amountCents: number;
  share: number;
}

export interface ProjectFinancialSummary {
  baselineBudgetCents: number;
  contingencyCents: number;
  acceptedChangeCents: number;
  pendingChangeCents: number;
  adjustedBudgetCents: number;
  verifiedSpendCents: number;
  reviewSpendCents: number;
  documentedSpendCents: number;
  manualCommitmentCents: number;
  procurementCommitmentCents: number;
  totalCommitmentCents: number;
  forecastRemainingCents: number;
  remainingAfterReserveCents: number;
  utilization: number;
  health: BudgetHealth;
  reviewReceiptCount: number;
  categories: FinancialCategoryTotal[];
}

export interface ProjectCostForecast {
  available: boolean;
  declaredFinalCostCents: number;
  paceProjectedFinalCents?: number;
  forecastFinalCostCents?: number;
  projectedVarianceCents?: number;
  remainingAtCompletionCents?: number;
  elapsedDays?: number;
  totalDays?: number;
  dailyVerifiedSpendCents?: number;
  receiptCount: number;
  confidence: CostForecastConfidence;
  health: CostForecastHealth;
  source: 'unavailable' | 'declared' | 'pace';
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;

function dateValue(value?: string): number | undefined {
  if (!value || !datePattern.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return undefined;
  return date.getTime();
}

export function projectFinancialSummary(input: {
  budget?: ProjectBudget;
  receipts: Receipt[];
  categories: ReceiptCategory[];
  changeOrders: ChangeOrder[];
  procurementCommitmentCents?: number;
}): ProjectFinancialSummary {
  const baselineBudgetCents = input.budget?.baselineBudgetCents ?? 0;
  const contingencyCents = input.budget?.contingencyCents ?? 0;
  const acceptedChangeCents = input.changeOrders
    .filter(item => item.status === 'accepted')
    .reduce((total, item) => total + item.amountCents, 0);
  const pendingChangeCents = input.changeOrders
    .filter(item => item.status === 'pending_client')
    .reduce((total, item) => total + item.amountCents, 0);
  const verifiedReceipts = input.receipts.filter(
    item => item.status === 'ready' && item.totalAmountCents !== undefined,
  );
  const reviewReceipts = input.receipts.filter(
    item => item.status !== 'ready' && item.totalAmountCents !== undefined,
  );
  const verifiedSpendCents = verifiedReceipts.reduce(
    (total, item) => total + (item.totalAmountCents ?? 0),
    0,
  );
  const reviewSpendCents = reviewReceipts.reduce(
    (total, item) => total + (item.totalAmountCents ?? 0),
    0,
  );
  const documentedSpendCents = verifiedSpendCents + reviewSpendCents;
  const manualCommitmentCents = input.budget?.remainingCommitmentCents ?? 0;
  const procurementCommitmentCents = Math.max(
    0,
    input.procurementCommitmentCents ?? 0,
  );
  const totalCommitmentCents =
    manualCommitmentCents + procurementCommitmentCents;
  const adjustedBudgetCents = baselineBudgetCents + acceptedChangeCents;
  const forecastRemainingCents = adjustedBudgetCents - documentedSpendCents;
  const remainingAfterReserveCents =
    forecastRemainingCents - contingencyCents;
  const utilization =
    adjustedBudgetCents > 0
      ? documentedSpendCents / adjustedBudgetCents
      : documentedSpendCents > 0
        ? 1
        : 0;
  const health: BudgetHealth = !input.budget
    ? 'not_configured'
    : forecastRemainingCents < 0
      ? 'over'
      : remainingAfterReserveCents < 0 || utilization >= 0.85
        ? 'watch'
        : 'healthy';
  const names = new Map(
    input.categories.map(category => [category.id, category.name]),
  );
  const categoryTotals = new Map<string | undefined, number>();
  for (const receipt of verifiedReceipts) {
    categoryTotals.set(
      receipt.categoryId,
      (categoryTotals.get(receipt.categoryId) ?? 0) +
        (receipt.totalAmountCents ?? 0),
    );
  }
  const categories = [...categoryTotals.entries()]
    .map(([categoryId, amountCents]) => ({
      categoryId,
      name: categoryId
        ? names.get(categoryId) ?? 'Nezaradené'
        : 'Nezaradené',
      amountCents,
      share: verifiedSpendCents > 0 ? amountCents / verifiedSpendCents : 0,
    }))
    .sort((left, right) => right.amountCents - left.amountCents);
  return {
    baselineBudgetCents,
    contingencyCents,
    acceptedChangeCents,
    pendingChangeCents,
    adjustedBudgetCents,
    verifiedSpendCents,
    reviewSpendCents,
    documentedSpendCents,
    manualCommitmentCents,
    procurementCommitmentCents,
    totalCommitmentCents,
    forecastRemainingCents,
    remainingAfterReserveCents,
    utilization,
    health,
    reviewReceiptCount: reviewReceipts.length,
    categories,
  };
}

export function projectCostForecast(input: {
  summary: ProjectFinancialSummary;
  budget?: ProjectBudget;
  receipts: Receipt[];
  today: string;
  scheduleStartDate?: string;
  forecastCompletionDate?: string;
}): ProjectCostForecast {
  const remainingCommitmentCents = input.summary.totalCommitmentCents;
  const declaredFinalCostCents =
    input.summary.documentedSpendCents + remainingCommitmentCents;
  const readyReceipts = input.receipts.filter(
    receipt =>
      receipt.status === 'ready' &&
      receipt.totalAmountCents !== undefined &&
      (!receipt.purchaseDate || receipt.purchaseDate <= input.today),
  );
  const verifiedSpendToDateCents = readyReceipts.reduce(
    (total, receipt) => total + (receipt.totalAmountCents ?? 0),
    0,
  );
  const start = dateValue(input.scheduleStartDate);
  const today = dateValue(input.today);
  const finish = dateValue(input.forecastCompletionDate);
  let elapsedDays: number | undefined;
  let totalDays: number | undefined;
  let dailyVerifiedSpendCents: number | undefined;
  let paceProjectedFinalCents: number | undefined;
  if (
    start !== undefined &&
    today !== undefined &&
    finish !== undefined &&
    today >= start &&
    finish >= start &&
    verifiedSpendToDateCents > 0
  ) {
    elapsedDays = Math.max(1, Math.floor((today - start) / dayMs) + 1);
    totalDays = Math.max(elapsedDays, Math.floor((finish - start) / dayMs) + 1);
    dailyVerifiedSpendCents = Math.round(
      verifiedSpendToDateCents / elapsedDays,
    );
    paceProjectedFinalCents = Math.max(
      input.summary.documentedSpendCents,
      Math.round((verifiedSpendToDateCents / elapsedDays) * totalDays),
    );
  }
  const paceAvailable = paceProjectedFinalCents !== undefined;
  const declaredAvailable = remainingCommitmentCents > 0;
  const available = Boolean(input.budget && (paceAvailable || declaredAvailable));
  const forecastFinalCostCents = available
    ? Math.max(
        declaredFinalCostCents,
        paceProjectedFinalCents ?? declaredFinalCostCents,
      )
    : undefined;
  const projectedVarianceCents =
    forecastFinalCostCents === undefined
      ? undefined
      : forecastFinalCostCents - input.summary.adjustedBudgetCents;
  const remainingAtCompletionCents =
    forecastFinalCostCents === undefined
      ? undefined
      : input.summary.adjustedBudgetCents - forecastFinalCostCents;
  const confidence: CostForecastConfidence = !paceAvailable
    ? 'unavailable'
    : (elapsedDays ?? 0) >= 42 && readyReceipts.length >= 12
      ? 'high'
      : (elapsedDays ?? 0) >= 14 && readyReceipts.length >= 5
        ? 'medium'
        : 'low';
  const health: CostForecastHealth = !available
    ? 'unavailable'
    : (forecastFinalCostCents ?? 0) > input.summary.adjustedBudgetCents
      ? 'over_budget'
      : (forecastFinalCostCents ?? 0) >
          input.summary.adjustedBudgetCents - input.summary.contingencyCents
        ? 'reserve_at_risk'
        : 'within_budget';
  return {
    available,
    declaredFinalCostCents,
    paceProjectedFinalCents,
    forecastFinalCostCents,
    projectedVarianceCents,
    remainingAtCompletionCents,
    elapsedDays,
    totalDays,
    dailyVerifiedSpendCents,
    receiptCount: readyReceipts.length,
    confidence,
    health,
    source:
      !available
        ? 'unavailable'
        : paceProjectedFinalCents !== undefined &&
            paceProjectedFinalCents > declaredFinalCostCents
          ? 'pace'
          : 'declared',
  };
}

export function validateProjectBudget(input: {
  baselineBudgetCents?: number;
  contingencyCents?: number;
  remainingCommitmentCents?: number;
  note?: string;
}): 'ok' | 'baseline' | 'contingency' | 'commitments' | 'note' {
  if (
    input.baselineBudgetCents === undefined ||
    !Number.isInteger(input.baselineBudgetCents) ||
    input.baselineBudgetCents <= 0 ||
    input.baselineBudgetCents > 1_000_000_000
  )
    return 'baseline';
  if (
    input.contingencyCents === undefined ||
    !Number.isInteger(input.contingencyCents) ||
    input.contingencyCents < 0 ||
    input.contingencyCents > input.baselineBudgetCents
  )
    return 'contingency';
  if (
    input.remainingCommitmentCents !== undefined &&
    (!Number.isInteger(input.remainingCommitmentCents) ||
      input.remainingCommitmentCents < 0 ||
      input.remainingCommitmentCents > 1_000_000_000)
  )
    return 'commitments';
  if ((input.note?.trim().length ?? 0) > 500) return 'note';
  return 'ok';
}
