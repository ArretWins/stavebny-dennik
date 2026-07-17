const { withAndroidManifest } = require("@expo/config-plugins");

const CAMERA_FEATURE = "android.hardware.camera";

module.exports = function withOptionalCameraHardware(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    const features = manifest["uses-feature"] ?? [];
    const existing = features.find(
      (feature) => feature.$?.["android:name"] === CAMERA_FEATURE,
    );

    if (existing) {
      existing.$["android:required"] = "false";
    } else {
      features.push({
        $: {
          "android:name": CAMERA_FEATURE,
          "android:required": "false",
        },
      });
    }

    manifest["uses-feature"] = features;
    return androidConfig;
  });
};
