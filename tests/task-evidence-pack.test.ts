import { describe, expect, it } from 'vitest';
import { taskEvidencePdfHtml } from '../src/domain/pdfTemplate';
import {
  canonicalManifestJson,
  taskEvidenceManifest,
} from '../src/domain/taskEvidencePack';
import type {
  Attachment,
  Project,
  ProjectChecklist,
  SiteTask,
  SiteTaskEvent,
} from '../src/domain/types';

const project: Project = {
  id: 'project-1',
  ownerId: 'owner-1',
  name: 'Rekonštrukcia <Dom>',
  location: 'Bratislava',
  status: 'active',
  createdAt: '2026-07-28T08:00:00.000Z',
  updatedAt: '2026-07-28T08:00:00.000Z',
};
const task: SiteTask = {
  id: 'task-1',
  ownerId: 'owner-1',
  projectId: project.id,
  title: 'Opraviť hydroizoláciu',
  description: 'Detail pri prestupe',
  kind: 'defect',
  status: 'review',
  priority: 'high',
  sourceChecklistId: 'check-1',
  sourceChecklistItemKey: 'details',
  syncStatus: 'synced',
  createdAt: '2026-07-28T08:10:00.000Z',
  updatedAt: '2026-07-28T09:00:00.000Z',
};
const event: SiteTaskEvent = {
  id: 'event-1',
  ownerId: 'owner-1',
  projectId: project.id,
  taskId: task.id,
  eventType: 'comment',
  body: 'Skontrolovať detail <script>alert(1)</script>',
  metadata: {},
  syncStatus: 'synced',
  createdAt: '2026-07-28T08:30:00.000Z',
};
const checklist: ProjectChecklist = {
  id: 'check-1',
  ownerId: 'owner-1',
  projectId: project.id,
  templateKey: 'waterproofing',
  templateName: 'Hydroizolácia',
  category: 'quality',
  inspectionDate: '2026-07-28',
  answers: [
    {
      itemKey: 'details',
      label: 'Detaily a prestupy',
      required: true,
      result: 'fail',
      note: 'Doplniť tesnenie.',
    },
  ],
  status: 'completed',
  confirmedAt: '2026-07-28T08:05:00.000Z',
  confirmedBy: 'owner-1',
  syncStatus: 'synced',
  createdAt: '2026-07-28T08:00:00.000Z',
  updatedAt: '2026-07-28T08:05:00.000Z',
};
const attachment: Attachment & {
  pdfUri: string;
  contentDigest: string;
} = {
  id: 'photo-1',
  ownerId: 'owner-1',
  projectId: project.id,
  relatedEntityType: 'site_task',
  relatedEntityId: task.id,
  evidenceRole: 'before',
  localUri: 'file:///photo.jpg',
  pdfUri: 'data:image/jpeg;base64,abc',
  contentDigest: 'a'.repeat(64),
  fileSize: 3,
  mimeType: 'image/jpeg',
  uploadStatus: 'synced',
  createdAt: '2026-07-28T08:12:00.000Z',
};

describe('task evidence PDF pack', () => {
  it('creates a stable canonical manifest independent of array order', () => {
    const input = {
      project,
      task,
      events: [
        { ...event, id: 'event-b', createdAt: '2026-07-28T09:00:00.000Z' },
        event,
      ],
      checklist,
      attachments: [
        { ...attachment, id: 'photo-b' },
        attachment,
      ],
      generatedAt: '2026-07-28T10:00:00.000Z',
    };
    const reversed = {
      ...input,
      events: [...input.events].reverse(),
      attachments: [...input.attachments].reverse(),
    };
    expect(canonicalManifestJson(taskEvidenceManifest(input))).toBe(
      canonicalManifestJson(taskEvidenceManifest(reversed)),
    );
  });

  it('renders traceable history, checklist, hashes and escaped user text', () => {
    const clientDecision: SiteTaskEvent = {
      ...event,
      id: 'event-client',
      eventType: 'client_decision',
      body: 'Bez výhrad.',
      metadata: { decision: 'accept', signerName: 'Peter Kováč' },
    };
    const html = taskEvidencePdfHtml({
      project,
      task,
      events: [event, clientDecision],
      attachments: [attachment],
      workers: [],
      checklist,
      generatedAt: '2026-07-28T10:00:00.000Z',
      manifestDigest: 'b'.repeat(64),
    });
    expect(html).toContain('Dôkazový balík úlohy');
    expect(html).toContain('Zdrojová kontrola');
    expect(html).toContain('História rozhodnutí a komunikácie');
    expect(html).toContain('Register fotografických dôkazov');
    expect(html).toContain('Objednávateľ prácu prevzal');
    expect(html).toContain('Peter Kováč');
    expect(html).toContain('data:image/jpeg;base64,abc');
    expect(html).toContain('a'.repeat(64));
    expect(html).toContain('b'.repeat(64));
    expect(html).toContain('&lt;Dom&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
