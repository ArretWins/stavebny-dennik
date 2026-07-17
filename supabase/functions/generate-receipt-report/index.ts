/// <reference path="../generate-report/pdfmake.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import pdfMakeImport from 'npm:pdfmake@0.2.20/build/pdfmake.js';
import pdfFontsImport from 'npm:pdfmake@0.2.20/build/vfs_fonts.js';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const jsonHeaders = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
const pdfMake = pdfMakeImport as any; const pdfFonts = pdfFontsImport as any; pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts;
type Row = Record<string, any>;

function date(value: string): string { return new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeZone: 'Europe/Bratislava' }).format(new Date(`${value}T12:00:00Z`)); }
function money(cents: number): string { return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(cents / 100); }
function bytesToDataUri(bytes: ArrayBuffer, mime: string): string { const data = new Uint8Array(bytes); let binary = ''; for (let offset = 0; offset < data.length; offset += 0x8000) binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000)); return `data:${mime};base64,${btoa(binary)}`; }
function createPdf(definition: Row): Promise<Uint8Array> { return new Promise((resolve, reject) => { try { pdfMake.createPdf(definition).getBuffer((buffer: Uint8Array) => resolve(new Uint8Array(buffer))); } catch (error) { reject(error); } }); }
async function checksum(bytes: Uint8Array): Promise<string> { const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; const digest = await crypto.subtle.digest('SHA-256', source); return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''); }

async function mergePdfParts(parts: Uint8Array[]): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  for (const bytes of parts) { const source = await PDFDocument.load(bytes); const pages = await output.copyPages(source, source.getPageIndices()); pages.forEach(page => output.addPage(page)); }
  return output.save();
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: jsonHeaders });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const body = await request.json();
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const dateFrom = typeof body.dateFrom === 'string' ? body.dateFrom : '';
    const dateTo = typeof body.dateTo === 'string' ? body.dateTo : '';
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.filter((value: unknown) => typeof value === 'string') : [];
    const excludedIds = new Set(Array.isArray(body.excludedReceiptIds) ? body.excludedReceiptIds.filter((value: unknown) => typeof value === 'string') : []);
    if (!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < dateFrom) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const auth = await client.auth.getUser(); if (auth.error || !auth.data.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const projectResult = await client.from('projects').select('id, owner_id, name, location').eq('id', projectId).single();
    const project = projectResult.data; if (projectResult.error || !project || project.owner_id !== auth.data.user.id) return new Response(JSON.stringify({ error: 'project_not_found' }), { status: 404, headers: jsonHeaders });
    let query = client.from('receipts').select('*, expense_categories(name), receipt_files(*)').eq('project_id', projectId).eq('status', 'ready').gte('purchase_date', dateFrom).lte('purchase_date', dateTo).order('purchase_date').order('created_at');
    if (categoryIds.length) query = query.in('category_id', categoryIds);
    const receiptResult = await query; if (receiptResult.error) throw receiptResult.error;
    const receipts = (receiptResult.data ?? []).filter((receipt: Row) => !excludedIds.has(receipt.id));
    if (!receipts.length) return new Response(JSON.stringify({ error: 'no_receipts' }), { status: 409, headers: jsonHeaders });
    const allowance = await client.rpc('consume_feature', { p_feature_key: 'receipt_exports', p_amount: 1 });
    if (allowance.error) return new Response(JSON.stringify({ error: allowance.error.message }), { status: 402, headers: jsonHeaders });
    const previous = await client.from('receipt_export_batches').select('version').eq('project_id', projectId).eq('date_from', dateFrom).eq('date_to', dateTo).order('version', { ascending: false }).limit(1).maybeSingle();
    if (previous.error) throw previous.error; const version = Number(previous.data?.version ?? 0) + 1;
    const total = receipts.reduce((sum: number, receipt: Row) => sum + Number(receipt.total_amount_cents), 0);
    const summaryRows = receipts.map((receipt: Row) => [date(receipt.purchase_date), receipt.seller, receipt.expense_categories?.name ?? '—', money(receipt.total_amount_cents)]);
    const summary = await createPdf({ pageSize: 'A4', pageMargins: [38, 42, 38, 42], defaultStyle: { font: 'Roboto', fontSize: 9 }, content: [
      { text: 'Účtovný balík dokladov', style: 'title' }, { text: project.name, style: 'project' },
      { text: `${date(dateFrom)} – ${date(dateTo)} · Verzia ${version}`, color: '#5f6b62', margin: [0, 0, 0, 16] },
      { table: { headerRows: 1, widths: [75, '*', 95, 72], body: [['Dátum', 'Predajca', 'Kategória', 'Suma'], ...summaryRows] }, layout: 'lightHorizontalLines' },
      { text: `Spolu: ${money(total)}`, alignment: 'right', bold: true, fontSize: 13, margin: [0, 12, 0, 0] },
    ], styles: { title: { fontSize: 22, bold: true, color: '#173b20', margin: [0, 0, 0, 6] }, project: { fontSize: 15, bold: true, margin: [0, 0, 0, 3] } } });
    const parts: Uint8Array[] = [summary];
    for (const [receiptIndex, receipt] of receipts.entries()) {
      const files = [...(receipt.receipt_files ?? [])].sort((a: Row, b: Row) => a.page_order - b.page_order);
      const downloads = await Promise.all(files.map(async (file: Row) => { if (!file.storage_path) throw new Error('RECEIPT_FILE_NOT_SYNCED'); const downloaded = await client.storage.from('receipts').download(file.storage_path); if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error('RECEIPT_FILE_DOWNLOAD_FAILED'); return { file, bytes: await downloaded.data.arrayBuffer() }; }));
      const images = downloads.filter(item => item.file.mime_type.startsWith('image/'));
      if (images.length) parts.push(await createPdf({ pageSize: 'A4', pageMargins: [38, 38, 38, 38], defaultStyle: { font: 'Roboto', fontSize: 9 }, content: [
        { text: `${receiptIndex + 1}. ${receipt.seller}`, fontSize: 15, bold: true, color: '#173b20' },
        { text: `${date(receipt.purchase_date)} · ${receipt.expense_categories?.name ?? '—'} · ${money(receipt.total_amount_cents)}`, margin: [0, 3, 0, 12] },
        ...images.map((item, imageIndex) => ({ image: bytesToDataUri(item.bytes, item.file.mime_type), fit: [510, 690], alignment: 'center', pageBreak: imageIndex ? 'before' : undefined })),
      ] }));
      for (const item of downloads.filter(item => item.file.mime_type === 'application/pdf')) parts.push(new Uint8Array(item.bytes));
    }
    const bytes = await mergePdfParts(parts); const pageCount = (await PDFDocument.load(bytes)).getPageCount(); const digest = await checksum(bytes);
    const storagePath = `${auth.data.user.id}/${projectId}/receipts-${dateFrom}-${dateTo}-v${version}-${crypto.randomUUID()}.pdf`;
    const upload = await client.storage.from('reports').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false }); if (upload.error) throw upload.error;
    const receiptIds = receipts.map((receipt: Row) => receipt.id);
    const snapshot = await client.rpc('create_receipt_export_snapshot', { p_project_id: projectId, p_date_from: dateFrom, p_date_to: dateTo, p_category_ids: categoryIds, p_receipt_ids: receiptIds, p_version: version, p_storage_path: storagePath, p_checksum: digest, p_page_count: pageCount });
    if (snapshot.error || !snapshot.data?.[0]) { await client.storage.from('reports').remove([storagePath]); throw snapshot.error ?? new Error('EXPORT_SNAPSHOT_FAILED'); }
    void client.rpc('track_analytics_event', { p_event_name: 'receipt_exported', p_properties: { platform: 'edge', count: receipts.length, plan: allowance.data?.plan ?? 'free' } });
    const row = snapshot.data[0];
    return new Response(JSON.stringify({ report: { id: row.id, ownerId: auth.data.user.id, projectId, dateFrom, dateTo, categoryIds, receiptIds, version, totalAmountCents: total, storagePath, checksum: digest, pageCount, status: 'synced', createdAt: row.created_at } }), { status: 201, headers: jsonHeaders });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'server_error' }), { status: 500, headers: jsonHeaders }); }
});
