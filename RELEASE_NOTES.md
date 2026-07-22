# Stavebný denník — v1.1.0

Pilot-ready Android release — 19 July 2026.

## Included

- Local-first construction diary, delays, GPS/weather evidence, photos, locking and corrections.
- Private Slovak diary and delay PDF reports.
- Receipt gallery with multiple photos or PDF pages, ordering, categories, purchase date, seller and total amount.
- Azure receipt OCR with manual review and duplicate warnings.
- One accountant PDF containing an expense table and every selected receipt, plus immutable versioned export history.
- Temporary QR onboarding in a browser; workers enter only name, surname and position and wait for foreman approval.
- Workers can submit structured material requests and see only their own requests; they cannot access receipts or accounting exports.
- Foreman approval/rejection/revocation, request status workflow and many-to-many receipt allocation to material requests.
- In-app notifications, Expo push for the foreman and opt-in Web Push for workers.
- Normalized SQLite storage, Supabase RLS and database guards for project ownership, status transitions, allocation limits and immutable exports.
- Privacy controls, personal-data export, permanent account deletion, safe support diagnostics and anonymous analytics opt-out.
- Signed architecture-specific Android APK updates delivered from the in-app settings screen, plus a signed AAB for future Google Play distribution.

## Verification

- 66 automated tests across 24 files.
- TypeScript, translation and visible-copy validation.
- Deno type checking for all six Edge Functions.
- Production smoke coverage for RLS, project lifecycle, one-use QR onboarding, material requests, receipt fallback, accountant PDF, privacy, support and export.
- Four signed split APKs and one signed AAB reproduced in GitHub Actions; the x86_64 release APK was installed and launch-tested on the API 35 emulator.
- Daily verified backups and a successful full restore drill covering 35 public tables, 54 Auth users and 4 Storage objects.

## Pilot limits

- Evidence-grade workflow only; it is not a certified government e-denník or a replacement for accounting software.
- Slovak-only interface for this release.
- No billing is enabled. Free pilot limits are enforced centrally and can later be upgraded to Premium entitlements.
- Receipt OCR requires configured Azure Document Intelligence and always requires foreman review of date, seller and total.
