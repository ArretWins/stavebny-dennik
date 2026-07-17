# Feature 07: Offline Capture And Sync

## Clear Sequence
1. Add local SQLite storage for pending records, attachments, evidence, and sync metadata.
2. Build an outbox queue with stable item types and retry status.
3. Save capture actions locally before attempting network writes.
4. Add background/manual sync when connectivity returns.
5. Surface pending, syncing, failed, and synced states in the UI.

## Implementation Instructions
- Offline capture applies to diary entries, delay events, photos, GPS/time evidence, manual worker presence, and pending weather fetches.
- Each outbox item stores type, payload, local id, remote id if synced, status, attempt count, last error, created timestamp, updated timestamp.
- Sync must be idempotent: retrying must not duplicate records.
- Today dashboard shows `SyncBanner` with number of queued records.
- Record forms should not feel blocked by network loss.
- Conflict policy for MVP: server-locked records cannot accept local edits; show a Slovak conflict message and keep the local item failed for user review.

## Acceptance Criteria
- User can create a diary record and delay event while offline.
- Restarting the app does not lose unsynced records.
- Reconnecting syncs queued items to Supabase without duplicates.
- Failed sync items show an actionable Slovak status and can retry.
- Pending sync count on the today dashboard matches local outbox state.
