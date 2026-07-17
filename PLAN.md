# Production MVP: Stavebný Denník Pre Slovenských Živnostníkov

## Summary
Build an Android-first mobile app for Slovak `majster` / small živnostník teams, focused on evidence-grade construction diary records and delay protection, not a certified state e-denník. Main value: fast daily records, GPS/weather snapshots, photo evidence, worker QR check-ins, and Slovak PDF exports.

MVP language is Slovak only. The app should be i18n-ready for future languages, but no language switcher or non-Slovak content is included in MVP.

## Key Changes
- Stack: Expo React Native Android app + Supabase Auth/Postgres/Storage/Edge Functions in EU region.
- Auth: email + password, password reset, no billing/paywall in MVP.
- Core roles: master account only; workers use QR/web check-in without accounts.
- MVP modules: projects, daily diary, delay/obstacle events, weather snapshot, attachments, worker check-ins, PDF exports.
- Language: all visible app text and PDFs in Slovak; implement centralized translation keys with default `sk-SK`.
- Design system: implement the field-first mobile UI from `mockup-stavebny-dennik-mvp.png` and `DESIGN_SYSTEM.md`.
- Deferred: OCR receipts, full material requests, eID signing, iOS release, official government-system integration, paid subscription, additional languages.

## Design System
- Product feel: practical Android-first site tool with white surfaces, strong green primary actions, orange delay/risk actions, and compact evidence cards.
- Core palette: green `#2E7D32`, dark green `#1B5E20`, orange `#EF6C00`, soft orange `#FFF4E5`, surface `#FFFFFF`, warm background `#F8F5EF`, border `#E0DED9`, text `#111827`, muted text `#6B7280`.
- Core components: `ScreenShell`, `TopBar`, `ProjectCard`, `PrimaryButton`, `SecondaryButton`, `WarningActionButton`, `Card`, `EvidenceTile`, `EvidenceStrip`, `RadioReasonRow`, `CounterInput`, `TextArea`, `DashedUploadBox`, `SyncBanner`, `PdfPreviewCard`.
- Interaction rules: one primary task per screen, large thumb-friendly CTAs, explicit GPS/weather/photo/time evidence states, visible pending-sync status, and locked-record views without inline editing.
- Implementation source of truth: store tokens in `src/theme/tokens.ts`, keep all UI copy in translation keys, and build feature screens from shared primitives before custom styling.

## Implementation
- Mobile screens in Slovak: login, projects, today dashboard, daily log, add delay, attachments, QR check-in, reports, settings.
- Use the design system from `DESIGN_SYSTEM.md` as the UI contract for all MVP screens and PDF previews.
- Use an i18n layer from day one: no hardcoded UI copy in components; Slovak catalog is the only shipped catalog.
- PDF templates use Slovak text and `sk-SK` date/number formatting; store report locale for future regeneration.
- Offline capture: local SQLite/outbox queue for diary entries, delay events, photos, and manual worker presence; sync when online.
- Weather: Open-Meteo adapter saves request URL, provider, GPS, timestamp, raw JSON, parsed temperature/precipitation/wind/weather code.
- Evidence model: records editable until day/project report is locked; locked records cannot be mutated. Corrections are new linked records. No visible/manual signature.
- QR check-in: public scoped token form where worker enters name and confirms presence.
- PDFs: generate `Stavebný denník` and `Oznámenie o prerušení / oneskorení prác`.

## Test Plan
- Unit: validation, lock/correction rules, weather parsing, Slovak date/number formatting, missing translation key checks.
- Integration: Supabase RLS, audit triggers, QR token expiry, attachment upload, weather sync.
- Offline: create delay + photo without network, restart app, reconnect, verify sync and PDF data.
- PDF: verify Slovak diacritics, photos, weather source, locked metadata, and `sk-SK` formatting.
- UI: compare the projects, today, new record, and interruption/report screens against `mockup-stavebny-dennik-mvp.png`; verify tap targets, text fit, evidence states, and no overlapping content.
- E2E: Android flow from project creation to locked diary and shared PDF; worker QR check-in from mobile browser.

## Assumptions
- MVP is evidence-grade, not marketed as legally certified official state e-denník.
- Main customer is a solo master or 1-5 person micro-brigade.
- App is free in first release; monetization is tested manually later.
- Material receipts are photo attachments only, no OCR or expense accounting yet.
- Future languages are planned, but MVP ships only Slovak.
