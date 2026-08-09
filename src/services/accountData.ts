import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { AppState } from "@/domain/types";
import { clearAppState } from "./localStore";
import { supabase } from "./supabase";

const PRIVATE_BUCKETS = ["attachments", "reports", "receipts", "plans"] as const;

async function listOwnedFiles(
  bucket: (typeof PRIVATE_BUCKETS)[number],
  path: string,
): Promise<string[]> {
  if (!supabase) return [];
  const files: string[] = [];
  let offset = 0;
  for (;;) {
    const result = await supabase.storage.from(bucket).list(path, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (result.error) throw result.error;
    const entries = result.data ?? [];
    for (const entry of entries) {
      const childPath = `${path}/${entry.name}`;
      if (entry.id) files.push(childPath);
      else files.push(...(await listOwnedFiles(bucket, childPath)));
    }
    if (entries.length < 100) break;
    offset += entries.length;
  }
  return files;
}

async function removeOwnedFiles(userId: string): Promise<void> {
  if (!supabase) return;
  for (const bucket of PRIVATE_BUCKETS) {
    const files = await listOwnedFiles(bucket, userId);
    for (let index = 0; index < files.length; index += 100) {
      const result = await supabase.storage
        .from(bucket)
        .remove(files.slice(index, index + 100));
      if (result.error) throw result.error;
    }
  }
}

export async function exportAccountData(localState: AppState): Promise<string> {
  let payload: unknown = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "local",
    data: localState,
  };
  if (supabase) {
    const result = await supabase.rpc("export_my_data");
    if (result.error) throw result.error;
    payload = { ...result.data, localPendingOutbox: localState.outbox };
  }
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!directory) throw new Error("FILE_DIRECTORY_UNAVAILABLE");
  const path = `${directory}stavebny-dennik-export-${new Date().toISOString().slice(0, 10)}.json`;
  await FileSystem.writeAsStringAsync(path, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Export údajov" });
  return path;
}

export async function deleteAccountPermanently(): Promise<void> {
  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error("AUTH_REQUIRED");
    await removeOwnedFiles(user.id);
    const result = await supabase.rpc("delete_my_account", { p_confirmation: "DELETE" });
    if (result.error) throw result.error;
  }
  await clearAppState();
}
