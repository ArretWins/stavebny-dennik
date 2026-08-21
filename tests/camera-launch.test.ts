import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Pixel Android camera launch regression", () => {
  const launcher = readFileSync("src/services/cameraLauncher.ts", "utf8");
  const attachments = readFileSync("src/services/attachments.ts", "utf8");
  const receipts = readFileSync("src/services/receiptFiles.ts", "utf8");
  const nativePatch = readFileSync(
    "patches/expo-image-picker+16.1.4.patch",
    "utf8",
  );

  it("checks an existing permission before requesting it", () => {
    expect(launcher.indexOf("getCameraPermissionsAsync")).toBeLessThan(
      launcher.indexOf("requestCameraPermissionsAsync"),
    );
    expect(launcher).toContain("if (permission.granted) return");
    expect(launcher).toContain("if (!permission.canAskAgain)");
  });

  it("routes every native camera use through the guarded launcher", () => {
    expect(attachments).toContain("launchPhotoCamera");
    expect(receipts).toContain("launchPhotoCamera");
    expect(attachments).not.toContain("requestCameraPermissionsAsync");
    expect(receipts).not.toContain("requestCameraPermissionsAsync");
  });

  it("does not ask Android again when camera access is already granted", () => {
    expect(nativePatch).toContain("permissions.hasGrantedPermissions");
    expect(nativePatch).toContain("return@suspendCancellableCoroutine");
    expect(nativePatch).toContain("*requiredPermissions");
  });
});
