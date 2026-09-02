const BRAND_MARKER = "Stavuno";

/**
 * The public root can serve either the download landing page or the worker
 * portal, depending on the route configuration. Keep the smoke test tied to
 * stable structural markers instead of marketing copy that changes often.
 */
export function isHealthyPublicPortal(html: string): boolean {
  const isDownloadPage = html.includes(
    'data-version-manifest="/app-version.json"',
  );
  const isWorkerPortal =
    html.includes('id="join-form"') && html.includes('id="request-form"');
  return html.includes(BRAND_MARKER) && (isDownloadPage || isWorkerPortal);
}

export function isHealthyPrivacyPage(html: string): boolean {
  return html.includes(BRAND_MARKER) && html.includes("Ochrana súkromia");
}
