# Design System: Stavebný Denník MVP

Source concept: `mockup-stavebny-dennik-mvp.png`.

## Product Feel
- Field-first mobile utility for Slovak builders: direct, readable, calm, and fast to operate outdoors.
- Visual tone: white workspace, strong green primary actions, orange interruption/risk actions, light evidence cards.
- Avoid marketing-style hero layouts, decorative gradients, oversized illustrations, and dense enterprise dashboards.
- The interface should feel like a reliable site tool: large tap targets, obvious status, clear proof metadata, minimal typing.

## Design Tokens
- Color:
  - `color.primary`: `#2E7D32` for main actions, success, active project, confirmed evidence.
  - `color.primaryDark`: `#1B5E20` for pressed primary buttons and strong text on green surfaces.
  - `color.warning`: `#EF6C00` for delay, stoppage, pending sync, weather interruption, attention states.
  - `color.warningSoft`: `#FFF4E5` for selected warning rows and pending-sync cards.
  - `color.surface`: `#FFFFFF` for screens and cards.
  - `color.surfaceAlt`: `#F8F5EF` for subtle app background and evidence strips.
  - `color.border`: `#E0DED9` for card/input dividers.
  - `color.text`: `#111827` for primary text.
  - `color.textMuted`: `#6B7280` for metadata, helper text, timestamps.
  - `color.danger`: `#C62828` only for destructive or failed sync states.
- Radius:
  - `radius.sm`: `8`
  - `radius.md`: `12`
  - `radius.lg`: `16`
  - Cards and inputs use `12`; large CTA buttons use `10-12`; avoid pill-heavy styling.
- Spacing:
  - Base grid `8`.
  - Screen horizontal padding `16`.
  - Card padding `16`.
  - Section gap `16-20`.
  - Compact metadata gap `8`.
- Typography:
  - System font on Android.
  - Screen title `28/34`, weight `700`.
  - Top-bar title `18/24`, weight `700`.
  - Section heading `16/22`, weight `700`.
  - Body `14-16/22`, weight `400`.
  - CTA `16/22`, weight `700`.
  - Metadata `12/16`, weight `400-600`.

## Core Components
- `ScreenShell`: white or subtle warm background, safe-area aware, fixed bottom action zone when needed.
- `TopBar`: back arrow, centered/left title, optional notification/menu icon. Keep titles concise in Slovak.
- `ProjectCard`: site icon/avatar, project name, status chip, location row, full-width primary action.
- `PrimaryButton`: green filled button with lucide icon when useful; min height `52`.
- `SecondaryButton`: white button with green border/text; min height `48`.
- `WarningActionButton`: orange filled button for `Nahlásiť prestoj` and interruption flows.
- `Card`: white surface, `1px` border, `radius.md`, light shadow only when needed for separation.
- `EvidenceTile`: compact bordered tile for GPS, photo proof, weather, and time. Use icon + label + value.
- `EvidenceStrip`: sticky or bottom-adjacent row showing captured GPS, saved weather, and timestamp before save.
- `RadioReasonRow`: large selectable row for delay reasons; selected row uses orange border and `warningSoft`.
- `CounterInput`: minus/value/plus row for worker count, with stable dimensions.
- `TextArea`: labeled input with character counter; use Slovak placeholder copy from i18n keys.
- `DashedUploadBox`: green dashed border for photo capture/upload, camera icon, file-size helper.
- `SyncBanner`: orange soft card for pending offline records with count and forward chevron.
- `PdfPreviewCard`: PDF icon, report title, project/date/reason metadata, page count chip.

## Interaction Rules
- Primary task per screen should be visually obvious within the first viewport.
- Bottom save/create/share actions remain reachable with one thumb; no critical action hidden behind overflow.
- Evidence capture states are explicit:
  - GPS captured: green map pin tile with coordinates.
  - Weather saved: weather icon tile with temperature, rain, wind.
  - Photo proof: thumbnail tile with count badge.
  - Pending sync: orange banner with number of queued records.
- Offline actions must look normal at capture time; only sync status changes.
- Locked records cannot show editable fields. Corrections use a new action labelled in Slovak, not inline editing.
- Use icons from `lucide-react-native` for actions and evidence: `MapPin`, `Camera`, `CloudRain`, `Clock`, `FileText`, `Share2`, `Plus`, `Pause`, `CheckCircle`, `Bell`.

## Language And Accessibility
- MVP ships only Slovak (`sk-SK`), but all strings must come from translation keys.
- Slovak labels should be short and field-friendly: `Pridať záznam`, `Nahlásiť prestoj`, `Vytvoriť PDF`, `Zdieľať`.
- Minimum tap target `44x44`; primary field actions should be at least `48` high.
- Color cannot be the only state indicator; selected/warning states need icon, border, and text.
- Preserve readable contrast in outdoor use. Do not use light gray text for important evidence values.

## Implementation Notes
- Implement tokens in `src/theme/tokens.ts` and expose component variants through shared UI primitives.
- Build screens from reusable primitives before adding feature-specific styling.
- Keep PDF visual language aligned with app evidence cards: clear metadata blocks, Slovak headings, concise proof summary.
