import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { taskEvidencePdfHtml } from '../src/domain/pdfTemplate';
import type {
  Project,
  ProjectChecklist,
  ProjectWorker,
  SiteTask,
  SiteTaskEvent,
} from '../src/domain/types';

const project: Project = {
  id: 'sample-project',
  ownerId: 'sample-owner',
  name: 'Rekonštrukcia rodinného domu',
  location: 'Bratislava',
  address: 'Záhradná 24',
  status: 'active',
  createdAt: '2026-07-20T07:00:00.000Z',
  updatedAt: '2026-07-28T09:30:00.000Z',
};
const worker: ProjectWorker = {
  id: 'sample-worker',
  ownerId: project.ownerId,
  projectId: project.id,
  firstName: 'Ján',
  lastName: 'Novák',
  position: 'Izolatér',
  status: 'active',
  createdAt: '2026-07-20T07:00:00.000Z',
  updatedAt: '2026-07-20T07:00:00.000Z',
};
const task: SiteTask = {
  id: 'task_hydro_detail_001',
  ownerId: project.ownerId,
  projectId: project.id,
  title: 'Opraviť detail hydroizolácie pri prestupe',
  description:
    'Doplniť tesnenie a ochrannú vrstvu podľa technologického postupu.',
  kind: 'defect',
  status: 'done',
  priority: 'high',
  assignedWorkerId: worker.id,
  dueDate: '2026-07-29',
  sourceChecklistId: 'check_waterproof_001',
  sourceChecklistItemKey: 'details',
  syncStatus: 'synced',
  createdAt: '2026-07-28T07:45:00.000Z',
  updatedAt: '2026-07-28T09:30:00.000Z',
};
const events: SiteTaskEvent[] = [
  {
    id: 'event_created',
    ownerId: project.ownerId,
    projectId: project.id,
    taskId: task.id,
    actorUserId: project.ownerId,
    eventType: 'created',
    metadata: {},
    syncStatus: 'synced',
    createdAt: '2026-07-28T07:45:00.000Z',
  },
  {
    id: 'event_assigned',
    ownerId: project.ownerId,
    projectId: project.id,
    taskId: task.id,
    actorUserId: project.ownerId,
    eventType: 'assignment_changed',
    metadata: { to: worker.id },
    syncStatus: 'synced',
    createdAt: '2026-07-28T07:48:00.000Z',
  },
  {
    id: 'event_comment_foreman',
    ownerId: project.ownerId,
    projectId: project.id,
    taskId: task.id,
    actorUserId: project.ownerId,
    eventType: 'comment',
    body: 'Prosím doplniť tesnenie po celom obvode prestupu.',
    metadata: {},
    syncStatus: 'synced',
    createdAt: '2026-07-28T08:00:00.000Z',
  },
  {
    id: 'event_comment_worker',
    ownerId: project.ownerId,
    projectId: project.id,
    taskId: task.id,
    actorWorkerId: worker.id,
    eventType: 'comment',
    body: 'Tesnenie je doplnené, prikladám fotografiu po oprave.',
    metadata: {},
    syncStatus: 'synced',
    createdAt: '2026-07-28T09:25:00.000Z',
  },
  {
    id: 'event_review',
    ownerId: project.ownerId,
    projectId: project.id,
    taskId: task.id,
    actorWorkerId: worker.id,
    eventType: 'status_changed',
    metadata: { from: 'in_progress', to: 'review' },
    syncStatus: 'synced',
    createdAt: '2026-07-28T09:30:00.000Z',
  },
  {
    id: 'event_client_acceptance',
    ownerId: project.ownerId,
    projectId: project.id,
    taskId: task.id,
    eventType: 'client_decision',
    body: 'Detail bol skontrolovaný na mieste.',
    metadata: {
      decision: 'accept',
      signerName: 'Peter Kováč',
      taskRevision: 0,
    },
    syncStatus: 'synced',
    createdAt: '2026-07-28T09:45:00.000Z',
  },
];
const checklist: ProjectChecklist = {
  id: 'check_waterproof_001',
  ownerId: project.ownerId,
  projectId: project.id,
  templateKey: 'waterproofing',
  templateName: 'Hydroizolácia',
  category: 'quality',
  inspectionDate: '2026-07-28',
  answers: [
    { itemKey: 'substrate', label: 'Podklad je čistý a suchý.', required: true, result: 'pass' },
    { itemKey: 'primer', label: 'Príprava podkladu je vykonaná.', required: true, result: 'pass' },
    { itemKey: 'overlaps', label: 'Presahy majú požadovanú šírku.', required: true, result: 'pass' },
    { itemKey: 'details', label: 'Rohy a prestupy sú utesnené.', required: true, result: 'fail', note: 'Chýba tesnenie pri severnom prestupe.' },
    { itemKey: 'protection', label: 'Vrstva je chránená pred poškodením.', required: true, result: 'pass' },
  ],
  status: 'completed',
  confirmedAt: '2026-07-28T07:40:00.000Z',
  confirmedBy: project.ownerId,
  syncStatus: 'synced',
  createdAt: '2026-07-28T07:30:00.000Z',
  updatedAt: '2026-07-28T07:40:00.000Z',
};

function samplePhoto(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#172016"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><rect x="170" y="170" width="860" height="460" rx="40" fill="none" stroke="#fff" stroke-width="18" opacity=".75"/><text x="600" y="420" text-anchor="middle" fill="#fff" font-family="Arial" font-size="72" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const html = taskEvidencePdfHtml({
  project,
  task,
  events,
  workers: [worker],
  checklist,
  generatedAt: '2026-07-28T10:00:00.000Z',
  manifestDigest:
    'd433b94b1f6dc8e64689385f526a433315a2021c85f7bb88994b4a5f8f77d912',
  attachments: [
    {
      id: 'photo_before_001',
      ownerId: project.ownerId,
      projectId: project.id,
      relatedEntityType: 'site_task',
      relatedEntityId: task.id,
      evidenceRole: 'before',
      localUri: '',
      pdfUri: samplePhoto('FOTO PRED OPRAVOU', '#9a5a00'),
      contentDigest:
        '2b5f722f5d5a20fcedbf1c9f7bf90fc67ddc3f895071cbb7f671a68f44e5d143',
      fileSize: 284112,
      mimeType: 'image/jpeg',
      uploadStatus: 'synced',
      createdAt: '2026-07-28T07:42:00.000Z',
    },
    {
      id: 'photo_after_001',
      ownerId: project.ownerId,
      projectId: project.id,
      relatedEntityType: 'site_task',
      relatedEntityId: task.id,
      evidenceRole: 'after',
      localUri: '',
      pdfUri: samplePhoto('FOTO PO OPRAVE', '#2e7d32'),
      contentDigest:
        '948ea451d7366191fb144b29ab2c5f5c77b48864b11d5552f45fce633e59e02a',
      fileSize: 301455,
      mimeType: 'image/jpeg',
      uploadStatus: 'synced',
      createdAt: '2026-07-28T09:22:00.000Z',
    },
  ],
});

const outputDirectory = resolve('output/pdf');
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  resolve(outputDirectory, 'task-evidence-sample.html'),
  html,
  'utf8',
);
