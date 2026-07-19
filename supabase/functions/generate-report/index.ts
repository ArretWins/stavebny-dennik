/// <reference path="./pdfmake.d.ts" />
import { createClient } from 'npm:@supabase/supabase-js@^2.49.4';
import pdfMakeImport from 'npm:pdfmake@0.2.20/build/pdfmake.js';
import pdfFontsImport from 'npm:pdfmake@0.2.20/build/vfs_fonts.js';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const jsonHeaders = { ...cors, 'Content-Type': 'application/json; charset=utf-8' };
const pdfMake = pdfMakeImport as any;
const pdfFonts = pdfFontsImport as any;
pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts;

type ReportType = 'diary' | 'delay';
type DbRow = Record<string, any>;

function date(value: string): string { return new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeZone: 'Europe/Bratislava' }).format(new Date(value)); }
function dateTime(value: string): string { return new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bratislava' }).format(new Date(value)); }
function number(value: unknown, suffix: string): string { return typeof value === 'number' ? `${new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 1 }).format(value)} ${suffix}` : '—'; }
function evidenceLines(row: DbRow): string[] {
  const evidence = row.evidence_json ?? {};
  const weather = evidence.weather ?? {};
  const gps = evidence.gps;
  const lines = [
    `Teplota: ${number(weather.temperatureC, '°C')}`,
    `Zrážky: ${number(weather.precipitationMm, 'mm')}`,
    `Vietor: ${number(weather.windSpeedKmh, 'km/h')}`,
    `Zdroj počasia: ${weather.provider === 'open-meteo' ? 'Open-Meteo' : '—'}`,
  ];
  if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') lines.push(`GPS: ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`);
  return lines;
}
function bytesToDataUri(bytes: ArrayBuffer, mime: string): string {
  const data = new Uint8Array(bytes); let binary = '';
  for (let offset = 0; offset < data.length; offset += 0x8000) binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}
function createPdf(definition: Record<string, unknown>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(definition).getBuffer((buffer: Uint8Array) => resolve(new Uint8Array(buffer))); }
    catch (error) { reject(error); }
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: jsonHeaders });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const body = await request.json();
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const type: ReportType | undefined = body.type === 'diary' || body.type === 'delay' ? body.type : undefined;
    const sourceEntityId = typeof body.sourceEntityId === 'string' ? body.sourceEntityId : undefined;
    if (!projectId || !type || (type === 'delay' && !sourceEntityId)) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const user = authData.user;
    const { data: project, error: projectError } = await client.from('projects').select('id, owner_id, name, location, address').eq('id', projectId).single();
    if (projectError || !project || project.owner_id !== user.id) return new Response(JSON.stringify({ error: 'project_not_found' }), { status: 404, headers: jsonHeaders });

    let rows: DbRow[] = [];
    if (type === 'diary') {
      const result = await client.from('diary_entries').select('*').eq('project_id', projectId).order('log_date').order('created_at');
      if (result.error) throw result.error; rows = result.data ?? [];
    } else {
      const result = await client.from('delay_events').select('*').eq('project_id', projectId).eq('id', sourceEntityId!).single();
      if (result.error) throw result.error; rows = [result.data];
    }

    const attachmentIds = [...new Set(rows.flatMap(row => Array.isArray(row.evidence_json?.attachmentIds) ? row.evidence_json.attachmentIds : []))];
    let attachments: DbRow[] = [];
    if (attachmentIds.length) {
      const result = await client.from('attachments').select('id, related_entity_id, storage_path, mime_type, created_at').eq('project_id', projectId).in('id', attachmentIds);
      if (result.error) throw result.error; attachments = result.data ?? [];
    }
    const images = new Map<string, string>();
    for (const attachment of attachments) {
      if (!attachment.storage_path) continue;
      const downloaded = await client.storage.from('attachments').download(attachment.storage_path);
      if (!downloaded.error && downloaded.data) images.set(attachment.id, bytesToDataUri(await downloaded.data.arrayBuffer(), attachment.mime_type));
    }

    const generatedAt = new Date().toISOString();
    const content: any[] = [
      { text: type === 'diary' ? 'Stavebný denník' : 'Oznámenie o prerušení / oneskorení prác', style: 'title' },
      { text: project.name, style: 'project' },
      { text: `${project.location}${project.address ? ` · ${project.address}` : ''}`, margin: [0, 0, 0, 12] },
    ];
    for (const row of rows) {
      content.push({ text: type === 'diary' ? date(row.log_date) : dateTime(row.event_date), style: 'section', pageBreak: content.length > 3 ? 'before' : undefined });
      if (type === 'diary') {
        content.push({ text: row.work_description, margin: [0, 0, 0, 4] }, { text: `Počet pracovníkov: ${row.worker_count}`, bold: true });
      } else {
        content.push({ text: `Dôvod: ${row.reason === 'bad_weather' ? 'Nepriaznivé počasie' : 'Čakanie na investora'}`, bold: true });
      }
      if (row.note) content.push({ text: `Poznámka: ${row.note}`, margin: [0, 4, 0, 4] });
      content.push({ text: 'Dôkazné údaje', style: 'label' }, { ul: evidenceLines(row), margin: [0, 0, 0, 6] });
      if (row.locked_at) content.push({ text: `Uzamknuté: ${dateTime(row.locked_at)}`, color: '#245c2a' });
      if (row.correction_of_id) content.push({ text: `Oprava záznamu: ${row.correction_of_id}`, color: '#9a5a00' });
      const rowImages = attachmentIds.filter(id => images.has(id) && attachments.find(item => item.id === id)?.related_entity_id === row.id);
      if (rowImages.length) content.push({ text: 'Fotodôkazy', style: 'label', margin: [0, 8, 0, 4] }, ...rowImages.map(id => ({ image: images.get(id), fit: [470, 340], margin: [0, 0, 0, 10] })));
    }
    content.push({ text: `Exportované: ${dateTime(generatedAt)} · Jazyk: sk-SK`, fontSize: 9, color: '#666666', margin: [0, 16, 0, 0] });
    const bytes = await createPdf({ pageSize: 'A4', pageMargins: [48, 52, 48, 52], defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.25 }, styles: { title: { fontSize: 22, bold: true, color: '#173b20', margin: [0, 0, 0, 8] }, project: { fontSize: 15, bold: true, margin: [0, 0, 0, 3] }, section: { fontSize: 14, bold: true, color: '#173b20', margin: [0, 12, 0, 7] }, label: { bold: true, margin: [0, 7, 0, 3] } }, content });
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    const storagePath = `${user.id}/${projectId}/${crypto.randomUUID()}.pdf`;
    const upload = await client.storage.from('reports').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (upload.error) throw upload.error;
    const inserted = await client.from('report_exports').insert({ owner_id: user.id, project_id: projectId, report_type: type, source_entity_id: sourceEntityId ?? null, attachment_ids: attachmentIds, locale: 'sk-SK', storage_path: storagePath, page_count: pageCount, status: 'synced' }).select('id, created_at').single();
    if (inserted.error) { await client.storage.from('reports').remove([storagePath]); throw inserted.error; }
    const signed = await client.storage.from('reports').createSignedUrl(storagePath, 60 * 60);
    if (signed.error) throw signed.error;
    return new Response(JSON.stringify({ report: { id: inserted.data.id, ownerId: user.id, projectId, type, sourceEntityId, attachmentIds, locale: 'sk-SK', storagePath, createdAt: inserted.data.created_at, pageCount, status: 'synced' }, signedUrl: signed.data.signedUrl }), { status: 201, headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'server_error' }), { status: 500, headers: jsonHeaders });
  }
});
