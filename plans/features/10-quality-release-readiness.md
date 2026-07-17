# Feature 10: Quality And Release Readiness

## Clear Sequence
1. Add unit tests for validation, i18n, weather parsing, and lock/correction rules.
2. Add integration tests for Supabase policies, audit triggers, QR token validation, attachments, and sync.
3. Add UI checks for the four concept screens.
4. Add Android E2E smoke coverage for the core MVP flow.
5. Prepare release configuration and documentation without publishing.

## Implementation Instructions
- Unit tests must cover:
  - Missing translation keys.
  - Slovak date/number formatting.
  - Weather snapshot parsing.
  - Locked-record update rejection.
  - Character limit validation.
- Integration tests must cover:
  - RLS isolation between users.
  - Audit event creation.
  - QR token expiry and scope.
  - Private attachment/PDF access.
  - Offline outbox idempotency.
- UI checks must compare projects, today dashboard, new diary record, and delay/report screens against `mockup-stavebny-dennik-mvp.png`.
- E2E flow: sign in, create project, capture diary record, capture delay event, attach photo, sync, generate PDF, share/open report, worker QR check-in.
- Prepare Android build settings for dev build/APK testing and future AAB release, but do not publish to Google Play.

## Acceptance Criteria
- Test suite passes locally and in CI.
- No missing Slovak translation keys.
- Core E2E flow completes on Android.
- UI review confirms no overlapping content, readable Slovak text, correct evidence states, and design-system alignment.
- Release notes clearly state MVP limits: evidence-grade only, not certified official state e-denník; Slovak-only; no billing; no OCR.
