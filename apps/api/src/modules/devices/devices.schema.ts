/**
 * @file devices.schema.ts
 * @module modules/devices
 *
 * Zod validation schemas for the device binding module.
 */

import { z } from 'zod';

/**
 * Schema for registering a new device binding.
 *
 * - `deviceFingerprint` — Unique device identifier from the React Native device API. Min 10 chars.
 * - `platform`          — `"ios"` or `"android"`.
 * - `deviceModel`       — Optional human-readable device model name.
 * - `osVersion`         — Optional OS version string.
 * - `isPrimary`         — Whether this is the primary device. Defaults to `true`.
 */
export const RegisterDeviceSchema = z.object({
  deviceFingerprint: z.string().min(10, 'Device fingerprint must be at least 10 characters'),
  platform: z.enum(['ios', 'android']),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  isPrimary: z.boolean().default(true),
});

/** TypeScript type inferred from {@link RegisterDeviceSchema}. */
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;

/**
 * Schema for revoking a device binding.
 *
 * - `reason` — Human-readable reason for revocation. Min 5 characters.
 */
export const RevokeDeviceSchema = z.object({
  reason: z.string().min(5, 'Revocation reason must be at least 5 characters'),
});

/** TypeScript type inferred from {@link RevokeDeviceSchema}. */
export type RevokeDeviceInput = z.infer<typeof RevokeDeviceSchema>;
