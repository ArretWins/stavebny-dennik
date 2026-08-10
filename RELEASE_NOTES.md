# Stavebný denník — v1.2.2

Authentication hotfix — 10 August 2026.

## Fixed

- Removed the insecure offline email login fallback.
- Unknown emails and incorrect passwords are now rejected by Supabase.
- Signed Android builds fail when production server configuration is missing.
- Android CI resolves the public Supabase client key from the authenticated project.
- Removed the green Control Tower card and its route from the application.

## Verification

- Authentication fails closed without Supabase configuration.
- Application, Android and update-manifest versions are aligned.
- TypeScript, translation, copy and navigation regression checks pass.
