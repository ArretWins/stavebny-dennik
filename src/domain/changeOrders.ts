export type ChangeOrderValidation =
  | 'ok'
  | 'title'
  | 'description'
  | 'amount'
  | 'schedule';

export function parseChangeOrderAmount(value: string): number | undefined {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export function parseScheduleImpact(value: string): number | undefined {
  if (!/^[+-]?\d+$/.test(value.trim())) return undefined;
  const days = Number(value);
  return Number.isSafeInteger(days) ? days : undefined;
}

export function validateChangeOrder(input: {
  title: string;
  description: string;
  amountCents?: number;
  scheduleImpactDays?: number;
}): ChangeOrderValidation {
  if (input.title.trim().length < 3 || input.title.trim().length > 120)
    return 'title';
  if (
    input.description.trim().length < 3 ||
    input.description.trim().length > 1200
  )
    return 'description';
  if (
    input.amountCents === undefined ||
    !Number.isInteger(input.amountCents) ||
    input.amountCents === 0 ||
    Math.abs(input.amountCents) > 100_000_000
  )
    return 'amount';
  if (
    input.scheduleImpactDays === undefined ||
    !Number.isInteger(input.scheduleImpactDays) ||
    Math.abs(input.scheduleImpactDays) > 365
  )
    return 'schedule';
  return 'ok';
}
