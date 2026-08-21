import * as ImagePicker from "expo-image-picker";

let cameraLaunchPending = false;

async function ensureCameraPermission(): Promise<void> {
  // Checking first is essential on Android 16 Pixel devices: requesting an
  // already-granted permission can leave the native promise unresolved.
  let permission = await ImagePicker.getCameraPermissionsAsync();
  if (permission.granted) return;
  if (!permission.canAskAgain) throw new Error("CAMERA_PERMISSION_DENIED");

  await ImagePicker.requestCameraPermissionsAsync();
  permission = await ImagePicker.getCameraPermissionsAsync();
  if (!permission.granted) throw new Error("CAMERA_PERMISSION_DENIED");
}

export async function launchPhotoCamera(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  if (cameraLaunchPending) throw new Error("CAMERA_ALREADY_OPEN");
  cameraLaunchPending = true;
  try {
    await ensureCameraPermission();
    return await ImagePicker.launchCameraAsync(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission|user rejected/i.test(message))
      throw new Error("CAMERA_PERMISSION_DENIED");
    throw error;
  } finally {
    cameraLaunchPending = false;
  }
}
