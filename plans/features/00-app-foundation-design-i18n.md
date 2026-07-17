# Feature 00: App Foundation, Design System, And I18n

## Clear Sequence
1. Scaffold the Expo React Native Android app with TypeScript.
2. Add navigation, shared theme tokens, shared UI primitives, and app shell structure.
3. Add the Slovak-only i18n catalog with `sk-SK` as the default locale.
4. Wire screens through placeholders that already use the design system primitives.
5. Add static checks that fail on missing translation keys and direct user-facing string usage where practical.

## Implementation Instructions
- Use Expo React Native with TypeScript and Android as the first-class platform.
- Implement tokens from `DESIGN_SYSTEM.md` in `src/theme/tokens.ts`: colors, spacing, radius, type scale, and shadows.
- Create shared primitives before feature screens: `ScreenShell`, `TopBar`, `Card`, `PrimaryButton`, `SecondaryButton`, `WarningActionButton`, `EvidenceTile`, `EvidenceStrip`, `CounterInput`, `TextArea`, `DashedUploadBox`, `SyncBanner`, `PdfPreviewCard`.
- Use `lucide-react-native` icons for action and evidence UI.
- Add an i18n helper with one shipped catalog: `sk-SK`. Do not add a language switcher.
- Keep all visible app copy in translation files, including placeholders, empty states, errors, button labels, and PDF preview text.
- Match the practical mobile style from `mockup-stavebny-dennik-mvp.png`: white surfaces, green primary CTAs, orange delay/risk CTAs, compact evidence cards, large tap targets.

## Acceptance Criteria
- App boots on Android with placeholder routes for login, projects, today dashboard, new diary record, delay report, reports, and settings.
- No feature screen contains hardcoded user-facing copy outside the Slovak translation catalog, except test IDs and developer-only comments.
- Shared UI primitives expose the variants needed by later feature files.
- Basic visual smoke check confirms no overlapping text, tap targets are at least `44x44`, and primary CTAs are thumb-friendly.
- The UI palette and component shapes visibly align with `mockup-stavebny-dennik-mvp.png`.
