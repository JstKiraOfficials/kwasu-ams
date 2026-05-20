/**
 * @file devices.service.ts
 * @module modules/devices
 *
 * Business logic for the device binding module.
 *
 * Responsibilities:
 * - Registering student devices with 1 primary + 1 secondary limit enforcement
 * - Setting `PENDING_APPROVAL` status for new devices when a student already has
 *   an active device or has exceeded 1 device change this semester
 * - Revoking device bindings with audit trail
 * - Approving pending device bindings (SUPER_ADMIN only)
 * - Listing device bindings for a user
 *
 * Security notes:
 * - Devices with `status: 'PENDING_APPROVAL'` cannot be used for check-in.
 *   The check-in service (Phase 19) enforces this.
 * - All device events are written to `AuditLog`.
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IDeviceBinding } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { type RegisterDeviceInput } from './devices.schema.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 * Errors are swallowed — audit failures must never surface to the caller.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name, e.g. `"DeviceBinding"`.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
 * @returns A promise that resolves once the log is written (or silently fails).
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

// =============================================================================
// Prisma select — IDeviceBinding fields
// =============================================================================

/**
 * Prisma `select` object that returns all `IDeviceBinding` fields.
 */
const DEVICE_SELECT = {
  id: true,
  userId: true,
  deviceFingerprint: true,
  platform: true,
  deviceModel: true,
  osVersion: true,
  isPrimary: true,
  status: true,
  registeredAt: true,
  lastSeenAt: true,
  revokedAt: true,
  revokedReason: true,
} as const;

// =============================================================================
// registerDevice
// =============================================================================

/**
 * Registers a new device binding for a student.
 *
 * Algorithm:
 * 1. Query existing active bindings for the user.
 * 2. If ≥ 2 active bindings: throw `DEVICE_LIMIT_REACHED`.
 * 3. If fingerprint already registered: update `lastSeenAt` and return existing.
 * 4. Determine status: `PENDING_APPROVAL` if user already has an active device
 *    or has registered > 1 device this semester; otherwise `ACTIVE`.
 * 5. Create `DeviceBinding` record.
 * 6. Write `DEVICE_REGISTERED` AuditLog entry.
 *
 * @param userId   - UUID of the student's `User` record.
 * @param data     - Validated registration payload from {@link RegisterDeviceSchema}.
 * @param actorId  - UUID of the actor (same as userId for self-registration).
 * @returns The created or updated device binding as {@link IDeviceBinding}.
 * @throws {AppError} `DEVICE_LIMIT_REACHED` (400) — student already has 2 active devices.
 */
export async function registerDevice(
  userId: string,
  data: RegisterDeviceInput,
  actorId: string,
): Promise<IDeviceBinding> {
  // 1. Query existing active bindings
  const activeDevices = await prisma.deviceBinding.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, deviceFingerprint: true },
  });

  // 2. Enforce 2-device limit
  if (activeDevices.length >= 2) {
    throw new AppError('DEVICE_LIMIT_REACHED', 'Maximum device limit reached.', 400);
  }

  // 3. If fingerprint already registered, update lastSeenAt and return
  const existingBinding = await prisma.deviceBinding.findUnique({
    where: { userId_deviceFingerprint: { userId, deviceFingerprint: data.deviceFingerprint } },
    select: DEVICE_SELECT,
  });
  if (existingBinding) {
    const updated = await prisma.deviceBinding.update({
      where: { id: existingBinding.id },
      data: { lastSeenAt: new Date() },
      select: DEVICE_SELECT,
    });
    return updated as IDeviceBinding;
  }

  // 4. Determine status for new device
  // New device when user already has an active device → PENDING_APPROVAL (TOTP challenge required)
  const isNewDevice = activeDevices.length > 0;

  // Check device changes this semester (approximate: last 6 months)
  const semesterStart = new Date();
  semesterStart.setMonth(semesterStart.getMonth() - 6);
  const deviceChangesThisSemester = await prisma.deviceBinding.count({
    where: { userId, registeredAt: { gte: semesterStart } },
  });
  const requiresAdminApproval = deviceChangesThisSemester > 1;

  const status = isNewDevice || requiresAdminApproval ? 'PENDING_APPROVAL' : 'ACTIVE';

  // 5. Create binding
  const binding = await prisma.deviceBinding.create({
    data: {
      userId,
      deviceFingerprint: data.deviceFingerprint,
      platform: data.platform,
      deviceModel: data.deviceModel ?? null,
      osVersion: data.osVersion ?? null,
      isPrimary: data.isPrimary,
      status,
    },
    select: DEVICE_SELECT,
  });

  // 6. Write audit log
  void writeAuditLog(actorId, 'STUDENT', 'DEVICE_REGISTERED', 'DeviceBinding', binding.id, {
    platform: data.platform,
    status,
  });

  return binding as IDeviceBinding;
}

// =============================================================================
// listDevices
// =============================================================================

/**
 * Returns all device bindings for a user, ordered by registration date descending.
 *
 * @param userId - UUID of the user whose devices to list.
 * @returns Array of {@link IDeviceBinding} records for the user.
 */
export async function listDevices(userId: string): Promise<IDeviceBinding[]> {
  const devices = await prisma.deviceBinding.findMany({
    where: { userId },
    select: DEVICE_SELECT,
    orderBy: { registeredAt: 'desc' },
  });
  return devices as IDeviceBinding[];
}

// =============================================================================
// revokeDevice
// =============================================================================

/**
 * Revokes a device binding by setting `status = 'REVOKED'`.
 *
 * Writes a `DEVICE_REVOKED` AuditLog entry on success.
 *
 * @param deviceId - UUID of the device binding to revoke.
 * @param reason   - Human-readable reason for revocation (min 5 chars).
 * @param actorId  - UUID of the actor performing the revocation (for audit trail).
 * @returns A promise that resolves once the revocation is complete.
 * @throws {AppError} `NOT_FOUND` (404) — device binding does not exist.
 */
export async function revokeDevice(
  deviceId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const existing = await prisma.deviceBinding.findUnique({
    where: { id: deviceId },
    select: { id: true, userId: true },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Device binding not found.', 404);
  }

  await prisma.deviceBinding.update({
    where: { id: deviceId },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason },
  });

  void writeAuditLog(actorId, 'STUDENT', 'DEVICE_REVOKED', 'DeviceBinding', deviceId, {
    reason,
  });
}

// =============================================================================
// approveDevice
// =============================================================================

/**
 * Approves a pending device binding by setting `status = 'ACTIVE'`.
 *
 * Restricted to `SUPER_ADMIN` via the route's `requireRoles` preHandler.
 * Writes a `DEVICE_REGISTERED` AuditLog entry on success.
 *
 * @param deviceId - UUID of the device binding to approve.
 * @param actorId  - UUID of the SUPER_ADMIN performing the approval (for audit trail).
 * @returns The approved device binding as {@link IDeviceBinding}.
 * @throws {AppError} `NOT_FOUND` (404) — device binding does not exist.
 */
export async function approveDevice(deviceId: string, actorId: string): Promise<IDeviceBinding> {
  const existing = await prisma.deviceBinding.findUnique({
    where: { id: deviceId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Device binding not found.', 404);
  }

  const binding = await prisma.deviceBinding.update({
    where: { id: deviceId },
    data: { status: 'ACTIVE' },
    select: DEVICE_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'DEVICE_REGISTERED', 'DeviceBinding', deviceId, {
    action: 'APPROVE',
  });

  return binding as IDeviceBinding;
}
