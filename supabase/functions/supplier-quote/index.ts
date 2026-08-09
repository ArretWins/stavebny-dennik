import { createClient } from "npm:@supabase/supabase-js@2";

type QuoteRequest = {
  reference: string;
  projectName: string;
  desiredDate?: string | null;
  expiresAt: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
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

function formatDate(value?: string | null): string {
  if (!value) return "Bez určeného termínu";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function parseMoney(value: string): number | undefined {
  let normalized = value.trim().replace(/[\s\u00a0]/g, "");
  if (normalized.includes(","))
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 && cents <= 1_000_000_000 ? cents : undefined;
}

function unavailablePage(): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Výzva už nie je dostupná</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;
  background:#edf1f2;color:#17211d;font:16px/1.55 "Segoe UI",sans-serif;padding:24px}
  main{max-width:540px;background:#fff;border:1px solid #9dabb1;padding:36px;
  box-shadow:10px 10px 0 #133b5c}h1{font:800 30px/1.1 "Arial Narrow","Segoe UI",sans-serif;
  margin:0 0 16px}p{margin:0;color:#536067}</style></head><body><main>
  <h1>Výzva už nie je dostupná</h1><p>Platnosť odkazu skončila, bol nahradený novým alebo už bol vybraný dodávateľ.</p>
  </main></body></html>`;
}

function page(snapshot: QuoteRequest, token: string, result: string): string {
  const items = snapshot.items
    .map(
      (item, index) => `<tr><td><span>${String(index + 1).padStart(2, "0")}</span>
      ${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td></tr>`,
    )
    .join("");
  const idempotency = crypto.randomUUID();
  const success = result === "success";
  const failed = result === "error";
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#133b5c"><title>Požiadavka na cenovú ponuku</title><style>
  :root{--ink:#17211d;--blue:#133b5c;--blue2:#1f567c;--yellow:#f2c14e;
  --fog:#edf1f2;--paper:#fff;--line:#9dabb1;--muted:#536067;--danger:#9a3d2f}
  *{box-sizing:border-box}body{margin:0;background:var(--fog);color:var(--ink);
  font:16px/1.5 "Segoe UI",Arial,sans-serif;background-image:linear-gradient(#dfe6e8 1px,transparent 1px),linear-gradient(90deg,#dfe6e8 1px,transparent 1px);background-size:28px 28px}
  .top{background:var(--blue);color:#fff;border-bottom:8px solid var(--yellow);padding:28px max(20px,env(safe-area-inset-left))}
  .top-inner,main{width:min(720px,100%);margin:auto}.brand{font:800 12px/1 "Arial Narrow",sans-serif;letter-spacing:1.8px;text-transform:uppercase;color:#cfe1eb}
  h1{font:900 clamp(30px,7vw,48px)/.98 "Arial Narrow","Segoe UI",sans-serif;letter-spacing:-1px;margin:13px 0 10px}.subtitle{color:#dbe7ed;margin:0;max-width:560px}
  main{padding:22px 16px 48px}.sheet{background:var(--paper);border:1px solid var(--line);box-shadow:7px 7px 0 #133b5c;margin-bottom:22px}.sheet-head{display:grid;grid-template-columns:1fr auto;border-bottom:1px solid var(--line)}
  .sheet-head>div{padding:20px}.sheet-head>div+div{border-left:1px solid var(--line);background:#f8fafb;min-width:132px}.utility{font:800 11px/1.2 "Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:1.2px;color:var(--blue2);margin:0 0 6px}.sheet h2{font:850 23px/1.15 "Arial Narrow",sans-serif;margin:0}.reference{font:900 20px/1 monospace;color:var(--blue)}
  table{width:100%;border-collapse:collapse}th,td{padding:13px 20px;text-align:left;border-bottom:1px solid #ccd5d9}th{font:800 11px/1 "Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:1px;color:var(--muted);background:#f5f8f9}td:last-child,th:last-child{text-align:right;font-weight:800}td span{display:inline-grid;place-items:center;width:28px;height:28px;background:var(--yellow);margin-right:10px;font:900 11px monospace}
  .deadline{display:grid;grid-template-columns:1fr 1fr}.deadline>div{padding:16px 20px}.deadline>div+div{border-left:1px solid var(--line)}.deadline strong{display:block}
  .form{padding:22px}.form h2{margin-bottom:6px}.hint{color:var(--muted);font-size:13px;margin:0 0 18px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:15px}.full{grid-column:1/-1}label{display:block;font-size:12px;font-weight:800;color:#27363c}input,textarea{display:block;width:100%;margin-top:6px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:0;padding:12px;font:inherit;min-height:48px}input:focus,textarea:focus{outline:3px solid #f2c14e80;border-color:var(--blue)}textarea{resize:vertical;min-height:90px}.trap{position:absolute;left:-10000px}
  button{width:100%;min-height:56px;border:0;background:var(--blue);color:#fff;font:900 16px "Segoe UI",sans-serif;padding:14px;margin-top:18px;box-shadow:5px 5px 0 var(--yellow);cursor:pointer}button:hover{background:var(--blue2)}button:focus-visible{outline:3px solid var(--yellow);outline-offset:3px}.notice{padding:16px 20px;margin-bottom:18px;border-left:6px solid var(--blue);background:#e2eef4;font-weight:700}.notice.error{border-color:var(--danger);background:#fae9e6;color:#712b20}.success{padding:30px}.stamp{display:inline-block;border:3px solid #267044;color:#267044;padding:8px 12px;transform:rotate(-2deg);font:900 15px "Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:1px;margin-bottom:18px}.success h2{font-size:28px}.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:20px}
  @media(max-width:560px){.sheet-head,.fields,.deadline{grid-template-columns:1fr}.sheet-head>div+div,.deadline>div+div{border-left:0;border-top:1px solid var(--line)}th,td{padding:12px}.sheet{box-shadow:4px 4px 0 #133b5c}.full{grid-column:auto}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  </style></head><body><header class="top"><div class="top-inner"><div class="brand">Stavebný denník · Nákup materiálu</div>
  <h1>Požiadavka na cenovú ponuku</h1><p class="subtitle">Vyplňte cenu a reálny termín dodania. Objednávku potvrdí vedúci stavby samostatne.</p></div></header>
  <main><section class="sheet"><div class="sheet-head"><div><p class="utility">Objekt</p><h2>${escapeHtml(snapshot.projectName)}</h2></div><div><p class="utility">Referencia</p><div class="reference">${escapeHtml(snapshot.reference)}</div></div></div>
  <table><thead><tr><th>Požadovaný materiál</th><th>Množstvo</th></tr></thead><tbody>${items}</tbody></table>
  <div class="deadline"><div><p class="utility">Materiál potrebný do</p><strong>${escapeHtml(formatDate(snapshot.desiredDate))}</strong></div><div><p class="utility">Ponuku odošlite do</p><strong>${escapeHtml(formatDate(snapshot.expiresAt))}</strong></div></div>
  ${success ? `<div class="success"><div class="stamp">Ponuka prijatá</div><h2>Ďakujeme za ponuku</h2><p>Vedúci stavby ju uvidí v porovnávacom liste. Odoslanie ponuky ešte nie je objednávka.</p></div>` : `<form class="form" method="post" action="?token=${escapeHtml(token)}">
  ${failed ? '<div class="notice error">Ponuku sa nepodarilo uložiť. Skontrolujte cenu, dátumy a skúste to znova.</div>' : '<div class="notice">Uveďte celkovú cenu s DPH vrátane dopravy, ak v poznámke neuvediete inak.</div>'}
  <h2>Vaša ponuka</h2><p class="hint">Polia označené hviezdičkou sú povinné.</p><input type="hidden" name="idempotency_key" value="${idempotency}"><label class="trap">Web<input name="website" tabindex="-1" autocomplete="off"></label>
  <div class="fields"><label class="full">Názov dodávateľa *<input name="supplier_name" required minlength="2" maxlength="160" autocomplete="organization" placeholder="Názov firmy alebo prevádzky"></label>
  <label>Celková cena s DPH *<input name="total_amount" required inputmode="decimal" placeholder="1 250,00 €"></label>
  <label>Termín dodania<input name="delivery_date" type="date"></label>
  <label>Ponuka platí do<input name="valid_until" type="date"></label>
  <label class="full">Poznámka<textarea name="note" maxlength="500" placeholder="Doprava, dostupnosť, platobné podmienky alebo položky, ktoré cena nezahŕňa."></textarea></label></div>
  <button>Odoslať cenovú ponuku</button></form>`}</section>
  <p class="foot">Súkromná dočasná výzva · odkaz neposúvajte mimo vašej firmy</p></main></body></html>`;
}

Deno.serve(async (request) => {
  if (!["GET", "POST"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
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
      if (String(form.get("website") ?? "")) result = "success";
      else {
        const cents = parseMoney(String(form.get("total_amount") ?? ""));
        if (cents === undefined) throw new Error("INVALID_AMOUNT");
        const submitted = await client.rpc("submit_material_supplier_quote", {
          p_token: token,
          p_idempotency_key: String(form.get("idempotency_key") ?? ""),
          p_supplier_name: String(form.get("supplier_name") ?? ""),
          p_total_amount_cents: cents,
          p_delivery_date: String(form.get("delivery_date") ?? "") || null,
          p_valid_until: String(form.get("valid_until") ?? "") || null,
          p_note: String(form.get("note") ?? ""),
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

  const resolved = await client.rpc("resolve_material_supplier_quote_invite", {
    p_token: token,
  });
  if (resolved.error || !resolved.data)
    return new Response(unavailablePage(), { status: 404, headers });
  return new Response(
    page(
      resolved.data as QuoteRequest,
      token,
      requestUrl.searchParams.get("result") ?? "",
    ),
    { status: 200, headers },
  );
});
