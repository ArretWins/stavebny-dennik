import { describe, expect, it } from 'vitest';
import { diaryPdfHtml, delayPdfHtml } from '../src/domain/pdfTemplate';
import { countPdfPageObjects } from '../src/domain/pdfBinary';
import type { Attachment, DelayEvent, DiaryEntry, Project } from '../src/domain/types';

const project: Project = { id: 'p1', ownerId: 'u1', name: 'Stavba Žilina', location: 'Žilina', status: 'active', createdAt: '2026-07-13T10:00:00.000Z', updatedAt: '2026-07-13T10:00:00.000Z' };
const evidence = { capturedAt: '2026-07-13T10:05:00.000Z', attachmentIds: ['a1'], gps: { latitude: 49.2231, longitude: 18.7394, capturedAt: '2026-07-13T10:05:00.000Z', status: 'captured' as const }, weather: { provider: 'open-meteo' as const, requestUrl: 'https://api.open-meteo.test', latitude: 49.2231, longitude: 18.7394, capturedAt: '2026-07-13T10:05:00.000Z', rawJson: {}, temperatureC: 18.5, precipitationMm: 1.2, windSpeedKmh: 14, status: 'saved' as const } };
const attachment: Attachment & { pdfUri: string } = { id: 'a1', ownerId: 'u1', projectId: 'p1', relatedEntityType: 'diary_entry', relatedEntityId: 'e1', localUri: 'file:///photo.jpg', pdfUri: 'data:image/jpeg;base64,abc', fileSize: 3, mimeType: 'image/jpeg', createdAt: '2026-07-13T10:05:00.000Z', uploadStatus: 'pending' };

describe('PDF templates', () => {
  it('counts page objects without counting the Pages tree', () => { expect(countPdfPageObjects('/Type /Pages /Count 2 /Type /Page /Type  /Page')).toBe(2); });

  it('renders stored evidence, lock metadata, Slovak text, and inline photos in diary exports', () => {
    const entry: DiaryEntry = { id: 'e1', ownerId: 'u1', projectId: 'p1', logDate: '2026-07-13', workDescription: 'Montáž zábradlia', workerCount: 3, evidence, lockedAt: '2026-07-13T11:00:00.000Z', lockedBy: 'u1', syncStatus: 'pending', createdAt: '2026-07-13T10:05:00.000Z', updatedAt: '2026-07-13T10:05:00.000Z' };
    const html = diaryPdfHtml(project, [entry], [attachment]);
    expect(html).toContain('Montáž zábradlia');
    expect(html).toContain('Open-Meteo');
    expect(html).toContain('1,2 mm');
    expect(html).toContain('data:image/jpeg;base64,abc');
    expect(html).toContain('Uzamknuté');
  });

  it('renders delay correction metadata and a linked photo', () => {
    const event: DelayEvent = { id: 'e1', ownerId: 'u1', projectId: 'p1', eventDate: '2026-07-13T10:05:00.000Z', reason: 'bad_weather', correctionOfId: 'old-delay', evidence, syncStatus: 'pending', createdAt: '2026-07-13T10:05:00.000Z', updatedAt: '2026-07-13T10:05:00.000Z' };
    const html = delayPdfHtml(project, event, 'Zlé počasie', [{ ...attachment, relatedEntityType: 'delay_event' }]);
    expect(html).toContain('Zlé počasie');
    expect(html).toContain('Oprava pôvodného záznamu');
    expect(html).toContain('data:image/jpeg;base64,abc');
  });
});
