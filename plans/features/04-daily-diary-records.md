# Feature 04: Daily Diary Records

## Clear Sequence
1. Implement the new diary record form.
2. Add worker count, work description, note, photo attachment entry point, and evidence strip.
3. Save records locally first, then sync to Supabase when available.
4. Add daily log grouping by project and date.
5. Add lock and correction behavior.

## Implementation Instructions
- Screen title is `Nový záznam`.
- Fields:
  - Date selector, default today.
  - `Čo sa vykonalo` text area, max 500 characters.
  - `Počet pracovníkov` counter.
  - `Poznámka` text area, max 300 characters.
  - Optional photo attachments.
- Evidence strip shows GPS, weather, and local time when available.
- Save button is green and fixed near the bottom: `Uložiť záznam`.
- Records remain editable until locked. Once locked, the UI must show read-only values and offer a correction action instead of inline editing.
- Corrections create linked records and preserve the original record.

## Acceptance Criteria
- User can create a daily record with date, work description, worker count, note, GPS/weather/time evidence, and optional photos.
- Character counters prevent over-limit submission.
- Saved records appear under the correct project and date.
- Locked records cannot be edited in UI or API.
- Corrections preserve original record metadata and link back to the corrected record.
