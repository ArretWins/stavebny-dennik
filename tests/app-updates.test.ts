import { describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.1.0", android: { versionCode: 2 } } },
}));
vi.mock("expo-device", () => ({ supportedCpuArchitectures: ["arm64-v8a"] }));

import { checkForAppUpdate } from "../src/services/appUpdates";

const manifest = {
  version: "1.1.0",
  versionCode: 2,
  androidUrls: Object.fromEntries(["arm64-v8a", "armeabi-v7a", "x86", "x86_64"].map(abi => [abi, `https://fjhgeudmcrbjpnduwhtb.supabase.co/storage/v1/object/public/app-releases/stavebny-dennik-1.1.0-${abi}.apk`])),
  publishedAt: "2026-07-19T00:00:00.000Z",
};

describe("Android update checks", () => {
  it("reports a newer signed release", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest });
    const result = await checkForAppUpdate(fetcher as typeof fetch, "1.0.0", 1);
    expect(result.available).toBe(true);
    expect(result.manifest.version).toBe("1.1.0");
    expect(result.downloadUrl).toContain("arm64-v8a.apk");
  });

  it("does not offer the installed build again", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest });
    await expect(checkForAppUpdate(fetcher as typeof fetch, "1.1.0", 2)).resolves.toMatchObject({ available: false });
  });

  it("rejects a download hosted outside the release origin", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...manifest, androidUrls: { ...manifest.androidUrls, x86: "https://example.com/app.apk" } }) });
    await expect(checkForAppUpdate(fetcher as typeof fetch, "1.0.0", 1)).rejects.toThrow("UPDATE_MANIFEST_INVALID");
  });
});
