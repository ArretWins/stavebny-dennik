import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const abis = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"] as const;

async function main() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_RELEASE_CREDENTIALS_REQUIRED");

  const manifest = JSON.parse(
    readFileSync(resolve("worker-portal/src/app-version.json"), "utf8"),
  ) as { version: string; androidUrls: Record<string, string> };
  const packageVersion = (JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { version: string }).version;
  if (manifest.version !== packageVersion) throw new Error("APP_VERSION_MANIFEST_MISMATCH");

  const headers = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey };
  const bucketListResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, { headers });
  if (!bucketListResponse.ok) throw new Error(`RELEASE_BUCKET_CHECK_FAILED_${bucketListResponse.status}`);
  const buckets = await bucketListResponse.json() as Array<{ id: string }>;
  if (!buckets.some(bucket => bucket.id === "app-releases")) {
    const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "app-releases",
        name: "app-releases",
        public: true,
        file_size_limit: 52428800,
        allowed_mime_types: ["application/vnd.android.package-archive"],
      }),
    });
    if (!bucketResponse.ok) throw new Error(`RELEASE_BUCKET_FAILED_${bucketResponse.status}`);
  }

  for (const abi of abis) {
    const fileName = `stavebny-dennik-${manifest.version}-${abi}.apk`;
    const apkPath = resolve(`android/app/build/outputs/apk/release/app-${abi}-release.apk`);
    const expectedUrl = `${supabaseUrl}/storage/v1/object/public/app-releases/${fileName}`;
    if (manifest.androidUrls[abi] !== expectedUrl) throw new Error(`APP_UPDATE_URL_MISMATCH_${abi}`);
    if (statSync(apkPath).size > 52428800) throw new Error(`ANDROID_RELEASE_TOO_LARGE_${abi}`);

    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/app-releases/${fileName}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/vnd.android.package-archive",
        "x-upsert": "true",
      },
      body: readFileSync(apkPath),
    });
    if (!uploadResponse.ok) throw new Error(`ANDROID_RELEASE_UPLOAD_FAILED_${abi}_${uploadResponse.status}`);
    console.log(`Published signed Android release: ${abi}`);
  }
}

void main();
