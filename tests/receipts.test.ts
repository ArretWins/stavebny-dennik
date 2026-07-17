import { describe, expect, it } from 'vitest';
import { defaultReceiptCategories, formatEuroAmount, metadataDuplicateCandidates, parseEuroAmount, receiptIsReady, validateReceipt } from '../src/domain/receipts';
import type { Receipt, ReceiptFile } from '../src/domain/types';

const receipt: Receipt = { id: 'r1', ownerId: 'o1', projectId: 'p1', categoryId: 'c1', purchaseDate: '2026-07-14', seller: 'Stavebniny', totalAmountCents: 12345, currency: 'EUR', status: 'ready', ocrStatus: 'completed', syncStatus: 'pending', createdAt: 'now', updatedAt: 'now' };
const file: ReceiptFile = { id: 'f1', receiptId: 'r1', ownerId: 'o1', projectId: 'p1', localUri: 'file.jpg', fileSize: 100, mimeType: 'image/jpeg', pageOrder: 0, uploadStatus: 'pending', createdAt: 'now' };

describe('receipt accounting model', () => {
  it('seeds stable default categories', () => { const categories = defaultReceiptCategories('owner', 'now'); expect(categories).toHaveLength(6); expect(categories[0].id).toBe('receipt-category:owner:materials'); });
  it('parses and formats EUR amounts without floating point storage', () => { expect(parseEuroAmount('123,45')).toBe(12345); expect(parseEuroAmount('1.234')).toBeUndefined(); expect(formatEuroAmount(12345)).toContain('123'); });
  it('requires a document for drafts and all accounting fields for ready receipts', () => { expect(validateReceipt(receipt, [])).toBe('files_required'); expect(receiptIsReady(receipt, [file])).toBe(true); expect(receiptIsReady({ ...receipt, seller: undefined }, [file])).toBe(false); });
  it('finds metadata duplicates only inside the same project', () => { expect(metadataDuplicateCandidates(receipt, [{ ...receipt, id: 'r2', seller: ' stavebniny ' }, { ...receipt, id: 'r3', projectId: 'p2' }]).map(item => item.id)).toEqual(['r2']); });
});
