import { describe, expect, it } from 'vitest';
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
  id: 'project-1', ownerId: 'owner-1', name: 'Rezidencia <Javor>',
  location: 'Bratislava', status: 'active',
  createdAt: '2026-08-01T07:00:00.000Z', updatedAt: '2026-08-01T07:00:00.000Z',
};
const worker: ProjectWorker = {
  id: 'worker-1', ownerId: 'owner-1', projectId: project.id,
  firstName: 'Ján', lastName: 'Novák', position: 'Tesár', status: 'active',
  createdAt: '2026-08-01T07:00:00.000Z', updatedAt: '2026-08-01T07:00:00.000Z',
};
function tool(index: number): ProjectTool {
  return {
    id: `tool-${index}`, ownerId: 'owner-1', projectId: project.id,
    assetNumber: index, name: `Vŕtačka ${index}`, category: 'Elektrické náradie',
    manufacturer: 'Makita', model: 'DHP486', serialNumber: `SER-${index}`,
    status: index === 1 ? 'issued' : 'available',
    currentWorkerId: index === 1 ? worker.id : undefined,
    issuedAt: index === 1 ? '2026-08-01T08:00:00.000Z' : undefined,
    expectedReturnDate: index === 1 ? '2026-08-05' : undefined,
    syncStatus: 'synced', createdAt: '2026-08-01T07:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
  };
}
const event: ProjectToolEvent = {
  id: 'event-1', ownerId: 'owner-1', projectId: project.id,
  toolId: 'tool-1', eventType: 'issued', workerId: worker.id,
  body: 'Montáž strechy', metadata: {}, createdAt: '2026-08-01T08:00:00.000Z',
};

describe('tool PDF templates', () => {
  it('renders an escaped inventory register with custody and history', () => {
    const html = toolInventoryPdfHtml({
      project,
      tools: [tool(1), tool(2)],
      workers: [worker],
      events: [event],
      generatedAt: '2026-08-01T12:00:00.000Z',
    });
    expect(html).toContain('Inventúra náradia a zariadení');
    expect(html).toContain('Rezidencia &lt;Javor&gt;');
    expect(html).toContain('TL-0001');
    expect(html).toContain('Ján Novák');
    expect(html).toContain('Montáž strechy');
    expect(html).toContain('counter(pages)');
  });

  it('paginates QR labels eight per A4 sheet without rasterizing the code', () => {
    const tools = Array.from({ length: 9 }, (_, index) => tool(index + 1));
    const qrSvgByToolId = Object.fromEntries(
      tools.map(item => [item.id, '<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>']),
    );
    const html = toolLabelsPdfHtml({
      project,
      tools,
      workers: [worker],
      events: [],
      generatedAt: '2026-08-01T12:00:00.000Z',
      qrSvgByToolId,
    });
    expect((html.match(/<section class="sheet/g) ?? []).length).toBe(2);
    expect((html.match(/<article class="label">/g) ?? []).length).toBe(9);
    expect((html.match(/<svg viewBox=/g) ?? []).length).toBe(9);
    expect(html).toContain('grid-auto-rows:67.5mm');
    expect((html.match(/<div class="page-break"><\/div>/g) ?? []).length).toBe(1);
  });
});
