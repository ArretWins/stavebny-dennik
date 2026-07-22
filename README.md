# Stavebný denník

Android-first Expo/React Native application for a Slovak construction foreman. It combines the construction diary, evidence capture, receipts/accountant exports, QR worker onboarding and material requests in one local-first app.

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

Version 1.1.0 is signed with the permanent upload key. Four ABI-specific APKs are stored in the public `app-releases` Supabase bucket; only the service role can publish or replace them. The app checks the HTTPS manifest at `https://stavebny-dennik-worker.pages.dev/app-version.json` only when the user taps **Skontrolovať aktualizáciu** in settings, validates the download host and selects the APK matching the device architecture. The signed AAB and all APKs are also retained as a private GitHub Actions artifact for 30 days.

## Release boundary

The app is an evidence and expense workflow, not a certified government e-denník or a replacement for accounting software. Production use requires a configured Supabase project, private service credentials, Azure OCR credentials and push-provider credentials.
