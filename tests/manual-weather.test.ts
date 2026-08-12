import { describe, expect, it } from 'vitest';
import { manualWeatherSnapshot, weatherSnapshotLabel } from '../src/domain/weather';

describe('manual weather evidence', () => {
  it('creates a saved snapshot without requiring GPS', () => {
    const snapshot = manualWeatherSnapshot({
      temperatureC: 17.5,
      description: 'Slabý dážď',
      windSpeedKmh: 11,
      precipitationMm: 1.2,
      capturedAt: '2026-08-12T12:00:00.000Z',
    });
    expect(snapshot).toMatchObject({
      provider: 'manual',
      latitude: 0,
      longitude: 0,
      temperatureC: 17.5,
      status: 'saved',
    });
    expect(weatherSnapshotLabel(snapshot)).toBe('Slabý dážď');
  });
});
