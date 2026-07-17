# Feature 09: Delay Events And PDF Reports

## Clear Sequence
1. Implement the delay/stoppage event form.
2. Add reason selection, GPS/weather/photo evidence, time/date, and note capture.
3. Add report preview for delay notification.
4. Generate Slovak PDFs through a Supabase Edge Function.
5. Store report export metadata and PDF file in private storage.

## Implementation Instructions
- Delay screen title: `Oznámenie o prerušení / oneskorení prác`.
- MVP delay reasons:
  - `Zlé počasie`
  - `Čakanie na investora`
  - Allow an additional custom note field but do not add a large taxonomy.
- Use orange selected state for reason rows and warning actions.
- PDF outputs:
  - `Stavebný denník` export for project/date range.
  - `Oznámenie o prerušení / oneskorení prác` for delay events.
- PDF must use Slovak text, `sk-SK` date/number formatting, embedded font with Slovak diacritics, report locale, project metadata, evidence summary, and audit/export timestamp.
- Generated PDF is stored privately and shareable through an authorized signed URL or platform share sheet.

## Acceptance Criteria
- User can create a delay event with reason, timestamp, GPS/weather/photo evidence, and optional note.
- Delay report preview shows project, date, reason, evidence, and page count.
- PDF generation succeeds with Slovak diacritics and correct `sk-SK` formatting.
- Generated report is stored in `report_exports` with locale, type, source entity, storage path, creator, and timestamp.
- Reports are based on stored evidence snapshots and do not depend on live weather refetch.
