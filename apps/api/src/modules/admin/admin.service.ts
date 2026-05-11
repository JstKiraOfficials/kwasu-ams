/**
 * @file admin.service.ts
 * @module modules/admin
 *
 * Business logic for administrative account provisioning in KWASU AMS.
 *
 * Responsibilities:
 * - Creating individual user accounts with a system-generated temporary password
 * - Validating identifier format (matric number vs staff ID) based on the role
 * - Uploading CSV files to S3 and queuing bulk import jobs
 *
 * Security notes:
 * - Temporary passwords are generated with `crypto.randomBytes` (CSPRNG).
 * - Passwords are hashed with Argon2id before storage — never stored in plaintext.
 * - `mustChangePassword` is always `true` for provisioned accounts, forcing a
 *   password change on first login.
 * - All state-changing operations write an AuditLog entry (fire-and-forget).
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { randomBytes } from 'crypto';
import { Buffer } from 'node:buffer';
import { type AuditAction, Prisma } from '@prisma/client';
import { validateMatricNumber, validateStaffId, normaliseMatricNumber } from '@kwasu-ams/utils';
import { type CreateUserInput, type IUserPublic, Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { uploadToS3 } from '../../lib/s3.js';
import { hashPassword } from '../../lib/argon2.js';
import { AppError } from '../../middleware/error-handler.js';
import { env } from '../../config/env.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 *
 * Placeholder until Phase 27 introduces BullMQ. Errors are swallowed so that
 * audit log failures never surface to the caller or block the response.
 *
 * @param actorId    - UUID of the admin performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name, e.g. `"User"`.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
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
// Create user
// =============================================================================

/**
 * Provisions a new user account with a system-generated temporary password.
 *
 * The temporary password is delivered to the user's phone via SMS (Phase 25).
 * The account is created with `mustChangePassword: true`, forcing a password
 * change on first login.
 *
 * @param data      - Validated user creation payload from {@link CreateUserSchema}.
 * @param actorId   - UUID of the admin creating the account.
 * @param actorRole - Role string of the admin (for audit log).
 * @returns The created user record with sensitive fields omitted (`IUserPublic`).
 * @throws {AppError} `VALIDATION_ERROR` (400) — identifier format does not match the role.
 * @throws {AppError} `CONFLICT` (409) — identifier already exists in the database.
 */
export async function createUser(
  data: CreateUserInput,
  actorId: string,
  actorRole: string,
): Promise<IUserPublic> {
  // Validate identifier format against the expected pattern for the given role
  const isStudentRole = data.role === Role.STUDENT;
  const isMatric = validateMatricNumber(data.identifier);
  const isStaff = validateStaffId(data.identifier);

  if (isStudentRole && !isMatric) {
    throw new AppError('VALIDATION_ERROR', 'Invalid matric number format.', 400, 'identifier');
  }
  if (!isStudentRole && !isStaff) {
    throw new AppError('VALIDATION_ERROR', 'Invalid staff ID format.', 400, 'identifier');
  }

  // Normalise matric numbers to uppercase; staff IDs are stored as submitted
  const normalisedIdentifier = isMatric ? normaliseMatricNumber(data.identifier) : data.identifier;

  // Reject duplicate identifiers before attempting to create
  const existing = await prisma.user.findUnique({
    where: { identifier: normalisedIdentifier },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('CONFLICT', 'Identifier already exists.', 409, 'identifier');
  }

  // Generate a cryptographically random 12-character URL-safe temporary password
  const tempPassword = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      identifier: normalisedIdentifier,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      role: data.role as never,
      scopeId: data.scopeId ?? null,
      passwordHash,
      mustChangePassword: true,
      totpEnrolled: false,
    },
    select: {
      id: true,
      identifier: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      scopeId: true,
      mustChangePassword: true,
      totpEnrolled: true,
      languagePreference: true,
      fcmToken: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // TODO Phase 25: enqueue SMS job to deliver tempPassword to user.phone
  // void smsQueue.add('send-sms', { to: user.phone, message: `Your KWASU AMS temporary password: ${tempPassword}` });

  void writeAuditLog(actorId, actorRole, 'USER_CREATED', 'User', user.id, {
    identifier: normalisedIdentifier,
    role: data.role,
  });

  return user as IUserPublic;
}

// =============================================================================
// Bulk import
// =============================================================================

/**
 * Initiates a bulk user import from a CSV file.
 *
 * The CSV buffer is uploaded to S3 first, then a BullMQ job is queued to
 * process it asynchronously. The endpoint returns immediately with a `jobId`
 * so the client can poll for completion.
 *
 * S3 key format: `imports/{timestamp}-{actorId}.csv`
 *
 * @param csvBuffer - Raw CSV file content as a Node.js Buffer.
 * @param actorId   - UUID of the admin triggering the import.
 * @param actorRole - Role string of the admin (for audit log).
 * @returns Object containing the `jobId` for polling.
 * @throws Will propagate S3 upload errors if the upload fails.
 */
export async function importUsers(
  csvBuffer: Buffer,
  actorId: string,
  actorRole: string,
): Promise<{ jobId: string }> {
  const timestamp = Date.now();
  const s3Key = `imports/${timestamp}-${actorId}.csv`;

  // Upload CSV to S3 before queuing — prevents large files from blocking the thread
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, csvBuffer, 'text/csv');

  void writeAuditLog(actorId, actorRole, 'BULK_IMPORT_STARTED', 'User', undefined, {
    s3Key,
  });

  // TODO Phase 27: replace with BullMQ job
  // void bulkImportQueue.add('bulk-account-creation', { csvS3Key: s3Key, actorId });
  const jobId = `bulk-${timestamp}`;

  return { jobId };
}
