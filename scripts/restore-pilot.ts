import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function runPsql(psql: string, dbUrl: string, args: string[], operation: string) {
  const result = spawnSync(
    psql,
    [dbUrl, "--set", "ON_ERROR_STOP=1", ...args],
    { stdio: "inherit", shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`psql failed while ${operation}`);
}

function copiedTables(dataSql: string): string[] {
  const tables = new Set<string>();
  for (const match of dataSql.matchAll(/^COPY\s+"([^"]+)"\."([^"]+)"/gm))
    tables.add(`"${match[1].replaceAll('"', '""')}"."${match[2].replaceAll('"', '""')}"`);
  return [...tables];
}

function withoutStorageCopies(dataSql: string): string {
  return dataSql.replace(
    /^COPY\s+"storage"\."[^"]+".*?^\\\.\r?\n?/gms,
    "",
  );
}

async function main() {
  if (process.env.RESTORE_CONFIRM !== "RESTORE")
    throw new Error(
      "Set RESTORE_CONFIRM=RESTORE to confirm the target database may be changed",
    );
  if (process.env.RESTORE_CLEAR_TARGET !== "CLEAR")
    throw new Error(
      "Set RESTORE_CLEAR_TARGET=CLEAR to confirm existing target rows may be removed",
    );
  const manifestPath = resolve(
    process.env.BACKUP_MANIFEST || process.argv[2] || "",
  );
  if (!process.env.BACKUP_MANIFEST && !process.argv[2])
    throw new Error("Pass the manifest path or set BACKUP_MANIFEST");
  const dbUrl = process.env.SUPABASE_DB_URL || "";
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!dbUrl || !supabaseUrl || !serviceKey)
    throw new Error(
      "SUPABASE_DB_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  const root = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.mode !== "complete")
    throw new Error("Dry-run backups cannot be restored");
  const files = [
    ...(manifest.database || []),
    ...(manifest.buckets || []).flatMap(
      (bucket: { files?: unknown[] }) => bucket.files || [],
    ),
  ] as Array<{ path: string; bytes: number; sha256: string }>;
  for (const file of files) {
    const localPath = resolve(root, file.path);
    if (!localPath.startsWith(`${root}\\`) && !localPath.startsWith(`${root}/`))
      throw new Error(`Manifest path escapes backup: ${file.path}`);
    const bytes = await readFile(localPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== file.bytes || digest !== file.sha256)
      throw new Error(`Checksum mismatch: ${file.path}`);
  }
  const psql =
    process.env.PSQL_BIN ||
    (process.platform === "win32" ? "psql.exe" : "psql");
  runPsql(
    psql,
    dbUrl,
    ["--file", join(root, "database", "roles.sql")],
    "restoring roles.sql",
  );
  runPsql(
    psql,
    dbUrl,
    [
      "--command",
      "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
    ],
    "resetting the public schema",
  );
  runPsql(
    psql,
    dbUrl,
    ["--file", join(root, "database", "schema.sql")],
    "restoring schema.sql",
  );
  const dataSql = withoutStorageCopies(
    await readFile(join(root, "database", "data.sql"), "utf8"),
  );
  const restorableDataPath = join(root, "database", "data-restorable.sql");
  await writeFile(restorableDataPath, dataSql, "utf8");
  const tables = copiedTables(dataSql);
  if (!tables.length) throw new Error("No COPY tables found in data.sql");
  runPsql(
    psql,
    dbUrl,
    [
      "--command",
      `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE;`,
    ],
    "clearing target tables",
  );
  runPsql(
    psql,
    dbUrl,
    ["--file", restorableDataPath],
    "restoring data.sql",
  );
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const listedBuckets = await client.storage.listBuckets();
  if (listedBuckets.error) throw listedBuckets.error;
  const existingBuckets = new Set(
    (listedBuckets.data || []).map((bucket) => bucket.id),
  );
  for (const bucket of manifest.buckets || []) {
    const options = {
      public: Boolean(bucket.public),
      fileSizeLimit:
        typeof bucket.fileSizeLimit === "number"
          ? bucket.fileSizeLimit
          : undefined,
      allowedMimeTypes: Array.isArray(bucket.allowedMimeTypes)
        ? bucket.allowedMimeTypes
        : undefined,
    };
    const configured = existingBuckets.has(bucket.id)
      ? await client.storage.updateBucket(bucket.id, options)
      : await client.storage.createBucket(bucket.id, options);
    if (configured.error) throw configured.error;
    for (const file of bucket.files || []) {
      const storagePath = file.storagePath;
      if (typeof storagePath !== "string" || !storagePath)
        throw new Error(`Missing storage path for ${file.path}`);
      const localPath = resolve(root, file.path);
      if (
        !localPath.startsWith(`${root}\\`) &&
        !localPath.startsWith(`${root}/`)
      )
        throw new Error(`Manifest path escapes backup: ${file.path}`);
      const bytes = await readFile(localPath);
      const uploaded = await client.storage
        .from(bucket.id)
        .upload(storagePath, bytes, { upsert: true });
      if (uploaded.error) throw uploaded.error;
    }
  }
  runPsql(
    psql,
    dbUrl,
    ["--command", "NOTIFY pgrst, 'reload schema'; NOTIFY pgrst, 'reload config';"],
    "refreshing the API schema cache",
  );
  console.log(`Backup restored from ${root}`);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
