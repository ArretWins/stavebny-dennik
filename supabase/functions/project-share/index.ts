import { createClient } from "npm:@supabase/supabase-js@2";

type SharedPhoto = { id: string; storagePath: string; signedUrl?: string };
type SharedTask = {
  id: string;
  title: string;
  description?: string | null;
  kind: string;
  completedAt?: string | null;
  revisionCount: number;
  decision?: {
    decision: "accept" | "rework";
    signerName: string;
    comment?: string | null;
    confirmedAt: string;
  } | null;
  photos: SharedPhoto[];
};
type SharedChangeOrder = {
  id: string;
  orderNumber: number;
  title: string;
  description: string;
  amountCents: number;
  scheduleImpactDays: number;
  status: "pending_client" | "accepted" | "rejected";
  submittedAt: string;
  decidedAt?: string | null;
  signerName?: string | null;
  decisionComment?: string | null;
};
type SharedWeeklyReport = {
  id: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  nextWeekPlan: string;
  clientNote?: string | null;
  publishedAt: string;
  snapshot: {
    completedTasks: Array<{
      id: string;
      title: string;
      completedAt: string;
      attachmentIds: string[];
    }>;
    diaryEntryCount: number;
    workerDays: number;
    verifiedSpendCents: number;
    acceptedChangeCents: number;
    openTaskCount: number;
    blockedTaskCount: number;
    overdueTaskCount: number;
    materialRiskCount: number;
    scheduleRisk: string;
    forecastCompletionDate?: string;
    attachmentIds: string[];
  };
  photos: SharedPhoto[];
};
type Snapshot = {
  project: { name: string; location: string; address?: string | null };
  tasks: SharedTask[];
  changeOrders: SharedChangeOrder[];
  weeklyReports: SharedWeeklyReport[];
  expiresAt: string;
  generatedAt: string;
};

const responseHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value?: string | null): string {
  if (!value) return "Dátum prijatia nie je uvedený";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function kindLabel(kind: string): string {
  return (
    {
      task: "Práca",
      defect: "Odstránený nedostatok",
      inspection: "Kontrola",
      material: "Materiál",
    }[kind] ?? "Práca"
  );
}

function invalidPage(): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Odkaz už nie je dostupný</title><style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f0e7;
  color:#17231f;font:16px/1.55 "Segoe UI",sans-serif;padding:24px}
  main{max-width:520px;background:#fff;border:1px solid #d7d0c1;padding:32px;
  box-shadow:8px 8px 0 #173f35}h1{font:700 30px/1.1 Rockwell,Georgia,serif;margin:0 0 16px}
  p{margin:0;color:#5f6863}</style></head><body><main><h1>Odkaz už nie je dostupný</h1>
  <p>Platnosť odkazu skončila alebo ho majster odvolal. Požiadajte ho o nový odkaz.</p>
  </main></body></html>`;
}

function taskHtml(task: SharedTask, index: number, token: string): string {
  const photos = task.photos
    .filter((photo) => photo.signedUrl)
    .map(
      (photo, photoIndex) =>
        `<figure><img src="${escapeHtml(photo.signedUrl)}" alt="${escapeHtml(
          `${task.title} – fotografia ${photoIndex + 1}`,
        )}" loading="lazy"></figure>`,
    )
    .join("");
  const decision = task.decision
    ? `<div class="decision recorded"><strong>${
        task.decision.decision === "accept"
          ? "Objednávateľ prácu prevzal"
          : "Objednávateľ požiadal o úpravu"
      }</strong><p>${escapeHtml(task.decision.signerName)} · ${escapeHtml(
        formatDate(task.decision.confirmedAt),
      )}</p>${
        task.decision.comment
          ? `<blockquote>${escapeHtml(task.decision.comment)}</blockquote>`
          : ""
      }</div>`
    : `<form class="decision" method="post" action="?token=${escapeHtml(token)}">
      <input type="hidden" name="entity" value="task">
      <input type="hidden" name="task_id" value="${escapeHtml(task.id)}">
      <h3>Potvrdenie objednávateľa</h3>
      <label>Meno a priezvisko<input name="signer_name" required minlength="2"
        maxlength="100" autocomplete="name"></label>
      <label>Poznámka<textarea name="comment" maxlength="500"
        placeholder="Pri vrátení uveďte, čo treba upraviť"></textarea></label>
      <label class="confirm"><input type="checkbox" name="confirmed" value="yes"
        required> Potvrdzujem, že som si prezrel(a) uvedenú prácu a fotografie.</label>
      <div class="decision-actions">
        <button name="decision" value="accept" class="accept">Prevziať prácu</button>
        <button name="decision" value="rework" class="rework">Vrátiť na úpravu</button>
      </div>
    </form>`;
  return `<article class="work">
    <div class="rail"><span>${String(index + 1).padStart(2, "0")}</span></div>
    <div class="work-body">
      <div class="work-head"><div><p class="utility">${escapeHtml(
        kindLabel(task.kind),
      )} · ${escapeHtml(formatDate(task.completedAt))}</p>
      <h2>${escapeHtml(task.title)}</h2></div><span class="stamp">✓ Prijaté</span></div>
      ${
        task.description
          ? `<p class="description">${escapeHtml(task.description)}</p>`
          : ""
      }
      ${photos ? `<div class="photos">${photos}</div>` : ""}
      ${decision}
    </div>
  </article>`;
}

function weeklyReportHtml(item: SharedWeeklyReport): string {
  const snapshot = item.snapshot ?? ({} as SharedWeeklyReport["snapshot"]);
  const completed = snapshot.completedTasks ?? [];
  const taskList = completed.length
    ? `<ul>${completed
        .map(
          (task) =>
            `<li><span>${escapeHtml(formatDate(task.completedAt))}</span><strong>${escapeHtml(task.title)}</strong></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted-copy">V tomto t\u00fd\u017edni nebola uzavret\u00e1 \u017eiadna samostatn\u00e1 \u00faloha.</p>`;
  const photos = (item.photos ?? [])
    .filter((photo) => photo.signedUrl)
    .map(
      (photo, index) =>
        `<figure><img src="${escapeHtml(photo.signedUrl)}" alt="Fotografia t\u00fd\u017ed\u0148a ${index + 1}" loading="lazy"></figure>`,
    )
    .join("");
  const risk =
    {
      not_configured: "Term\u00edn nie je nastaven\u00fd",
      on_track: "Pod\u013ea pl\u00e1nu",
      watch: "Vy\u017eaduje sledovanie",
      high: "Vysok\u00e9 riziko",
      critical: "Kritick\u00e9 riziko",
    }[snapshot.scheduleRisk] ?? "Bez vyhodnotenia";
  return `<article class="weekly">
    <div class="weekly-period"><span>T\u00fd\u017edenn\u00fd report</span><strong>${escapeHtml(
      formatDate(item.periodStart),
    )} \u2013 ${escapeHtml(formatDate(item.periodEnd))}</strong></div>
    <div class="weekly-score">
      <div><b>${completed.length}</b><span>Hotov\u00e9</span></div>
      <div><b>${Number(snapshot.workerDays ?? 0)}</b><span>Pracovn\u00edkodni</span></div>
      <div><b>${Number(snapshot.blockedTaskCount ?? 0)}</b><span>Blok\u00e1cie</span></div>
      <div><b>${Number(snapshot.overdueTaskCount ?? 0)}</b><span>Po term\u00edne</span></div>
    </div>
    <div class="weekly-risk"><b>Term\u00ednov\u00fd stav: ${escapeHtml(risk)}</b>${
      snapshot.forecastCompletionDate
        ? `<span>Odhad dokon\u010denia ${escapeHtml(
            formatDate(snapshot.forecastCompletionDate),
          )}</span>`
        : ""
    }</div>
    <div class="weekly-copy"><div><h3>\u010co sa urobilo</h3><p>${escapeHtml(
      item.summary,
    )}</p></div><div><h3>Pl\u00e1n na \u010fal\u0161\u00ed t\u00fd\u017ede\u0148</h3><p>${escapeHtml(
      item.nextWeekPlan,
    )}</p></div></div>
    ${
      item.clientNote
        ? `<blockquote class="client-note">${escapeHtml(item.clientNote)}</blockquote>`
        : ""
    }
    <div class="weekly-ledger"><span>Potvrden\u00e9 v\u00fddavky <b>${escapeHtml(
      formatMoney(Number(snapshot.verifiedSpendCents ?? 0)),
    )}</b></span><span>Schv\u00e1len\u00e9 dodatky <b>${escapeHtml(
      formatMoney(Number(snapshot.acceptedChangeCents ?? 0)),
    )}</b></span></div>
    <div class="weekly-tasks">${taskList}</div>
    ${photos ? `<div class="photos weekly-photos">${photos}</div>` : ""}
  </article>`;
}

function weeklyReportHtmlLegacy(item: SharedWeeklyReport): string {
  const snapshot = item.snapshot ?? ({} as SharedWeeklyReport["snapshot"]);
  const completed = snapshot.completedTasks ?? [];
  const taskList = completed.length
    ? `<ul>${completed
        .map(
          (task) =>
            `<li><span>${escapeHtml(formatDate(task.completedAt))}</span><strong>${escapeHtml(task.title)}</strong></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted-copy">V tomto tĂ˝Ĺľdni nebola uzavretĂˇ Ĺľiadna samostatnĂˇ Ăşloha.</p>`;
  const photos = (item.photos ?? [])
    .filter((photo) => photo.signedUrl)
    .map(
      (photo, index) =>
        `<figure><img src="${escapeHtml(photo.signedUrl)}" alt="Fotografia tĂ˝ĹľdĹa ${index + 1}" loading="lazy"></figure>`,
    )
    .join("");
  const risk = {
    not_configured: "TermĂ­n nie je nastavenĂ˝",
    on_track: "PodÄľa plĂˇnu",
    watch: "VyĹľaduje sledovanie",
    high: "VysokĂ© riziko",
    critical: "KritickĂ© riziko",
  }[snapshot.scheduleRisk] ?? "Bez vyhodnotenia";
  return `<article class="weekly">
    <div class="weekly-period"><span>TĂ˝ĹľdennĂ˝ report</span><strong>${escapeHtml(
      formatDate(item.periodStart),
    )} â€“ ${escapeHtml(formatDate(item.periodEnd))}</strong></div>
    <div class="weekly-score">
      <div><b>${completed.length}</b><span>HotovĂ©</span></div>
      <div><b>${Number(snapshot.workerDays ?? 0)}</b><span>PracovnĂ­kodni</span></div>
      <div><b>${Number(snapshot.blockedTaskCount ?? 0)}</b><span>BlokĂˇcie</span></div>
      <div><b>${Number(snapshot.overdueTaskCount ?? 0)}</b><span>Po termĂ­ne</span></div>
    </div>
    <div class="weekly-risk"><b>TermĂ­novĂ˝ stav: ${escapeHtml(risk)}</b>${
      snapshot.forecastCompletionDate
        ? `<span>Odhad dokonÄŤenia ${escapeHtml(
            formatDate(snapshot.forecastCompletionDate),
          )}</span>`
        : ""
    }</div>
    <div class="weekly-copy"><div><h3>ÄŚo sa urobilo</h3><p>${escapeHtml(
      item.summary,
    )}</p></div><div><h3>PlĂˇn na ÄŹalĹˇĂ­ tĂ˝ĹľdeĹ</h3><p>${escapeHtml(
      item.nextWeekPlan,
    )}</p></div></div>
    ${
      item.clientNote
        ? `<blockquote class="client-note">${escapeHtml(item.clientNote)}</blockquote>`
        : ""
    }
    <div class="weekly-ledger"><span>PotvrdenĂ© vĂ˝davky <b>${escapeHtml(
      formatMoney(Number(snapshot.verifiedSpendCents ?? 0)),
    )}</b></span><span>SchvĂˇlenĂ© dodatky <b>${escapeHtml(
      formatMoney(Number(snapshot.acceptedChangeCents ?? 0)),
    )}</b></span></div>
    <div class="weekly-tasks">${taskList}</div>
    ${photos ? `<div class="photos weekly-photos">${photos}</div>` : ""}
  </article>`;
}

function changeOrderHtml(item: SharedChangeOrder, token: string): string {
  const decided =
    item.status === "accepted" || item.status === "rejected"
      ? `<div class="decision recorded ${item.status}">
        <strong>${
          item.status === "accepted"
            ? "Dodatok bol schválený"
            : "Dodatok bol zamietnutý"
        }</strong>
        <p>${escapeHtml(item.signerName)} · ${escapeHtml(
          formatDate(item.decidedAt),
        )}</p>
        ${
          item.decisionComment
            ? `<blockquote>${escapeHtml(item.decisionComment)}</blockquote>`
            : ""
        }</div>`
      : `<form class="decision" method="post" action="?token=${escapeHtml(token)}">
        <input type="hidden" name="entity" value="change_order">
        <input type="hidden" name="change_order_id" value="${escapeHtml(item.id)}">
        <label>Meno a priezvisko<input name="signer_name" required minlength="2"
          maxlength="100" autocomplete="name"></label>
        <label>Poznámka<textarea name="comment" maxlength="500"
          placeholder="Pri zamietnutí uveďte dôvod"></textarea></label>
        <label class="confirm"><input type="checkbox" name="confirmed" value="yes"
          required> Potvrdzujem cenu, rozsah práce a vplyv na termín.</label>
        <div class="decision-actions">
          <button name="decision" value="accept" class="accept">Schváliť dodatok</button>
          <button name="decision" value="reject" class="rework">Zamietnuť</button>
        </div>
      </form>`;
  const days = item.scheduleImpactDays === 0
    ? "Bez zmeny termínu"
    : `${item.scheduleImpactDays > 0 ? "+" : ""}${item.scheduleImpactDays} dní`;
  return `<article class="variation">
    <div class="variation-code">DODATOK ${String(item.orderNumber).padStart(2, "0")}</div>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.description)}</p>
    <div class="impact">
      <div><span>Zmena ceny</span><strong>${escapeHtml(formatMoney(item.amountCents))}</strong></div>
      <div><span>Vplyv na termín</span><strong>${escapeHtml(days)}</strong></div>
    </div>${decided}
  </article>`;
}

function page(snapshot: Snapshot, token: string, result?: string): string {
  const tasks = snapshot.tasks.slice(0, 100);
  const works = tasks.length
    ? tasks.map((task, index) => taskHtml(task, index, token)).join("")
    : `<div class="empty"><strong>Zatiaľ bez zverejnených prác</strong>
       <p>Majster sem pridá práce po ich kontrole a prijatí.</p></div>`;
  const variations = (snapshot.changeOrders ?? []).length
    ? snapshot.changeOrders.map(item => changeOrderHtml(item, token)).join("")
    : `<div class="empty compact"><p>Nie sú predložené žiadne dodatky.</p></div>`;
  const weeklyReports = (snapshot.weeklyReports ?? []).length
    ? snapshot.weeklyReports.map(weeklyReportHtml).join("")
    : `<div class="empty compact"><p>Zatiaľ nebol publikovaný týždenný report.</p></div>`;
  const address = [snapshot.project.location, snapshot.project.address]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#173f35"><title>${escapeHtml(
    snapshot.project.name,
  )} – priebeh stavby</title><style>
  :root{--forest:#173f35;--forest2:#0f2e27;--brass:#c8a96b;--paper:#f4f0e7;
  --sheet:#fffdf8;--ink:#17231f;--muted:#69736d;--line:#d7d0c1}
  *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);
  font:16px/1.55 "Aptos","Segoe UI",sans-serif}
  .cover{background:var(--forest);color:#fff;padding:42px max(22px,calc((100vw - 920px)/2));
  border-bottom:8px solid var(--brass);position:relative;overflow:hidden}
  .cover:after{content:"";position:absolute;inset:0;background:
  linear-gradient(90deg,transparent 49.6%,#ffffff0b 50%,transparent 50.4%),
  linear-gradient(0deg,transparent 49.6%,#ffffff0b 50%,transparent 50.4%);
  background-size:42px 42px;pointer-events:none}
  .folder-tab{display:inline-block;background:var(--brass);color:#17231f;padding:7px 12px;
  font:800 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;
  position:relative;z-index:1}.cover h1{max-width:760px;margin:22px 0 12px;
  font:700 clamp(36px,8vw,68px)/.98 Rockwell,"Roboto Slab",Georgia,serif;
  letter-spacing:-.035em;position:relative;z-index:1}
  .address{margin:0;color:#dce9e3;position:relative;z-index:1}
  .issue{margin-top:30px;padding-top:16px;border-top:1px solid #ffffff35;
  display:flex;gap:24px;flex-wrap:wrap;font:700 11px/1.4 ui-monospace,monospace;
  letter-spacing:.08em;text-transform:uppercase;color:#c6d8cf;position:relative;z-index:1}
  main{max-width:920px;margin:0 auto;padding:36px 22px 64px}
  .intro{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;
  border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:4px}
  .intro h2{font:700 24px/1.1 Rockwell,Georgia,serif;margin:0}
  .intro p{margin:0;color:var(--muted);font-size:13px}
  .work{display:grid;grid-template-columns:72px 1fr;border-bottom:1px solid var(--line)}
  .rail{border-right:1px solid var(--line);padding-top:31px}
  .rail span{font:800 12px/1 ui-monospace,monospace;color:var(--forest)}
  .work-body{padding:28px 0 32px 28px}.work-head{display:flex;justify-content:space-between;
  align-items:flex-start;gap:18px}.utility{margin:0 0 7px;color:var(--muted);
  font:700 11px/1.3 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}
  .work h2{font:700 clamp(22px,4vw,31px)/1.12 Rockwell,Georgia,serif;margin:0}
  .stamp{flex:none;border:2px solid var(--forest);color:var(--forest);padding:7px 9px;
  font:900 11px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;
  transform:rotate(-2deg);background:#edf5ef}.description{max-width:680px;color:#46514b;margin:16px 0}
  .photos{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:20px}
  figure{margin:0;aspect-ratio:4/3;background:#e7e2d8;overflow:hidden}
  img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease}
  figure:hover img{transform:scale(1.025)}.empty{padding:50px 0;text-align:center}
  .result{margin:0 0 24px;padding:15px 17px;border-left:5px solid var(--forest);
  background:#edf5ef;font-weight:700}.result.error{border-color:#9f2f25;background:#fff0ed}
  .decision{margin-top:24px;border:1px solid var(--line);background:#fff;padding:18px}
  .decision h3{font:700 18px Rockwell,Georgia,serif;margin:0 0 14px}
  .decision label{display:block;font-size:13px;font-weight:700;margin-top:12px}
  .decision input[type=text],.decision input:not([type]),.decision textarea{
  display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #9ca69f;
  border-radius:0;font:inherit;background:#fff}.decision textarea{min-height:82px;resize:vertical}
  .decision .confirm{font-weight:500;line-height:1.4}.decision-actions{display:flex;
  flex-wrap:wrap;gap:9px;margin-top:16px}.decision button{border:0;padding:12px 15px;
  font-weight:800;cursor:pointer}.decision .accept{background:var(--forest);color:#fff}
  .decision .rework{background:#fff0ed;color:#7a251d;border:1px solid #c76e63}
  .decision.recorded{border-left:5px solid var(--forest);background:#edf5ef}
  .decision.recorded.rejected{border-left-color:#9f2f25;background:#fff0ed}
  .decision.recorded p{margin:5px 0;color:var(--muted)}blockquote{margin:10px 0 0}
  .variations{margin:0 0 42px}.variations-head{border-bottom:2px solid var(--ink);
  padding-bottom:14px}.variations-head h2{font:700 24px/1.1 Rockwell,Georgia,serif;margin:0}
  .weeklies{margin:0 0 48px}.weekly{background:var(--sheet);border:1px solid var(--line);
  border-top:7px solid var(--forest);padding:24px;margin-top:18px;box-shadow:6px 6px 0 #c8a96b35}
  .weekly-period{display:flex;justify-content:space-between;gap:14px;align-items:end;
  border-bottom:1px solid var(--ink);padding-bottom:12px}.weekly-period span{
  font:800 10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;
  color:var(--forest)}.weekly-period strong{font:800 15px ui-monospace,monospace}
  .weekly-score{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);
  margin:18px 0}.weekly-score div{padding:12px;border-right:1px solid var(--line)}
  .weekly-score div:last-child{border-right:0}.weekly-score b{display:block;
  font:900 24px ui-monospace,monospace;color:var(--forest)}.weekly-score span{
  font-size:10px;color:var(--muted)}.weekly-risk{border-left:5px solid var(--brass);
  background:#f7f4ec;padding:12px 14px;display:flex;justify-content:space-between;gap:12px}
  .weekly-risk span{color:var(--muted);font-size:12px}.weekly-copy{display:grid;
  grid-template-columns:1fr 1fr;gap:22px;margin:22px 0}.weekly-copy>div{
  border-top:2px solid var(--forest);padding-top:10px}.weekly-copy h3{
  font:700 18px Rockwell,Georgia,serif;margin:0 0 7px}.weekly-copy p{margin:0;
  white-space:pre-wrap}.client-note{border:1px solid var(--brass);padding:14px;
  margin:0 0 18px;background:#fffdf8}.weekly-ledger{display:grid;grid-template-columns:1fr 1fr;
  border:1px solid var(--line)}.weekly-ledger span{padding:12px}.weekly-ledger b{float:right;
  font-family:ui-monospace,monospace}.weekly-tasks ul{list-style:none;padding:0;margin:18px 0}
  .weekly-tasks li{display:grid;grid-template-columns:130px 1fr;gap:12px;padding:9px 0;
  border-bottom:1px solid var(--line)}.weekly-tasks li span{color:var(--muted);font-size:12px}
  .weekly-photos{margin-top:18px}.muted-copy{color:var(--muted)}
  .variation{border-bottom:1px solid var(--line);padding:26px 0}.variation-code{
  color:var(--forest);font:800 11px/1 ui-monospace,monospace;letter-spacing:.1em}
  .variation h3{font:700 25px/1.15 Rockwell,Georgia,serif;margin:9px 0}
  .variation>p{max-width:720px;color:#46514b}.impact{display:grid;
  grid-template-columns:1fr 1fr;border:1px solid var(--line);margin-top:18px}
  .impact>div{padding:14px;border-left:5px solid var(--brass)}
  .impact span{display:block;color:var(--muted);font:700 10px ui-monospace,monospace;
  text-transform:uppercase}.impact strong{display:block;margin-top:4px;font:800 20px
  ui-monospace,monospace}.empty.compact{padding:25px 0;text-align:left}
  .empty strong{font:700 23px Rockwell,Georgia,serif}.empty p{color:var(--muted)}
  footer{background:var(--forest2);color:#b8cbc2;padding:24px;text-align:center;font-size:12px}
  @media(max-width:620px){.cover{padding-top:32px;padding-bottom:34px}.work{grid-template-columns:42px 1fr}
  .work-body{padding-left:16px}.stamp{font-size:9px}.photos{grid-template-columns:1fr 1fr}
  .intro{display:block}.intro p{margin-top:8px}.weekly{padding:17px}.weekly-copy{
  grid-template-columns:1fr}.weekly-score{grid-template-columns:1fr 1fr}.weekly-score div{
  border-bottom:1px solid var(--line)}.weekly-ledger{grid-template-columns:1fr}
  .weekly-period,.weekly-risk{display:block}.weekly-risk span{display:block;margin-top:5px}}
  @media(prefers-reduced-motion:reduce){img{transition:none}}
  </style></head><body><header class="cover"><span class="folder-tab">Priebeh stavby</span>
  <h1>${escapeHtml(snapshot.project.name)}</h1><p class="address">${escapeHtml(
    address,
  )}</p><div class="issue"><span>Overené práce: ${tasks.length}</span>
  <span>Platnosť do: ${escapeHtml(formatDate(snapshot.expiresAt))}</span></div></header>
  <main>${
    result
      ? `<div class="result${result === "error" ? " error" : ""}">${
          result === "accept"
            ? "Potvrdenie bolo bezpečne uložené."
            : result === "rework"
              ? "Požiadavka na úpravu bola odoslaná majstrovi."
              : result === "change_accept"
                ? "Dodatok bol bezpečne schválený."
                : result === "change_reject"
                  ? "Zamietnutie dodatku bolo odoslané majstrovi."
              : "Rozhodnutie sa nepodarilo uložiť. Skontrolujte údaje alebo požiadajte o nový odkaz."
        }</div>`
      : ""
  }<section class="weeklies"><div class="variations-head"><h2>Týždenné reporty</h2></div>
  ${weeklyReports}</section><section class="variations"><div class="variations-head"><h2>Dodatky a zmeny</h2></div>
  ${variations}</section><div class="intro"><h2>Prevzaté práce</h2><p>Zobrazené položky vybral majster.</p></div>
  ${works}</main><footer>Súkromný výpis zo Stavebného denníka · odkaz je dočasný</footer>
  </body></html>`;
}

Deno.serve(async (request) => {
  if (!["GET", "POST"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token))
    return new Response(invalidPage(), { status: 404, headers: responseHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey)
    return new Response(invalidPage(), { status: 503, headers: responseHeaders });

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  if (request.method === "POST") {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 4096)
      return new Response(invalidPage(), { status: 413, headers: responseHeaders });
    try {
      const form = await request.formData();
      const decision = String(form.get("decision") ?? "");
      const entity = String(form.get("entity") ?? "task");
      const submitted = entity === "change_order"
        ? await client.rpc("submit_project_share_change_order_decision", {
            p_token: token,
            p_change_order_id: String(form.get("change_order_id") ?? ""),
            p_decision: decision,
            p_signer_name: String(form.get("signer_name") ?? ""),
            p_comment: String(form.get("comment") ?? ""),
            p_confirmed: form.get("confirmed") === "yes",
          })
        : await client.rpc("submit_project_share_task_decision", {
            p_token: token,
            p_task_id: String(form.get("task_id") ?? ""),
            p_decision: decision,
            p_signer_name: String(form.get("signer_name") ?? ""),
            p_comment: String(form.get("comment") ?? ""),
            p_confirmed: form.get("confirmed") === "yes",
          });
      const result = submitted.error
        ? "error"
        : entity === "change_order"
          ? `change_${decision}`
          : decision;
      return new Response(null, {
        status: 303,
        headers: {
          ...responseHeaders,
          Location: `?token=${encodeURIComponent(token)}&result=${result}`,
        },
      });
    } catch {
      return new Response(null, {
        status: 303,
        headers: {
          ...responseHeaders,
          Location: `?token=${encodeURIComponent(token)}&result=error`,
        },
      });
    }
  }
  const result = await client.rpc("resolve_project_share_snapshot", {
    p_token: token,
  });
  if (result.error || !result.data)
    return new Response(invalidPage(), { status: 404, headers: responseHeaders });

  const snapshot = result.data as Snapshot;
  const changeOrders = await client.rpc("resolve_project_share_change_orders", {
    p_token: token,
  });
  snapshot.changeOrders =
    changeOrders.error || !Array.isArray(changeOrders.data)
      ? []
      : (changeOrders.data as SharedChangeOrder[]);
  const weeklyReports = await client.rpc(
    "resolve_project_share_weekly_reports",
    { p_token: token },
  );
  snapshot.weeklyReports =
    weeklyReports.error || !Array.isArray(weeklyReports.data)
      ? []
      : await Promise.all(
          (weeklyReports.data as SharedWeeklyReport[]).map(async (report) => {
            const ids = Array.isArray(report.snapshot?.attachmentIds)
              ? report.snapshot.attachmentIds.slice(0, 12)
              : [];
            if (!ids.length) return { ...report, photos: [] };
            const selected = await client
              .from("attachments")
              .select("id,storage_path")
              .in("id", ids)
              .not("storage_path", "is", null);
            const photos = await Promise.all(
              (selected.data ?? []).map(async (row) => {
                const signed = await client.storage
                  .from("attachments")
                  .createSignedUrl(String(row.storage_path), 15 * 60);
                return {
                  id: String(row.id),
                  storagePath: String(row.storage_path),
                  signedUrl: signed.error ? undefined : signed.data.signedUrl,
                };
              }),
            );
            return { ...report, photos };
          }),
        );
  snapshot.tasks = await Promise.all(
    (snapshot.tasks ?? []).slice(0, 100).map(async (task) => ({
      ...task,
      photos: await Promise.all(
        (task.photos ?? []).slice(0, 6).map(async (photo) => {
          const signed = await client.storage
            .from("attachments")
            .createSignedUrl(photo.storagePath, 15 * 60);
          return {
            ...photo,
            signedUrl: signed.error ? undefined : signed.data.signedUrl,
          };
        }),
      ),
    })),
  );
  const resultMessage = new URL(request.url).searchParams.get("result") ?? "";
  return new Response(page(snapshot, token, resultMessage), {
    status: 200,
    headers: responseHeaders,
  });
});
