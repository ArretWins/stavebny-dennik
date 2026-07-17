import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async function main() {
  const manifestPath = resolve(
    process.env.BACKUP_MANIFEST || process.argv[2] || "",
  );
  if (!process.env.BACKUP_MANIFEST && !process.argv[2])
    throw new Error("Pass the manifest path or set BACKUP_MANIFEST");
  const root = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = [
    ...(manifest.database || []),
    ...(manifest.buckets || []).flatMap(
      (bucket: { files: unknown[] }) => bucket.files || [],
    ),
  ];
  for (const file of files as Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>) {
    const fullPath = resolve(root, file.path);
    if (!fullPath.startsWith(`${root}\\`) && !fullPath.startsWith(`${root}/`))
      throw new Error(`Manifest path escapes backup: ${file.path}`);
    const bytes = await readFile(fullPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== file.bytes || digest !== file.sha256)
      throw new Error(`Checksum mismatch: ${file.path}`);
  }
  console.log(
    `Backup verified: ${files.length} files, schema v${manifest.schemaVersion}`,
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
