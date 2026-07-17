# Feature 05: Weather, GPS, And Evidence Snapshots

## Clear Sequence
1. Request device location permission at the point evidence is captured.
2. Capture GPS coordinates and timestamp.
3. Fetch weather from Open-Meteo for the captured coordinates and relevant date/time.
4. Store raw provider response and parsed weather values.
5. Render evidence tiles and include weather/GPS data in reports.

## Implementation Instructions
- Weather provider: Open-Meteo adapter for MVP.
- Save provider name, request URL, latitude, longitude, captured timestamp, raw JSON, parsed temperature, precipitation/rain, wind speed, and weather code.
- If the app is offline, save GPS/time evidence immediately and mark weather as pending for sync resolution.
- Evidence tiles use `MapPin`, `CloudRain`, and `Clock` icons.
- Do not let weather fetch failure block diary record capture.
- Show source/status clearly: captured, saved, pending, or failed.

## Acceptance Criteria
- GPS evidence can be captured and stored with a diary or delay record.
- Weather snapshot is stored with raw JSON and parsed display values.
- Offline capture stores a pending weather state and resolves it after sync.
- Weather failure shows a Slovak error/status but still allows the user to save the record.
- Reports can access the stored weather snapshot without refetching external weather data.
