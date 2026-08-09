import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import type {
  Project,
  ProjectTool,
  ProjectToolEvent,
  ProjectWorker,
} from '../src/domain/types';
import {
  toolInventoryPdfHtml,
  toolLabelsPdfHtml,
} from '../src/domain/toolPdfTemplate';

const project: Project = {
  id: '33333333-3333-4333-8333-333333333333',
  ownerId: '11111111-1111-4111-8111-111111111111',
  name: 'Rezidencia Javor',
  location: 'Bratislava - Ružinov',
  address: 'Javorová 18',
  status: 'active',
  createdAt: '2026-07-01T07:00:00.000Z',
  updatedAt: '2026-08-01T07:00:00.000Z',
};
const workers: ProjectWorker[] = [
  ['44444444-4444-4444-8444-444444444441', 'Marek', 'Kováč', 'Tesár'],
  ['44444444-4444-4444-8444-444444444442', 'Peter', 'Horváth', 'Elektrikár'],
  ['44444444-4444-4444-8444-444444444443', 'Ján', 'Novák', 'Majster'],
].map(([id, firstName, lastName, position]) => ({
  id,
  ownerId: project.ownerId,
  projectId: project.id,
  firstName,
  lastName,
  position,
  status: 'active',
  createdAt: '2026-07-01T07:00:00.000Z',
  updatedAt: '2026-08-01T07:00:00.000Z',
}));
const names = [
  ['Aku vŕtačka DHP486', 'Elektrické náradie', 'Makita', 'DHP486'],
  ['Laserový nivelák GLL 3-80', 'Meracia technika', 'Bosch', 'GLL 3-80'],
  ['Búracie kladivo HM1214C', 'Elektrické náradie', 'Makita', 'HM1214C'],
  ['Kotúčová píla DHS680', 'Elektrické náradie', 'Makita', 'DHS680'],
  ['Priemyselný vysávač', 'Stroje a zariadenia', 'Kärcher', 'NT 30/1'],
  ['Rotačný laser', 'Meracia technika', 'Hilti', 'PR 30-HVS'],
  ['Rezačka dlažby', 'Ručné náradie', 'Rubi', 'TX-1250'],
  ['Predlžovací kábel 40 m', 'Elektrické náradie', 'Brennenstuhl', 'Garant'],
  ['Postroj proti pádu', 'Bezpečnostná výbava', 'Petzl', 'Newton Easyfit'],
  ['Miešadlo malty', 'Elektrické náradie', 'Collomix', 'Xo 4 R'],
  ['Kompresor', 'Stroje a zariadenia', 'Metabo', 'Basic 250-24 W'],
  ['Detektor vedení', 'Meracia technika', 'Bosch', 'D-tect 120'],
] as const;
const statuses: ProjectTool['status'][] = [
  'issued', 'available', 'maintenance', 'issued', 'available', 'issued',
  'available', 'available', 'issued', 'maintenance', 'lost', 'available',
];
const tools: ProjectTool[] = names.map((item, index) => {
  const status = statuses[index];
  const worker = status === 'issued' ? workers[index % workers.length] : undefined;
  return {
    id: `tool-sample-${index + 1}`,
    ownerId: project.ownerId,
    projectId: project.id,
    assetNumber: index + 1,
    name: item[0],
    category: item[1],
    manufacturer: item[2],
    model: item[3],
    serialNumber: `RJ-${String(index + 1).padStart(4, '0')}`,
    status,
    currentWorkerId: worker?.id,
    issuedAt: worker ? '2026-07-30T07:30:00.000Z' : undefined,
    expectedReturnDate: worker ? `2026-08-${String(4 + index).padStart(2, '0')}` : undefined,
    syncStatus: 'synced',
    createdAt: '2026-07-01T07:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  };
});
const events: ProjectToolEvent[] = tools.flatMap((tool, index) => {
  const registered: ProjectToolEvent = {
    id: `event-register-${index}`,
    ownerId: project.ownerId,
    projectId: project.id,
    toolId: tool.id,
    eventType: 'registered',
    metadata: {},
    createdAt: '2026-07-01T07:00:00.000Z',
  };
  if (tool.status !== 'issued') return [registered];
  return [registered, {
    ...registered,
    id: `event-issue-${index}`,
    eventType: 'issued',
    workerId: tool.currentWorkerId,
    body: index % 2 ? 'Montáž elektroinštalácie' : 'Montáž krovu',
    createdAt: '2026-07-30T07:30:00.000Z',
  }];
});

async function main(): Promise<void> {
  await mkdir(resolve('tmp/pdfs'), { recursive: true });
  await mkdir(resolve('output/pdf'), { recursive: true });
  const generatedAt = '2026-08-01T12:00:00.000Z';
  await writeFile(
    resolve('tmp/pdfs/tool-inventory-sample.html'),
    toolInventoryPdfHtml({ project, tools, workers, events, generatedAt }),
    'utf8',
  );
  const pairs = await Promise.all(
    tools.map(async tool => [
      tool.id,
      await QRCode.toString(
        `stavebnydennik://tools/${encodeURIComponent(tool.id)}`,
        {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 0,
          color: { dark: '#1F2A30', light: '#FFFFFF' },
        },
      ),
    ] as const),
  );
  await writeFile(
    resolve('tmp/pdfs/tool-labels-sample.html'),
    toolLabelsPdfHtml({
      project,
      tools,
      workers,
      events,
      generatedAt,
      qrSvgByToolId: Object.fromEntries(pairs),
    }),
    'utf8',
  );
}

void main();
