import * as Location from 'expo-location';
import type { GpsEvidence, WeatherSnapshot } from '@/domain/types';
import { buildOpenMeteoUrl, parseWeatherSnapshot } from '@/domain/weather';

export async function captureGps(): Promise<GpsEvidence> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) throw new Error('LOCATION_DENIED');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude, capturedAt: new Date(position.timestamp).toISOString(), status: 'captured' };
}

export async function fetchWeather(gps: GpsEvidence): Promise<WeatherSnapshot> {
  const requestUrl = buildOpenMeteoUrl(gps.latitude, gps.longitude, new Date(gps.capturedAt));
  const response = await fetch(requestUrl);
  if (!response.ok) throw new Error(`WEATHER_HTTP_${response.status}`);
  const raw = await response.json();
  return parseWeatherSnapshot({ latitude: gps.latitude, longitude: gps.longitude, capturedAt: gps.capturedAt, raw, requestUrl });
}
