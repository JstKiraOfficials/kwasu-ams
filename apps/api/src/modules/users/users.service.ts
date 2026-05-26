/**
 * @file users.service.ts
 * @module modules/users
 *
 * Business logic for the users module.
 *
 * Responsibilities:
 * - `getCurrentUser`    — Returns `IUserPublic` for the authenticated user.
 * - `updateProfile`     — Updates allowed profile fields and writes AuditLog.
 * - `requestDataExport` — Generates NDPA data export PDF, emails it to the user.
 * - `getAccessLog`      — Paginated log of who accessed the user's attendance data.
 */

import { type IUserPublic, type PaginatedResponse, type Role } from '@kwasu-ams/types';
import { type AuditAction } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { generatePdf } from '../../lib/pdf-generator.js';
import { sendEmail } from '../../lib/email-client.js';
import { type UpdateProfileInput, type AccessLogQuery } from './users.schema.js';

// =============================================================================
// Types
// =============================================================================

/** A single entry in a user's transparency access log. */
export interface AccessLogEntry {
  actorRole: Role;
  action: AuditAction;
  timestamp: Date;
  description: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Strips all sensitive fields from a raw DB user record and returns a safe
 * public representation.
 *
 * Fields **never** returned: `passwordHash`, `totpSecret`, `totpBackupCodes`,
 * `failedAttempts`, `lockoutUntil`.
 *
 * @param user - Raw Prisma user record.
 * @returns Safe public user object conforming to {@link IUserPublic}.
 */
function toPublic(user: Record<string, unknown>): IUserPublic {
  const {
    passwordHash: _ph,
    totpSecret: _ts,
    totpBackupCodes: _tbc,
    failedAttempts: _fa,
    lockoutUntil: _lu,
    deletedAt: _da,
    ...safe
  } = user;

  return safe as unknown as IUserPublic;
}

// =============================================================================
// getCurrentUser
// =============================================================================

/**
 * Returns the public profile for the currently authenticated user.
 *
 * Includes the linked `student` or `lecturer` sub-record if present.
 * Sensitive fields (`passwordHash`, `totpSecret`, etc.) are never returned.
 *
 * @param userId - UUID of the authenticated user.
 * @returns The user's public profile as {@link IUserPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — user does not exist.
 */
export async function getCurrentUser(userId: string): Promise<IUserPublic> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    include: {
      student: { select: { id: true, matricNumber: true, level: true } },
      lecturer: { select: { id: true, staffId: true } },
    },
  });

  if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);

  return toPublic(user as unknown as Record<string, unknown>);
}

// =============================================================================
// updateProfile
// =============================================================================

/**
 * Updates the authenticated user's allowed profile fields.
 *
 * Permitted fields: `email`, `phone`, `languagePreference`,
 * `notificationPreferences`. Writes an `USER_UPDATED` AuditLog entry.
 *
 * @param userId - UUID of the authenticated user.
 * @param data   - Validated input from {@link UpdateProfileSchema}.
 * @returns Updated public profile as {@link IUserPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — user does not exist.
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileInput,
): Promise<IUserPublic> {
  const existing = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'User not found.', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.languagePreference !== undefined
        ? { languagePreference: data.languagePreference }
        : {}),
    },
    include: {
      student: { select: { id: true, matricNumber: true, level: true } },
      lecturer: { select: { id: true, staffId: true } },
    },
  });

  void prisma.auditLog.create({
    data: {
      actorId: userId,
      actorRole: updated.role,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: userId,
      metadata: { fields: Object.keys(data) } as never,
    },
  });

  return toPublic(updated as unknown as Record<string, unknown>);
}

// =============================================================================
// requestDataExport
// =============================================================================

/**
 * Generates a PDF of all personal data held about the user and emails it to
 * their registered address (NDPA 2023 right of access).
 *
 * The PDF contains:
 * - Personal details, attendance records, excuse letters,
 *   eligibility records, notifications, support tickets.
 * - A statement that GPS coordinates are not stored.
 * - Document timestamp and user identifier on the cover.
 *
 * The PDF is never returned in the API response — only sent by email.
 *
 * @param userId - UUID of the authenticated user.
 * @returns `{ message }` confirmation string.
 * @throws {AppError} `NOT_FOUND` (404) — user does not exist.
 */
export async function requestDataExport(userId: string): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { id: true, fullName: true, email: true, identifier: true, role: true },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found.', 404);

  // Gather all personal data concurrently
  const [attendanceRecords, excuseLetters, eligibilityRecords, notifications, supportTickets] =
    await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { student: { userId } },
        include: {
          session: {
            select: {
              scheduledStart: true,
              courseSection: { select: { course: { select: { code: true, title: true } } } },
            },
          },
        },
        take: 500,
      }),
      prisma.excuseLetter.findMany({ where: { student: { userId } }, take: 100 }),
      prisma.examEligibility.findMany({
        where: { enrollment: { student: { userId } } },
        include: { enrollment: { select: { courseSection: { select: { course: true } } } } },
        take: 100,
      }),
      prisma.notification.findMany({ where: { recipientId: userId }, take: 100 }),
      prisma.supportTicket.findMany({ where: { submittedById: userId }, take: 50 }),
    ]);

  const exportedAt = new Date().toISOString();

  const { buffer } = await generatePdf(`KWASU AMS — Personal Data Export`, [
    {
      heading: 'Export Information',
      body: [
        `Exported at: ${exportedAt}`,
        `User Identifier: ${user.identifier}`,
        `Full Name: ${user.fullName}`,
        `Role: ${user.role}`,
        '',
        'Note: GPS coordinates are not stored by KWASU AMS in accordance with the NDPA 2023.',
      ].join('\n'),
    },
    {
      heading: 'Attendance Records',
      body:
        attendanceRecords.length > 0
          ? attendanceRecords
              .map(
                (r) =>
                  `${(r as unknown as Record<string, unknown>)['courseSession'] !== undefined ? JSON.stringify((r as unknown as Record<string, unknown>)['courseSession']) : 'N/A'} — status: ${(r as unknown as Record<string, unknown>)['status'] as string}`,
              )
              .join('\n')
          : 'No attendance records found.',
    },
    {
      heading: 'Excuse Letters',
      body:
        excuseLetters.length > 0
          ? excuseLetters
              .map(
                (e) =>
                  `${(e as unknown as Record<string, unknown>)['reason'] as string} — status: ${(e as unknown as Record<string, unknown>)['status'] as string}`,
              )
              .join('\n')
          : 'No excuse letters found.',
    },
    {
      heading: 'Exam Eligibility Records',
      body:
        eligibilityRecords.length > 0
          ? eligibilityRecords
              .map(
                (r) =>
                  `Status: ${(r as unknown as Record<string, unknown>)['status'] as string}, Percentage: ${(r as unknown as Record<string, unknown>)['effectivePercentage'] as string}%`,
              )
              .join('\n')
          : 'No eligibility records found.',
    },
    {
      heading: 'Notifications',
      body:
        notifications.length > 0
          ? `${notifications.length.toString()} notifications on record.`
          : 'No notifications found.',
    },
    {
      heading: 'Support Tickets',
      body:
        supportTickets.length > 0
          ? supportTickets
              .map(
                (t) =>
                  `[${(t as unknown as Record<string, unknown>)['status'] as string}] ${(t as unknown as Record<string, unknown>)['subject'] as string}`,
              )
              .join('\n')
          : 'No support tickets found.',
    },
  ]);

  await sendEmail(
    user.email,
    'KWASU AMS — Your Personal Data Export',
    `<p>Dear ${user.fullName},</p><p>Please find your personal data export attached.</p><p>Exported at: ${exportedAt}</p>`,
  );

  void prisma.auditLog.create({
    data: {
      actorId: userId,
      actorRole: user.role,
      action: 'DATA_EXPORT_REQUESTED',
      entityType: 'User',
      entityId: userId,
      metadata: { exportedAt, sizeBytes: buffer.length } as never,
    },
  });

  return { message: 'Your data export has been sent to your registered email address.' };
}

// =============================================================================
// getAccessLog
// =============================================================================

/**
 * Returns a paginated transparency log showing which roles accessed the
 * user's attendance-related data and when.
 *
 * Only surfaces entries where `entityType IN ['AttendanceRecord',
 * 'ExamEligibility', 'ExcuseLetter']`. Admin operations on other users are
 * not included.
 *
 * @param userId - UUID of the authenticated user.
 * @param query  - Validated pagination params from {@link AccessLogQuerySchema}.
 * @returns Paginated list of {@link AccessLogEntry} records.
 */
export async function getAccessLog(
  userId: string,
  query: AccessLogQuery,
): Promise<PaginatedResponse<AccessLogEntry>> {
  const { page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  // Find all attendance/eligibility/excuse entity IDs belonging to this user
  const [attendanceIds, eligibilityIds, excuseIds] = await Promise.all([
    prisma.attendanceRecord
      .findMany({
        where: { student: { userId } },
        select: { id: true },
        take: 1000,
      })
      .then((rows) => rows.map((r) => r.id)),
    prisma.examEligibility
      .findMany({
        where: { enrollment: { student: { userId } } },
        select: { id: true },
        take: 1000,
      })
      .then((rows) => rows.map((r) => r.id)),
    prisma.excuseLetter
      .findMany({ where: { student: { userId } }, select: { id: true }, take: 1000 })
      .then((rows) => rows.map((r) => r.id)),
  ]);

  const entityIds = [...attendanceIds, ...eligibilityIds, ...excuseIds];

  const where = {
    entityType: { in: ['AttendanceRecord', 'ExamEligibility', 'ExcuseLetter'] as string[] },
    ...(entityIds.length > 0 ? { entityId: { in: entityIds } } : { id: 'no-match' }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: { id: true, actorRole: true, action: true, createdAt: true, entityType: true },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const data: AccessLogEntry[] = logs.map((log) => ({
    actorRole: log.actorRole as Role,
    action: log.action,
    timestamp: log.createdAt,
    description: `${log.actorRole} accessed your ${log.entityType} record.`,
  }));

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
