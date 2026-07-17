# Feature 03: Today Dashboard

## Clear Sequence
1. Build the project selector header for the currently active project.
2. Add primary actions for adding a diary record and reporting a stoppage/delay.
3. Add weather summary, worker presence, and pending sync cards.
4. Wire navigation to new diary record, delay event, QR check-in, and reports.
5. Add empty and loading states.

## Implementation Instructions
- Screen title is `Dnes`.
- Use the design system layout from the second phone in `mockup-stavebny-dennik-mvp.png`.
- Primary actions:
  - Green `Pridať záznam`.
  - Orange `Nahlásiť prestoj`.
- Weather card shows current saved weather for the active project/day when available.
- Worker presence card links to QR check-in flow and shows today's count when available.
- Pending sync card appears only when local outbox items exist.
- Keep all cards compact enough for field use and avoid nested cards.

## Acceptance Criteria
- A selected project opens to the today dashboard.
- Primary actions navigate to the correct flows.
- Weather, worker presence, and sync cards render correct empty/loading/success states.
- Pending sync state uses orange styling and shows the queued record count.
- UI review confirms first viewport exposes the project selector and main actions without scrolling on a typical Android phone.
