# Stavebný denník — v1.2.0

Working Android release — 9 August 2026.

## Included

- Construction plans, tasks, pins, timelines, checklists and evidence PDF packs.
- Client progress sharing, task acceptance, change orders, budgets, forecasts and weekly reports.
- Control Tower, daily control autopilot, tomorrow planning and sync diagnostics.
- Legal day closure, structured diary fields, photo integrity and external closed-day approvals.
- Material procurement, supplier quotes, deliveries, stock and task reservations.
- RFI register, tools, work shifts, safety briefings, worker credentials and site incidents.
- Receipt OCR with manual fallback and one accountant PDF containing the expense table and receipts.
- One-use QR worker onboarding and private worker material requests.

## Verification

- 279 automated tests across 81 files.
- TypeScript, translation and visible-copy validation.
- Deno type checking for all nine Edge Functions.
- Production Android bundle and native Android debug build.
- Production smoke coverage for portal, privacy, RLS, project lifecycle, QR onboarding, material requests, receipt fallback, accountant PDF, support, sync diagnostics and export.

## Limits

- Evidence-grade workflow; it is not a qualified electronic-signature service or a replacement for certified government or accounting systems.
- Slovak interface and no billing in this release.
- Receipt OCR requires configured Azure Document Intelligence and manual confirmation of date, seller and total.
