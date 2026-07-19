import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const sourceUrl = process.env.SOURCE_SUPABASE_URL || "";
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY || "";
const targetUrl = process.env.TARGET_SUPABASE_URL || "";
const targetKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || "";

function required(value: string, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function admin(url: string, key: string): SupabaseClient {
  return createClient(required(url, "Supabase URL"), required(key, "service role key"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function userCount(client: SupabaseClient): Promise<number> {
  let total = 0;
  for (let page = 1; ; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    total += result.data.users.length;
    if (result.data.users.length < 1000) return total;
  }
}

async function tableCount(client: SupabaseClient, table: string): Promise<number> {
  const result = await client.from(table).select("*", { count: "exact", head: true });
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.count || 0;
}

async function retryTableCount(client: SupabaseClient, table: string): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await tableCount(client, table);
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const manifestPath = resolve(process.env.BACKUP_MANIFEST || process.argv[2] || "");
  if (!process.env.BACKUP_MANIFEST && !process.argv[2])
    throw new Error("Pass the manifest path or set BACKUP_MANIFEST");
  const root = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.mode !== "complete") throw new Error("A complete backup is required");
  const source = admin(sourceUrl, sourceKey);
  const target = admin(targetUrl, targetKey);

  const dataSql = await readFile(join(root, "database", "data.sql"), "utf8");
  const publicTables = [
    ...new Set(
      [...dataSql.matchAll(/^COPY\s+"public"\."([^"]+)"/gm)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
  if (!publicTables.length) throw new Error("No public tables found in data.sql");
  for (const table of publicTables) {
    const [sourceRows, targetRows] = await Promise.all([
      tableCount(source, table),
      retryTableCount(target, table),
    ]);
    if (sourceRows !== targetRows)
      throw new Error(`${table}: source=${sourceRows}, restored=${targetRows}`);
  }

  const [sourceUsers, targetUsers] = await Promise.all([
    userCount(source),
    userCount(target),
  ]);
  if (sourceUsers !== targetUsers)
    throw new Error(`auth.users: source=${sourceUsers}, restored=${targetUsers}`);

  const targetBuckets = await target.storage.listBuckets();
  if (targetBuckets.error) throw targetBuckets.error;
  const bucketIds = new Set((targetBuckets.data || []).map((bucket) => bucket.id));
  let verifiedObjects = 0;
  for (const bucket of manifest.buckets || []) {
    if (!bucketIds.has(bucket.id)) throw new Error(`Missing bucket: ${bucket.id}`);
    for (const file of bucket.files || []) {
      if (typeof file.storagePath !== "string" || !file.storagePath)
        throw new Error(`Missing storagePath for ${file.path}`);
      const downloaded = await target.storage.from(bucket.id).download(file.storagePath);
      if (downloaded.error || !downloaded.data)
        throw downloaded.error || new Error(`Missing ${bucket.id}/${file.storagePath}`);
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== file.bytes || digest !== file.sha256)
        throw new Error(`Restored object checksum mismatch: ${file.path}`);
      verifiedObjects += 1;
    }
  }

  console.log(
    `Restore drill verified: ${publicTables.length} public tables, ${sourceUsers} auth users, ${verifiedObjects} storage objects.`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
