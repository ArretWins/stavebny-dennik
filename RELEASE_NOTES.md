# Stavebný denník — v1.0.0

First working release — 17 July 2026.

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

## Verification

- 58 automated tests across 21 files.
- TypeScript, translation and visible-copy validation.
- Deno type checking for all six Edge Functions.
- Android release APK build and API 35 emulator checks for notifications, worker/request tabs, receipt photo/PDF entry and the system PDF picker.
