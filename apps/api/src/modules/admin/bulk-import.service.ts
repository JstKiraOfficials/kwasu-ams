/**
 * @file bulk-import.service.ts
 * @module modules/admin
 *
 * Bulk CSV user import service for KWASU AMS.
 *
 * Responsibilities:
 * - Downloading a CSV file from S3 using a direct server-side `GetObjectCommand`
 * - Parsing and validating every row before creating any accounts
 * - Generating cryptographically random temporary passwords (Argon2id hashed)
 * - Creating user accounts one-by-one (non-transactional, idempotent via duplicate skip)
 * - Enqueueing placeholder SMS jobs for temporary password delivery
 * - Writing a `BULK_IMPORT_COMPLETED` AuditLog entry on completion
 *
 * Atomicity note: the import is intentionally non-transactional. If the process
 * fails midway, already-created accounts remain. Re-running the import skips
 * duplicates, making it effectively idempotent.
 *
 * This service is called directly in Phase 12. Phase 27 will wire it into a
 * BullMQ `bulk-account-creation` worker.
 *
 * Security notes:
 * - Temporary passwords are generated with `crypto.randomBytes` (CSPRNG).
 * - Passwords are hashed with Argon2id before storage — never stored in plaintext.
 * - Temporary passwords are never returned in API responses.
 * - GPS coordinates are never stored anywhere in this module.
 */

import { randomBytes } from 'crypto';
import { parse } from 'csv-parse/sync';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { type AuditAction, Prisma } from '@prisma/client';
import { validateMatricNumber, validateStaffId, normaliseMatricNumber } from '@kwasu-ams/utils';
import { Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { s3Client } from '../../lib/s3.js';
import { hashPassword } from '../../lib/argon2.js';
import { env } from '../../config/env.js';

// =============================================================================
// Result types
// =============================================================================

/**
 * A single row-level validation error produced during CSV parsing.
 */
export interface BulkImportRowError {
  /** 1-based row number in the CSV (excluding the header row). */
  row: number;
  /** Name of the field that failed validation. */
  field: string;
  /** Human-readable description of the validation failure. */
  message: string;
}

/**
 * Result returned when the bulk import fails validation.
 * No accounts are created when `success` is `false`.
 */
export interface BulkImportFailureResult {
  /** Always `false` for a validation failure result. */
  success: false;
  /** Row-level validation errors. At least one entry is always present. */
  errors: BulkImportRowError[];
}

/**
 * Result returned when `dryRun` is `true`.
 * No accounts are created; the result previews what would happen.
 */
export interface BulkImportDryRunResult {
  /** Always `true` for a dry-run result. */
  success: true;
  /** Always `true` to distinguish from a real import result. */
  dryRun: true;
  /** Number of rows that would be created (valid, non-duplicate rows). */
  wouldCreate: number;
  /** Number of rows that would be skipped (duplicate identifiers). */
  wouldSkip: number;
  /** Always an empty array for a dry-run result (validation passed). */
  errors: BulkImportRowError[];
}

/**
 * Result returned when the bulk import completes successfully.
 */
export interface BulkImportSuccessResult {
  /** Always `true` for a successful import result. */
  success: true;
  /** Number of user accounts created. */
  created: number;
  /** Number of rows skipped due to duplicate identifiers. */
  skipped: number;
}

/**
 * Union of all possible return types from {@link processBulkImport}.
 */
export type BulkImportResult =
  | BulkImportFailureResult
  | BulkImportDryRunResult
  | BulkImportSuccessResult;

// =============================================================================
// Internal helpers
// =============================================================================

/** Valid `Role` enum values as a Set for O(1) membership checks. */
const VALID_ROLES = new Set<string>(Object.values(Role));

/** Simple email format regex — sufficient for import validation. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Raw CSV row shape after parsing. All values are strings until validated.
 */
interface CsvRow {
  identifier?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role?: string;
  scopeId?: string;
}

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
 * @param metadata   - Optional free-form context object.
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

// =============================================================================
// processBulkImport
// =============================================================================

/**
 * Downloads a CSV from S3, validates every row, and creates user accounts.
 *
 * ## Algorithm
 *
 * 1. Download the CSV from S3 using a direct `GetObjectCommand` (server-side
 *    access — no pre-signed URL needed).
 * 2. Parse CSV rows. Expected columns: `identifier`, `fullName`, `email`,
 *    `phone`, `role`, `scopeId` (optional).
 * 3. Validate every row:
 *    - `identifier`: matches `MATRIC_NUMBER_REGEX` for `STUDENT` role, or
 *      `STAFF_ID_REGEX` for all other roles.
 *    - `email`: valid email format.
 *    - `role`: valid {@link Role} enum value.
 *    - `fullName`: non-empty string.
 *    - `phone`: minimum 10 characters.
 * 4. If **any** row has validation errors: return a failure result with all
 *    row-level errors. No accounts are created.
 * 5. If `dryRun === true`: return a preview result without creating accounts.
 * 6. Otherwise: for each valid row, check for duplicate identifier (skip if
 *    found), generate a temporary password, hash it, create the user, and
 *    enqueue an SMS job (placeholder).
 * 7. Write a `BULK_IMPORT_COMPLETED` AuditLog entry.
 * 8. Return `{ success: true, created, skipped }`.
 *
 * @param csvS3Key - S3 object key of the uploaded CSV file.
 * @param actorId  - UUID of the admin triggering the import (for audit trail).
 * @param dryRun   - When `true`, validates and previews without creating accounts.
 *                   Defaults to `false`.
 * @returns A {@link BulkImportResult} discriminated union.
 * @throws Will propagate S3 download errors if the object cannot be retrieved.
 */
export async function processBulkImport(
  csvS3Key: string,
  actorId: string,
  dryRun = false,
): Promise<BulkImportResult> {
  // ── Step 1: Download CSV from S3 ─────────────────────────────────────────
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET_REPORTS, Key: csvS3Key }),
  );

  const csvContent = await response.Body?.transformToString();

  if (!csvContent || csvContent.trim().length === 0) {
    return {
      success: false,
      errors: [{ row: 0, field: 'file', message: 'CSV file is empty.' }],
    };
  }

  // ── Step 2: Parse CSV rows ────────────────────────────────────────────────
  const rows: CsvRow[] = parse(csvContent, {
    columns: true, // use header row as keys
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  if (rows.length === 0) {
    return {
      success: false,
      errors: [{ row: 0, field: 'file', message: 'CSV file contains no data rows.' }],
    };
  }

  // ── Step 3: Validate every row ────────────────────────────────────────────
  const validationErrors: BulkImportRowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1; // 1-based for human-readable error messages

    // fullName
    if (!row.fullName || row.fullName.trim().length === 0) {
      validationErrors.push({ row: rowNum, field: 'fullName', message: 'Full name is required.' });
    }

    // email
    if (!row.email || !EMAIL_REGEX.test(row.email)) {
      validationErrors.push({ row: rowNum, field: 'email', message: 'Invalid email format.' });
    }

    // phone
    if (!row.phone || row.phone.length < 10) {
      validationErrors.push({
        row: rowNum,
        field: 'phone',
        message: 'Phone number must be at least 10 characters.',
      });
    }

    // role
    if (!row.role || !VALID_ROLES.has(row.role)) {
      validationErrors.push({
        row: rowNum,
        field: 'role',
        message: `Invalid role. Must be one of: ${Object.values(Role).join(', ')}.`,
      });
      // Skip identifier check — we need a valid role to know which regex to use
      continue;
    }

    // identifier — depends on role
    if (!row.identifier || row.identifier.trim().length === 0) {
      validationErrors.push({
        row: rowNum,
        field: 'identifier',
        message: 'Identifier is required.',
      });
    } else {
      const isStudentRole = row.role === Role.STUDENT;
      const isMatric = validateMatricNumber(row.identifier);
      const isStaff = validateStaffId(row.identifier);

      if (isStudentRole && !isMatric) {
        validationErrors.push({
          row: rowNum,
          field: 'identifier',
          message: 'Invalid matric number format for STUDENT role.',
        });
      } else if (!isStudentRole && !isStaff) {
        validationErrors.push({
          row: rowNum,
          field: 'identifier',
          message: 'Invalid staff ID format.',
        });
      }
    }
  }

  // ── Step 4: Return failure if any row is invalid ──────────────────────────
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }

  // ── Step 5: Dry-run preview ───────────────────────────────────────────────
  if (dryRun) {
    // Count duplicates by checking identifiers against the database
    const identifiers = rows.map((row) => {
      const isMatric = validateMatricNumber(row.identifier!);
      return isMatric ? normaliseMatricNumber(row.identifier!) : row.identifier!;
    });

    const existingUsers = await prisma.user.findMany({
      where: { identifier: { in: identifiers } },
      select: { identifier: true },
    });

    const existingSet = new Set(existingUsers.map((u) => u.identifier));
    const wouldSkip = identifiers.filter((id) => existingSet.has(id)).length;
    const wouldCreate = identifiers.length - wouldSkip;

    return { success: true, dryRun: true, wouldCreate, wouldSkip, errors: [] };
  }

  // ── Step 6: Create accounts ───────────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const isMatric = validateMatricNumber(row.identifier!);
    const normalisedIdentifier = isMatric
      ? normaliseMatricNumber(row.identifier!)
      : row.identifier!;

    // Check for duplicate — skip if already exists
    const existing = await prisma.user.findUnique({
      where: { identifier: normalisedIdentifier },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Generate temporary password
    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.create({
      data: {
        identifier: normalisedIdentifier,
        fullName: row.fullName!,
        email: row.email!,
        phone: row.phone!,
        role: row.role as never,
        scopeId: row.scopeId && row.scopeId.trim().length > 0 ? row.scopeId : null,
        passwordHash,
        mustChangePassword: true,
        totpEnrolled: false,
      },
    });

    // TODO Phase 25/27: enqueue SMS job via BullMQ
    // void smsQueue.add('send-sms', {
    //   phone: row.phone,
    //   message: `Your KWASU AMS temporary password is: ${tempPassword}. Login at ${env.WEB_BASE_URL}. Change your password on first login.`,
    //   identifier: normalisedIdentifier,
    // });

    created++;
  }

  // ── Step 7: Write audit log ───────────────────────────────────────────────
  void writeAuditLog(actorId, 'SUPER_ADMIN', 'BULK_IMPORT_COMPLETED', 'User', {
    total: rows.length,
    created,
    skipped,
    errors: 0,
    dryRun: false,
    csvS3Key,
  });

  // ── Step 8: Return result ─────────────────────────────────────────────────
  return { success: true, created, skipped };
}
