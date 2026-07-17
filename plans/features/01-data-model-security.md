# Feature 01: Data Model, Storage, And Security

## Clear Sequence
1. Create the Supabase project configuration and migration structure.
2. Define core tables and relationships for users, projects, diary records, evidence, reports, and audit events.
3. Add private storage buckets for attachments and generated PDFs.
4. Enable row-level security and owner-scoped policies.
5. Add audit triggers and locked-record constraints.

## Implementation Instructions
- Use Supabase Auth, Postgres, Storage, and Edge Functions.
- Create these core tables: `profiles`, `projects`, `daily_logs`, `diary_entries`, `delay_events`, `weather_snapshots`, `attachments`, `worker_checkins`, `report_exports`, `audit_events`.
- Include `locale` on report/export records and default it to `sk-SK`.
- Include `locked_at`, `locked_by`, and correction-link fields where records can be locked.
- Enforce that locked records cannot be updated directly. Corrections must be inserted as separate linked records.
- Use private storage buckets for photos and PDFs. Access must be via signed URLs or authenticated routes.
- RLS must limit master-owned data to the authenticated owner. Public QR check-in must only access the narrowly scoped token endpoint.

## Acceptance Criteria
- Migrations can create the database from empty state.
- Authenticated users can only read/write their own profile, projects, diary data, reports, and attachments.
- Locked diary and delay records reject direct updates at the database/API layer.
- Every insert/update/lock/report generation writes an audit event with actor, timestamp, entity type, entity id, and action.
- Private storage objects are not publicly readable by default.
