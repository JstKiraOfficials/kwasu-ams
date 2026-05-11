/** Nigeria's geographic bounding box (covers all of Nigeria including offshore). */
export const NIGERIA_BOUNDS = {
  minLat: 4.0,
  maxLat: 14.0,
  minLng: 2.5,
  maxLng: 15.0,
} as const;

/** Default geofence radius in metres. */
export const DEFAULT_GEOFENCE_RADIUS_METRES: number = 50;

/** Minimum allowed geofence radius in metres. */
export const MIN_GEOFENCE_RADIUS_METRES: number = 30;

/** Maximum allowed geofence radius in metres. */
export const MAX_GEOFENCE_RADIUS_METRES: number = 150;

/** Mean Earth radius in metres used in the Haversine formula. */
export const EARTH_RADIUS_METRES: number = 6_371_000;
