import { EARTH_RADIUS_METRES, NIGERIA_BOUNDS } from './constants/geofence';

export interface GeofenceInput {
  studentLat: number;
  studentLng: number;
  venueLat: number;
  venueLng: number;
  radiusMetres: number;
  venueName: string;
}

export interface GeofenceResult {
  inside: boolean;
  distanceMetres: number;
  venue: string;
}

/**
 * Validates whether a student's GPS coordinates are within the venue geofence.
 * Uses the Haversine formula — accurate to within 1 metre for distances ≤ 200m.
 * GPS coordinates are NEVER stored — only the boolean result is used downstream.
 */
export function validateGeofence(input: GeofenceInput): GeofenceResult {
  const toRad = (deg: number): number => deg * (Math.PI / 180);

  const studentLatRad = toRad(input.studentLat);
  const studentLngRad = toRad(input.studentLng);
  const venueLatRad = toRad(input.venueLat);
  const venueLngRad = toRad(input.venueLng);

  const deltaLat = venueLatRad - studentLatRad;
  const deltaLng = venueLngRad - studentLngRad;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(studentLatRad) * Math.cos(venueLatRad) * Math.sin(deltaLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMetres = EARTH_RADIUS_METRES * c;
  const rounded = Math.round(distanceMetres * 10) / 10;

  return {
    inside: rounded <= input.radiusMetres,
    distanceMetres: rounded,
    venue: input.venueName,
  };
}

/**
 * Returns true if the coordinates are within Nigeria's geographic bounding box.
 * Coordinates outside this box are rejected before the Haversine calculation runs.
 */
export function isWithinNigeriaBounds(lat: number, lng: number): boolean {
  return (
    lat >= NIGERIA_BOUNDS.minLat &&
    lat <= NIGERIA_BOUNDS.maxLat &&
    lng >= NIGERIA_BOUNDS.minLng &&
    lng <= NIGERIA_BOUNDS.maxLng
  );
}
