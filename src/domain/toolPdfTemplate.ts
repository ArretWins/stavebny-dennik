import type {
  Project,
  ProjectTool,
  ProjectToolEvent,
  ProjectWorker,
} from './types';
import { projectToolReference } from './tools';
import { formatDate, formatDateTime } from '../i18n/format';

export interface ToolPdfInput {
  project: Project;
  tools: ProjectTool[];
  workers: ProjectWorker[];
  events: ProjectToolEvent[];
  generatedAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function statusLabel(status: ProjectTool['status']): string {
  return {
    available: 'K dispozícii',
    issued: 'U pracovníka',
    maintenance: 'Mimo prevádzky',
    lost: 'Stratené',
    retired: 'Vyradené',
  }[status];
}

function eventLabel(event: ProjectToolEvent): string {
  return {
    registered: 'Registrácia',
    updated: 'Aktualizácia údajov',
    issued: 'Vydanie pracovníkovi',
    returned: 'Prevzatie späť',
    damaged: 'Poškodenie',
    lost: 'Strata',
    maintenance_completed: 'Ukončenie opravy alebo nález',
    retired: 'Vyradenie',
  }[event.eventType];
}

function workerName(workers: ProjectWorker[], workerId?: string): string {
  const worker = workers.find(item => item.id === workerId);
  return worker ? `${worker.firstName} ${worker.lastName}` : '-';
}

export function toolInventoryPdfHtml(input: ToolPdfInput): string {
  const tools = [...input.tools].sort(
    (left, right) => left.assetNumber - right.assetNumber,
  );
  const counts = {
    available: tools.filter(item => item.status === 'available').length,
    issued: tools.filter(item => item.status === 'issued').length,
    maintenance: tools.filter(item => item.status === 'maintenance').length,
    lost: tools.filter(item => item.status === 'lost').length,
    retired: tools.filter(item => item.status === 'retired').length,
  };
  const rows = tools
    .map(
      tool => `<tr>
        <td class="code">${projectToolReference(tool.assetNumber)}</td>
        <td><b>${escapeHtml(tool.name)}</b><small>${escapeHtml(tool.category)}</small></td>
        <td>${escapeHtml([tool.manufacturer, tool.model].filter(Boolean).join(' ') || '-')}<small>${tool.serialNumber ? `S/N ${escapeHtml(tool.serialNumber)}` : '-'}</small></td>
        <td><span class="status status-${tool.status}">${statusLabel(tool.status)}</span></td>
        <td>${escapeHtml(workerName(input.workers, tool.currentWorkerId))}${tool.expectedReturnDate ? `<small>Vrátiť: ${formatDate(tool.expectedReturnDate)}</small>` : ''}</td>
      </tr>`,
    )
    .join('');
  const selectedIds = new Set(tools.map(item => item.id));
  const history = [...input.events]
    .filter(event => selectedIds.has(event.toolId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 100)
    .map(event => {
      const tool = tools.find(item => item.id === event.toolId);
      return `<tr><td>${formatDateTime(event.createdAt)}</td><td class="code">${tool ? projectToolReference(tool.assetNumber) : '-'}</td><td><b>${eventLabel(event)}</b>${event.body ? `<small>${escapeHtml(event.body)}</small>` : ''}</td><td>${escapeHtml(workerName(input.workers, event.workerId))}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>
@page{size:A4;margin:15mm 12mm 18mm;@bottom-left{content:"Register náradia";color:#68747a;font-size:7.5pt}@bottom-right{content:"Strana " counter(page) " / " counter(pages);color:#68747a;font-size:7.5pt}}
*{box-sizing:border-box}body{margin:0;color:#172127;font:9pt/1.4 'Noto Sans','DejaVu Sans',Arial,sans-serif}.topline{height:5mm;background:#1f2a30;margin:0 0 8mm}.eyebrow{font:800 8pt monospace;letter-spacing:.13em;text-transform:uppercase;color:#e46f2e}h1{font-size:26pt;line-height:1.05;margin:3mm 0;color:#1f2a30}.address{color:#68747a;font-size:10pt;margin:0 0 8mm}.summary{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #cdd4d7;margin-bottom:8mm}.summary div{padding:4mm 2mm;border-right:1px solid #cdd4d7;text-align:center}.summary div:last-child{border-right:0}.summary b{display:block;font:900 18pt monospace;color:#1f2a30}.summary span{font-size:7pt;text-transform:uppercase;color:#68747a}.summary .alert b{color:#b42318}h2{font-size:14pt;color:#1f2a30;margin:8mm 0 3mm;border-bottom:2px solid #1f2a30;padding-bottom:2mm}table{width:100%;border-collapse:collapse;font-size:8pt}thead{display:table-header-group}th{background:#1f2a30;color:#fff;text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em}th,td{border:1px solid #d6dcde;padding:2.2mm;vertical-align:top}tr{break-inside:avoid}td small{display:block;color:#68747a;margin-top:1mm}.code{font-family:'DejaVu Sans Mono',monospace;font-weight:800;white-space:nowrap}.status{display:inline-block;padding:1mm 2mm;border-radius:2mm;font-size:7pt;font-weight:800}.status-available{background:#e9f4ea;color:#1b5e20}.status-issued{background:#e7f1f6;color:#245d7b}.status-maintenance{background:#fff1df;color:#9b4d00}.status-lost{background:#fde9e7;color:#a51d16}.status-retired{background:#eceff1;color:#59636a}.history{page-break-before:always}.footnote{margin-top:7mm;border-top:1px solid #cdd4d7;padding-top:3mm;color:#68747a;font-size:7.5pt}
</style></head><body><div class="topline"></div><div class="eyebrow">Stavebný denník · Kontrolný export</div><h1>Inventúra náradia a zariadení</h1><p class="address"><b>${escapeHtml(input.project.name)}</b> · ${escapeHtml(input.project.location)}${input.project.address ? `, ${escapeHtml(input.project.address)}` : ''}<br>Stav k ${formatDateTime(input.generatedAt)}</p><div class="summary"><div><b>${tools.length}</b><span>spolu</span></div><div><b>${counts.available}</b><span>voľné</span></div><div><b>${counts.issued}</b><span>vydané</span></div><div><b>${counts.maintenance}</b><span>oprava</span></div><div class="alert"><b>${counts.lost}</b><span>stratené</span></div></div><h2>Aktuálny register</h2><table><thead><tr><th>Inventár</th><th>Náradie</th><th>Identifikácia</th><th>Stav</th><th>Zodpovednosť</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Bez evidovaného náradia.</td></tr>'}</tbody></table><section class="history"><h2>Posledné pohyby a udalosti</h2><table><thead><tr><th>Čas</th><th>Inventár</th><th>Udalosť</th><th>Pracovník</th></tr></thead><tbody>${history || '<tr><td colspan="4">Bez zaznamenaných udalostí.</td></tr>'}</tbody></table></section><p class="footnote">Dokument zachytáva stav evidovaný v aplikácii v čase exportu. Sériové čísla a zodpovednosť treba pri fyzickej inventúre porovnať so skutočným stavom na objekte.</p></body></html>`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

export function toolLabelsPdfHtml(
  input: ToolPdfInput & { qrSvgByToolId: Record<string, string> },
): string {
  const pages = chunks(
    [...input.tools].sort((left, right) => left.assetNumber - right.assetNumber),
    8,
  );
  const pageHtml = pages
    .map(
      (page, pageIndex) => `${pageIndex ? '<div class="page-break"></div>' : ''}<section class="sheet">${page
        .map(tool => `<article class="label"><div class="cut">✂</div><div class="label-main"><div class="brand">STAVEBNÝ DENNÍK</div><div class="asset-code">${projectToolReference(tool.assetNumber)}</div><h2>${escapeHtml(tool.name)}</h2><p>${escapeHtml(tool.category)}</p><div class="identity">${tool.manufacturer ? escapeHtml(tool.manufacturer) : ''}${tool.model ? ` · ${escapeHtml(tool.model)}` : ''}${tool.serialNumber ? `<br>S/N ${escapeHtml(tool.serialNumber)}` : ''}</div><div class="project">${escapeHtml(input.project.name)}</div></div><div class="qr">${input.qrSvgByToolId[tool.id] ?? ''}<span>Naskenujte kartu</span></div></article>`)
        .join('')}</section>`,
    )
    .join('');
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>
@page{size:A4;margin:7mm}*{box-sizing:border-box}body{margin:0;font-family:'Noto Sans','DejaVu Sans',Arial,sans-serif;color:#1f2a30}.page-break{display:block;height:0;clear:both;break-before:page;page-break-before:always}.sheet{width:196mm;display:grid;grid-template-columns:repeat(2,96mm);grid-auto-rows:67.5mm;gap:4mm;break-inside:avoid;page-break-inside:avoid}.label{position:relative;border:1px dashed #6d7b83;border-radius:2.5mm;display:grid;grid-template-columns:1fr 36mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.label-main{padding:5mm 3mm 4mm 5mm;border-left:4mm solid #e46f2e}.brand{font:800 6.5pt monospace;letter-spacing:.12em;color:#6d7b83}.asset-code{display:inline-block;background:#1f2a30;color:#fff;font:900 13pt monospace;padding:1.5mm 2mm;border-radius:1.5mm;margin:2mm 0}h2{font-size:12pt;line-height:1.08;margin:0 0 1mm;max-height:13mm;overflow:hidden}.label p{font-size:7.5pt;margin:0;color:#536169}.identity{font:7pt/1.3 monospace;margin-top:2mm;color:#37434a}.project{position:absolute;bottom:4mm;left:9mm;max-width:48mm;font-size:7pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.qr{border-left:1px solid #d4dade;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5mm;padding:3mm}.qr svg{display:block;width:29mm;height:29mm}.qr span{font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;color:#6d7b83;text-align:center}.cut{position:absolute;top:1mm;right:1.5mm;color:#9aa5aa;font-size:7pt}
</style></head><body>${pageHtml}</body></html>`;
}
