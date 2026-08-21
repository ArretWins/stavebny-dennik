import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const source = resolve("worker-portal/src");
const output = resolve("worker-portal/dist");
const supabaseUrl =
  process.env.WORKER_PORTAL_SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "";
const anonKey =
  process.env.WORKER_PORTAL_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
mkdirSync(resolve(output, "assets"), { recursive: true });
cpSync(
  resolve("assets/brand/app-icon-v1.png"),
  resolve(output, "assets/app-icon.png"),
);
writeFileSync(
  resolve(output, "config.js"),
  `window.STAVBA_CONFIG=${JSON.stringify({ supabaseUrl, anonKey, vapidPublicKey })};\n`,
);
const html = readFileSync(resolve(output, "index.html"), "utf8");
if (!html.includes("config.js"))
  throw new Error("WORKER_PORTAL_CONFIG_SCRIPT_MISSING");
writeFileSync(resolve(output, "index.html"), html);
mkdirSync(resolve(output, "worker"), { recursive: true });
cpSync(resolve(output, "index.html"), resolve(output, "worker/index.html"));
const landing = readFileSync(resolve(output, "download.html"), "utf8");
if (!landing.includes("app-version.json"))
  throw new Error("DOWNLOAD_PAGE_VERSION_MANIFEST_MISSING");
console.log(
  `Worker portal built in ${output}${supabaseUrl && anonKey ? "" : " (server credentials are placeholders)"}`,
);
