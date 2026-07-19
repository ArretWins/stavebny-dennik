import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { AppState } from "@/domain/types";
import { clearAppState } from "./localStore";
import { supabase } from "./supabase";

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
    const result = await supabase.rpc("delete_my_account", { p_confirmation: "DELETE" });
    if (result.error) throw result.error;
  }
  await clearAppState();
}
