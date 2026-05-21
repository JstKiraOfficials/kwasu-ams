/**
 * @file attendance.schema.ts
 * @module modules/attendance
 *
 * Zod validation schemas for the attendance module.
 *
 * `GpsCheckinSchema`, `QrCheckinSchema`, and `CodeCheckinSchema` are imported
 * from `@kwasu-ams/types` — the single source of truth for runtime validation
 * shared across API and mobile clients.
 *
 * `ListAttendanceQuerySchema` is defined here for the paginated attendance
 * list endpoint (`GET /attendance`).
 */

import { z } from 'zod';
import { GpsCheckinSchema, QrCheckinSchema, CodeCheckinSchema } from '@kwasu-ams/types';
import { AttendanceStatus } from '@kwasu-ams/types';

// Re-export shared check-in schemas so route/controller files only need to
// import from this module rather than reaching into @kwasu-ams/types directly.
export { GpsCheckinSchema, QrCheckinSchema, CodeCheckinSchema };
export type { GpsCheckinInput, QrCheckinInput, CodeCheckinInput } from '@kwasu-ams/types';

/**
 * Zod schema for validating query parameters on `GET /attendance`.
 *
 * All fields are optional — omitting them returns all records for the
 * authenticated student in the current semester.
 *
 * - `courseSectionId` — Filter by a specific course section UUID.
 * - `semesterId`      — Filter by a specific semester UUID.
 * - `status`          — Filter by {@link AttendanceStatus} enum value.
 * - `page`            — 1-based page number. Defaults to `1`.
 * - `pageSize`        — Records per page. Min 1, max 100. Defaults to `20`.
 */
export const ListAttendanceQuerySchema = z.object({
  courseSectionId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * TypeScript type inferred from {@link ListAttendanceQuerySchema}.
 */
export type ListAttendanceQuery = z.infer<typeof ListAttendanceQuerySchema>;
