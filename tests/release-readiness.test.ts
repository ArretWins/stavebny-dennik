import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pilot release configuration", () => {
  it("type-checks every deployed Edge Function in CI", () => {
    const workflow = readFileSync(".github/workflows/validate.yml", "utf8");
    for (const name of [
      "dispatch-notifications",
      "generate-receipt-report",
      "generate-report",
      "process-receipt-ocr",
      "worker-checkin",
      "worker-portal",
    ]) {
      expect(workflow).toContain(`supabase/functions/${name}/index.ts`);
    }
    expect(workflow).toContain("--node-modules-dir=auto");
  });

  it("refuses unsigned Android releases and retains signed artifacts", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    const workflow = readFileSync(".github/workflows/android-release.yml", "utf8");
    expect(gradle).toContain("refusing to use the debug key");
    expect(gradle).not.toContain("signingConfigs.release : signingConfigs.debug");
    for (const secret of [
      "ANDROID_UPLOAD_KEYSTORE_BASE64",
      "ANDROID_UPLOAD_STORE_PASSWORD",
      "ANDROID_UPLOAD_KEY_ALIAS",
      "ANDROID_UPLOAD_KEY_PASSWORD",
    ]) expect(workflow).toContain(secret);
    expect(workflow).toContain("assembleRelease bundleRelease");
    expect(workflow).toContain("Resolve production application configuration");
    expect(workflow).toContain("secrets.SUPABASE_URL");
    expect(workflow).toContain("supabase projects api-keys");
    expect(workflow).toContain("retention-days: 2");
  });

  it("keeps application, Android and update-manifest versions aligned", () => {
    const app = JSON.parse(readFileSync("app.json", "utf8")).expo;
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const update = JSON.parse(readFileSync("worker-portal/src/app-version.json", "utf8"));
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(app.version).toBe(pkg.version);
    expect(update.version).toBe(pkg.version);
    expect(app.android.versionCode).toBe(update.versionCode);
    expect(gradle).toContain(`versionCode ${update.versionCode}`);
    expect(gradle).toContain(`versionName "${update.version}"`);
  });

  it("persists Supabase sessions in React Native storage", () => {
    const client = readFileSync("src/services/supabase.ts", "utf8");
    expect(client).toContain(
      "import AsyncStorage from '@react-native-async-storage/async-storage'",
    );
    expect(client).toContain("storage: AsyncStorage");
    expect(client).toContain("persistSession: true");
  });
});
