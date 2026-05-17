/**
 * @file lecturers.schema.ts
 * @module modules/lecturers
 *
 * Zod validation schemas for the lecturers module.
 *
 * `STAFF_ID_REGEX` is imported from `@kwasu-ams/utils` — the single source
 * of truth. It is never redefined here or anywhere else in the codebase.
 */

import { z } from 'zod';
import { STAFF_ID_REGEX } from '@kwasu-ams/utils';

/**
 * Schema for creating a new lecturer record.
 *
 * - `userId`       — UUID of the existing `User` record with role `LECTURER`.
 * - `staffId`      — Validated against `STAFF_ID_REGEX` (e.g. `KWASU/LEC/CSC/00134`).
 * - `departmentId` — UUID of the department the lecturer belongs to.
 * - `title`        — Optional honorific (e.g. `"Dr."`, `"Prof."`).
 */
export const CreateLecturerSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  staffId: z.string().regex(STAFF_ID_REGEX, 'Invalid staff ID format'),
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  title: z.string().optional(),
});

/** TypeScript type inferred from {@link CreateLecturerSchema}. */
export type CreateLecturerInput = z.infer<typeof CreateLecturerSchema>;

/**
 * Schema for partially updating an existing lecturer record.
 *
 * - `departmentId` — Move lecturer to a different department.
 * - `title`        — Update or clear the honorific.
 */
export const UpdateLecturerSchema = z.object({
  departmentId: z.string().uuid('departmentId must be a valid UUID').optional(),
  title: z.string().optional(),
});

/** TypeScript type inferred from {@link UpdateLecturerSchema}. */
export type UpdateLecturerInput = z.infer<typeof UpdateLecturerSchema>;

/**
 * Schema for validating query parameters on `GET /lecturers`.
 *
 * - `departmentId` — Optional UUID filter by department.
 * - `search`       — Optional case-insensitive search on staff ID or full name.
 * - `page`         — 1-based page number. Defaults to 1.
 * - `pageSize`     — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListLecturersQuerySchema = z.object({
  departmentId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListLecturersQuerySchema}. */
export type ListLecturersQuery = z.infer<typeof ListLecturersQuerySchema>;
