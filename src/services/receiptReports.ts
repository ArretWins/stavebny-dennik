import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';
import type { Project, Receipt, ReceiptCategory, ReceiptExport, ReceiptFile } from '@/domain/types';
import { createId, nowIso } from '@/domain/ids';
import { formatEuroAmount } from '@/domain/receipts';
import { supabase } from './supabase';

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!); }
function bytesToBase64(bytes: Uint8Array): string { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }

export async function generateRemoteReceiptReport(input: { projectId: string; dateFrom: string; dateTo: string; categoryIds: string[]; excludedReceiptIds: string[] }): Promise<ReceiptExport> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.functions.invoke('generate-receipt-report', { body: input });
  if (error) throw error;
  if (!data?.report?.id || !data.report.storagePath) throw new Error('INVALID_RECEIPT_REPORT_RESPONSE');
  return data.report as ReceiptExport;
}

export async function generateLocalReceiptReport(input: { ownerId: string; project: Project; dateFrom: string; dateTo: string; categoryIds: string[]; receipts: Receipt[]; categories: ReceiptCategory[]; files: ReceiptFile[]; version: number }): Promise<ReceiptExport> {
  const categoryMap = new Map(input.categories.map(category => [category.id, category.name]));
  const total = input.receipts.reduce((sum, receipt) => sum + (receipt.totalAmountCents ?? 0), 0);
  const imageSections: string[] = [];
  const pdfFiles: ReceiptFile[] = [];
  for (const [index, receipt] of input.receipts.entries()) {
    const files = input.files.filter(file => file.receiptId === receipt.id).sort((a, b) => a.pageOrder - b.pageOrder);
    const images: string[] = [];
    for (const file of files) {
      if (file.mimeType === 'application/pdf') { pdfFiles.push(file); continue; }
      const base64 = await FileSystem.readAsStringAsync(file.localUri, { encoding: FileSystem.EncodingType.Base64 });
      images.push(`<img src="data:${file.mimeType};base64,${base64}" />`);
    }
    imageSections.push(`<section class="receipt"><h2>${index + 1}. ${escapeHtml(receipt.seller ?? '—')}</h2><p>${escapeHtml(receipt.purchaseDate ?? '—')} · ${escapeHtml(categoryMap.get(receipt.categoryId ?? '') ?? '—')} · ${formatEuroAmount(receipt.totalAmountCents)}</p>${images.join('')}</section>`);
  }
  const rows = input.receipts.map(receipt => `<tr><td>${escapeHtml(receipt.purchaseDate ?? '—')}</td><td>${escapeHtml(receipt.seller ?? '—')}</td><td>${escapeHtml(categoryMap.get(receipt.categoryId ?? '') ?? '—')}</td><td>${formatEuroAmount(receipt.totalAmountCents)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111827;font-size:10pt}h1{color:#1b5e20;margin-bottom:4px}h2{color:#1b5e20;font-size:15pt}.meta{color:#6b7280;margin-bottom:18px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:7px 5px;text-align:left}th{background:#eaf4e8}.total{text-align:right;font-size:14pt;font-weight:bold;margin-top:12px}.receipt{page-break-before:always}.receipt img{display:block;max-width:100%;max-height:245mm;margin:8px auto;page-break-inside:avoid}</style></head><body><h1>Účtovný balík dokladov</h1><div class="meta">${escapeHtml(input.project.name)} · ${input.dateFrom} – ${input.dateTo} · Verzia ${input.version}</div><table><thead><tr><th>Dátum</th><th>Predajca</th><th>Kategória</th><th>Suma</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Spolu: ${formatEuroAmount(total)}</div>${imageSections.join('')}</body></html>`;
  const printed = await Print.printToFileAsync({ html });
  const output = await PDFDocument.create();
  const baseBytes = new Uint8Array(await (await fetch(printed.uri)).arrayBuffer());
  const base = await PDFDocument.load(baseBytes); const basePages = await output.copyPages(base, base.getPageIndices()); basePages.forEach(page => output.addPage(page));
  for (const file of pdfFiles) { const source = await PDFDocument.load(await (await fetch(file.localUri)).arrayBuffer()); const pages = await output.copyPages(source, source.getPageIndices()); pages.forEach(page => output.addPage(page)); }
  const bytes = await output.save(); const base64 = bytesToBase64(bytes);
  const id = createId('receipt-export'); const uri = `${FileSystem.cacheDirectory}${id}.pdf`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  return { id, ownerId: input.ownerId, projectId: input.project.id, dateFrom: input.dateFrom, dateTo: input.dateTo, categoryIds: input.categoryIds, receiptIds: input.receipts.map(receipt => receipt.id), version: input.version, totalAmountCents: total, storagePath: uri, checksum, pageCount: output.getPageCount(), status: 'synced', createdAt: nowIso() };
}

export async function shareReceiptReport(report: ReceiptExport): Promise<void> {
  let uri = report.storagePath;
  if (!uri) throw new Error('REPORT_FILE_MISSING');
  if (supabase && !uri.startsWith('file://')) {
    const signed = await supabase.storage.from('reports').createSignedUrl(uri, 60 * 60); if (signed.error) throw signed.error;
    const downloaded = await FileSystem.downloadAsync(signed.data.signedUrl, `${FileSystem.cacheDirectory}receipts-${report.id}.pdf`); uri = downloaded.uri;
  }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Zdieľať účtovný balík' });
}
