import Constants from "expo-constants";
import { supportedCpuArchitectures } from "expo-device";

export const APP_UPDATE_MANIFEST_URL =
  "https://stavuno.pages.dev/app-version.json";

export type AppUpdateManifest = {
  version: string;
  versionCode: number;
  androidUrls: Record<string, string>;
  publishedAt: string;
};

export type AppUpdateResult = {
  available: boolean;
  currentVersion: string;
  downloadUrl: string;
  manifest: AppUpdateManifest;
};

const supportedAbis = ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"] as const;

export function selectAndroidDownload(
  urls: Record<string, string>,
  architectures: string[] | null = supportedCpuArchitectures,
): string | undefined {
  const normalized = (architectures ?? []).map(value => value.toLowerCase().replace("arm64 v8", "arm64-v8a"));
  const match = supportedAbis.find(abi => normalized.some(value => value.includes(abi)) && urls[abi]);
  return match ? urls[match] : urls["arm64-v8a"];
}

function isManifest(value: unknown): value is AppUpdateManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppUpdateManifest>;
  if (
    typeof candidate.version !== "string" ||
    !Number.isInteger(candidate.versionCode) ||
    Number(candidate.versionCode) < 1 ||
    !candidate.androidUrls || typeof candidate.androidUrls !== "object" ||
    typeof candidate.publishedAt !== "string"
  ) return false;

  for (const abi of supportedAbis) {
    const rawUrl = candidate.androidUrls[abi];
    if (typeof rawUrl !== "string") return false;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" ||
        url.hostname !== "fjhgeudmcrbjpnduwhtb.supabase.co" ||
        !url.pathname.startsWith("/storage/v1/object/public/app-releases/")) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function checkForAppUpdate(
  fetcher: typeof fetch = fetch,
  currentVersion = Constants.expoConfig?.version ?? "0.0.0",
  currentVersionCode = Constants.expoConfig?.android?.versionCode ?? 0,
): Promise<AppUpdateResult> {
  const response = await fetcher(APP_UPDATE_MANIFEST_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("UPDATE_CHECK_FAILED");
  const manifest: unknown = await response.json();
  if (!isManifest(manifest)) throw new Error("UPDATE_MANIFEST_INVALID");
  const downloadUrl = selectAndroidDownload(manifest.androidUrls);
  if (!downloadUrl) throw new Error("UPDATE_ARCHITECTURE_UNSUPPORTED");
  return {
    available: manifest.versionCode > currentVersionCode,
    currentVersion,
    downloadUrl,
    manifest,
  };
}
