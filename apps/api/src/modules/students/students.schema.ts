/**
 * @file students.schema.ts
 * @module modules/students
 *
 * Zod validation schemas for the students module.
 *
 * `MATRIC_NUMBER_REGEX` is imported from `@kwasu-ams/utils` — the single source
 * of truth. It is never redefined here or anywhere else in the codebase.
 */

import { z } from 'zod';
import { MATRIC_NUMBER_REGEX } from '@kwasu-ams/utils';

/** Valid student academic levels per KWASU academic structure. */
const VALID_LEVELS = [100, 200, 300, 400, 500, 600] as const;

/**
 * Schema for creating a new student record.
 *
 * - `userId`       — UUID of the existing `User` record with role `STUDENT`.
 * - `matricNumber` — Validated against `MATRIC_NUMBER_REGEX`. Normalised to uppercase in service.
 * - `programmeId`  — UUID of the student's enrolled programme.
 * - `level`        — Academic level: 100, 200, 300, 400, 500, or 600.
 */
export const CreateStudentSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  matricNumber: z.string().regex(MATRIC_NUMBER_REGEX, 'Invalid matric number format'),
  programmeId: z.string().uuid('programmeId must be a valid UUID'),
  level: z
    .number()
    .int('Level must be an integer')
    .refine((v) => VALID_LEVELS.includes(v as (typeof VALID_LEVELS)[number]), {
      message: 'Level must be 100, 200, 300, 400, 500, or 600',
    }),
});

/** TypeScript type inferred from {@link CreateStudentSchema}. */
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;

/**
 * Schema for partially updating an existing student record.
 *
 * - `programmeId`  — Move student to a different programme.
 * - `level`        — Update academic level.
 * - `hasCarryOver` — Set or clear the carry-over flag.
 */
export const UpdateStudentSchema = z.object({
  programmeId: z.string().uuid('programmeId must be a valid UUID').optional(),
  level: z
    .number()
    .int('Level must be an integer')
    .refine((v) => VALID_LEVELS.includes(v as (typeof VALID_LEVELS)[number]), {
      message: 'Level must be 100, 200, 300, 400, 500, or 600',
    })
    .optional(),
  hasCarryOver: z.boolean().optional(),
});

/** TypeScript type inferred from {@link UpdateStudentSchema}. */
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

/**
 * Schema for validating query parameters on `GET /students`.
 *
 * - `programmeId` — Optional UUID filter by programme.
 * - `level`       — Optional level filter.
 * - `search`      — Optional case-insensitive search on matric number or full name.
 * - `page`        — 1-based page number. Defaults to 1.
 * - `pageSize`    — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListStudentsQuerySchema = z.object({
  programmeId: z.string().uuid().optional(),
  level: z.coerce.number().int().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListStudentsQuerySchema}. */
export type ListStudentsQuery = z.infer<typeof ListStudentsQuerySchema>;
