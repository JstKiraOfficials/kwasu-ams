import { describe, it, expect } from 'vitest';
import { CreateVenueSchema } from './venue.schema';

const BASE = {
  name: 'Main Lecture Theatre 1',
  buildingName: 'Main Lecture Theatre',
  latitude: 8.552,
  longitude: 4.534,
  capacity: 500,
};

describe('CreateVenueSchema', () => {
  it('accepts valid venue with default geofenceRadius', () => {
    const result = CreateVenueSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geofenceRadius).toBe(50);
    }
  });

  it('rejects geofenceRadius below minimum (25)', () => {
    const result = CreateVenueSchema.safeParse({ ...BASE, geofenceRadius: 25 });
    expect(result.success).toBe(false);
  });

  it('rejects geofenceRadius above maximum (200)', () => {
    const result = CreateVenueSchema.safeParse({ ...BASE, geofenceRadius: 200 });
    expect(result.success).toBe(false);
  });

  it('accepts geofenceRadius at boundary minimum (30)', () => {
    const result = CreateVenueSchema.safeParse({ ...BASE, geofenceRadius: 30 });
    expect(result.success).toBe(true);
  });

  it('accepts geofenceRadius at boundary maximum (150)', () => {
    const result = CreateVenueSchema.safeParse({ ...BASE, geofenceRadius: 150 });
    expect(result.success).toBe(true);
  });
});
