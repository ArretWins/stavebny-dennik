import type { Receipt, ReceiptCategory, ReceiptFile } from './types';

export const DEFAULT_RECEIPT_CATEGORIES = [
  { key: 'materials', name: 'Materiál' },
  { key: 'tools', name: 'Náradie' },
  { key: 'transport', name: 'Doprava' },
  { key: 'rental', name: 'Prenájom' },
  { key: 'services', name: 'Služby' },
  { key: 'other', name: 'Ostatné' },
] as const;

export function defaultReceiptCategories(ownerId: string, at: string): ReceiptCategory[] {
  return DEFAULT_RECEIPT_CATEGORIES.map(category => ({
    id: `receipt-category:${ownerId}:${category.key}`,
    ownerId,
    name: category.name,
    isDefault: true,
    syncStatus: 'pending',
    createdAt: at,
    updatedAt: at,
  }));
}

export type ReceiptValidationError = 'files_required' | 'date_required' | 'seller_required' | 'amount_required' | 'category_required';

export function validateReceipt(receipt: Pick<Receipt, 'purchaseDate' | 'seller' | 'totalAmountCents' | 'categoryId'>, files: ReceiptFile[], requireAccountingFields = false): ReceiptValidationError | undefined {
  if (!files.length) return 'files_required';
  if (!requireAccountingFields) return undefined;
  if (!receipt.purchaseDate) return 'date_required';
  if (!receipt.seller?.trim()) return 'seller_required';
  if (receipt.totalAmountCents === undefined || receipt.totalAmountCents < 0) return 'amount_required';
  if (!receipt.categoryId) return 'category_required';
  return undefined;
}

export function receiptIsReady(receipt: Receipt, files: ReceiptFile[]): boolean {
  return !validateReceipt(receipt, files.filter(file => file.receiptId === receipt.id), true);
}

export function parseEuroAmount(value: string): number | undefined {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

export function formatEuroAmount(cents?: number): string {
  return cents === undefined ? '' : (cents / 100).toLocaleString('sk-SK', { style: 'currency', currency: 'EUR' });
}

export function metadataDuplicateCandidates(target: Receipt, receipts: Receipt[]): Receipt[] {
  if (!target.purchaseDate || !target.seller?.trim() || target.totalAmountCents === undefined) return [];
  const seller = target.seller.trim().toLocaleLowerCase('sk-SK');
  return receipts.filter(candidate => candidate.id !== target.id
    && candidate.projectId === target.projectId
    && candidate.purchaseDate === target.purchaseDate
    && candidate.totalAmountCents === target.totalAmountCents
    && candidate.seller?.trim().toLocaleLowerCase('sk-SK') === seller);
}
