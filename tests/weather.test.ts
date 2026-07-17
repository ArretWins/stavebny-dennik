import { describe, expect, it } from 'vitest';
import { buildOpenMeteoUrl, parseWeatherSnapshot, weatherLabel } from '../src/domain/weather';

describe('Open-Meteo adapter', () => {
  it('builds a reproducible request URL', () => { const url = buildOpenMeteoUrl(48.2189, 17.4048); expect(url).toContain('latitude=48.2189'); expect(url).toContain('current='); expect(url).toContain('wind_speed_10m'); });
  it('stores raw and parsed weather values', () => { const snapshot = parseWeatherSnapshot({ latitude: 48, longitude: 17, capturedAt: '2026-07-11T09:42:00.000Z', requestUrl: 'https://example.test', raw: { current: { temperature_2m: 12, precipitation: 3.2, wind_speed_10m: 18, weather_code: 61 } } }); expect(snapshot.rawJson).toEqual(expect.objectContaining({ current: expect.anything() })); expect(snapshot.temperatureC).toBe(12); expect(snapshot.precipitationMm).toBe(3.2); expect(snapshot.status).toBe('saved'); });
  it('maps weather codes to field labels', () => { expect(weatherLabel(61)).toBe('Dážď'); expect(weatherLabel(0)).toBe('Jasno'); });
});
