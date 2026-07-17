import type { WeatherSnapshot } from './types';

export interface OpenMeteoResponse {
  current?: { temperature_2m?: number; precipitation?: number; rain?: number; wind_speed_10m?: number; weather_code?: number };
  hourly?: { temperature_2m?: number[]; precipitation?: number[]; wind_speed_10m?: number[]; weather_code?: number[] };
  [key: string]: unknown;
}

export function buildOpenMeteoUrl(latitude: number, longitude: number, capturedAt = new Date()): string {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'temperature_2m,precipitation,rain,wind_speed_10m,weather_code',
    timezone: 'auto',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function parseWeatherSnapshot(args: { latitude: number; longitude: number; capturedAt: string; raw: OpenMeteoResponse; requestUrl: string }): WeatherSnapshot {
  const current = args.raw.current ?? {};
  return {
    provider: 'open-meteo', requestUrl: args.requestUrl, latitude: args.latitude, longitude: args.longitude,
    capturedAt: args.capturedAt, rawJson: args.raw as Record<string, unknown>,
    temperatureC: numberOrUndefined(current.temperature_2m),
    precipitationMm: numberOrUndefined(current.precipitation ?? current.rain),
    windSpeedKmh: numberOrUndefined(current.wind_speed_10m),
    weatherCode: numberOrUndefined(current.weather_code), status: 'saved',
  };
}

function numberOrUndefined(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }

export function weatherLabel(code?: number): string {
  if (code === undefined) return '—';
  if (code === 0) return 'Jasno';
  if ([1, 2, 3].includes(code)) return 'Oblačno';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'Dážď';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Sneh';
  if ([95, 96, 99].includes(code)) return 'Búrka';
  return 'Premenlivé';
}
