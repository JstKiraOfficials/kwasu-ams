import { isWithinNigeriaBounds, validateGeofence } from './geofence.js';

export type SpoofingFlag =
  | 'PRECISION_SPOOFING'
  | 'VELOCITY_SPOOFING'
  | 'MOCK_LOCATION'
  | 'OUTSIDE_NIGERIA';

export interface SpoofingCheckInput {
  latitude: number;
  longitude: number;
  mockLocationEnabled: boolean;
  previousCheckinLat?: number;
  previousCheckinLng?: number;
  previousCheckinTimestamp?: Date;
  currentTimestamp: Date;
}

export interface SpoofingCheckResult {
  isSuspicious: boolean;
  flags: SpoofingFlag[];
}

/** Maximum plausible human velocity in m/s (≈54 km/h). */
const MAX_VELOCITY_MS = 15;

/** Returns the number of decimal places in a number string. */
function countDecimalPlaces(value: number): number {
  const str = value.toString();
  const dotIndex = str.indexOf('.');
  if (dotIndex === -1) return 0;
  return str.length - dotIndex - 1;
}

/**
 * Checks all four GPS spoofing signals.
 * Flagged records receive PENDING_REVIEW status — not auto-rejected.
 */
export function checkSpoofing(input: SpoofingCheckInput): SpoofingCheckResult {
  const flags: SpoofingFlag[] = [];

  // 1. Precision spoofing — more than 8 decimal places is suspicious
  if (countDecimalPlaces(input.latitude) > 8 || countDecimalPlaces(input.longitude) > 8) {
    flags.push('PRECISION_SPOOFING');
  }

  // 2. Mock location flag
  if (input.mockLocationEnabled) {
    flags.push('MOCK_LOCATION');
  }

  // 3. Nigeria bounds check
  if (!isWithinNigeriaBounds(input.latitude, input.longitude)) {
    flags.push('OUTSIDE_NIGERIA');
  }

  // 4. Velocity spoofing — requires previous check-in data
  if (
    input.previousCheckinLat !== undefined &&
    input.previousCheckinLng !== undefined &&
    input.previousCheckinTimestamp !== undefined
  ) {
    const geofenceResult = validateGeofence({
      studentLat: input.previousCheckinLat,
      studentLng: input.previousCheckinLng,
      venueLat: input.latitude,
      venueLng: input.longitude,
      radiusMetres: 0,
      venueName: '',
    });

    const elapsedSeconds =
      (input.currentTimestamp.getTime() - input.previousCheckinTimestamp.getTime()) / 1000;

    if (elapsedSeconds > 0) {
      const velocity = geofenceResult.distanceMetres / elapsedSeconds;
      if (velocity > MAX_VELOCITY_MS) {
        flags.push('VELOCITY_SPOOFING');
      }
    }
  }

  return { isSuspicious: flags.length > 0, flags };
}
