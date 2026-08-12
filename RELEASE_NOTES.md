# Stavebný denník — v1.2.3

Authentication feedback update — 12 August 2026.

## Fixed

- Registration failures no longer appear as a generic sign-in error.
- Added clear messages for invalid email, weak password, existing account, unconfirmed email and rate limits.
- Kept authentication fail-closed when production server configuration is unavailable.

## Verification

- A real Supabase sign-up completed and sent a confirmation email; the temporary test account was removed.
- TypeScript, translations, visible copy and authentication regression tests pass.
