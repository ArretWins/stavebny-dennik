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
    const result = await client
      .from("push_subscriptions")
      .upsert(
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
async function load() {
  try {
    if (!client) throw new Error("CONFIG_REQUIRED");
    await session();
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
    await Promise.all([loadRequests(), configurePush(), loadAnalytics()]);
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
$("add-item").onclick = itemRow;
$("refresh").onclick = () => location.reload();
$("enable-push").onclick = enablePush;
$("analytics-toggle").onchange = () => void changeAnalytics();
itemRow();
if (preview === "join") show("join");
else if (preview === "active") {
  $("worker-name").textContent = "Ján Novák · Murár";
  $("project-name").textContent = "Rekonštrukcia rodinného domu";
  show("active");
} else void load();
