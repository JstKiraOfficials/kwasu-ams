import { describe, it, expect } from 'vitest';
import { validateGeofence, isWithinNigeriaBounds } from './geofence.js';

// KWASU Malete campus centre
const VENUE_LAT = 8.552;
const VENUE_LNG = 4.534;
const VENUE_NAME = 'LT1';
const RADIUS = 50;

/**
 * Generates a point approximately `metres` north of the given coordinates.
 * 1 degree latitude ≈ 111,320 metres.
 */
function pointNorthBy(lat: number, lng: number, metres: number): { lat: number; lng: number } {
  return { lat: lat + metres / 111_320, lng };
}

describe('validateGeofence', () => {
  it('returns inside: true and distanceMetres: 0 when student is at exact venue coordinates', () => {
    const result = validateGeofence({
      studentLat: VENUE_LAT,
      studentLng: VENUE_LNG,
      venueLat: VENUE_LAT,
      venueLng: VENUE_LNG,
      radiusMetres: RADIUS,
      venueName: VENUE_NAME,
    });
    expect(result.inside).toBe(true);
    expect(result.distanceMetres).toBe(0);
    expect(result.venue).toBe(VENUE_NAME);
  });

  it('returns inside: true for a student 49m from venue with 50m radius', () => {
    const { lat, lng } = pointNorthBy(VENUE_LAT, VENUE_LNG, 49);
    const result = validateGeofence({
      studentLat: lat,
      studentLng: lng,
      venueLat: VENUE_LAT,
      venueLng: VENUE_LNG,
      radiusMetres: RADIUS,
      venueName: VENUE_NAME,
    });
    expect(result.inside).toBe(true);
    expect(result.distanceMetres).toBeCloseTo(49, 0);
  });

  it('returns inside: false for a student 51m from venue with 50m radius', () => {
    const { lat, lng } = pointNorthBy(VENUE_LAT, VENUE_LNG, 51);
    const result = validateGeofence({
      studentLat: lat,
      studentLng: lng,
      venueLat: VENUE_LAT,
      venueLng: VENUE_LNG,
      radiusMetres: RADIUS,
      venueName: VENUE_NAME,
    });
    expect(result.inside).toBe(false);
    expect(result.distanceMetres).toBeCloseTo(51, 0);
  });

  it('returns inside: false and distanceMetres ≈ 200 for a student 200m away', () => {
    const { lat, lng } = pointNorthBy(VENUE_LAT, VENUE_LNG, 200);
    const result = validateGeofence({
      studentLat: lat,
      studentLng: lng,
      venueLat: VENUE_LAT,
      venueLng: VENUE_LNG,
      radiusMetres: RADIUS,
      venueName: VENUE_NAME,
    });
    expect(result.inside).toBe(false);
    expect(result.distanceMetres).toBeCloseTo(200, 0);
  });

  it('returns the correct venue name in the result', () => {
    const result = validateGeofence({
      studentLat: VENUE_LAT,
      studentLng: VENUE_LNG,
      venueLat: VENUE_LAT,
      venueLng: VENUE_LNG,
      radiusMetres: RADIUS,
      venueName: 'Science Block LT1',
    });
    expect(result.venue).toBe('Science Block LT1');
  });
});

describe('isWithinNigeriaBounds', () => {
  it('returns true for KWASU campus coordinates (8.55, 4.54)', () =>
    expect(isWithinNigeriaBounds(8.55, 4.54)).toBe(true));

  it('returns true for Lagos coordinates (6.45, 3.39)', () =>
    expect(isWithinNigeriaBounds(6.45, 3.39)).toBe(true));

  it('returns false for London coordinates (51.5, -0.1)', () =>
    expect(isWithinNigeriaBounds(51.5, -0.1)).toBe(false));

  it('returns false for coordinates north of Nigeria (15.0, 8.0)', () =>
    expect(isWithinNigeriaBounds(15.0, 8.0)).toBe(false));

  it('returns false for coordinates south of Nigeria (3.9, 8.0)', () =>
    expect(isWithinNigeriaBounds(3.9, 8.0)).toBe(false));

  it('returns true for coordinates at the southern border edge (4.0, 8.0)', () =>
    expect(isWithinNigeriaBounds(4.0, 8.0)).toBe(true));

  it('returns true for coordinates at the northern border edge (14.0, 8.0)', () =>
    expect(isWithinNigeriaBounds(14.0, 8.0)).toBe(true));
});
