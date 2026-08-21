import { createClient } from "npm:@supabase/supabase-js@2";

type ApprovalSnapshot = {
  project: { name: string; location?: string | null; address?: string | null };
  request: {
    id: string;
    recipientName: string;
    reviewerRole: string;
    status: "pending" | "approved" | "changes_requested";
    expiresAt: string;
    decidedAt?: string | null;
    decisionComment?: string | null;
  };
  closure: {
    id: string;
    logDate: string;
    version: number;
    contentHash: string;
    confirmedAt: string;
    diaryEntries?: Array<Record<string, unknown>>;
  };
};

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; " +
    "form-action 'self'; frame-ancestors 'none'",
  "Permissions-Policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function date(value: string): string {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "long",
    timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

const roleLabels: Record<string, string> = {
  technical_supervisor: "Stavebný dozor",
  investor: "Investor",
  designer: "Projektant",
  contractor: "Zhotoviteľ",
  other: "Iná oprávnená osoba",
};

function maskRecipientName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) =>
      part.length <= 1 ? "*" : `${part.slice(0, 1)}${"*".repeat(Math.min(5, part.length - 1))}`,
    )
    .join(" ");
}

function unavailablePage(): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Odkaz nie je dostupný</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;
  background:#f4f1e9;color:#17211d;font:16px/1.55 "Segoe UI",sans-serif;padding:24px}
  main{max-width:560px;background:#fff;border:1px solid #a9ada7;padding:36px;
  box-shadow:9px 9px 0 #225b37}h1{margin:0 0 15px;font:800 30px/1.1 "Arial Narrow",sans-serif}
  p{margin:0;color:#5f6762}</style></head><body><main><h1>Odkaz nie je dostupný</h1>
  <p>Jeho platnosť vypršala, vlastník ho zrušil alebo uzavretý deň už nie je dostupný.</p>
  </main></body></html>`;
}

function entryHtml(entry: Record<string, unknown>, index: number): string {
  const roles = Array.isArray(entry.workforceRoles)
    ? (entry.workforceRoles as Array<Record<string, unknown>>)
        .map((item) => `${escapeHtml(item.role)}: ${escapeHtml(item.count)}`)
        .join(" · ")
    : "";
  const records = Array.isArray(entry.technicalRecords)
    ? (entry.technicalRecords as Array<Record<string, unknown>>)
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.category)}</strong> — ${escapeHtml(item.description)}</li>`,
        )
        .join("")
    : "";
  return `<article class="entry"><div class="entry-no">${String(index + 1).padStart(2, "0")}</div><div>
    <h3>${escapeHtml(entry.workDescription)}</h3>
    <p class="facts"><b>Pracovníci:</b> ${escapeHtml(entry.workerCount)}${entry.workStartTime || entry.workEndTime ? ` · <b>Čas:</b> ${escapeHtml(entry.workStartTime || "—")}–${escapeHtml(entry.workEndTime || "—")}` : ""}</p>
    ${roles ? `<p class="facts"><b>Zloženie:</b> ${roles}</p>` : ""}
    ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
    ${records ? `<ul>${records}</ul>` : ""}
  </div></article>`;
}

function page(snapshot: ApprovalSnapshot, token: string, result: string): string {
  const { project, request, closure } = snapshot;
  const entries = (closure.diaryEntries ?? [])
    .map((entry, index) => entryHtml(entry, index))
    .join("");
  const approved = request.status === "approved";
  const returned = request.status === "changes_requested";
  const failed = result === "error";
  const finalState = approved || returned;
  const decision = approved ? "SCHVÁLENÉ" : "VYŽADUJÚ SA ZMENY";
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#225b37"><title>Schválenie stavebného denníka</title><style>
  :root{--ink:#17211d;--green:#225b37;--green2:#34764b;--sand:#e1b75d;--paper:#fff;--bg:#f4f1e9;--line:#a9ada7;--muted:#5f6762;--danger:#9d382d}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Segoe UI",Arial,sans-serif;background-image:linear-gradient(#e6e1d7 1px,transparent 1px),linear-gradient(90deg,#e6e1d7 1px,transparent 1px);background-size:30px 30px}
  header{background:var(--green);color:#fff;border-bottom:8px solid var(--sand);padding:28px max(18px,env(safe-area-inset-left))}.inner,main{width:min(780px,100%);margin:auto}.brand{font:800 12px/1 "Arial Narrow",sans-serif;letter-spacing:1.7px;text-transform:uppercase;color:#d8eadf}h1{font:900 clamp(30px,7vw,48px)/1 "Arial Narrow","Segoe UI",sans-serif;margin:13px 0 9px}.subtitle{color:#dfebe3;margin:0}
  main{padding:22px 15px 50px}.sheet{background:var(--paper);border:1px solid var(--line);box-shadow:8px 8px 0 var(--green);margin-bottom:22px}.summary{display:grid;grid-template-columns:1fr 1fr}.cell{padding:18px;border-bottom:1px solid var(--line)}.cell:nth-child(odd){border-right:1px solid var(--line)}.label{display:block;color:var(--muted);font:800 11px/1.2 "Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.hash{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere;color:#30433a}.entries{padding:20px}.entries h2,.decision h2{font:850 24px/1.1 "Arial Narrow",sans-serif;margin:0 0 15px}.entry{display:grid;grid-template-columns:38px 1fr;gap:13px;padding:16px 0;border-top:1px solid #d6d8d4}.entry-no{width:32px;height:32px;display:grid;place-items:center;background:var(--sand);font:900 12px monospace}.entry h3{margin:2px 0 8px;font-size:16px}.entry p,.entry ul{margin:7px 0}.facts{color:var(--muted);font-size:13px}
  .decision{padding:22px;border-top:1px solid var(--line)}label{display:block;font-size:12px;font-weight:800;margin-top:14px}input,textarea{display:block;width:100%;margin-top:6px;border:1px solid var(--line);padding:12px;font:inherit;min-height:48px}textarea{min-height:100px;resize:vertical}.check{display:flex;gap:10px;align-items:flex-start;font-weight:500;font-size:13px}.check input{width:20px;min-height:20px;margin:0;flex:0 0 20px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}button{min-height:56px;border:0;color:#fff;font-weight:900;padding:12px;cursor:pointer}button[value=approved]{background:var(--green)}button[value=changes_requested]{background:var(--danger)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--sand);outline-offset:2px}.notice{padding:14px;border-left:6px solid var(--danger);background:#fae7e4;color:#76271e}.trap{position:absolute;left:-10000px}.stamp{display:inline-block;border:3px solid ${approved ? "var(--green)" : "var(--danger)"};color:${approved ? "var(--green)" : "var(--danger)"};padding:9px 13px;transform:rotate(-2deg);font:900 15px "Arial Narrow",sans-serif;letter-spacing:1px}.final{padding:25px}.comment{background:#f4f1e9;padding:13px}.legal{color:var(--muted);font-size:12px;text-align:center;margin:20px auto 0;max-width:680px}
  @media(max-width:580px){.summary,.actions{grid-template-columns:1fr}.cell:nth-child(odd){border-right:0}.sheet{box-shadow:4px 4px 0 var(--green)}}
  </style></head><body><header><div class="inner"><div class="brand">Stavuno · kontrola uzavretého dňa</div><h1>${escapeHtml(project.name)}</h1><p class="subtitle">${escapeHtml(project.location || project.address || "Záznam stavebného projektu")}</p></div></header>
  <main><section class="sheet"><div class="summary"><div class="cell"><span class="label">Uzavretý deň</span><strong>${escapeHtml(date(closure.logDate))}</strong></div><div class="cell"><span class="label">Verzia</span><strong>${escapeHtml(closure.version)}</strong></div><div class="cell"><span class="label">Príjemca</span><strong>${escapeHtml(maskRecipientName(request.recipientName))}</strong><br>${escapeHtml(roleLabels[request.reviewerRole] ?? request.reviewerRole)}</div><div class="cell"><span class="label">Uzavreté</span><strong>${escapeHtml(dateTime(closure.confirmedAt))}</strong></div><div class="cell" style="grid-column:1/-1"><span class="label">SHA-256 odtlačok presnej verzie</span><div class="hash">${escapeHtml(closure.contentHash)}</div></div></div>
  <div class="entries"><h2>Záznamy dňa</h2>${entries || "<p>V uzavretej verzii nie je žiadny denný záznam.</p>"}</div>
  ${finalState ? `<div class="final"><div class="stamp">${decision}</div><h2>Rozhodnutie bolo zaznamenané</h2><p>${request.decidedAt ? escapeHtml(dateTime(request.decidedAt)) : ""}</p>${request.decisionComment ? `<p class="comment">${escapeHtml(request.decisionComment)}</p>` : ""}</div>` : `<form class="decision" method="post" action="?token=${escapeHtml(token)}">${failed ? '<div class="notice">Rozhodnutie sa nepodarilo uložiť. Skontrolujte presné meno, potvrdenie a pripomienku.</div>' : ""}<h2>Vaše rozhodnutie</h2><p>Pred potvrdením skontrolujte záznamy aj odtlačok verzie. Rozhodnutie je možné vykonať iba raz.</p><label class="trap">Web<input name="website" tabindex="-1" autocomplete="off"></label><label>Meno a priezvisko presne podľa pozvánky *<input name="signer_name" required minlength="2" maxlength="120" autocomplete="name"></label><label>Pripomienka<textarea name="comment" maxlength="1000" placeholder="Pri požiadavke na zmenu uveďte, čo treba opraviť."></textarea></label><label class="check"><input type="checkbox" name="confirmed" value="yes" required><span>Potvrdzujem, že som určený príjemca, skontroloval som uvedenú verziu a rozumiem, že moje rozhodnutie zostane v auditnej histórii.</span></label><div class="actions"><button name="decision" value="approved">Schváliť deň</button><button name="decision" value="changes_requested">Vyžiadať zmeny</button></div></form>`}</section>
  <p class="legal">Toto potvrdenie je auditný záznam v aplikácii. Nie je kvalifikovaným elektronickým podpisom ani náhradou podpisu, ktorý vyžaduje zákon alebo zmluva.</p></main></body></html>`;
}

Deno.serve(async (request) => {
  if (!["GET", "POST"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...headers, Allow: "GET, POST" },
    });
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token))
    return new Response(unavailablePage(), { status: 404, headers });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey)
    return new Response(unavailablePage(), { status: 503, headers });
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  if (request.method === "POST") {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 8192)
      return new Response(unavailablePage(), { status: 413, headers });
    let result = "error";
    try {
      const form = await request.formData();
      if (!String(form.get("website") ?? "")) {
        const submitted = await client.rpc("submit_diary_approval_decision", {
          p_token: token,
          p_decision: String(form.get("decision") ?? ""),
          p_signer_name: String(form.get("signer_name") ?? ""),
          p_comment: String(form.get("comment") ?? ""),
          p_confirmed: form.get("confirmed") === "yes",
        });
        if (submitted.error) throw submitted.error;
        result = "success";
      }
    } catch {
      result = "error";
    }
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: `?token=${encodeURIComponent(token)}&result=${result}`,
      },
    });
  }

  const resolved = await client.rpc("resolve_diary_approval", {
    p_token: token,
  });
  if (resolved.error || !resolved.data)
    return new Response(unavailablePage(), { status: 404, headers });
  return new Response(
    page(
      resolved.data as ApprovalSnapshot,
      token,
      requestUrl.searchParams.get("result") ?? "",
    ),
    { status: 200, headers },
  );
});
