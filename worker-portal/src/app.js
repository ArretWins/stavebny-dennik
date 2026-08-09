import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.STAVBA_CONFIG || {};
const client =
  config.supabaseUrl && config.anonKey
    ? createClient(config.supabaseUrl, config.anonKey)
    : null;
const invite = new URL(location.href).searchParams.get("token") || "";
const preview = ["127.0.0.1", "localhost"].includes(location.hostname)
  ? new URL(location.href).searchParams.get("preview")
  : "";
let worker;
let authUser;
let currentShift;
let deliveryRequests = [];
let stockOptions = [];
const $ = (id) => document.getElementById(id);

function show(id) {
  for (const name of ["loading", "join", "pending", "blocked", "active"])
    $(name).classList.toggle("hidden", name !== id);
}
function message(text, tone = "error") {
  const box = document.createElement("div");
  box.className = tone;
  box.textContent = text;
  $("message").replaceChildren(box);
}
function itemRow() {
  const row = document.createElement("div");
  row.className = "item item-grid";
  row.innerHTML =
    '<input class="item-name" maxlength="160" placeholder="Názov materiálu" required><input class="item-quantity" type="number" min="0.01" step="0.01" placeholder="Množstvo" required><input class="item-unit" maxlength="30" placeholder="ks / m / kg" required>';
  $("items").append(row);
}
async function session() {
  let {
    data: { session: current },
  } = await client.auth.getSession();
  if (!current) {
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
    current = result.data.session;
  }
  return current;
}
async function memberships() {
  const result = await client
    .from("project_workers")
    .select("*")
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}
async function track(eventName, properties = {}) {
  if (!client) return;
  try {
    await client.rpc("track_analytics_event", {
      p_event_name: eventName,
      p_properties: properties,
    });
  } catch {}
}
async function loadAnalytics() {
  const auth = await client.auth.getUser();
  if (!auth.data.user) return;
  const result = await client
    .from("analytics_preferences")
    .select("enabled")
    .eq("user_id", auth.data.user.id)
    .maybeSingle();
  if (!result.error)
    $("analytics-toggle").checked = result.data?.enabled ?? true;
}
async function changeAnalytics() {
  const enabled = $("analytics-toggle").checked;
  $("analytics-toggle").disabled = true;
  try {
    const result = await client.rpc("set_analytics_enabled", {
      p_enabled: enabled,
    });
    if (result.error) throw result.error;
    if (enabled)
      await track("analytics_changed", { status: "enabled", platform: "web" });
  } catch {
    $("analytics-toggle").checked = !enabled;
    message("Nastavenie analytiky sa nepodarilo uložiť.");
  } finally {
    $("analytics-toggle").disabled = false;
  }
}
function pushKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4),
    raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}
async function configurePush() {
  if (
    !config.vapidPublicKey ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return;
  const registration = await navigator.serviceWorker.register("/sw.js"),
    existing = await registration.pushManager.getSubscription();
  if (existing) $("push-enabled").classList.remove("hidden");
  else $("enable-push").classList.remove("hidden");
}
async function enablePush() {
  try {
    if ((await Notification.requestPermission()) !== "granted") return;
    const registration = await navigator.serviceWorker.ready,
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushKey(config.vapidPublicKey),
      }),
      keys = subscription.toJSON().keys || {},
      auth = await client.auth.getUser();
    if (!auth.data.user || !worker) throw new Error("AUTH_REQUIRED");
    const result = await client.from("push_subscriptions").upsert(
      {
        auth_user_id: auth.data.user.id,
        worker_id: worker.id,
        channel: "web",
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth_secret: keys.auth,
        active: true,
      },
      { onConflict: "auth_user_id,endpoint" },
    );
    if (result.error) throw result.error;
    $("enable-push").classList.add("hidden");
    $("push-enabled").classList.remove("hidden");
  } catch {
    message(
      "Upozornenia sa nepodarilo povoliť. Skontrolujte nastavenia prehliadača.",
    );
  }
}
async function loadRequests() {
  const result = await client
    .from("material_requests")
    .select("*,material_request_items(*)")
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  const labels = {
      new: "Nová",
      approved: "Schválená",
      partially_purchased: "Čiastočne kúpená",
      purchased: "Kúpená",
      rejected: "Zamietnutá",
    },
    cards = (result.data || []).map((request) => {
      const article = document.createElement("article");
      article.className = "card request";
      article.dataset.status = request.status;
      const status = document.createElement("span");
      status.className = "status";
      status.textContent = labels[request.status];
      const title = document.createElement("h3");
      title.textContent = new Date(request.created_at).toLocaleDateString(
        "sk-SK",
      );
      const items = document.createElement("p");
      items.textContent = request.material_request_items
        .map((item) => `${item.name} · ${item.quantity} ${item.unit}`)
        .join("\n");
      article.append(status, title, items);
      if (request.rejection_reason) {
        const reason = document.createElement("p");
        reason.className = "muted";
        reason.textContent = request.rejection_reason;
        article.append(reason);
      }
      return article;
    });
  $("requests").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "card muted";
    empty.textContent = "Zatiaľ ste neposlali žiadnu žiadosť.";
    $("requests").append(empty);
  }
}
function shiftTime(value) {
  return value
    ? new Date(value).toLocaleTimeString("sk-SK", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
function shiftHours(shift) {
  if (!shift.ended_at) return "Prebieha";
  const minutes = Math.max(
    0,
    Math.floor(
      (new Date(shift.ended_at) - new Date(shift.started_at)) / 60000,
    ) - Number(shift.break_minutes || 0),
  );
  return `${(minutes / 60).toLocaleString("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}
async function loadAttendance() {
  const result = await client
    .from("work_shifts")
    .select("*")
    .eq("worker_id", worker.id)
    .order("started_at", { ascending: false })
    .limit(7);
  if (result.error) throw result.error;
  const shifts = result.data || [];
  currentShift = shifts.find((item) => item.status === "active");
  $("shift-action").textContent = currentShift
    ? "Ukončiť smenu"
    : "Začať smenu";
  $("shift-end-fields").classList.toggle("hidden", !currentShift);
  $("shift-state").textContent = currentShift
    ? `Začiatok ${shiftTime(currentShift.started_at)} · nezabudnite ukončiť smenu`
    : "Smena momentálne neprebieha.";
  $("shift-clock").textContent = currentShift
    ? shiftTime(currentShift.started_at)
    : "Mimo";
  const rows = shifts
    .filter((item) => item.status !== "active")
    .slice(0, 5)
    .map((shift) => {
      const row = document.createElement("div");
      row.className = "shift-row";
      const label = document.createElement("span");
      label.textContent = new Date(
        `${shift.shift_date}T12:00:00`,
      ).toLocaleDateString("sk-SK", { day: "numeric", month: "short" });
      const times = document.createElement("small");
      times.textContent = `${shiftTime(shift.started_at)}–${shiftTime(shift.ended_at)} · ${shiftHours(shift)}`;
      const status = document.createElement("strong");
      status.textContent =
        shift.status === "approved" ? "Potvrdená" : "Na kontrolu";
      row.append(label, times, status);
      return row;
    });
  $("recent-shifts").replaceChildren(...rows);
}
async function acknowledgeSafetyBriefing(briefingId, checkbox, button) {
  if (!checkbox.checked) return;
  button.disabled = true;
  checkbox.disabled = true;
  try {
    const result = await client.rpc("acknowledge_my_safety_briefing", {
      p_briefing_id: briefingId,
      p_confirmed: true,
    });
    if (result.error) throw result.error;
    message("Oboznámenie s poučením bolo potvrdené.", "success");
    await loadSafetyBriefings();
  } catch {
    message(
      "Potvrdenie sa nepodarilo uložiť. Skontrolujte pripojenie a skúste to znova.",
    );
    button.disabled = false;
    checkbox.disabled = false;
  }
}
async function loadSafetyBriefings() {
  const result = await client
    .from("safety_briefing_recipients")
    .select("*,safety_briefings(*)")
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  const cards = (result.data || [])
    .filter((item) => item.safety_briefings)
    .map((recipient) => {
      const briefing = recipient.safety_briefings,
        article = document.createElement("article");
      article.className = "safety-briefing";
      article.dataset.status = recipient.status;
      const status = document.createElement("span");
      status.className = "status";
      status.textContent =
        recipient.status === "pending"
          ? "Čaká na potvrdenie"
          : recipient.status === "acknowledged"
            ? "Potvrdené"
            : "Ospravedlnené";
      const title = document.createElement("h3");
      title.textContent = briefing.title;
      const date = document.createElement("time");
      date.dateTime = briefing.briefing_date;
      date.textContent = new Date(
        `${briefing.briefing_date}T12:00:00`,
      ).toLocaleDateString("sk-SK", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const body = document.createElement("p");
      body.className = "safety-copy";
      body.textContent = briefing.body;
      const hash = document.createElement("code");
      hash.textContent = `SHA-256 ${recipient.content_hash}`;
      article.append(status, title, date, body, hash);
      if (recipient.status === "pending" && briefing.status === "published") {
        const label = document.createElement("label");
        label.className = "safety-confirm";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        const text = document.createElement("span");
        text.textContent =
          "Potvrdzujem, že som si poučenie prečítal(a), porozumel(a) mu a budem ho dodržiavať.";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Potvrdiť oboznámenie";
        button.disabled = true;
        checkbox.onchange = () => {
          button.disabled = !checkbox.checked;
        };
        button.onclick = () =>
          void acknowledgeSafetyBriefing(briefing.id, checkbox, button);
        label.append(checkbox, text);
        article.append(label, button);
      } else if (recipient.acknowledged_at) {
        const confirmed = document.createElement("p");
        confirmed.className = "safety-confirmed";
        confirmed.textContent = `Potvrdené ${new Date(recipient.acknowledged_at).toLocaleString("sk-SK")}`;
        article.append(confirmed);
      } else if (recipient.excuse_reason) {
        const excused = document.createElement("p");
        excused.className = "muted";
        excused.textContent = recipient.excuse_reason;
        article.append(excused);
      }
      return article;
    });
  $("safety-briefings").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Momentálne nemáte žiadne poučenie na potvrdenie.";
    $("safety-briefings").append(empty);
  }
}
function credentialHealth(item) {
  if (item.revoked_at) return ["Odvolaný", "#6b7280"];
  if (!item.expires_at) return ["Bez obmedzenia", "#4472a8"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${item.expires_at}T00:00:00`);
  if (expiry < today) return ["Platnosť skončila", "#c62828"];
  const warning = new Date(today);
  warning.setDate(warning.getDate() + 30);
  return expiry <= warning
    ? ["Čoskoro končí", "#ef6c00"]
    : ["Platný", "#2e7d32"];
}
async function loadCredentials() {
  const result = await client
    .from("worker_credentials")
    .select("*")
    .eq("worker_id", worker.id)
    .order("expires_at", { ascending: true, nullsFirst: false });
  if (result.error) throw result.error;
  const typeLabels = {
    medical_exam: "Lekárska prehliadka",
    bozp_training: "Školenie BOZP",
    height_work: "Práca vo výške",
    machinery_operator: "Obsluha strojov",
    electrician: "Elektrotechnická spôsobilosť",
    welder: "Zváračský preukaz",
    driver: "Vodičské oprávnenie",
    other: "Iný doklad",
  };
  const cards = (result.data || []).map((item) => {
    const [label, color] = credentialHealth(item);
    const article = document.createElement("article");
    article.className = "credential";
    article.style.setProperty("--credential-color", color);
    const head = document.createElement("div");
    head.className = "credential-head";
    const title = document.createElement("h3");
    title.textContent = item.title;
    const state = document.createElement("span");
    state.className = "credential-state";
    state.textContent = label;
    head.append(title, state);
    const type = document.createElement("p");
    type.className = "muted";
    type.textContent = [
      typeLabels[item.credential_type] || item.credential_type,
      item.document_number,
    ]
      .filter(Boolean)
      .join(" · ");
    const expiry = document.createElement("p");
    expiry.textContent = item.expires_at
      ? `Platí do ${new Date(`${item.expires_at}T12:00:00`).toLocaleDateString("sk-SK")}`
      : "Bez časového obmedzenia";
    article.append(head, type, expiry);
    return article;
  });
  $("credentials").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Majster zatiaľ nezaevidoval žiadny doklad.";
    $("credentials").append(empty);
  }
}
async function loadIncidents() {
  const result = await client
    .from("site_incidents")
    .select("*")
    .eq("reporter_worker_id", worker.id)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  const status = {
    reported: "Nahlásené",
    investigating: "Vyšetrovanie",
    resolved: "Uzavreté",
  };
  const cards = (result.data || []).map((item) => {
    const article = document.createElement("article");
    article.className = `incident-summary severity-${item.severity}`;
    const title = document.createElement("strong");
    title.textContent = item.description;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${new Date(item.occurred_at).toLocaleString("sk-SK")} · ${item.location}`;
    const badge = document.createElement("span");
    badge.className = "status";
    badge.textContent = status[item.status] || item.status;
    article.append(badge, title, meta);
    return article;
  });
  $("incidents").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Zatiaľ ste neposlali žiadne hlásenie.";
    $("incidents").append(empty);
  }
}
function renderDeliveryLines() {
  const request = deliveryRequests.find(
    (item) => item.id === $("delivery-request").value,
  );
  const rows = (request?.material_request_items || []).map((item) => {
    const row = document.createElement("div");
    row.className = "delivery-line";
    row.dataset.itemId = item.id;
    row.dataset.itemName = item.name;
    row.dataset.unit = item.unit;
    row.dataset.expected = String(item.quantity);
    const name = document.createElement("strong");
    name.textContent = `${item.name} · objednané ${item.quantity} ${item.unit}`;
    const fields = document.createElement("div");
    fields.className = "delivery-quantities";
    fields.innerHTML = `<label>Prijaté<input class="delivery-quantity" type="number" min="0" step="0.01" value="${item.quantity}" required></label><label>Poškodené<input class="delivery-damaged" type="number" min="0" step="0.01" value="0" required></label>`;
    row.append(name, fields);
    return row;
  });
  $("delivery-lines").replaceChildren(...rows);
}
async function loadDeliveries() {
  const requests = await client
    .from("material_requests")
    .select("*,material_request_items(*)")
    .eq("worker_id", worker.id)
    .in("status", ["approved", "partially_purchased", "purchased"])
    .order("created_at", { ascending: false });
  if (requests.error) throw requests.error;
  deliveryRequests = requests.data || [];
  $("delivery-request").replaceChildren(
    ...deliveryRequests.map((request) => {
      const option = document.createElement("option");
      option.value = request.id;
      option.textContent = (request.material_request_items || [])
        .map((item) => item.name)
        .join(", ");
      return option;
    }),
  );
  renderDeliveryLines();
  $("delivery-form").classList.toggle("hidden", !deliveryRequests.length);
  const result = await client
    .from("material_deliveries")
    .select("*")
    .eq("receiver_worker_id", worker.id)
    .order("delivered_at", { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  const labels = {
    reported: "Čaká na kontrolu",
    accepted: "Prevzaté",
    discrepancy: "Rozdiel",
    resolved: "Rozdiel uzavretý",
  };
  const cards = (result.data || []).map((item) => {
    const article = document.createElement("article");
    article.className = `delivery-summary delivery-${item.status}`;
    const badge = document.createElement("span");
    badge.className = "status";
    badge.textContent = labels[item.status] || item.status;
    const title = document.createElement("strong");
    title.textContent = item.supplier_name;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = new Date(item.delivered_at).toLocaleString("sk-SK");
    article.append(badge, title, meta);
    return article;
  });
  $("deliveries").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Zatiaľ ste neprevzali žiadnu dodávku.";
    $("deliveries").append(empty);
  }
}
async function loadStock() {
  const options = await client.rpc("my_material_stock_options", {
    p_worker_id: worker.id,
  });
  if (options.error) throw options.error;
  stockOptions = options.data || [];
  $("stock-item").replaceChildren(
    ...stockOptions.map((item) => {
      const option = document.createElement("option");
      option.value = item.request_item_id;
      option.textContent = `${item.material_name} · ${item.unit}`;
      return option;
    }),
  );
  $("stock-form").classList.toggle("hidden", !stockOptions.length);
  const result = await client
    .from("material_stock_movements")
    .select("*")
    .eq("worker_id", worker.id)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  const status = {
    reported: "Čaká na kontrolu",
    confirmed: "Potvrdené",
    rejected: "Zamietnuté",
  };
  const type = { usage: "Spotreba", waste: "Odpad", return: "Vrátené" };
  const cards = (result.data || []).map((item) => {
    const article = document.createElement("article");
    article.className = `stock-summary stock-${item.status}`;
    const badge = document.createElement("span");
    badge.className = "status";
    badge.textContent = status[item.status] || item.status;
    const title = document.createElement("strong");
    title.textContent = `${item.material_name} · ${item.quantity} ${item.unit}`;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${type[item.movement_type] || item.movement_type} · ${new Date(item.occurred_at).toLocaleString("sk-SK")}`;
    article.append(badge, title, meta);
    if (item.rejection_reason) {
      const reason = document.createElement("p");
      reason.textContent = item.rejection_reason;
      article.append(reason);
    }
    return article;
  });
  $("stock-movements").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Zatiaľ ste neposlali žiadny pohyb materiálu.";
    $("stock-movements").append(empty);
  }
}
async function toggleAttendance() {
  if (
    currentShift &&
    !window.confirm("Ukončiť aktuálnu smenu a odoslať hodiny majstrovi?")
  )
    return;
  const button = $("shift-action");
  button.disabled = true;
  try {
    const result = currentShift
      ? await client.rpc("end_my_work_shift", {
          p_shift_id: currentShift.id,
          p_break_minutes: Number($("shift-break").value || 0),
          p_note: $("shift-note").value.trim() || null,
        })
      : await client.rpc("start_my_work_shift", {
          p_project_id: worker.project_id,
        });
    if (result.error) throw result.error;
    $("shift-note").value = "";
    message(
      currentShift
        ? "Smena bola ukončená a odoslaná majstrovi."
        : "Smena sa začala.",
      "success",
    );
    await loadAttendance();
  } catch {
    message(
      currentShift
        ? "Smenu sa nepodarilo ukončiť. Skontrolujte prestávku a skúste to znova."
        : "Smenu sa nepodarilo začať. Skontrolujte pripojenie.",
    );
  } finally {
    button.disabled = false;
  }
}
async function changeTaskStatus(taskId, status, buttons) {
  for (const button of buttons) button.disabled = true;
  try {
    const result = await client.rpc("set_my_site_task_status", {
      p_task_id: taskId,
      p_status: status,
    });
    if (result.error) throw result.error;
    message("Stav úlohy bol uložený.", "success");
    await loadTasks();
  } catch {
    message("Stav úlohy sa nepodarilo zmeniť.");
    for (const button of buttons) button.disabled = false;
  }
}
function taskButton(label, taskId, status) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = label;
  button.dataset.status = status;
  button.onclick = () => {
    const siblings = [...button.parentElement.querySelectorAll("button")];
    void changeTaskStatus(taskId, status, siblings);
  };
  return button;
}

async function compressTaskPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("PHOTO_REQUIRED");
  if (file.size > 25 * 1024 * 1024) throw new Error("PHOTO_TOO_LARGE");
  let source;
  let release = () => {};
  if ("createImageBitmap" in window) {
    source = await createImageBitmap(file);
    release = () => source.close();
  } else {
    const url = URL.createObjectURL(file);
    const image = new Image();
    source = image;
    release = () => URL.revokeObjectURL(url);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
  }
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  release();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("PHOTO_FAILED")),
      "image/jpeg",
      0.82,
    ),
  );
  if (blob.size > 10 * 1024 * 1024) throw new Error("PHOTO_TOO_LARGE");
  return blob;
}

async function submitTaskEvidence(task, files, controls) {
  for (const control of controls) control.disabled = true;
  const uploadedPaths = [];
  try {
    if (!authUser || !files.length) throw new Error("TASK_EVIDENCE_REQUIRED");
    const photos = await Promise.all(files.map(compressTaskPhoto));
    const evidence = await Promise.all(
      photos.map(async (photo) => {
        const id = `attachment_${crypto.randomUUID()}`;
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await photo.arrayBuffer(),
        );
        const contentSha256 = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        return {
          id,
          storagePath:
            `${task.owner_id}/${task.project_id}/site-tasks/` +
            `${task.id}/${authUser.id}/${id}.jpg`,
          fileSize: photo.size,
          mimeType: "image/jpeg",
          captureSource: "worker_portal",
          capturedAt: new Date().toISOString(),
          contentSha256,
          integrityVersion: "sha256-v1",
          photo,
        };
      }),
    );
    const uploadResults = await Promise.all(
      evidence.map(async (item) => {
        const upload = await client.storage
          .from("attachments")
          .upload(item.storagePath, item.photo, {
            contentType: item.mimeType,
            upsert: false,
          });
        return { path: item.storagePath, error: upload.error };
      }),
    );
    uploadedPaths.push(
      ...uploadResults.filter((item) => !item.error).map((item) => item.path),
    );
    if (uploadResults.some((item) => item.error))
      throw new Error("TASK_EVIDENCE_UPLOAD_FAILED");
    const result = await client.rpc("submit_my_site_task", {
      p_task_id: task.id,
      p_evidence: evidence.map(({ photo: _photo, ...item }) => item),
    });
    if (result.error) throw result.error;
    message("Práca bola odoslaná majstrovi na kontrolu.", "success");
    await loadTasks();
  } catch {
    if (uploadedPaths.length)
      await client.storage.from("attachments").remove(uploadedPaths);
    message(
      "Fotografie sa nepodarilo odoslať. Skontrolujte pripojenie a skúste to znova.",
    );
    for (const control of controls) control.disabled = false;
  }
}

function evidenceForm(task, existingCount) {
  const remaining = Math.max(0, 6 - existingCount);
  const wrapper = document.createElement("div");
  wrapper.className = "task-evidence";
  const heading = document.createElement("strong");
  heading.textContent = "Fotografie dokončenej práce";
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = remaining
    ? `Pridané ${existingCount}/6 · môžete pridať ešte ${remaining}.`
    : "Limit 6 fotografií bol dosiahnutý.";
  wrapper.append(heading, hint);
  if (!remaining) return wrapper;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.className = "task-photo-input";
  input.setAttribute("aria-label", "Vybrať fotografie dokončenej práce");
  const preview = document.createElement("div");
  preview.className = "task-photo-preview";
  const submit = document.createElement("button");
  submit.type = "button";
  submit.disabled = true;
  submit.textContent = "Odoslať na kontrolu";
  let selected = [];
  let previewUrls = [];
  input.onchange = () => {
    for (const url of previewUrls) URL.revokeObjectURL(url);
    selected = [...(input.files || [])].slice(0, remaining);
    previewUrls = selected.map((file) => URL.createObjectURL(file));
    preview.replaceChildren(
      ...previewUrls.map((url, index) => {
        const image = document.createElement("img");
        image.src = url;
        image.alt = `Fotografia ${index + 1}`;
        return image;
      }),
    );
    submit.disabled = selected.length === 0;
    if ((input.files?.length || 0) > remaining)
      message(`Môžete pridať najviac ${remaining} ďalších fotografií.`);
  };
  submit.onclick = () =>
    void submitTaskEvidence(task, selected, [input, submit]);
  wrapper.append(input, preview, submit);
  return wrapper;
}

function taskEventLabel(event) {
  if (event.event_type === "comment") return "Komentár";
  if (event.event_type === "created") return "Úloha vytvorená";
  if (event.event_type === "assignment_changed") return "Zmena priradenia";
  if (event.event_type === "status_changed") return "Zmena stavu";
  return "Úloha upravená";
}

function taskTimeline(events) {
  const section = document.createElement("section");
  section.className = "task-timeline";
  const title = document.createElement("strong");
  title.textContent = "História a diskusia";
  section.append(title);
  for (const event of events.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "task-event";
    const heading = document.createElement("span");
    heading.textContent = taskEventLabel(event);
    const time = document.createElement("time");
    time.dateTime = event.created_at;
    time.textContent = new Date(event.created_at).toLocaleString("sk-SK");
    row.append(heading, time);
    if (event.body) {
      const body = document.createElement("p");
      body.textContent = event.body;
      row.append(body);
    }
    section.append(row);
  }
  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "História sa zobrazí po synchronizácii.";
    section.append(empty);
  }
  return section;
}

function taskCommentForm(task) {
  const form = document.createElement("form");
  form.className = "task-comment-form";
  const label = document.createElement("label");
  label.textContent = "Komentár pre majstra";
  const input = document.createElement("textarea");
  input.maxLength = 1000;
  input.rows = 2;
  input.required = true;
  input.placeholder = "Otázka, vysvetlenie alebo informácia z pracoviska";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Odoslať komentár";
  form.append(label, input, submit);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true;
    submit.disabled = true;
    try {
      const id =
        `task_event_${Date.now().toString(36)}_` +
        crypto.randomUUID().replaceAll("-", "");
      const result = await client.from("site_task_events").insert({
        id,
        owner_id: task.owner_id,
        project_id: task.project_id,
        task_id: task.id,
        actor_user_id: authUser.id,
        actor_worker_id: worker.id,
        event_type: "comment",
        body,
        metadata: {},
      });
      if (result.error) throw result.error;
      message("Komentár bol odoslaný.", "success");
      await loadTasks();
    } catch {
      message("Komentár sa nepodarilo odoslať.");
      input.disabled = false;
      submit.disabled = false;
    }
  };
  return form;
}

async function loadTasks() {
  const [result, evidenceResult, eventResult] = await Promise.all([
    client
      .from("site_tasks")
      .select("*,task_material_requirements(*),task_tool_requirements(*)")
      .eq("assigned_worker_id", worker.id)
      .order("created_at", { ascending: false }),
    client
      .from("attachments")
      .select("related_entity_id")
      .eq("created_by_worker_id", worker.id)
      .eq("related_entity_type", "site_task")
      .eq("evidence_role", "after"),
    client
      .from("site_task_events")
      .select("*")
      .eq("project_id", worker.project_id)
      .order("created_at", { ascending: false }),
  ]);
  if (result.error) throw result.error;
  if (evidenceResult.error) throw evidenceResult.error;
  if (eventResult.error) throw eventResult.error;
  const evidenceCounts = new Map();
  for (const item of evidenceResult.data || [])
    evidenceCounts.set(
      item.related_entity_id,
      (evidenceCounts.get(item.related_entity_id) || 0) + 1,
    );
  const eventsByTask = new Map();
  for (const event of eventResult.data || []) {
    const items = eventsByTask.get(event.task_id) || [];
    items.push(event);
    eventsByTask.set(event.task_id, items);
  }
  const statusLabels = {
    open: "Otvorená",
    in_progress: "Rieši sa",
    blocked: "Blokovaná",
    review: "Na kontrole",
    done: "Hotová",
  };
  const priorityLabels = {
    low: "Nízka",
    normal: "Bežná",
    high: "Vysoká",
    urgent: "Urgentná",
  };
  const kindLabels = {
    task: "Úloha",
    defect: "Nedostatok",
    inspection: "Kontrola",
    material: "Materiál",
  };
  const cards = (result.data || []).map((task) => {
    const article = document.createElement("article");
    article.className = "site-task";
    article.dataset.priority = task.priority;
    article.dataset.kind = task.kind;
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = statusLabels[task.status] || task.status;
    const title = document.createElement("h3");
    title.textContent = task.title;
    const meta = document.createElement("p");
    meta.className = "muted";
    const details = [
      kindLabels[task.kind] || task.kind,
      priorityLabels[task.priority] || task.priority,
    ];
    if (task.due_date) details.push(`Termín ${task.due_date}`);
    if (task.plan_id) details.push(`Plán · strana ${task.page_number || 1}`);
    meta.textContent = details.join(" · ");
    article.append(status, title, meta);
    if (task.description) {
      const description = document.createElement("p");
      description.textContent = task.description;
      article.append(description);
    }
    const materials = task.task_material_requirements || [];
    if (materials.length) {
      const kit = document.createElement("div");
      kit.className = "task-review-note";
      const label = document.createElement("strong");
      label.textContent = "Materiál k úlohe";
      const list = document.createElement("p");
      list.textContent = materials
        .map((item) => `${item.material_name}: ${item.quantity} ${item.unit}`)
        .join(" · ");
      kit.append(label, list);
      article.append(kit);
    }
    const tools = task.task_tool_requirements || [];
    if (tools.length) {
      const kit = document.createElement("div");
      kit.className = "task-review-note";
      const label = document.createElement("strong");
      label.textContent = "Náradie k úlohe";
      const list = document.createElement("p");
      list.textContent = tools
        .map(
          (item) =>
            `TL-${String(item.asset_number).padStart(4, "0")} · ${item.tool_name}`,
        )
        .join(" · ");
      kit.append(label, list);
      article.append(kit);
    }
    if (task.review_note) {
      const note = document.createElement("div");
      note.className = "task-review-note";
      const label = document.createElement("strong");
      label.textContent = "Vrátené na dopracovanie";
      const text = document.createElement("p");
      text.textContent = task.review_note;
      note.append(label, text);
      article.append(note);
    }
    article.append(taskTimeline(eventsByTask.get(task.id) || []));
    article.append(taskCommentForm(task));
    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (task.status === "review") {
      const waiting = document.createElement("p");
      waiting.className = "task-waiting";
      waiting.textContent = "Majster kontroluje odoslanú prácu.";
      article.append(waiting);
    } else if (task.status === "done") {
      const accepted = document.createElement("p");
      accepted.className = "task-accepted";
      accepted.textContent = "Práca bola prijatá.";
      article.append(accepted);
    } else {
      if (task.status !== "in_progress")
        actions.append(taskButton("Začať", task.id, "in_progress"));
      if (actions.children.length) article.append(actions);
      article.append(evidenceForm(task, evidenceCounts.get(task.id) || 0));
    }
    return article;
  });
  $("tasks").replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Momentálne nemáte pridelenú žiadnu úlohu.";
    $("tasks").append(empty);
  }
}
async function load() {
  try {
    if (!client) throw new Error("CONFIG_REQUIRED");
    const currentSession = await session();
    authUser = currentSession.user;
    const list = await memberships();
    if (
      invite &&
      !list.some(
        (item) => item.status === "pending" || item.status === "active",
      )
    ) {
      show("join");
      return;
    }
    worker =
      list.find((item) => item.status === "active") ||
      list.find((item) => item.status === "pending") ||
      list[0];
    if (!worker) {
      show(invite ? "join" : "blocked");
      $("blocked-text").textContent = "Otvorte platný QR kód od majstra.";
      return;
    }
    if (worker.status === "pending") {
      show("pending");
      $("pending-name").textContent =
        `${worker.first_name} ${worker.last_name}`;
      return;
    }
    if (worker.status !== "active") {
      show("blocked");
      $("blocked-text").textContent =
        worker.status === "revoked"
          ? "Majster odvolal tento prístup."
          : "Žiadosť o prístup bola zamietnutá.";
      return;
    }
    show("active");
    $("worker-name").textContent =
      `${worker.first_name} ${worker.last_name} · ${worker.position}`;
    const project = await client
      .from("projects")
      .select("name")
      .eq("id", worker.project_id)
      .single();
    $("project-name").textContent = project.data?.name || "Stavebný objekt";
    await Promise.all([
      loadTasks(),
      loadRequests(),
      loadAttendance().catch(() => $("attendance").classList.add("hidden")),
      loadSafetyBriefings().catch(() =>
        $("safety-briefings-card").classList.add("hidden"),
      ),
      loadCredentials().catch(() =>
        $("credentials-card").classList.add("hidden"),
      ),
      loadIncidents().catch(() => $("incidents-card").classList.add("hidden")),
      loadDeliveries().catch(() =>
        $("deliveries-card").classList.add("hidden"),
      ),
      loadStock().catch(() => $("stock-card").classList.add("hidden")),
      configurePush(),
      loadAnalytics(),
    ]);
  } catch {
    show("blocked");
    message(
      "Prístup sa nepodarilo načítať. Skontrolujte internetové pripojenie.",
    );
  }
}

$("join-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const result = await client.rpc("join_project_as_worker", {
      p_token: invite,
      p_first_name: $("first").value,
      p_last_name: $("last").value,
      p_position: $("position").value,
    });
    if (result.error) throw result.error;
    await track("worker_joined", { platform: "web", status: "pending" });
    history.replaceState({}, "", location.pathname);
    location.reload();
  } catch {
    message(
      "QR kód je neplatný, vypršal alebo bol na tomto zariadení už použitý.",
    );
  }
};
$("request-form").onsubmit = async (event) => {
  event.preventDefault();
  const items = [...document.querySelectorAll(".item")].map((row) => ({
    name: row.querySelector(".item-name").value,
    quantity: Number(row.querySelector(".item-quantity").value),
    unit: row.querySelector(".item-unit").value,
  }));
  try {
    const result = await client.rpc("create_material_request", {
      p_worker_id: worker.id,
      p_desired_date: $("desired").value || null,
      p_comment: $("comment").value,
      p_items: items,
    });
    if (result.error) throw result.error;
    await track("material_requested", { platform: "web", count: items.length });
    $("request-form").reset();
    $("items").replaceChildren();
    itemRow();
    message("Žiadosť bola odoslaná.", "success");
    await loadRequests();
  } catch {
    message("Žiadosť sa nepodarilo odoslať. Skontrolujte všetky položky.");
  }
};
$("incident-confirm").onchange = () => {
  $("incident-submit").disabled = !$("incident-confirm").checked;
};
$("incident-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!$("incident-confirm").checked) return;
  const button = $("incident-submit");
  button.disabled = true;
  try {
    if (!window.confirm("Odoslať toto bezpečnostné hlásenie majstrovi?"))
      return;
    const result = await client.rpc("report_my_site_incident", {
      p_worker_id: worker.id,
      p_incident_type: $("incident-type").value,
      p_severity: $("incident-severity").value,
      p_occurred_at: new Date($("incident-time").value).toISOString(),
      p_location: $("incident-location").value,
      p_description: $("incident-description").value,
      p_immediate_action: $("incident-action").value || null,
      p_people_involved: $("incident-people").value || null,
      p_confirmed: true,
    });
    if (result.error) throw result.error;
    $("incident-form").reset();
    setIncidentNow();
    message("Hlásenie bolo odoslané majstrovi.", "success");
    await loadIncidents();
  } catch {
    message("Hlásenie sa nepodarilo odoslať. Skontrolujte údaje a pripojenie.");
  } finally {
    button.disabled = !$("incident-confirm").checked;
  }
};
function setIncidentNow() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  $("incident-time").value = now.toISOString().slice(0, 16);
  $("incident-confirm").checked = false;
  $("incident-submit").disabled = true;
}
function setDeliveryNow() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  $("delivery-time").value = now.toISOString().slice(0, 16);
  $("delivery-confirm").checked = false;
  $("delivery-submit").disabled = true;
}
$("delivery-request").onchange = renderDeliveryLines;
$("delivery-confirm").onchange = () => {
  $("delivery-submit").disabled = !$("delivery-confirm").checked;
};
$("delivery-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!$("delivery-confirm").checked) return;
  const button = $("delivery-submit");
  button.disabled = true;
  try {
    if (!window.confirm("Odoslať skontrolované množstvá majstrovi?")) return;
    const lines = [...document.querySelectorAll(".delivery-line")].map(
      (row) => ({
        requestItemId: row.dataset.itemId,
        itemName: row.dataset.itemName,
        unit: row.dataset.unit,
        expectedQuantity: Number(row.dataset.expected),
        deliveredQuantity: Number(
          row.querySelector(".delivery-quantity").value,
        ),
        damagedQuantity: Number(row.querySelector(".delivery-damaged").value),
      }),
    );
    const result = await client.rpc("report_my_material_delivery", {
      p_worker_id: worker.id,
      p_request_id: $("delivery-request").value,
      p_supplier_name: $("delivery-supplier").value,
      p_delivery_note_number: $("delivery-note").value || null,
      p_delivered_at: new Date($("delivery-time").value).toISOString(),
      p_note: $("delivery-comment").value || null,
      p_lines: lines,
      p_confirmed: true,
    });
    if (result.error) throw result.error;
    $("delivery-form").reset();
    setDeliveryNow();
    renderDeliveryLines();
    message("Príjem dodávky bol odoslaný majstrovi.", "success");
    await loadDeliveries();
  } catch {
    message(
      "Príjem sa nepodarilo odoslať. Skontrolujte množstvá a pripojenie.",
    );
  } finally {
    button.disabled = !$("delivery-confirm").checked;
  }
};
function setStockNow() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  $("stock-time").value = now.toISOString().slice(0, 16);
  $("stock-confirm").checked = false;
  $("stock-submit").disabled = true;
}
$("stock-confirm").onchange = () => {
  $("stock-submit").disabled = !$("stock-confirm").checked;
};
$("stock-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!$("stock-confirm").checked) return;
  const button = $("stock-submit");
  button.disabled = true;
  try {
    const selected = stockOptions.find(
      (item) => item.request_item_id === $("stock-item").value,
    );
    if (
      !selected ||
      !window.confirm(
        `Odoslať ${$("stock-quantity").value} ${selected.unit} majstrovi na kontrolu?`,
      )
    )
      return;
    const result = await client.rpc("report_my_material_stock_movement", {
      p_worker_id: worker.id,
      p_request_item_id: selected.request_item_id,
      p_movement_type: $("stock-type").value,
      p_quantity: Number($("stock-quantity").value),
      p_occurred_at: new Date($("stock-time").value).toISOString(),
      p_note: $("stock-note").value || null,
      p_confirmed: true,
    });
    if (result.error) throw result.error;
    $("stock-form").reset();
    setStockNow();
    message("Pohyb materiálu bol odoslaný majstrovi na kontrolu.", "success");
    await loadStock();
  } catch {
    message("Pohyb sa nepodarilo odoslať. Skontrolujte množstvo a pripojenie.");
  } finally {
    button.disabled = !$("stock-confirm").checked;
  }
};
$("add-item").onclick = itemRow;
$("refresh").onclick = () => location.reload();
$("refresh-tasks").onclick = () =>
  void loadTasks().catch(() => message("Úlohy sa nepodarilo načítať."));
$("enable-push").onclick = enablePush;
$("analytics-toggle").onchange = () => void changeAnalytics();
$("shift-action").onclick = () => void toggleAttendance();
itemRow();
setIncidentNow();
setDeliveryNow();
setStockNow();
if (preview === "join") show("join");
else if (preview === "active") {
  $("worker-name").textContent = "Ján Novák · Murár";
  $("project-name").textContent = "Rekonštrukcia rodinného domu";
  $("shift-state").textContent = "Smena momentálne neprebieha.";
  $("shift-clock").textContent = "Mimo";
  const previewBriefing = document.createElement("article");
  previewBriefing.className = "safety-briefing";
  previewBriefing.innerHTML =
    '<span class="status">Čaká na potvrdenie</span><h3>Práca vo výške</h3><time>Dnes</time><p class="safety-copy">Použite ochranný postroj a pred začiatkom skontrolujte kotviaci bod.</p><code>SHA-256 8f2a…74bd</code>';
  const previewConfirm = document.createElement("label");
  previewConfirm.className = "safety-confirm";
  const previewCheckbox = document.createElement("input");
  previewCheckbox.type = "checkbox";
  const previewText = document.createElement("span");
  previewText.textContent =
    "Potvrdzujem, že som si poučenie prečítal(a), porozumel(a) mu a budem ho dodržiavať.";
  const previewButton = document.createElement("button");
  previewButton.type = "button";
  previewButton.textContent = "Potvrdiť oboznámenie";
  previewButton.disabled = true;
  previewCheckbox.onchange = () => {
    previewButton.disabled = !previewCheckbox.checked;
  };
  previewConfirm.append(previewCheckbox, previewText);
  previewBriefing.append(previewConfirm, previewButton);
  $("safety-briefings").replaceChildren(previewBriefing);
  const previewCredential = document.createElement("article");
  previewCredential.className = "credential";
  previewCredential.style.setProperty("--credential-color", "#ef6c00");
  previewCredential.innerHTML =
    '<div class="credential-head"><h3>Lekárska prehliadka</h3><span class="credential-state">Čoskoro končí</span></div><p class="muted">Lekárska prehliadka · MED-2026-42</p><p>Platí do 20. 8. 2026</p>';
  $("credentials").replaceChildren(previewCredential);
  deliveryRequests = [
    {
      id: "request-preview",
      material_request_items: [
        {
          id: "item-preview",
          name: "Cement CEM II",
          quantity: 30,
          unit: "vriec",
        },
        {
          id: "item-preview-2",
          name: "Murovacia malta",
          quantity: 12,
          unit: "vriec",
        },
      ],
    },
  ];
  const previewOption = document.createElement("option");
  previewOption.value = "request-preview";
  previewOption.textContent = "Cement CEM II, Murovacia malta";
  $("delivery-request").replaceChildren(previewOption);
  renderDeliveryLines();
  stockOptions = [
    {
      request_item_id: "item-preview",
      material_name: "Cement CEM II",
      unit: "vriec",
    },
  ];
  const stockOption = document.createElement("option");
  stockOption.value = "item-preview";
  stockOption.textContent = "Cement CEM II · vriec";
  $("stock-item").replaceChildren(stockOption);
  show("active");
} else void load();
