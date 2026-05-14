/**
 * @file totp.service.ts
 * @module modules/auth
 *
 * TOTP lifecycle service for KWASU AMS.
 *
 * Responsibilities:
 * - TOTP secret generation and temporary storage in Redis during setup
 * - Enrollment confirmation: secret encryption, backup code generation, DB persistence
 * - TOTP code verification with ±1 step tolerance and used-token replay blacklist
 * - Account recovery via single-use backup codes
 * - Admin-initiated TOTP reset (clears secret and forces re-enrollment)
 *
 * All AuditLog writes are fire-and-forget (void) — they must never block the
 * request cycle. Phase 27 replaces the direct Prisma calls with BullMQ jobs.
 *
 * Security invariants:
 * - TOTP secrets are stored AES-256 encrypted at rest — never in plaintext.
 * - Backup codes are stored as SHA-256 hashes — plaintext is shown exactly once.
 * - Each TOTP code is blacklisted in Redis for 90 seconds after use (replay protection).
 * - GPS coordinates are never stored anywhere in this module.
 */

import { randomUUID } from 'crypto';
import { type AuditAction, Prisma } from '@prisma/client';
import { validateMatricNumber, validateStaffId, normaliseMatricNumber } from '@kwasu-ams/utils';
import { type Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import {
  generateTotpSecret,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  verifyBackupCode,
} from '../../lib/totp.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../middleware/error-handler.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 *
 * This is a **placeholder** until Phase 27 introduces the BullMQ
 * `auditLogQueue`. At that point, replace the `prisma.auditLog.create` call
 * with `void auditLogQueue.add('audit', jobData)`.
 *
 * Errors are swallowed intentionally — audit log failures must never surface
 * to the end user or block the response.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor (stored denormalised for query speed).
 * @param action     - The {@link AuditAction} enum value describing what happened.
 * @param entityType - Human-readable entity name, e.g. `"User"`.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object (reason, method, etc.).
 * @returns A promise that resolves once the log entry is written (or silently fails).
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
// TOTP setup
// =============================================================================

/**
 * Begins the TOTP enrollment flow for a user.
 *
 * Generates a new TOTP secret, stores the plaintext secret in Redis under
 * `totp:setup:{userId}` with a 10-minute TTL, and returns the base32 secret
 * and the `otpauth://totp/...` URI for QR code rendering by the client.
 *
 * The secret is **not** persisted to the database until {@link confirmTotp}
 * is called with a valid code. If the user does not confirm within 10 minutes,
 * the Redis key expires and they must restart setup.
 *
 * @param userId - UUID of the authenticated user initiating setup.
 * @returns Object containing the base32 `secret` (manual entry fallback) and
 *          `qrCodeUri` (`otpauth://` URI — pass to `<QRCodeSVG value={qrCodeUri} />`).
 * @throws {AppError} `NOT_FOUND` (404) — user record does not exist.
 * @throws {AppError} `CONFLICT` (409) — user has already completed TOTP enrollment.
 */
export async function setupTotp(userId: string): Promise<{ secret: string; qrCodeUri: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, totpEnrolled: true },
  });

  if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);
  if (user.totpEnrolled) throw new AppError('CONFLICT', 'TOTP already enrolled.', 409);

  const { secret, uri } = generateTotpSecret();
  await redis.set(`totp:setup:${userId}`, secret, 'EX', 600);

  return { secret, qrCodeUri: uri };
}

// =============================================================================
// TOTP enrollment confirmation
// =============================================================================

/**
 * Confirms TOTP enrollment by validating the first authenticator code.
 *
 * Retrieves the pending plaintext secret from Redis, verifies the submitted
 * code with ±1 step tolerance, then:
 * 1. Encrypts the secret with AES-256-CBC and persists it to the database.
 * 2. Generates 8 single-use backup recovery codes (returned in plaintext once).
 * 3. Stores the SHA-256 hashes of the backup codes in the database.
 * 4. Sets `totpEnrolled = true` on the user record.
 * 5. Deletes the Redis setup key.
 * 6. Writes a `TOTP_ENROLLED` AuditLog entry (fire-and-forget).
 *
 * @param userId - UUID of the authenticated user confirming enrollment.
 * @param code   - 6-digit TOTP code from the user's authenticator app.
 * @returns Object containing `backupCodes` — 8 plaintext single-use recovery codes.
 *          These are shown exactly once and must be stored safely by the user.
 * @throws {AppError} `TOTP_SETUP_REQUIRED` (400) — Redis setup session has expired (10-min TTL).
 * @throws {AppError} `TOTP_INVALID` (400) — submitted code does not match the pending secret.
 */
export async function confirmTotp(
  userId: string,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const secret = await redis.get(`totp:setup:${userId}`);
  if (!secret) {
    throw new AppError('TOTP_SETUP_REQUIRED', 'Setup session expired. Restart setup.', 400);
  }

  if (!verifyTotpCode(secret, code)) {
    throw new AppError('TOTP_INVALID', 'Invalid TOTP code.', 400);
  }

  const encryptedSecret = encryptTotpSecret(secret);
  const { plaintext, hashed } = generateBackupCodes();

  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encryptedSecret, totpEnrolled: true, totpBackupCodes: hashed },
  });

  await redis.del(`totp:setup:${userId}`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  void writeAuditLog(userId, user?.role ?? 'STUDENT', 'TOTP_ENROLLED', 'User', userId);

  return { backupCodes: plaintext };
}

// =============================================================================
// TOTP verification (login step 2)
// =============================================================================

/**
 * Verifies a TOTP code and issues a full JWT access + refresh token pair.
 *
 * This is the second step of the login flow, called after `POST /auth/login`
 * has issued an interim token. Enforces:
 * - `totpEnrolled` check — returns 403 if the user has not yet set up TOTP.
 * - Used-token blacklist — each code is blacklisted in Redis for 90 seconds
 *   after use to prevent replay attacks within the ±1 step window.
 * - ±1 step tolerance — accepts codes from the previous and next 30-second
 *   windows to accommodate clock drift on student devices.
 *
 * On success, writes a `LOGIN_SUCCESS` AuditLog entry (fire-and-forget).
 *
 * @param userId - UUID of the authenticated user (from the interim token).
 * @param code   - 6-digit TOTP code from the user's authenticator app.
 * @returns Object containing `accessToken` (30-min) and `refreshToken` (7-day).
 * @throws {AppError} `NOT_FOUND` (404) — user record does not exist.
 * @throws {AppError} `TOTP_SETUP_REQUIRED` (403) — user has not completed TOTP enrollment.
 * @throws {AppError} `TOTP_INVALID` (400) — code has already been used (replay) or is incorrect.
 */
export async function verifyTotp(
  userId: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, scopeId: true, totpEnrolled: true, totpSecret: true },
  });

  if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);
  if (!user.totpEnrolled) {
    throw new AppError('TOTP_SETUP_REQUIRED', 'TOTP setup required.', 403);
  }

  const decryptedSecret = decryptTotpSecret(user.totpSecret!);

  // Replay protection — reject codes that have already been used within the 90-second window
  const blacklistKey = `totp:used:${userId}:${code}`;
  const alreadyUsed = await redis.get(blacklistKey);
  if (alreadyUsed) throw new AppError('TOTP_INVALID', 'TOTP code already used.', 400);

  if (!verifyTotpCode(decryptedSecret, code)) {
    throw new AppError('TOTP_INVALID', 'Invalid TOTP code.', 400);
  }

  // Blacklist the used code for 90 seconds (covers the full ±1 step window)
  void redis.set(blacklistKey, '1', 'EX', 90);

  const sessionId = randomUUID();
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId,
  });
  const refreshToken = signRefreshToken({ userId: user.id, sessionId });

  void writeAuditLog(userId, user.role, 'LOGIN_SUCCESS', 'User', userId);

  return { accessToken, refreshToken };
}

// =============================================================================
// TOTP recovery via backup code
// =============================================================================

/**
 * Authenticates a user using a single-use backup recovery code.
 *
 * Used when the user cannot access their authenticator app. Validates the
 * identifier format, looks up the user, verifies the submitted recovery code
 * against the stored SHA-256 hashes, removes the used code from the list,
 * and issues a full JWT pair.
 *
 * If the last backup code is consumed, the AuditLog entry includes
 * `metadata: { backupCodesExhausted: true }` so admins can identify affected
 * users who will need an admin TOTP reset to regain access.
 *
 * Security invariant: all failure paths return the same generic
 * `INVALID_CREDENTIALS` error to prevent user enumeration.
 *
 * @param identifier   - Raw matric number or staff ID as submitted by the client.
 * @param recoveryCode - 8-character alphanumeric single-use backup code.
 * @returns Object containing `accessToken` (30-min) and `refreshToken` (7-day).
 * @throws {AppError} `VALIDATION_ERROR` (400) — identifier format is invalid.
 * @throws {AppError} `INVALID_CREDENTIALS` (401) — user not found or recovery code is wrong/used.
 */
export async function recoverTotp(
  identifier: string,
  recoveryCode: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const isMatric = validateMatricNumber(identifier);
  const isStaff = validateStaffId(identifier);

  if (!isMatric && !isStaff) {
    throw new AppError('VALIDATION_ERROR', 'Invalid identifier format.', 400, 'identifier');
  }

  const normalisedIdentifier = isMatric ? normaliseMatricNumber(identifier) : identifier;

  const user = await prisma.user.findUnique({
    where: { identifier: normalisedIdentifier, deletedAt: null },
    select: {
      id: true,
      role: true,
      scopeId: true,
      totpBackupCodes: true,
    },
  });

  if (!user) throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

  const { valid, remainingCodes } = verifyBackupCode(recoveryCode, user.totpBackupCodes);
  if (!valid) throw new AppError('INVALID_CREDENTIALS', 'Invalid recovery code.', 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpBackupCodes: remainingCodes },
  });

  const sessionId = randomUUID();
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId,
  });
  const refreshToken = signRefreshToken({ userId: user.id, sessionId });

  const metadata: Record<string, unknown> = {};
  if (remainingCodes.length === 0) metadata.backupCodesExhausted = true;

  void writeAuditLog(user.id, user.role, 'LOGIN_SUCCESS', 'User', user.id, metadata);

  return { accessToken, refreshToken };
}

// =============================================================================
// Admin TOTP reset
// =============================================================================

/**
 * Resets a user's TOTP enrollment, forcing them to re-enroll on next login.
 *
 * Clears `totpSecret`, sets `totpEnrolled = false`, and empties
 * `totpBackupCodes` on the target user record. Writes a `TOTP_RESET` AuditLog
 * entry recording which admin performed the reset.
 *
 * This is the only recovery path when a user has exhausted all 8 backup codes.
 * Restricted to `SUPER_ADMIN` via the route's `requireRoles` preHandler.
 *
 * @param targetUserId - UUID of the user whose TOTP enrollment is being reset.
 * @param actorId      - UUID of the SUPER_ADMIN performing the reset (for audit trail).
 * @returns A promise that resolves once the reset is complete.
 * @throws {AppError} `NOT_FOUND` (404) — target user record does not exist.
 */
export async function adminResetTotp(targetUserId: string, actorId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });

  if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);

  await prisma.user.update({
    where: { id: targetUserId },
    data: { totpSecret: null, totpEnrolled: false, totpBackupCodes: [] },
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'TOTP_RESET', 'User', targetUserId, {
    resetBy: actorId,
  });
}
