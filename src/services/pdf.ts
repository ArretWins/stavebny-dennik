import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import type { Attachment, ReportExport } from '@/domain/types';
import { diaryPdfHtml, delayPdfHtml, type PdfAttachment } from '@/domain/pdfTemplate';
import { countPdfPageObjects } from '@/domain/pdfBinary';
import { sk } from '@/i18n/translations';
import { supabase } from './supabase';

export { diaryPdfHtml, delayPdfHtml };

export async function inlinePdfAttachments(attachments: Attachment[]): Promise<PdfAttachment[]> {
  return Promise.all(attachments.map(async attachment => {
    try {
      const base64 = await FileSystem.readAsStringAsync(attachment.localUri, { encoding: FileSystem.EncodingType.Base64 });
      return { ...attachment, pdfUri: `data:${attachment.mimeType};base64,${base64}` };
    } catch {
      return { ...attachment, pdfUri: attachment.localUri };
    }
  }));
}

async function countPdfPages(uri: string, fallback: number): Promise<number> {
  try {
    const response = await fetch(uri); const bytes = new Uint8Array(await response.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return countPdfPageObjects(binary) || fallback;
  } catch { return fallback; }
}
export async function createPdf(html: string): Promise<{ uri: string; pageCount: number }> { const result = await Print.printToFileAsync({ html }); return { uri: result.uri, pageCount: await countPdfPages(result.uri, result.numberOfPages) }; }
export async function sharePdf(uri: string): Promise<void> { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: sk.reports.share }); }
export function reportFromPdf(ownerId: string, projectId: string, type: ReportExport['type'], uri: string, pageCount: number, sourceEntityId?: string, attachmentIds: string[] = []): ReportExport { return { id: `report_${Date.now()}`, ownerId, projectId, type, sourceEntityId, attachmentIds, locale: 'sk-SK', storagePath: uri, createdAt: new Date().toISOString(), pageCount, status: 'synced' }; }

export async function generateRemoteReport(projectId: string, type: ReportExport['type'], sourceEntityId?: string): Promise<ReportExport> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.functions.invoke('generate-report', { body: { projectId, type, sourceEntityId } });
  if (error) throw error;
  if (!data?.report?.id || !data.report.storagePath) throw new Error('INVALID_REPORT_RESPONSE');
  return data.report as ReportExport;
}

export async function uploadPrivateReport(report: ReportExport, localUri: string): Promise<ReportExport> {
  if (!supabase) return report;
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('REPORT_READ_FAILED');
  const bytes = await response.arrayBuffer();
  const storagePath = `${report.ownerId}/${report.projectId}/${Date.now()}.pdf`;
  const upload = await supabase.storage.from('reports').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw upload.error;
  const { data, error } = await supabase.from('report_exports').insert({ owner_id: report.ownerId, project_id: report.projectId, report_type: report.type, source_entity_id: report.sourceEntityId ?? null, attachment_ids: report.attachmentIds ?? [], locale: report.locale, storage_path: storagePath, page_count: report.pageCount, status: 'synced' }).select('id, created_at').single();
  if (error) throw error;
  return { ...report, id: String(data.id), storagePath, createdAt: String(data.created_at), status: 'synced' };
}

export async function shareReport(report: ReportExport): Promise<void> {
  if (supabase && report.storagePath && !report.storagePath.startsWith('file://')) {
    const { data, error } = await supabase.storage.from('reports').createSignedUrl(report.storagePath, 60 * 60);
    if (error) throw error;
    const destination = `${FileSystem.cacheDirectory}report-${report.id}.pdf`;
    const download = await FileSystem.downloadAsync(data.signedUrl, destination);
    await sharePdf(download.uri);
    return;
  }
  if (report.storagePath) await sharePdf(report.storagePath);
}
