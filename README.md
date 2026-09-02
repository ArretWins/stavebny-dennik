# Stavuno

Android-first Expo/React Native application for a Slovak construction foreman. It combines the construction diary, evidence capture, receipts/accountant exports, QR worker onboarding and material requests in one local-first app.

The worker portal also includes a self-service shift clock. An approved worker can keep only one active shift, record a break when leaving and review only their own recent shifts. The foreman app polls the register while the timesheet is open, flags forgotten clock-outs, permits audited manual corrections, locks explicitly approved payroll rows and exports the selected week as an Excel-compatible CSV. Apply `202608010005_work_shifts.sql` before publishing the matching worker portal build.

Personal BOZP briefings are handled as attributable records rather than a shared checklist. The foreman prepares a draft, publishes one immutable SHA-256-stamped version to the current active-worker roster and can close it only after every recipient has acknowledged it or has been excused with a reason. Each worker sees and confirms only their own briefing in the QR portal; publication, acknowledgement, excuse and closure remain in an immutable event history. Apply `202608010006_safety_briefings.sql` before publishing the matching app and worker portal builds.

The worker qualification register stores medical checks, BOZP training, trade licences and other credentials with optional private photo evidence. Active workers with no records, expired records or revoked records are escalated in the control tower; documents expiring within 30 days are warned in advance. Workers can read only their own status in the QR portal, while every manager change, revocation and restoration remains attributable. Apply `202608010007_worker_credentials.sql` after the safety briefing migration and before publishing the matching clients.

The HSE incident register covers injuries, property or environmental damage, safety observations and near misses. Workers report from their personal QR portal with explicit confirmation and can only read their own reports. Managers investigate, record root cause and corrective action, resolve or reopen an incident; every transition is retained in an immutable timeline and serious or stale open incidents are escalated in the control tower. Apply `202608080001_site_incidents.sql` after the worker credential migration.

Material delivery reconciliation closes the gap between an approved request, selected supplier quote and receipt. A worker can confirm only a delivery for their own approved request in the QR portal, recording ordered, received and damaged quantities without access to accounting documents. The foreman reviews every receipt, resolves shortages or damage with an attributable note, and sees open discrepancies in the control tower. Apply `202608080002_material_deliveries.sql` after the incident migration.

The site stock ledger derives available quantities from reviewed deliveries and immutable usage, waste, return and correction movements. Worker-submitted movements remain pending until the foreman confirms them; low, empty and impossible negative balances are escalated in the Control Tower. Apply `202608080003_material_stock.sql` after the delivery migration.

The foreman autopilot turns Control Tower risks into an attributable daily decision queue and now checks tomorrow's tasks for missing workers, credentials, material, tools and safety preparation. Every action opens its exact source workflow, remains open across days until the foreman records a confirmed resolution and syncs through the expanded v27 server contract. Apply `202608080006_daily_control_autopilot_v27.sql` after the task tool migration.

Daily diary entries can additionally capture working hours, the worker count by trade and structured technical events based on the categories in Annex 20 of Slovak Decree 60/2025. These fields are server-validated, included in both local and remote PDF exports and sealed inside the versioned SHA-256 day-closure snapshot. Apply `202608080007_legal_diary_records_v28.sql` after the autopilot migration. This improves evidentiary completeness but does not by itself certify the app or replace any required authorization or submission through the official construction information system.

Newly captured evidence photos carry the source, capture time, optional EXIF GPS and a SHA-256 digest of the exact normalized bytes stored by the app. The private Storage policy no longer permits in-place overwrite, worker completion photos provide the same metadata, and report generation recomputes the digest from the downloaded object before labelling integrity as verified. Legacy photos remain readable and are explicitly shown as having no recorded digest. Apply `202608080008_photo_evidence_integrity_v29.sql` after the legal diary migration. The digest proves byte-level identity inside this system; it is not a qualified electronic signature and does not independently prove when or where a scene occurred.

An owner can send one exact closed-day version to a named technical supervisor, investor, designer or contractor through a recipient-specific temporary link. The reviewer re-enters the intended name, explicitly confirms the decision and can approve once or request changes with a mandatory comment. The closure hash, openings, decision and immutable event history are visible in the app, included in diary PDFs and escalated through the Control Tower. Apply `202608080009_diary_approval_workflow_v30.sql`, deploy the public `diary-approval` function and set `EXPO_PUBLIC_DIARY_APPROVAL_URL` if its address differs from the default Supabase function URL. This is an attributable application acknowledgement, not a qualified electronic signature or independent identity verification.

## Local run

1. Copy `.env.example` to `.env` and fill the public Supabase values. Without them, the foreman app remains usable in offline demo mode, while QR worker onboarding and OCR require the server.
2. Run `npm install`.
3. Run `npm run android` for development. Signed releases require the four `STAVBA_UPLOAD_*` signing variables and are built with `android\gradlew.bat assembleRelease bundleRelease`; Gradle produces one APK per supported ABI and an AAB.
4. Run `npm run validate` before every handoff.

## Server setup

Apply every SQL file in `supabase/migrations` in filename order, enable anonymous sign-ins in Supabase Auth, then deploy all functions from `supabase/functions`. Copy `supabase/.env.example` to a private secrets file and configure the values with Supabase secrets; never put service-role, Azure or VAPID private keys in the Expo `.env` file.

For automatic push dispatch, add these two Vault secrets in Supabase:

- `project_url`: the project URL, for example `https://project.supabase.co`;
- `service_role_key`: the project service-role key.

Android push delivery additionally needs an EAS project ID in `EXPO_PUBLIC_EAS_PROJECT_ID` and valid FCM v1 credentials for that EAS project. Web Push uses the same VAPID public/private key pair configured on the worker portal and notification dispatcher.

OCR uses Azure Document Intelligence `prebuilt-receipt`. Every OCR result remains in manual-review status until the foreman confirms purchase date, seller and total amount.

## Free worker portal

The QR worker portal is a static site in `worker-portal` so it can be hosted on Cloudflare Pages without consuming Supabase Edge Function HTML responses.

1. Set `WORKER_PORTAL_SUPABASE_URL`, `WORKER_PORTAL_SUPABASE_ANON_KEY` and optionally `VAPID_PUBLIC_KEY` from `.env.example`.
2. Run `npm run build:worker-portal`. The deployable site is generated in `worker-portal/dist` and contains only public browser credentials.
3. Create a Cloudflare Pages project with build command `npm run build:worker-portal` and output directory `worker-portal/dist`, or deploy the folder with `npx wrangler pages deploy worker-portal/dist`.
4. Set the resulting HTTPS address as `EXPO_PUBLIC_WORKER_PORTAL_URL` in the app and `WORKER_PORTAL_PUBLIC_URL` in Supabase Edge Function secrets. The old function then preserves QR tokens and redirects existing links to the static portal.

Anonymous sign-in must be enabled in Supabase Auth. Workers join once from the QR code, wait for foreman approval and can only access their own material requests. The portal asks separately before enabling push notifications and allows anonymous product analytics to be disabled.

## Pilot plans and limits

Migration `202607140003_pilot_plans_quotas_analytics.sql` adds centrally controlled Free/Premium entitlements. Free currently allows 3 projects, 20 pending/active workers per project, 750 MB of receipt images, 150 MB of evidence images, 100 OCR runs and 20 accountant PDF exports per month. Upload limits are checked before storage transfer and again in database triggers. Photos are compressed on the device before upload.

The app's **Tarif a súkromie** screen shows the current plan and usage. Analytics stores only an allowlisted event name, a rotating monthly pseudonymous actor hash and safe aggregate properties; names, e-mail addresses, notes and photos are never accepted. Events older than 180 days are removed. Analytics is enabled by default for the pilot and can be switched off in both the app and worker portal.

## Pilot backups

`npm run backup:pilot` creates an atomic timestamped backup containing roles, schema, database data (including Auth and Storage metadata), every Storage object and a SHA-256 manifest. Required private environment variables are `SUPABASE_DB_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

- Verify any backup with `npm run backup:verify -- backups/<timestamp>/manifest.json`.
- Test the backup pipeline without credentials with `$env:BACKUP_DRY_RUN='1'; npm run backup:pilot` on PowerShell.
- For a locally linked Supabase project, set `BACKUP_USE_LINKED=1` instead of `SUPABASE_DB_URL`; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are still required for private Storage objects. Supabase CLI database dumps run through Docker, so Docker Desktop must be installed and running for this mode.
- Restore only to an intentionally selected target after verification: set `BACKUP_MANIFEST`, the three target Supabase variables, `RESTORE_CONFIRM=RESTORE`, and run `npm run backup:restore`. The restore machine needs `psql`; override its path with `PSQL_BIN` if necessary.

The `Pilot backup` GitHub Actions workflow runs daily and retains repository artifacts for 14 days. Add repository secrets named `SUPABASE_DB_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` before enabling it. Keep a second periodic copy outside GitHub before treating this as a production disaster-recovery system.

## Verification

- `npm run validate`: TypeScript, Slovak translation keys, visible-copy checks and Vitest.
- `deno check --no-lock --node-modules-dir=auto supabase/functions/*/index.ts`: all six Edge Functions; the same gate runs in GitHub Actions.
- The release APK is visually tested on the `codex-api35` Android emulator; screenshots are stored in `test-artifacts/emulator`.

## Android pilot distribution

Version 1.2.8 is signed with the permanent upload key. Four ABI-specific APKs are stored in the public `app-releases` Supabase bucket; only the service role can publish or replace them. The app checks the HTTPS manifest at `https://stavuno.pages.dev/app-version.json` only when the user taps **Skontrolovať aktualizáciu** in settings, validates the download host and selects the APK matching the device architecture. The signed AAB and all APKs are retained as durable GitHub Release assets, avoiding the GitHub Actions artifact storage quota.

## Release boundary

The app is an evidence and expense workflow, not a certified government e-denník or a replacement for accounting software. Production use requires a configured Supabase project, private service credentials, Azure OCR credentials and push-provider credentials.
