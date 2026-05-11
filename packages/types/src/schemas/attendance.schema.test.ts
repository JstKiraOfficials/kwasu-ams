import { describe, it, expect } from 'vitest';
import { GpsCheckinSchema, QrCheckinSchema, CodeCheckinSchema } from './attendance.schema.js';

const BASE = {
  latitude: 8.552,
  longitude: 4.534,
  deviceFingerprint: 'device-abc-123',
};

describe('GpsCheckinSchema', () => {
  it('accepts valid GPS check-in', () => {
    const result = GpsCheckinSchema.safeParse({
      ...BASE,
      sessionId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for sessionId', () => {
    const result = GpsCheckinSchema.safeParse({ ...BASE, sessionId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('defaults mockLocationEnabled to false', () => {
    const result = GpsCheckinSchema.safeParse({
      ...BASE,
      sessionId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mockLocationEnabled).toBe(false);
    }
  });
});

describe('CodeCheckinSchema', () => {
  it('rejects code shorter than 6 characters', () => {
    const result = CodeCheckinSchema.safeParse({
      ...BASE,
      sessionId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
      code: 'AB12',
    });
    expect(result.success).toBe(false);
  });

  it('rejects code longer than 8 characters', () => {
    const result = CodeCheckinSchema.safeParse({
      ...BASE,
      sessionId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
      code: 'ABCDEFGHI',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid 6-character code', () => {
    const result = CodeCheckinSchema.safeParse({
      ...BASE,
      sessionId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
      code: 'ABC123',
    });
    expect(result.success).toBe(true);
  });
});

describe('QrCheckinSchema', () => {
  it('accepts valid QR check-in', () => {
    const result = QrCheckinSchema.safeParse({ ...BASE, qrToken: 'eyJhbGciOiJIUzI1NiJ9.test' });
    expect(result.success).toBe(true);
  });
});
