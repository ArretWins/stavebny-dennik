# Feature 08: Worker QR Check-In

## Clear Sequence
1. Generate scoped QR check-in tokens for a project/day.
2. Render QR code and share/open link from the master app.
3. Build the public worker check-in form.
4. Store check-ins against project/day with token validation.
5. Show today's worker presence summary in the app and reports.

## Implementation Instructions
- Workers do not have app accounts in MVP.
- QR token scope: project id, owner id, date, expiry, and allowed action `checkin`.
- Public form fields: worker name and confirmation action. Optional browser geolocation may be requested but must not be required.
- Public form copy is Slovak only and must be short.
- Edge Function validates token before writing `worker_checkins`.
- Manual worker count in diary records remains available even if QR check-in is not used.

## Acceptance Criteria
- Master can open a QR check-in screen for the selected project/day.
- Worker can submit a check-in from a mobile browser without an account.
- Expired, malformed, or wrong-scope tokens are rejected.
- Check-in appears in today's worker presence summary.
- User A cannot generate or use a token to write check-ins into User B's project.
