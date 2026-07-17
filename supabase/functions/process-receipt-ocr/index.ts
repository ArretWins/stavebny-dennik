import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const jsonHeaders = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
type Row = Record<string, any>;
type ExtractedField<T> = { value?: T; confidence: number };

function bytesToBase64(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes); let binary = '';
  for (let offset = 0; offset < data.length; offset += 0x8000) binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function stringField(field: Row | undefined): ExtractedField<string> {
  return { value: field?.valueString ?? field?.valueDate ?? field?.content, confidence: Number(field?.confidence ?? 0) };
}

function amountField(field: Row | undefined): ExtractedField<number> {
  const raw = field?.valueCurrency?.amount ?? field?.valueNumber ?? field?.content;
  const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
  return { value: Number.isFinite(value) ? Math.round(value * 100) : undefined, confidence: Number(field?.confidence ?? 0) };
}

async function analyzeDocument(bytes: ArrayBuffer, endpoint: string, key: string): Promise<{ seller: ExtractedField<string>; purchaseDate: ExtractedField<string>; totalAmountCents: ExtractedField<number>; raw: Row }> {
  const analyzeUrl = `${endpoint.replace(/\/$/, '')}/documentintelligence/documentModels/prebuilt-receipt:analyze?_overload=analyzeDocument&api-version=2024-11-30`;
  const started = await fetch(analyzeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key }, body: JSON.stringify({ base64Source: bytesToBase64(bytes) }) });
  if (started.status !== 202) throw new Error(`OCR_START_${started.status}`);
  const operationUrl = started.headers.get('Operation-Location');
  if (!operationUrl) throw new Error('OCR_OPERATION_MISSING');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const polled = await fetch(operationUrl, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!polled.ok) throw new Error(`OCR_POLL_${polled.status}`);
    const result = await polled.json();
    if (result.status === 'failed') throw new Error('OCR_ANALYSIS_FAILED');
    if (result.status !== 'succeeded') continue;
    const fields = result.analyzeResult?.documents?.[0]?.fields ?? {};
    return { seller: stringField(fields.MerchantName), purchaseDate: stringField(fields.TransactionDate), totalAmountCents: amountField(fields.Total), raw: result };
  }
  throw new Error('OCR_TIMEOUT');
}

function best<T>(results: Array<ExtractedField<T>>): ExtractedField<T> {
  return results.filter(item => item.value !== undefined).sort((a, b) => b.confidence - a.confidence)[0] ?? { confidence: 0 };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: jsonHeaders });
  let jobId: string | undefined;
  let receiptId: string | undefined;
  // Database types are intentionally runtime-discovered in Edge Functions.
  // Keep the service-role boundary untyped until generated Supabase types are available.
  let admin: any;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const body = await request.json();
    receiptId = typeof body.receiptId === 'string' ? body.receiptId : '';
    if (!receiptId) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const { data: receipt, error: receiptError } = await client.from('receipts').select('*').eq('id', receiptId).single();
    if (receiptError || !receipt || receipt.owner_id !== authData.user.id) return new Response(JSON.stringify({ error: 'receipt_not_found' }), { status: 404, headers: jsonHeaders });
    const { data: files, error: filesError } = await client.from('receipt_files').select('*').eq('receipt_id', receiptId).order('page_order');
    if (filesError) throw filesError;
    if (!files?.length) return new Response(JSON.stringify({ error: 'receipt_files_missing' }), { status: 409, headers: jsonHeaders });
    const allowance = await client.rpc('consume_feature', { p_feature_key: 'receipt_ocr', p_amount: 1 });
    if (allowance.error) return new Response(JSON.stringify({ error: allowance.error.message }), { status: 402, headers: jsonHeaders });
    void client.rpc('track_analytics_event', { p_event_name: 'receipt_ocr_requested', p_properties: { platform: 'edge', plan: allowance.data?.plan ?? 'free' } });
    const insertedJob = await admin.from('receipt_ocr_jobs').insert({ owner_id: authData.user.id, receipt_id: receiptId, status: 'processing', provider: 'azure-document-intelligence', attempt_count: 1 }).select('id').single();
    if (insertedJob.error) throw insertedJob.error;
    jobId = insertedJob.data.id;
    await admin.from('receipts').update({ ocr_status: 'processing', ocr_error: null }).eq('id', receiptId);
    const endpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const key = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    if (!endpoint || !key) throw new Error('OCR_NOT_CONFIGURED');
    const selected = files.length <= 5 ? files : [files[0], files[1], files[2], files[files.length - 2], files[files.length - 1]];
    const analyses = await Promise.all(selected.map(async file => {
      if (!file.storage_path) throw new Error('RECEIPT_FILE_NOT_SYNCED');
      const downloaded = await client.storage.from('receipts').download(file.storage_path);
      if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error('RECEIPT_FILE_DOWNLOAD_FAILED');
      return analyzeDocument(await downloaded.data.arrayBuffer(), endpoint, key);
    }));
    const seller = best(analyses.map(item => item.seller));
    const purchaseDate = best(analyses.map(item => item.purchaseDate));
    const totalAmountCents = best(analyses.map(item => item.totalAmountCents));
    const confidence = Math.min(seller.confidence || 1, purchaseDate.confidence || 1, totalAmountCents.confidence || 1);
    const patch = {
      seller: receipt.seller ?? seller.value ?? null,
      purchase_date: receipt.purchase_date ?? purchaseDate.value ?? null,
      total_amount_cents: receipt.total_amount_cents ?? totalAmountCents.value ?? null,
      ocr_status: 'needs_review', ocr_confidence: confidence, ocr_error: null, status: 'needs_review',
    };
    const updated = await admin.from('receipts').update(patch).eq('id', receiptId).select('*').single();
    if (updated.error) throw updated.error;
    await admin.from('receipt_ocr_jobs').update({ status: 'completed', result_json: { seller, purchaseDate, totalAmountCents, documents: analyses.map(item => item.raw) } }).eq('id', jobId);
    if (patch.purchase_date && patch.seller && patch.total_amount_cents !== null) {
      const duplicates = await admin.from('receipts').select('id').eq('project_id', receipt.project_id).eq('purchase_date', patch.purchase_date).eq('total_amount_cents', patch.total_amount_cents).ilike('seller', patch.seller).neq('id', receiptId);
      for (const candidate of duplicates.data ?? []) await admin.from('receipt_duplicate_candidates').upsert({ owner_id: authData.user.id, receipt_id: receiptId, candidate_receipt_id: candidate.id, score: 0.9, reasons: ['date', 'seller', 'amount'] }, { onConflict: 'receipt_id,candidate_receipt_id' });
    }
    return new Response(JSON.stringify({ receipt: { purchaseDate: patch.purchase_date, seller: patch.seller, totalAmountCents: patch.total_amount_cents, status: 'needs_review', ocrStatus: 'needs_review', ocrConfidence: confidence, ocrError: undefined } }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'server_error';
    if (admin && jobId) await admin.from('receipt_ocr_jobs').update({ status: 'failed', error: message }).eq('id', jobId);
    if (admin && receiptId) await admin.from('receipts').update({ ocr_status: 'failed', ocr_error: message, status: 'needs_review' }).eq('id', receiptId);
    return new Response(JSON.stringify({ error: message }), { status: message === 'OCR_NOT_CONFIGURED' ? 503 : 500, headers: jsonHeaders });
  }
});
