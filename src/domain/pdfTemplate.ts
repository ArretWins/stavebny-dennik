import type { Attachment, DelayEvent, DiaryEntry, Project } from './types';
import { formatDate, formatDateTime, formatNumber } from '../i18n/format';
import { sk } from '../i18n/translations';
import { colors } from '../theme/tokens';

export type PdfAttachment = Attachment & { pdfUri?: string };

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function evidenceHtml(entry: DiaryEntry | DelayEvent): string {
  const gps = entry.evidence.gps ? `${entry.evidence.gps.latitude.toFixed(5)}, ${entry.evidence.gps.longitude.toFixed(5)}` : '—';
  const snapshot = entry.evidence.weather;
  const temperature = snapshot?.temperatureC !== undefined ? `${formatNumber(snapshot.temperatureC)} °C` : '—';
  const precipitation = snapshot?.precipitationMm !== undefined ? `${formatNumber(snapshot.precipitationMm)} mm` : '—';
  const wind = snapshot?.windSpeedKmh !== undefined ? `${formatNumber(snapshot.windSpeedKmh)} km/h` : '—';
  return `<div class="evidence"><b>${sk.pdf.evidence}</b><br>${sk.pdf.location}: ${gps}<br>${sk.pdf.timestamp}: ${formatDateTime(entry.evidence.capturedAt)}<br>${sk.pdf.weatherSource}<br>${sk.pdf.temperature}: ${temperature}<br>${sk.pdf.precipitation}: ${precipitation}<br>${sk.pdf.wind}: ${wind}</div>`;
}

function recordMetadataHtml(entry: DiaryEntry | DelayEvent): string {
  const locked = entry.lockedAt ? `<div class="locked"><b>${sk.pdf.lockedAt}:</b> ${formatDateTime(entry.lockedAt)}</div>` : '';
  const correction = entry.correctionOfId ? `<div class="correction"><b>${sk.pdf.correction}</b></div>` : '';
  return `${locked}${correction}`;
}

function photosHtml(entityId: string, attachments: PdfAttachment[]): string {
  const photos = attachments.filter(attachment => attachment.relatedEntityId === entityId);
  if (!photos.length) return `<p class="photo-empty">${sk.evidence.noPhotos}</p>`;
  return `<div class="photos"><h4>${sk.pdf.photos}</h4>${photos.map((photo, index) => `<figure><img src="${escapeHtml(photo.pdfUri ?? photo.localUri)}" alt="${sk.pdf.photo} ${index + 1}"><figcaption>${sk.pdf.photo} ${index + 1}</figcaption></figure>`).join('')}</div>`;
}

export function diaryPdfHtml(project: Project, entries: DiaryEntry[], attachments: PdfAttachment[] = []): string {
  return baseHtml(`<h1>${sk.pdf.diaryTitle}</h1><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ''}</p>${entries.map(entry => `<section><h3>${formatDate(entry.logDate)}</h3><p>${escapeHtml(entry.workDescription)}</p><p>${sk.diary.workers}: ${formatNumber(entry.workerCount)}</p>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}${recordMetadataHtml(entry)}${evidenceHtml(entry)}${photosHtml(entry.id, attachments)}</section>`).join('')}`);
}

export function delayPdfHtml(project: Project, event: DelayEvent, reasonLabel: string, attachments: PdfAttachment[] = []): string {
  return baseHtml(`<h1>${sk.pdf.delayTitle}</h1><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ''}</p><section><b>${sk.reports.reason}:</b> ${escapeHtml(reasonLabel)}<br><b>${sk.diary.date}:</b> ${formatDateTime(event.eventDate)}${event.note ? `<p>${escapeHtml(event.note)}</p>` : ''}${recordMetadataHtml(event)}${evidenceHtml(event)}${photosHtml(event.id, attachments)}</section>`);
}

function baseHtml(content: string): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>@font-face{font-family:'Noto Sans';src:local('Noto Sans')}@page{margin:24px}*{box-sizing:border-box}body{font-family:'Noto Sans','DejaVu Sans',Arial,sans-serif;color:${colors.text};padding:20px;font-size:14px;line-height:1.45}h1{color:${colors.primaryDark};font-size:26px}h2{font-size:19px}h3{border-bottom:1px solid #ddd;padding-bottom:8px}.evidence{background:#f8f5ef;border:1px solid #e0ded9;border-radius:8px;padding:12px;margin-top:16px;font-size:12px}.locked,.correction{margin-top:8px;padding:8px;border-left:3px solid ${colors.primary};background:#eef7ec}.photos{margin-top:16px}.photos h4{margin:0 0 8px}.photos figure{margin:0 0 14px;break-inside:avoid;page-break-inside:avoid}.photos img{display:block;width:100%;max-height:320px;object-fit:contain;border:1px solid #e0ded9;border-radius:8px;background:#f8f5ef}.photos figcaption,.photo-empty{font-size:11px;color:#6b7280;margin-top:5px}section{border-top:1px solid #e0ded9;padding:12px 0;break-inside:auto}footer{border-top:1px solid #e0ded9;margin-top:24px;padding-top:10px;font-size:11px;color:#6b7280;break-inside:avoid;page-break-inside:avoid}</style></head><body>${content}<footer>${sk.pdf.generatedAt}: ${formatDateTime(new Date())}</footer></body></html>`;
}
