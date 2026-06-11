import { describe, it, expect } from 'vitest';
import { RegisterDeviceSchema } from './device.schema';

describe('RegisterDeviceSchema', () => {
  const valid = {
    deviceFingerprint: 'abc1234567890xyz',
    platform: 'android' as const,
    deviceModel: 'Pixel 7',
    osVersion: '13.0',
    isPrimary: true,
  };

  it('accepts a valid registration payload', () => {
    expect(RegisterDeviceSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts ios as platform', () => {
    expect(RegisterDeviceSchema.safeParse({ ...valid, platform: 'ios' }).success).toBe(true);
  });

  it('rejects unknown platform', () => {
    expect(RegisterDeviceSchema.safeParse({ ...valid, platform: 'windows' }).success).toBe(false);
  });

  it('rejects deviceFingerprint shorter than 10 characters', () => {
    expect(RegisterDeviceSchema.safeParse({ ...valid, deviceFingerprint: 'abc123' }).success).toBe(
      false,
    );
  });

  it('accepts payload without optional fields', () => {
    expect(
      RegisterDeviceSchema.safeParse({ deviceFingerprint: 'abc1234567890xyz', platform: 'ios' })
        .success,
    ).toBe(true);
  });

  it('defaults isPrimary to true when omitted', () => {
    const result = RegisterDeviceSchema.safeParse({
      deviceFingerprint: 'abc1234567890xyz',
      platform: 'android',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isPrimary).toBe(true);
  });
});
