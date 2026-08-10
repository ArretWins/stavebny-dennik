# Stavebný denník — v1.2.1

Simplified Android release — 10 August 2026.

## Changed

- Removed daily workday control from the visible application.
- Removed quality and safety checklists from navigation.
- Removed change orders, financial checkpoint and 14-day forecast.
- Removed the tools and equipment register, including related task and tomorrow-plan shortcuts.
- Simplified the dashboard, notifications and Control Tower recommendations.
- Existing server data for removed modules remains preserved for safe rollback.

## Verification

- 280 automated tests across 82 files.
- TypeScript, translation and visible-copy checks pass.
- Removed routes are covered by a dedicated navigation regression test.

## Limits

- Evidence-grade workflow; it is not a qualified electronic-signature service or a replacement for certified government or accounting systems.
- Slovak interface and no billing in this release.
