import { describe, it, expect } from 'vitest';
import { checkSpoofing } from './spoofing.js';

const NOW = new Date('2024-10-01T10:00:00.000Z');
const VALID_LAT = 8.552;
const VALID_LNG = 4.534;

describe('checkSpoofing', () => {
  it('returns isSuspicious: false for clean check-in', () => {
    const result = checkSpoofing({
      latitude: VALID_LAT,
      longitude: VALID_LNG,
      mockLocationEnabled: false,
      currentTimestamp: NOW,
    });
    expect(result.isSuspicious).toBe(false);
    expect(result.flags).toHaveLength(0);
  });

  it('flags PRECISION_SPOOFING for latitude with 9 decimal places', () => {
    const result = checkSpoofing({
      latitude: 8.55123456789,
      longitude: VALID_LNG,
      mockLocationEnabled: false,
      currentTimestamp: NOW,
    });
    expect(result.flags).toContain('PRECISION_SPOOFING');
    expect(result.isSuspicious).toBe(true);
  });

  it('does NOT flag precision for coordinates with exactly 8 decimal places', () => {
    const result = checkSpoofing({
      latitude: 8.55123456,
      longitude: VALID_LNG,
      mockLocationEnabled: false,
      currentTimestamp: NOW,
    });
    expect(result.flags).not.toContain('PRECISION_SPOOFING');
  });

  it('flags MOCK_LOCATION when mockLocationEnabled is true', () => {
    const result = checkSpoofing({
      latitude: VALID_LAT,
      longitude: VALID_LNG,
      mockLocationEnabled: true,
      currentTimestamp: NOW,
    });
    expect(result.flags).toContain('MOCK_LOCATION');
    expect(result.isSuspicious).toBe(true);
  });

  it('flags OUTSIDE_NIGERIA for London coordinates', () => {
    const result = checkSpoofing({
      latitude: 51.5,
      longitude: -0.1,
      mockLocationEnabled: false,
      currentTimestamp: NOW,
    });
    expect(result.flags).toContain('OUTSIDE_NIGERIA');
    expect(result.isSuspicious).toBe(true);
  });

  it('flags VELOCITY_SPOOFING when velocity > 15 m/s between check-ins', () => {
    // 1000m in 10 seconds = 100 m/s — clearly spoofed
    const prev = new Date(NOW.getTime() - 10_000);
    const { lat: prevLat, lng: prevLng } = { lat: VALID_LAT, lng: VALID_LNG };
    const { lat: currLat, lng: currLng } = {
      lat: VALID_LAT + 1000 / 111_320,
      lng: VALID_LNG,
    };

    const result = checkSpoofing({
      latitude: currLat,
      longitude: currLng,
      mockLocationEnabled: false,
      previousCheckinLat: prevLat,
      previousCheckinLng: prevLng,
      previousCheckinTimestamp: prev,
      currentTimestamp: NOW,
    });
    expect(result.flags).toContain('VELOCITY_SPOOFING');
  });

  it('does NOT flag velocity when movement is ≤ 15 m/s', () => {
    // 10m in 10 seconds = 1 m/s — walking pace
    const prev = new Date(NOW.getTime() - 10_000);
    const { lat: currLat, lng: currLng } = {
      lat: VALID_LAT + 10 / 111_320,
      lng: VALID_LNG,
    };

    const result = checkSpoofing({
      latitude: currLat,
      longitude: currLng,
      mockLocationEnabled: false,
      previousCheckinLat: VALID_LAT,
      previousCheckinLng: VALID_LNG,
      previousCheckinTimestamp: prev,
      currentTimestamp: NOW,
    });
    expect(result.flags).not.toContain('VELOCITY_SPOOFING');
  });

  it('does NOT flag velocity when no previous check-in data is provided', () => {
    const result = checkSpoofing({
      latitude: VALID_LAT,
      longitude: VALID_LNG,
      mockLocationEnabled: false,
      currentTimestamp: NOW,
    });
    expect(result.flags).not.toContain('VELOCITY_SPOOFING');
  });

  it('can flag multiple signals simultaneously', () => {
    const result = checkSpoofing({
      latitude: 51.5,
      longitude: -0.1,
      mockLocationEnabled: true,
      currentTimestamp: NOW,
    });
    expect(result.flags).toContain('OUTSIDE_NIGERIA');
    expect(result.flags).toContain('MOCK_LOCATION');
    expect(result.flags.length).toBeGreaterThanOrEqual(2);
  });
});
