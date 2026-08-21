const manifestUrl = "/app-version.json";
const downloadButton = document.getElementById("download-button");
const releaseDownload = document.getElementById("release-download");
const buttonVersion = document.getElementById("button-version");
const releaseStatus = document.getElementById("release-status");

function activateDownload(element, url) {
  element.href = url;
  element.classList.remove("is-loading");
  element.setAttribute("download", "");
}

async function loadLatestRelease() {
  try {
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("VERSION_UNAVAILABLE");
    const manifest = await response.json();
    const apkUrl = manifest.androidUrls?.["arm64-v8a"];
    if (!manifest.version || !apkUrl) throw new Error("APK_UNAVAILABLE");

    buttonVersion.textContent = `Verzia ${manifest.version}`;
    releaseStatus.textContent = `Aktuálna verzia ${manifest.version} · Android 7.0 alebo novší · podpísaný APK`;
    releaseDownload.textContent = `Stiahnuť verziu ${manifest.version}`;
    activateDownload(downloadButton, apkUrl);
    activateDownload(releaseDownload, apkUrl);
  } catch {
    buttonVersion.textContent = "Skúste to o chvíľu";
    releaseStatus.textContent = "Odkaz na aktuálnu verziu sa nepodarilo načítať. Obnovte stránku.";
    releaseDownload.textContent = "Obnoviť stránku";
    releaseDownload.href = location.href;
    releaseDownload.classList.remove("is-loading");
  }
}

document.getElementById("today-label").textContent = new Intl.DateTimeFormat("sk-SK", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());

void loadLatestRelease();
