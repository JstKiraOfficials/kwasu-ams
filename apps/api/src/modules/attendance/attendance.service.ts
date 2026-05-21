/**
 * @file attendance.service.ts
 * @module modules/attendance
 *
 * Business logic for attendance record retrieval.
 *
 * This service handles the `GET /attendance` endpoint, returning a paginated,
 * filtered list of the authenticated student's own attendance records with
 * full session details (venue, course code, check-in method, status).
 *
 * Check-in logic lives in the co-located service files:
 * - GPS direct: {@link checkin-gps.service.ts}
 * - QR code and alphanumeric code: Phase 20
 */

import { type IAttendanceRecord, type PaginatedResponse } from '@kwasu-ams/types';
import { type Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { type ListAttendanceQuery } from './attendance.schema.js';

// =============================================================================
// listAttendance
// =============================================================================

/**
 * Returns a paginated list of the authenticated student's own attendance records.
 *
 * Each record includes full session details: venue name, course code and title,
 * check-in method, status, and the scheduled session times.
 *
 * Scope is enforced at the query level — the student can only ever retrieve
 * their own records. The `studentUserId` is resolved from the JWT, not from
 * a query parameter.
 *
 * @param studentUserId - UUID of the authenticated `User` (not the `Student` record).
 * @param query         - Validated query params from {@link ListAttendanceQuerySchema}.
 * @returns A {@link PaginatedResponse} containing {@link IAttendanceRecord} items
 *          ordered by `checkedInAt` descending, with pagination metadata.
 * @throws {AppError} `NOT_FOUND` (404) — no `Student` record linked to the given user ID.
 */
export async function listAttendance(
  studentUserId: string,
  query: ListAttendanceQuery,
): Promise<PaginatedResponse<IAttendanceRecord>> {
  // Resolve the Student record from the authenticated user's ID
  const student = await prisma.student.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });
  if (!student) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  const { page, pageSize, courseSectionId, semesterId, status } = query;
  const skip = (page - 1) * pageSize;

  // Build scope-safe where clause — always scoped to this student
  const where: Prisma.AttendanceRecordWhereInput = {
    studentId: student.id,
  };

  if (courseSectionId !== undefined) {
    where.enrollment = { courseSectionId };
  }

  if (semesterId !== undefined) {
    where.session = {
      courseSection: { semesterId },
    };
  }

  if (status !== undefined) {
    where.status = status;
  }

  const [records, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      include: {
        session: {
          include: {
            venue: {
              select: { name: true, buildingName: true },
            },
            courseSection: {
              include: {
                course: {
                  select: { code: true, title: true },
                },
              },
            },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: { checkedInAt: 'desc' },
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  return {
    data: records as unknown as IAttendanceRecord[],
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
