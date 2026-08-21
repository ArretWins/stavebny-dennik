import type {
  Attachment,
  DelayEvent,
  DayClosureRecord,
  DiaryApprovalRequest,
  DiaryEntry,
  Project,
  ProjectChecklist,
  ProjectWorker,
  SiteTask,
  SiteTaskEvent,
  WeeklyReport,
} from "./types";
import { formatDate, formatDateTime, formatNumber } from "../i18n/format";
import { sk } from "../i18n/translations";
import { colors } from "../theme/tokens";

export type PdfAttachment = Attachment & {
  pdfUri?: string;
  contentDigest?: string;
  integrityStatus?: "verified" | "mismatch" | "unrecorded" | "unavailable";
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evidenceHtml(entry: DiaryEntry | DelayEvent): string {
  const gps = entry.evidence.gps
    ? `${entry.evidence.gps.latitude.toFixed(5)}, ${entry.evidence.gps.longitude.toFixed(5)}`
    : "—";
  const snapshot = entry.evidence.weather;
  const temperature =
    snapshot?.temperatureC !== undefined
      ? `${formatNumber(snapshot.temperatureC)} °C`
      : "—";
  const precipitation =
    snapshot?.precipitationMm !== undefined
      ? `${formatNumber(snapshot.precipitationMm)} mm`
      : "—";
  const wind =
    snapshot?.windSpeedKmh !== undefined
      ? `${formatNumber(snapshot.windSpeedKmh)} km/h`
      : "—";
  return `<div class="evidence"><b>${sk.pdf.evidence}</b><br>${sk.pdf.location}: ${gps}<br>${sk.pdf.timestamp}: ${formatDateTime(entry.evidence.capturedAt)}<br>${sk.pdf.weatherSource}<br>${sk.pdf.temperature}: ${temperature}<br>${sk.pdf.precipitation}: ${precipitation}<br>${sk.pdf.wind}: ${wind}</div>`;
}

function recordMetadataHtml(entry: DiaryEntry | DelayEvent): string {
  const locked = entry.lockedAt
    ? `<div class="locked"><b>${sk.pdf.lockedAt}:</b> ${formatDateTime(entry.lockedAt)}</div>`
    : "";
  const correction = entry.correctionOfId
    ? `<div class="correction"><b>${sk.pdf.correction}</b></div>`
    : "";
  return `${locked}${correction}`;
}

function photosHtml(entityId: string, attachments: PdfAttachment[]): string {
  const photos = attachments.filter(
    (attachment) => attachment.relatedEntityId === entityId,
  );
  if (!photos.length)
    return `<p class="photo-empty">${sk.evidence.noPhotos}</p>`;
  return `<div class="photos"><h4>${sk.pdf.photos}</h4>${photos.map((photo, index) => `<figure><img src="${escapeHtml(photo.pdfUri ?? photo.localUri)}" alt="${sk.pdf.photo} ${index + 1}"><figcaption><b>${sk.pdf.photo} ${index + 1}</b> · ${formatDateTime(photo.capturedAt ?? photo.createdAt)}${photo.captureSource ? `<br>Zdroj: ${escapeHtml(photo.captureSource)}` : ""}${photo.latitude !== undefined && photo.longitude !== undefined ? `<br>GPS: ${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}` : ""}${photo.contentDigest ? `<br>SHA-256 uloženého súboru: <span class="digest">${escapeHtml(photo.contentDigest)}</span>` : ""}<br>Kontrola integrity: ${photo.integrityStatus === "verified" ? "overená pri exporte" : photo.integrityStatus === "mismatch" ? "NEZHODA" : "nedostupná pre starší záznam"}</figcaption></figure>`).join("")}</div>`;
}

function legalDiaryHtml(entry: DiaryEntry): string {
  const time =
    entry.workStartTime && entry.workEndTime
      ? `<div class="legal-line"><b>${sk.diaryLegal.workingTime}:</b> ${escapeHtml(entry.workStartTime)}–${escapeHtml(entry.workEndTime)}</div>`
      : "";
  const roles = entry.workforceRoles?.length
    ? `<div class="legal-block"><b>${sk.diaryLegal.workforceTitle}</b><ul>${entry.workforceRoles
        .map(
          (item) =>
            `<li>${escapeHtml(item.role)}: ${formatNumber(item.count)}</li>`,
        )
        .join("")}</ul></div>`
    : "";
  const records = entry.technicalRecords?.length
    ? `<div class="legal-block"><b>${sk.diaryLegal.recordsTitle}</b>${entry.technicalRecords
        .map(
          (item) =>
            `<div class="technical-record"><span>${escapeHtml(sk.diaryLegal.category[item.category])}</span><br>${escapeHtml(item.description)}${item.reference ? `<br><small>${escapeHtml(item.reference)}</small>` : ""}</div>`,
        )
        .join("")}</div>`
    : "";
  return time || roles || records
    ? `<div class="legal-evidence">${time}${roles}${records}</div>`
    : "";
}

export function diaryPdfHtml(
  project: Project,
  entries: DiaryEntry[],
  attachments: PdfAttachment[] = [],
  approvalEvidence?: {
    requests: DiaryApprovalRequest[];
    closures: DayClosureRecord[];
  },
): string {
  const approvalHtml = approvalEvidence?.requests.length
    ? `<section class="approvals"><h2>Schv\u00e1lenia uzavret\u00fdch dn\u00ed</h2><p class="approval-notice">Rozhodnutia s\u00fa auditn\u00e9 z\u00e1znamy aplik\u00e1cie, nie kvalifikovan\u00e9 elektronick\u00e9 podpisy.</p>${approvalEvidence.requests
        .map((request) => {
          const closure = approvalEvidence.closures.find(
            (item) => item.id === request.closureId,
          );
          const expired =
            request.status === "pending" &&
            new Date(request.expiresAt).getTime() <= Date.now();
          const status = expired
            ? "Platnos\u0165 vypr\u0161ala"
            : {
                pending: "\u010cak\u00e1 na rozhodnutie",
                approved: "Schv\u00e1len\u00e9",
                changes_requested: "Vy\u017eaduj\u00fa sa zmeny",
                revoked: "Zru\u0161en\u00e9",
              }[request.status];
          const role = {
            technical_supervisor: "Stavebn\u00fd dozor",
            investor: "Investor",
            designer: "Projektant",
            contractor: "Zhotovite\u013e",
            other: "In\u00e1 osoba",
          }[request.reviewerRole];
          return `<div class="approval"><b>${closure ? formatDate(closure.logDate) : escapeHtml(request.closureId)}${closure ? ` \u00b7 verzia ${closure.version}` : ""}</b><br>${escapeHtml(request.recipientName)} \u00b7 ${role}<br>Stav: ${status}${request.decidedAt ? ` \u00b7 ${formatDateTime(request.decidedAt)}` : ""} \u00b7 otvorenia: ${request.viewCount}${request.decisionComment ? `<p>Pripomienka: ${escapeHtml(request.decisionComment)}</p>` : ""}<div class="digest">SHA-256: ${escapeHtml(request.closureHash)}</div></div>`;
        })
        .join("")}</section>`
    : "";
  return baseHtml(
    `<h1>${sk.pdf.diaryTitle}</h1><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ""}</p>${entries.map((entry) => `<section><h3>${formatDate(entry.logDate)}</h3><p>${escapeHtml(entry.workDescription)}</p><p>${sk.diary.workers}: ${formatNumber(entry.workerCount)}</p>${legalDiaryHtml(entry)}${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}${recordMetadataHtml(entry)}${evidenceHtml(entry)}${photosHtml(entry.id, attachments)}</section>`).join("")}${approvalHtml}`,
  );
}

export function delayPdfHtml(
  project: Project,
  event: DelayEvent,
  reasonLabel: string,
  attachments: PdfAttachment[] = [],
): string {
  return baseHtml(
    `<h1>${sk.pdf.delayTitle}</h1><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ""}</p><section><b>${sk.reports.reason}:</b> ${escapeHtml(reasonLabel)}<br><b>${sk.diary.date}:</b> ${formatDateTime(event.eventDate)}${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}${recordMetadataHtml(event)}${evidenceHtml(event)}${photosHtml(event.id, attachments)}</section>`,
  );
}

function baseHtml(content: string): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>@font-face{font-family:'Noto Sans';src:local('Noto Sans')}@page{margin:24px}*{box-sizing:border-box}body{font-family:'Noto Sans','DejaVu Sans',Arial,sans-serif;color:${colors.text};padding:20px;font-size:14px;line-height:1.45}h1{color:${colors.primaryDark};font-size:26px}h2{font-size:19px}h3{border-bottom:1px solid #ddd;padding-bottom:8px}.digest{font-family:'DejaVu Sans Mono',monospace;font-size:9px;overflow-wrap:anywhere;word-break:break-all}.evidence{background:#f8f5ef;border:1px solid #e0ded9;border-radius:8px;padding:12px;margin-top:16px;font-size:12px}.legal-evidence{border:1px solid #9cb5a8;background:#f7fbf7;padding:12px;margin:12px 0}.legal-line{font-family:'DejaVu Sans Mono',monospace}.legal-block{margin-top:8px}.legal-block ul{margin:5px 0}.technical-record{border-left:3px solid ${colors.primary};padding:6px 8px;margin-top:6px;background:#fff}.technical-record span{font-size:11px;font-weight:bold;color:${colors.primaryDark}}.technical-record small{color:#6b7280}.locked,.correction{margin-top:8px;padding:8px;border-left:3px solid ${colors.primary};background:#eef7ec}.photos{margin-top:16px}.photos h4{margin:0 0 8px}.photos figure{margin:0 0 14px;break-inside:avoid;page-break-inside:avoid}.photos img{display:block;width:100%;max-height:320px;object-fit:contain;border:1px solid #e0ded9;border-radius:8px;background:#f8f5ef}.photos figcaption,.photo-empty{font-size:11px;color:#6b7280;margin-top:5px}section{border-top:1px solid #e0ded9;padding:12px 0;break-inside:auto}footer{border-top:1px solid #e0ded9;margin-top:24px;padding-top:10px;font-size:11px;color:#6b7280;break-inside:avoid;page-break-inside:avoid}</style></head><body>${content}<footer>${sk.pdf.generatedAt}: ${formatDateTime(new Date())}</footer></body></html>`;
}

export interface TaskEvidencePdfInput {
  project: Project;
  task: SiteTask;
  events: SiteTaskEvent[];
  attachments: PdfAttachment[];
  workers: ProjectWorker[];
  checklist?: ProjectChecklist;
  generatedAt: string;
  manifestDigest: string;
}

function taskStatusLabel(status: SiteTask["status"]): string {
  const labels: Record<SiteTask["status"], string> = {
    open: "Otvorená",
    in_progress: "Rieši sa",
    blocked: "Blokovaná",
    review: "Na kontrolu",
    done: "Hotová",
  };
  return labels[status];
}

function taskEventLabel(event: SiteTaskEvent): string {
  if (event.eventType === "client_decision")
    return event.metadata.decision === "accept"
      ? "Objednávateľ prácu prevzal"
      : "Objednávateľ vrátil prácu na úpravu";
  if (event.eventType === "created") return "Úloha vytvorená";
  if (event.eventType === "updated") return "Podmienky úlohy zmenené";
  if (event.eventType === "assignment_changed") return "Zmena priradenia";
  if (event.eventType === "comment") return "Komentár";
  const from = String(event.metadata.from ?? "open") as SiteTask["status"];
  const to = String(event.metadata.to ?? "open") as SiteTask["status"];
  return `Zmena stavu: ${taskStatusLabel(from)} -> ${taskStatusLabel(to)}`;
}

function taskPhotosHtml(
  attachments: PdfAttachment[],
  role: NonNullable<Attachment["evidenceRole"]>,
  title: string,
): string {
  const photos = attachments.filter((item) => item.evidenceRole === role);
  if (!photos.length) return "";
  return `<section class="photo-section"><h2>${title}</h2>${photos
    .map(
      (photo, index) =>
        `<figure><img src="${escapeHtml(photo.pdfUri ?? photo.localUri)}" alt="${escapeHtml(title)} ${index + 1}"><figcaption><b>${escapeHtml(title)} ${index + 1}</b><br>ID: ${escapeHtml(photo.id)} · ${formatDateTime(photo.capturedAt ?? photo.createdAt)}${photo.captureSource ? `<br>Zdroj: ${escapeHtml(photo.captureSource)}` : ""}${photo.latitude !== undefined && photo.longitude !== undefined ? `<br>GPS: ${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}` : ""}${photo.contentDigest ? `<br>SHA-256: <span class="digest">${escapeHtml(photo.contentDigest)}</span>` : ""}<br>Integrita: ${photo.integrityStatus === "verified" ? "overená pri exporte" : photo.integrityStatus === "mismatch" ? "NEZHODA" : "nedostupná"}</figcaption></figure>`,
    )
    .join("")}</section>`;
}

export function taskEvidencePdfHtml(input: TaskEvidencePdfInput): string {
  const {
    project,
    task,
    events,
    attachments,
    workers,
    checklist,
    generatedAt,
    manifestDigest,
  } = input;
  const assignee = workers.find(
    (worker) => worker.id === task.assignedWorkerId,
  );
  const orderedEvents = [...events].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
  const timeline = orderedEvents.length
    ? orderedEvents
        .map((event) => {
          const actor = workers.find(
            (worker) => worker.id === event.actorWorkerId,
          );
          const actorName = actor
            ? `${actor.firstName} ${actor.lastName} (${actor.position})`
            : event.eventType === "client_decision"
              ? String(event.metadata.signerName ?? "Objednávateľ")
              : event.actorUserId
                ? "Majster"
                : "Systém";
          return `<div class="event"><div class="event-dot"></div><div><div class="event-head"><b>${escapeHtml(taskEventLabel(event))}</b><time>${formatDateTime(event.createdAt)}</time></div><div class="actor">${escapeHtml(actorName)}</div>${event.body ? `<p>${escapeHtml(event.body)}</p>` : ""}<div class="record-id">ID udalosti: ${escapeHtml(event.id)}</div></div></div>`;
        })
        .join("")
    : '<p class="muted">Bez udalostí.</p>';
  const checklistHtml = checklist
    ? `<section><h2>Zdrojová kontrola</h2><div class="fact-grid"><div><span>Šablóna</span><b>${escapeHtml(checklist.templateName)}</b></div><div><span>Dátum kontroly</span><b>${escapeHtml(checklist.inspectionDate)}</b></div><div><span>Stav</span><b>${checklist.status === "completed" ? "Potvrdená" : "Rozpracovaná"}</b></div><div><span>Potvrdené</span><b>${checklist.confirmedAt ? formatDateTime(checklist.confirmedAt) : "-"}</b></div></div><table><thead><tr><th>Kontrolný bod</th><th>Výsledok</th><th>Poznámka</th></tr></thead><tbody>${checklist.answers
        .map(
          (answer) =>
            `<tr><td>${escapeHtml(answer.label)}</td><td class="${answer.result === "fail" ? "fail" : "pass"}">${answer.result === "pass" ? "Vyhovuje" : answer.result === "fail" ? "Nevyhovuje" : answer.result === "na" ? "N/A" : "Čaká"}</td><td>${answer.note ? escapeHtml(answer.note) : "-"}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><div class="record-id">ID kontroly: ${escapeHtml(checklist.id)}</div></section>`
    : "";
  const register = attachments.length
    ? `<section><h2>Register fotografických dôkazov</h2><table><thead><tr><th>ID</th><th>Rola</th><th>Čas</th><th>SHA-256</th></tr></thead><tbody>${attachments
        .map(
          (attachment) =>
            `<tr><td>${escapeHtml(attachment.id)}</td><td>${attachment.evidenceRole === "before" ? "Pred" : attachment.evidenceRole === "after" ? "Po" : "Všeobecné"}</td><td>${formatDateTime(attachment.createdAt)}</td><td class="digest">${attachment.contentDigest ? escapeHtml(attachment.contentDigest) : "Nedostupný"}</td></tr>`,
        )
        .join("")}</tbody></table></section>`
    : "";

  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>
@page{size:A4;margin:18mm 14mm 20mm;
  @bottom-left{content:"Dôkazový balík";color:#6b7280;font-size:7.5pt}
  @bottom-right{content:"Strana " counter(page) " / " counter(pages);color:#6b7280;font-size:7.5pt}
}

*{box-sizing:border-box}body{font-family:'Noto Sans','DejaVu Sans',Arial,sans-serif;color:#111827;font-size:10pt;line-height:1.45;margin:0}
h1{font-size:24pt;line-height:1.1;color:#173b20;margin:0 0 3mm}h2{font-size:14pt;color:#173b20;margin:0 0 4mm;border-bottom:1px solid #d7ddd5;padding-bottom:2mm}
.eyebrow{font-size:8pt;letter-spacing:.12em;text-transform:uppercase;color:#2e7d32;font-weight:800;margin-bottom:3mm}.subtitle{font-size:12pt;color:#374151;margin:0 0 8mm}
.cover{min-height:245mm;display:flex;flex-direction:column}.cover-main{flex:1}.stamp{border:1px solid #96b896;background:#f2f8f0;border-radius:3mm;padding:5mm;margin:8mm 0}
.stamp span,.fact-grid span{display:block;color:#6b7280;font-size:8pt;text-transform:uppercase;letter-spacing:.05em}.digest{font-family:'DejaVu Sans Mono',monospace;font-size:7.5pt;overflow-wrap:anywhere;word-break:break-all}
.fact-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:5mm 0}.fact-grid>div{border:1px solid #dfe4dd;border-radius:2mm;padding:3mm;break-inside:avoid}.fact-grid b{display:block;margin-top:1mm}
.notice{border-left:4px solid #ef6c00;background:#fff6e9;padding:4mm;margin-top:5mm;color:#4b5563}section{page-break-before:always;padding-top:2mm}section.photo-section{page-break-before:always}
table{width:100%;border-collapse:collapse;font-size:8.5pt}th{background:#edf5eb;color:#173b20;text-align:left}th,td{border:1px solid #dfe4dd;padding:2.5mm;vertical-align:top}td.fail{color:#b42318;font-weight:800}td.pass{color:#1b5e20;font-weight:700}
.timeline{border-left:2px solid #cdd8cb;margin-left:2mm;padding-left:6mm}.event{position:relative;margin:0 0 6mm;break-inside:avoid}.event-dot{position:absolute;width:3mm;height:3mm;border-radius:50%;background:#2e7d32;left:-7.6mm;top:1mm}.event-head{display:flex;justify-content:space-between;gap:4mm}.event-head time,.actor,.record-id,.muted{color:#6b7280;font-size:8pt}.event p{background:#f8f5ef;border-radius:2mm;padding:3mm;margin:2mm 0}
figure{margin:0 0 8mm;break-inside:avoid;page-break-inside:avoid}figure img{display:block;width:100%;max-height:210mm;object-fit:contain;border:1px solid #dfe4dd;background:#f8f5ef}figcaption{font-size:8pt;color:#4b5563;margin-top:2mm}
</style></head><body>
<div class="cover"><div class="cover-main"><div class="eyebrow">Stavebn\u00fd denn\u00edk \u00b7 D\u00f4kazov\u00fd export</div><h1>D\u00f4kazov\u00fd bal\u00edk \u00falohy</h1><p class="subtitle">${escapeHtml(task.title)}</p><div class="fact-grid"><div><span>Projekt</span><b>${escapeHtml(project.name)}</b></div><div><span>Miesto</span><b>${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ""}</b></div><div><span>Typ a priorita</span><b>${escapeHtml(task.kind)} \u00b7 ${escapeHtml(task.priority)}</b></div><div><span>Aktu\u00e1lny stav</span><b>${taskStatusLabel(task.status)}</b></div><div><span>Zodpovedn\u00fd pracovn\u00edk</span><b>${assignee ? `${escapeHtml(assignee.firstName)} ${escapeHtml(assignee.lastName)}` : "Nepriraden\u00e9"}</b></div><div><span>Term\u00edn</span><b>${task.dueDate ? escapeHtml(task.dueDate) : "-"}</b></div></div>${task.description ? `<div class="stamp"><span>Popis</span>${escapeHtml(task.description)}</div>` : ""}<div class="stamp"><span>Kontroln\u00fd SHA-256 odtla\u010dok manifestu</span><b class="digest">${escapeHtml(manifestDigest)}</b></div><div class="notice">Dokument je s\u00fahrnom \u00fadajov evidovan\u00fdch v aplik\u00e1cii k \u010dasu exportu. Odtla\u010dok overuje manifest z\u00e1znamov a prilo\u017een\u00fdch s\u00faborov; nejde o kvalifikovan\u00fd elektronick\u00fd podpis.</div></div><div class="record-id">Vytvoren\u00e9: ${formatDateTime(generatedAt)} \u00b7 ID \u00falohy: ${escapeHtml(task.id)}</div></div>
${checklistHtml}<section><h2>Hist\u00f3ria rozhodnut\u00ed a komunik\u00e1cie</h2><div class="timeline">${timeline}</div></section>${taskPhotosHtml(attachments, "before", "Fotografie pred pr\u00e1cou")}${taskPhotosHtml(attachments, "after", "Fotografie po pr\u00e1ci")}${taskPhotosHtml(attachments, "general", "Ostatn\u00e9 fotografie")}${register}</body></html>`;
}

function weeklyRiskLabel(
  risk: WeeklyReport["snapshot"]["scheduleRisk"],
): string {
  return {
    not_configured: "TermĂ­n nie je nastavenĂ˝",
    on_track: "PodÄľa plĂˇnu",
    watch: "VyĹľaduje sledovanie",
    high: "VysokĂ© riziko",
    critical: "KritickĂ© riziko",
  }[risk];
}

function weeklyMoney(cents: number): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function weeklyReportPdfHtml(input: {
  project: Project;
  report: WeeklyReport;
  attachments: PdfAttachment[];
}): string {
  const { project, report, attachments } = input;
  const snapshot = report.snapshot;
  const risk = {
    not_configured: "Term\u00edn nie je nastaven\u00fd",
    on_track: "Pod\u013ea pl\u00e1nu",
    watch: "Vy\u017eaduje sledovanie",
    high: "Vysok\u00e9 riziko",
    critical: "Kritick\u00e9 riziko",
  }[snapshot.scheduleRisk];
  const taskRows = snapshot.completedTasks.length
    ? snapshot.completedTasks
        .map(
          (task) =>
            `<tr><td>${formatDate(task.completedAt)}</td><td><b>${escapeHtml(task.title)}</b></td><td>${task.attachmentIds.length}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="3">V tomto t\u00fd\u017edni nebola uzavret\u00e1 \u017eiadna \u00faloha.</td></tr>';
  const photos = attachments.length
    ? `<section class="weekly-photos"><h2>Fotodokument\u00e1cia t\u00fd\u017ed\u0148a</h2><div class="photo-grid">${attachments
        .map(
          (photo, index) =>
            `<figure><img src="${escapeHtml(photo.pdfUri ?? photo.localUri)}" alt="Fotografia ${index + 1}"><figcaption>Fotografia ${index + 1} \u00b7 ${formatDateTime(photo.createdAt)}</figcaption></figure>`,
        )
        .join("")}</div></section>`
    : "";
  const note = report.clientNote
    ? `<div class="client-note"><span>Pozn\u00e1mka pre objedn\u00e1vate\u013ea</span>${escapeHtml(report.clientNote)}</div>`
    : "";
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 14mm 18mm;@bottom-left{content:"T\u00fd\u017edenn\u00fd report stavby";color:#6b7280;font-size:7.5pt}@bottom-right{content:"Strana " counter(page) " / " counter(pages);color:#6b7280;font-size:7.5pt}}
*{box-sizing:border-box}body{margin:0;color:#17231f;font:10pt/1.45 'Noto Sans','DejaVu Sans',Arial,sans-serif}
.cover{border-top:7mm solid #173f35;padding-top:9mm}.eyebrow{font:800 8pt/1.2 monospace;letter-spacing:.12em;text-transform:uppercase;color:#2e7d32}
h1{font-size:27pt;line-height:1.05;color:#173f35;margin:4mm 0 2mm}.address{color:#59645e;margin:0 0 7mm}
.period{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #17231f;padding-bottom:4mm;margin-bottom:6mm}.period strong{font:800 15pt monospace}.period span{font:700 8pt monospace;text-transform:uppercase;color:#6b7280}
.scoreboard{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d7d0c1;margin-bottom:6mm}.scoreboard>div{padding:4mm;border-right:1px solid #d7d0c1}.scoreboard>div:last-child{border-right:0}.scoreboard b{display:block;font:900 18pt monospace;color:#173f35}.scoreboard span,.client-note span{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
.risk{border-left:5px solid #c8a96b;background:#f7f4ec;padding:4mm;margin:5mm 0}.risk b{color:#173f35}
.statement{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:6mm 0}.statement>div{border-top:2px solid #173f35;padding-top:3mm}.statement h2,section h2{font-size:13pt;color:#173f35;margin:0 0 3mm}.statement p{white-space:pre-wrap;margin:0;color:#374151}.client-note{margin:5mm 0;border:1px solid #c8a96b;padding:4mm;background:#fffdf8}
section{margin-top:8mm;break-inside:auto}table{width:100%;border-collapse:collapse;font-size:9pt}th{background:#edf5eb;color:#173f35;text-align:left}th,td{border:1px solid #dfe4dd;padding:2.5mm;vertical-align:top}
.ledger{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d7d0c1;margin-top:5mm}.ledger>div{padding:3mm;border-bottom:1px solid #d7d0c1}.ledger b{float:right;font-family:monospace}
.weekly-photos{page-break-before:always}.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}figure{margin:0;break-inside:avoid}img{display:block;width:100%;height:82mm;object-fit:contain;background:#f8f5ef;border:1px solid #dfe4dd}figcaption{font-size:7.5pt;color:#6b7280;margin-top:1.5mm}
.footnote{margin-top:8mm;border-top:1px solid #d7d0c1;padding-top:3mm;color:#6b7280;font-size:7.5pt}
</style></head><body><div class="cover"><div class="eyebrow">Stavebn\u00fd denn\u00edk \u00b7 Pravideln\u00fd postup</div><h1>T\u00fd\u017edenn\u00fd report stavby</h1><p class="address"><b>${escapeHtml(project.name)}</b> \u00b7 ${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ""}</p></div>
<div class="period"><div><span>Obdobie</span><strong>${formatDate(report.periodStart)} \u2014 ${formatDate(report.periodEnd)}</strong></div><div><span>Vydanie</span><b>${formatDate(report.publishedAt ?? report.snapshot.generatedAt)}</b></div></div>
<div class="scoreboard"><div><b>${snapshot.completedTasks.length}</b><span>Hotov\u00e9 pr\u00e1ce</span></div><div><b>${snapshot.workerDays}</b><span>Pracovn\u00edkodni</span></div><div><b>${snapshot.blockedTaskCount}</b><span>Blok\u00e1cie</span></div><div><b>${snapshot.overdueTaskCount}</b><span>Po term\u00edne</span></div></div>
<div class="risk"><b>Term\u00ednov\u00fd stav: ${escapeHtml(risk)}</b>${snapshot.forecastCompletionDate ? `<br>Pracovn\u00fd odhad dokon\u010denia: ${formatDate(snapshot.forecastCompletionDate)}` : ""}</div>
<div class="statement"><div><h2>\u010co sa urobilo</h2><p>${escapeHtml(report.summary)}</p></div><div><h2>Pl\u00e1n na \u010fal\u0161\u00ed t\u00fd\u017ede\u0148</h2><p>${escapeHtml(report.nextWeekPlan)}</p></div></div>${note}
<section><h2>Uzavret\u00e9 pr\u00e1ce</h2><table><thead><tr><th>D\u00e1tum</th><th>Pr\u00e1ca</th><th>Fotografie</th></tr></thead><tbody>${taskRows}</tbody></table></section>
<section><h2>Kontroln\u00fd s\u00fahrn</h2><div class="ledger"><div>Potvrden\u00e9 v\u00fddavky t\u00fd\u017ed\u0148a <b>${weeklyMoney(snapshot.verifiedSpendCents)}</b></div><div>Schv\u00e1len\u00e9 dodatky t\u00fd\u017ed\u0148a <b>${weeklyMoney(snapshot.acceptedChangeCents)}</b></div><div>Otvoren\u00e9 \u00falohy <b>${snapshot.openTaskCount}</b></div><div>Rizik\u00e1 materi\u00e1lu <b>${snapshot.materialRiskCount}</b></div><div>Z\u00e1pisy v denn\u00edku <b>${snapshot.diaryEntryCount}</b></div><div>Fotografie vo v\u00fdbere <b>${snapshot.attachmentIds.length}</b></div></div></section>
<p class="footnote">Report je nemenn\u00fdm sn\u00edmkom \u00fadajov potvrden\u00fdch majstrom pri publikovan\u00ed. Finan\u010dn\u00e9 \u00fadaje zah\u0155\u0148aj\u00fa iba doklady ozna\u010den\u00e9 ako pripraven\u00e9.</p>${photos}</body></html>`;
}

function weeklyReportPdfHtmlLegacy(input: {
  project: Project;
  report: WeeklyReport;
  attachments: PdfAttachment[];
}): string {
  const { project, report, attachments } = input;
  const snapshot = report.snapshot;
  const taskRows = snapshot.completedTasks.length
    ? snapshot.completedTasks
        .map(
          (task) =>
            `<tr><td>${formatDate(task.completedAt)}</td><td><b>${escapeHtml(task.title)}</b></td><td>${task.attachmentIds.length}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="3">V tomto tĂ˝Ĺľdni nebola uzavretĂˇ Ĺľiadna Ăşloha.</td></tr>';
  const photos = attachments.length
    ? `<section class="weekly-photos"><h2>FotodokumentĂˇcia tĂ˝ĹľdĹa</h2><div class="photo-grid">${attachments
        .map(
          (photo, index) =>
            `<figure><img src="${escapeHtml(photo.pdfUri ?? photo.localUri)}" alt="Fotografia ${index + 1}"><figcaption>Fotografia ${index + 1} Â· ${formatDateTime(photo.createdAt)}</figcaption></figure>`,
        )
        .join("")}</div></section>`
    : "";
  const note = report.clientNote
    ? `<div class="client-note"><span>PoznĂˇmka pre objednĂˇvateÄľa</span>${escapeHtml(report.clientNote)}</div>`
    : "";
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 14mm 18mm;@bottom-left{content:"TĂ˝ĹľdennĂ˝ report stavby";color:#6b7280;font-size:7.5pt}@bottom-right{content:"Strana " counter(page) " / " counter(pages);color:#6b7280;font-size:7.5pt}}
*{box-sizing:border-box}body{margin:0;color:#17231f;font:10pt/1.45 'Noto Sans','DejaVu Sans',Arial,sans-serif}
.cover{border-top:7mm solid #173f35;padding-top:9mm}.eyebrow{font:800 8pt/1.2 monospace;letter-spacing:.12em;text-transform:uppercase;color:#2e7d32}
h1{font-size:27pt;line-height:1.05;color:#173f35;margin:4mm 0 2mm}.address{color:#59645e;margin:0 0 7mm}
.period{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #17231f;padding-bottom:4mm;margin-bottom:6mm}.period strong{font:800 15pt monospace}.period span{font:700 8pt monospace;text-transform:uppercase;color:#6b7280}
.scoreboard{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d7d0c1;margin-bottom:6mm}.scoreboard>div{padding:4mm;border-right:1px solid #d7d0c1}.scoreboard>div:last-child{border-right:0}.scoreboard b{display:block;font:900 18pt monospace;color:#173f35}.scoreboard span,.client-note span{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
.risk{border-left:5px solid #c8a96b;background:#f7f4ec;padding:4mm;margin:5mm 0}.risk b{color:#173f35}
.statement{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:6mm 0}.statement>div{border-top:2px solid #173f35;padding-top:3mm}.statement h2,section h2{font-size:13pt;color:#173f35;margin:0 0 3mm}.statement p{white-space:pre-wrap;margin:0;color:#374151}.client-note{margin:5mm 0;border:1px solid #c8a96b;padding:4mm;background:#fffdf8}
section{margin-top:8mm;break-inside:auto}table{width:100%;border-collapse:collapse;font-size:9pt}th{background:#edf5eb;color:#173f35;text-align:left}th,td{border:1px solid #dfe4dd;padding:2.5mm;vertical-align:top}
.ledger{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d7d0c1;margin-top:5mm}.ledger>div{padding:3mm;border-bottom:1px solid #d7d0c1}.ledger b{float:right;font-family:monospace}
.weekly-photos{page-break-before:always}.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}figure{margin:0;break-inside:avoid}img{display:block;width:100%;height:82mm;object-fit:contain;background:#f8f5ef;border:1px solid #dfe4dd}figcaption{font-size:7.5pt;color:#6b7280;margin-top:1.5mm}
.footnote{margin-top:8mm;border-top:1px solid #d7d0c1;padding-top:3mm;color:#6b7280;font-size:7.5pt}
</style></head><body><div class="cover"><div class="eyebrow">StavebnĂ˝ dennĂ­k Â· PravidelnĂ˝ postup</div><h1>TĂ˝ĹľdennĂ˝ report stavby</h1><p class="address"><b>${escapeHtml(project.name)}</b> Â· ${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ""}</p></div>
<div class="period"><div><span>Obdobie</span><strong>${formatDate(report.periodStart)} â€” ${formatDate(report.periodEnd)}</strong></div><div><span>Vydanie</span><b>${formatDate(report.publishedAt ?? report.snapshot.generatedAt)}</b></div></div>
<div class="scoreboard"><div><b>${snapshot.completedTasks.length}</b><span>HotovĂ© prĂˇce</span></div><div><b>${snapshot.workerDays}</b><span>PracovnĂ­kodni</span></div><div><b>${snapshot.blockedTaskCount}</b><span>BlokĂˇcie</span></div><div><b>${snapshot.overdueTaskCount}</b><span>Po termĂ­ne</span></div></div>
<div class="risk"><b>TermĂ­novĂ˝ stav: ${escapeHtml(weeklyRiskLabel(snapshot.scheduleRisk))}</b>${snapshot.forecastCompletionDate ? `<br>PracovnĂ˝ odhad dokonÄŤenia: ${formatDate(snapshot.forecastCompletionDate)}` : ""}</div>
<div class="statement"><div><h2>ÄŚo sa urobilo</h2><p>${escapeHtml(report.summary)}</p></div><div><h2>PlĂˇn na ÄŹalĹˇĂ­ tĂ˝ĹľdeĹ</h2><p>${escapeHtml(report.nextWeekPlan)}</p></div></div>${note}
<section><h2>UzavretĂ© prĂˇce</h2><table><thead><tr><th>DĂˇtum</th><th>PrĂˇca</th><th>Fotografie</th></tr></thead><tbody>${taskRows}</tbody></table></section>
<section><h2>KontrolnĂ˝ sĂşhrn</h2><div class="ledger"><div>PotvrdenĂ© vĂ˝davky tĂ˝ĹľdĹa <b>${weeklyMoney(snapshot.verifiedSpendCents)}</b></div><div>SchvĂˇlenĂ© dodatky tĂ˝ĹľdĹa <b>${weeklyMoney(snapshot.acceptedChangeCents)}</b></div><div>OtvorenĂ© Ăşlohy <b>${snapshot.openTaskCount}</b></div><div>RizikĂˇ materiĂˇlu <b>${snapshot.materialRiskCount}</b></div><div>ZĂˇpisy v dennĂ­ku <b>${snapshot.diaryEntryCount}</b></div><div>Fotografie vo vĂ˝bere <b>${snapshot.attachmentIds.length}</b></div></div></section>
<p class="footnote">Report je nemennĂ˝m snĂ­mkom Ăşdajov potvrdenĂ˝ch majstrom pri publikovanĂ­. FinanÄŤnĂ© Ăşdaje zahĹ•ĹajĂş iba doklady oznaÄŤenĂ© ako pripravenĂ©.</p>${photos}</body></html>`;
}
/*
*{box-sizing:border-box}body{font-family:'Noto Sans','DejaVu Sans',Arial,sans-serif;color:#111827;font-size:10pt;line-height:1.45;margin:0}
h1{font-size:24pt;line-height:1.1;color:#173b20;margin:0 0 3mm}h2{font-size:14pt;color:#173b20;margin:0 0 4mm;border-bottom:1px solid #d7ddd5;padding-bottom:2mm}
.eyebrow{font-size:8pt;letter-spacing:.12em;text-transform:uppercase;color:#2e7d32;font-weight:800;margin-bottom:3mm}.subtitle{font-size:12pt;color:#374151;margin:0 0 8mm}
.cover{min-height:245mm;display:flex;flex-direction:column}.cover-main{flex:1}.stamp{border:1px solid #96b896;background:#f2f8f0;border-radius:3mm;padding:5mm;margin:8mm 0}
.stamp span,.fact-grid span{display:block;color:#6b7280;font-size:8pt;text-transform:uppercase;letter-spacing:.05em}.digest{font-family:'DejaVu Sans Mono',monospace;font-size:7.5pt;overflow-wrap:anywhere;word-break:break-all}
.fact-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:5mm 0}.fact-grid>div{border:1px solid #dfe4dd;border-radius:2mm;padding:3mm;break-inside:avoid}.fact-grid b{display:block;margin-top:1mm}
.notice{border-left:4px solid #ef6c00;background:#fff6e9;padding:4mm;margin-top:5mm;color:#4b5563}section{page-break-before:always;padding-top:2mm}section.photo-section{page-break-before:always}
table{width:100%;border-collapse:collapse;font-size:8.5pt}th{background:#edf5eb;color:#173b20;text-align:left}th,td{border:1px solid #dfe4dd;padding:2.5mm;vertical-align:top}td.fail{color:#b42318;font-weight:800}td.pass{color:#1b5e20;font-weight:700}
.timeline{border-left:2px solid #cdd8cb;margin-left:2mm;padding-left:6mm}.event{position:relative;margin:0 0 6mm;break-inside:avoid}.event-dot{position:absolute;width:3mm;height:3mm;border-radius:50%;background:#2e7d32;left:-7.6mm;top:1mm}.event-head{display:flex;justify-content:space-between;gap:4mm}.event-head time,.actor,.record-id,.muted{color:#6b7280;font-size:8pt}.event p{background:#f8f5ef;border-radius:2mm;padding:3mm;margin:2mm 0}
figure{margin:0 0 8mm;break-inside:avoid;page-break-inside:avoid}figure img{display:block;width:100%;max-height:210mm;object-fit:contain;border:1px solid #dfe4dd;background:#f8f5ef}figcaption{font-size:8pt;color:#4b5563;margin-top:2mm}
</style></head><body>
<div class="cover"><div class="cover-main"><div class="eyebrow">Stavuno · Dôkazový export</div><h1>Dôkazový balík úlohy</h1><p class="subtitle">${escapeHtml(task.title)}</p><div class="fact-grid"><div><span>Projekt</span><b>${escapeHtml(project.name)}</b></div><div><span>Miesto</span><b>${escapeHtml(project.location)}${project.address ? `, ${escapeHtml(project.address)}` : ''}</b></div><div><span>Typ a priorita</span><b>${escapeHtml(task.kind)} · ${escapeHtml(task.priority)}</b></div><div><span>Aktuálny stav</span><b>${taskStatusLabel(task.status)}</b></div><div><span>Zodpovedný pracovník</span><b>${assignee ? `${escapeHtml(assignee.firstName)} ${escapeHtml(assignee.lastName)}` : 'Nepriradené'}</b></div><div><span>Termín</span><b>${task.dueDate ? escapeHtml(task.dueDate) : '-'}</b></div></div>${task.description ? `<div class="stamp"><span>Popis</span>${escapeHtml(task.description)}</div>` : ''}<div class="stamp"><span>Kontrolný SHA-256 odtlačok manifestu</span><b class="digest">${escapeHtml(manifestDigest)}</b></div><div class="notice">Dokument je súhrnom údajov evidovaných v aplikácii k času exportu. Odtlačok overuje manifest záznamov a priložených súborov; nejde o kvalifikovaný elektronický podpis.</div></div><div class="record-id">Vytvorené: ${formatDateTime(generatedAt)} · ID úlohy: ${escapeHtml(task.id)}</div></div>
${checklistHtml}<section><h2>História rozhodnutí a komunikácie</h2><div class="timeline">${timeline}</div></section>${taskPhotosHtml(attachments, 'before', 'Fotografie pred prácou')}${taskPhotosHtml(attachments, 'after', 'Fotografie po práci')}${taskPhotosHtml(attachments, 'general', 'Ostatné fotografie')}${register}</body></html>`;
}
*/
