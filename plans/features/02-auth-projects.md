# Feature 02: Auth And Projects

## Clear Sequence
1. Implement email/password sign-up, sign-in, sign-out, and password reset.
2. Create the authenticated app shell.
3. Implement project list and project detail selection.
4. Add create/edit project forms.
5. Persist selected project for fast return to the today dashboard.

## Implementation Instructions
- Use Supabase Auth with email and password. Do not add OTP, social login, or billing gates.
- Required project fields: project name, location/city, optional address, status, owner id.
- Use `ProjectCard` from the design system for the project list.
- The primary empty-state action is `Nový projekt`.
- The project card primary action is `Otvoriť projekt`.
- Project status should support at least active and archived, with active as the MVP default.
- All labels, errors, and empty states must come from the Slovak translation catalog.

## Acceptance Criteria
- A new user can create an account, sign in, reset password, and sign out.
- An authenticated user can create a project and see it in the project list.
- Project list visually matches the concept: project card, location row, status chip, green full-width open button.
- User A cannot access User B's projects through UI or API.
- Reopening the app returns the authenticated user to the last selected active project when possible.
