/**
 * @file auth.service.ts
 * @module modules/auth
 *
 * Core authentication business logic for KWASU AMS.
 *
 * Responsibilities:
 * - Identifier format validation (matric number / staff ID) before any DB lookup
 * - Argon2id password verification with 5-attempt lockout enforcement
 * - Interim JWT token issuance for the TOTP verification step
 * - Refresh token rotation with Redis blocklist
 * - Password change and password reset flows
 * - Logout with refresh token invalidation
 *
 * All AuditLog writes are fire-and-forget (void) — they must never block the
 * request cycle. Phase 27 replaces the direct Prisma calls with BullMQ jobs.
 *
 * Security invariant: every login failure path returns the same generic
 * "Invalid credentials." message to prevent user enumeration.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import {
  validateMatricNumber,
  validateStaffId,
  normaliseMatricNumber,
  addMinutes,
  isOk,
} from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { verifyPassword, hashPassword } from '../../lib/argon2.js';
import {
  signInterimToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
} from '../../lib/jwt.js';
import { sendEmail } from '../../lib/email-client.js';
import { AppError } from '../../middleware/error-handler.js';
import { env } from '../../config/env.js';
import { Role } from '@kwasu-ams/types';

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
 * @param actorId   - UUID of the user performing the action.
 * @param actorRole - Role string of the actor (stored denormalised for query speed).
 * @param action    - The {@link AuditAction} enum value describing what happened.
 * @param entityType - Human-readable entity name, e.g. `"User"`.
 * @param entityId  - Optional UUID of the affected entity.
 * @param metadata  - Optional free-form context object (reason, method, etc.).
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
// Login
// =============================================================================

/**
 * Authenticates a user with their institutional identifier and password.
 *
 * Flow:
 * 1. Validates identifier format (matric number or staff ID) — returns 400 if invalid.
 * 2. Normalises matric numbers to uppercase.
 * 3. Looks up the user — returns generic 401 if not found (no enumeration).
 * 4. Checks account lockout — returns 401 ACCOUNT_LOCKED if locked.
 * 5. Verifies Argon2id password hash.
 * 6. On failure: increments `failedAttempts`; locks account after 5 failures.
 * 7. On success: resets counters, writes audit log, issues 5-minute interim token.
 *
 * The returned `interimToken` is only valid for `POST /auth/verify-totp`.
 *
 * @param identifier - Raw matric number or staff ID as submitted by the client.
 * @param password   - Plaintext password to verify against the stored Argon2id hash.
 * @returns Object containing the interim JWT, and flags for the client flow.
 * @throws {AppError} `VALIDATION_ERROR` (400) — identifier format is invalid.
 * @throws {AppError} `INVALID_CREDENTIALS` (401) — user not found or wrong password.
 * @throws {AppError} `ACCOUNT_LOCKED` (401) — account is currently locked.
 */
export async function login(
  identifier: string,
  password: string,
): Promise<{ interimToken: string; mustChangePassword: boolean; totpEnrolled: boolean }> {
  // Step 1 — Validate identifier format before touching the database
  const isMatric = validateMatricNumber(identifier);
  const isStaff = validateStaffId(identifier);

  if (!isMatric && !isStaff) {
    throw new AppError('VALIDATION_ERROR', 'Invalid identifier format.', 400, 'identifier');
  }

  // Step 2 — Normalise matric numbers to uppercase; staff IDs are stored as-is
  const normalisedIdentifier = isMatric ? normaliseMatricNumber(identifier) : identifier;

  // Step 3 — Fetch user (generic error prevents enumeration)
  const user = await prisma.user.findUnique({
    where: { identifier: normalisedIdentifier, deletedAt: null },
    select: {
      id: true,
      role: true,
      passwordHash: true,
      mustChangePassword: true,
      totpEnrolled: true,
      failedAttempts: true,
      lockoutUntil: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);
  }

  // Step 4 — Check lockout window
  if (user.lockoutUntil !== null && user.lockoutUntil > new Date()) {
    throw new AppError('ACCOUNT_LOCKED', 'Invalid credentials.', 401);
  }

  // Step 5 — Verify Argon2id hash
  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const newFailedAttempts = user.failedAttempts + 1;
    const shouldLock = newFailedAttempts >= 5;

    // Step 6 — Increment counter; optionally set lockout
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: newFailedAttempts,
        ...(shouldLock ? { lockoutUntil: addMinutes(new Date(), 15) } : {}),
      },
    });

    if (shouldLock) {
      void writeAuditLog(user.id, user.role, 'ACCOUNT_LOCKED', 'User', user.id, {
        reason: 'Too many failed login attempts',
      });
    }

    throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);
  }

  // Step 7 — Successful login: reset counters and issue interim token
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockoutUntil: null },
  });

  void writeAuditLog(user.id, user.role, 'LOGIN_SUCCESS', 'User', user.id);

  const interimToken = signInterimToken({ userId: user.id });

  return {
    interimToken,
    mustChangePassword: user.mustChangePassword,
    totpEnrolled: user.totpEnrolled,
  };
}

// =============================================================================
// Refresh token
// =============================================================================

/**
 * Rotates a refresh token, issuing a new access token and refresh token pair.
 *
 * The old refresh token is added to a Redis blocklist (TTL = remaining lifetime)
 * to prevent reuse. This implements single-use refresh token semantics.
 *
 * @param token - The refresh token string from the client's secure storage.
 * @returns New `accessToken` and `refreshToken` strings.
 * @throws {AppError} `UNAUTHORIZED` (401) — token is invalid, expired, or blocklisted.
 */
export async function refreshToken(
  token: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const result = verifyRefreshToken(token);

  if (!isOk(result)) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials.', 401);
  }

  const payload = result.value;

  // Reject blocklisted tokens (already-used refresh tokens)
  const blocked = await redis.get(`blocklist:refresh:${token}`);
  if (blocked) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials.', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId, isActive: true, deletedAt: null },
    select: { id: true, role: true, scopeId: true },
  });

  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials.', 401);
  }

  // Blocklist the consumed refresh token for its remaining lifetime
  const remainingTtl = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
  if (remainingTtl > 0) {
    void redis.set(`blocklist:refresh:${token}`, '1', 'EX', remainingTtl);
  }

  const sessionId = payload.sessionId;
  const newAccessToken = signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId,
  });
  const newRefreshToken = signRefreshToken({ userId: user.id, sessionId });

  void writeAuditLog(user.id, user.role, 'LOGIN_SUCCESS', 'User', user.id, {
    action: 'token_refresh',
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// =============================================================================
// Change password
// =============================================================================

/**
 * Changes a user's password after verifying their current password.
 *
 * Sets `mustChangePassword = false` on success, which clears the forced
 * password-change gate on subsequent logins.
 *
 * @param userId          - UUID of the authenticated user.
 * @param currentPassword - Plaintext current password for verification.
 * @param newPassword     - Plaintext new password to hash and store.
 * @throws {AppError} `NOT_FOUND` (404) — user record does not exist.
 * @throws {AppError} `INVALID_CREDENTIALS` (400) — current password is wrong.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, passwordHash: true },
  });

  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found.', 404);
  }

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) {
    throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 400);
  }

  const newHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  void writeAuditLog(userId, user.role, 'PASSWORD_CHANGED', 'User', userId);
}

// =============================================================================
// Forgot password
// =============================================================================

/**
 * Initiates the password reset flow by generating a single-use reset token
 * and sending it to the user's registered email address.
 *
 * This function **always returns void** regardless of whether the identifier
 * or email exists — this prevents account enumeration via the forgot-password
 * endpoint.
 *
 * The reset token is stored in Redis with a 1-hour TTL. It is consumed and
 * deleted by {@link resetPassword}.
 *
 * @param identifier - Matric number or staff ID submitted by the user.
 * @param email      - Email address the user claims is associated with the account.
 * @throws {AppError} `VALIDATION_ERROR` (400) — identifier format is invalid.
 */
export async function forgotPassword(identifier: string, email: string): Promise<void> {
  const isMatric = validateMatricNumber(identifier);
  const isStaff = validateStaffId(identifier);

  if (!isMatric && !isStaff) {
    throw new AppError('VALIDATION_ERROR', 'Invalid identifier format.', 400, 'identifier');
  }

  const normalisedIdentifier = isMatric ? normaliseMatricNumber(identifier) : identifier;

  const user = await prisma.user.findUnique({
    where: { identifier: normalisedIdentifier, deletedAt: null },
    select: { id: true, email: true },
  });

  // Silent return — never reveal whether the account or email exists
  if (!user || user.email.toLowerCase() !== email.toLowerCase()) return;

  const resetToken = signInterimToken({ userId: user.id });
  await redis.set(`pwd-reset:${user.id}`, resetToken, 'EX', 3600);

  const resetLink = `${env.WEB_BASE_URL}/reset-password?token=${resetToken}`;

  void sendEmail(
    user.email,
    'KWASU AMS — Password Reset',
    `<p>Click the link below to reset your password. This link expires in 1 hour.</p>
     <p><a href="${resetLink}">${resetLink}</a></p>
     <p>If you did not request this, please ignore this email.</p>`,
  );
}

// =============================================================================
// Reset password
// =============================================================================

/**
 * Completes the password reset flow by consuming the single-use reset token
 * and updating the user's password hash.
 *
 * The Redis key is deleted after use, making the token single-use. Subsequent
 * calls with the same token will fail with `UNAUTHORIZED`.
 *
 * @param resetToken  - Single-use JWT delivered via the password reset email link.
 * @param newPassword - Plaintext new password to hash and store.
 * @throws {AppError} `UNAUTHORIZED` (401) — token is invalid, expired, or already used.
 */
export async function resetPassword(resetToken: string, newPassword: string): Promise<void> {
  const result = verifyAccessToken(resetToken);

  if (!isOk(result)) {
    throw new AppError('UNAUTHORIZED', 'Reset link is invalid or has expired.', 401);
  }

  const payload = result.value;

  // Verify the token matches what we stored (single-use enforcement)
  const stored = await redis.get(`pwd-reset:${payload.userId}`);
  if (!stored || stored !== resetToken) {
    throw new AppError('UNAUTHORIZED', 'Reset link has already been used.', 401);
  }

  const newHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: payload.userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  // Consume the token — any further use of the same link will fail
  await redis.del(`pwd-reset:${payload.userId}`);

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  });

  void writeAuditLog(
    payload.userId,
    user?.role ?? 'STUDENT',
    'PASSWORD_CHANGED',
    'User',
    payload.userId,
    { method: 'password_reset' },
  );
}

// =============================================================================
// Logout
// =============================================================================

/**
 * Logs out the authenticated user by blocklisting their refresh token and
 * writing a LOGOUT audit log entry.
 *
 * If no refresh token is provided (e.g. the client lost it), the logout still
 * succeeds — the access token will expire naturally within 30 minutes.
 *
 * @param userId            - UUID of the authenticated user.
 * @param userRole          - Role string of the user (for audit log).
 * @param refreshTokenValue - Optional refresh token to blocklist.
 */
export async function logout(
  userId: string,
  userRole: string,
  refreshTokenValue: string | undefined,
): Promise<void> {
  if (refreshTokenValue) {
    const result = verifyRefreshToken(refreshTokenValue);
    if (isOk(result)) {
      const payload = result.value;
      const remainingTtl = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
      if (remainingTtl > 0) {
        void redis.set(`blocklist:refresh:${refreshTokenValue}`, '1', 'EX', remainingTtl);
      }
    }
  }

  void writeAuditLog(userId, userRole, 'LOGOUT', 'User', userId);
}
