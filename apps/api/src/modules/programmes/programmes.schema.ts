/**
 * @file programmes.schema.ts
 * @module modules/programmes
 *
 * Zod validation schemas for the programmes module.
 *
 * Programme codes are normalised to uppercase via `.toUpperCase()` transform
 * in the schema — callers never need to normalise manually.
 */

import { z } from 'zod';

/**
 * Schema for creating a new programme.
 *
 * - `name`          — Human-readable programme name. Min 2 characters.
 * - `code`          — Short uppercase identifier (e.g. `"BSC-BIO"`). Stored uppercase.
 * - `departmentId`  — UUID of the parent department.
 * - `durationYears` — Programme length in years. Integer between 1 and 7.
 */
export const CreateProgrammeSchema = z.object({
  name: z.string().min(2, 'Programme name must be at least 2 characters'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(20, 'Code must be at most 20 characters')
    .transform((v) => v.toUpperCase()),
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  durationYears: z
    .number()
    .int('durationYears must be an integer')
    .min(1, 'durationYears must be at least 1')
    .max(7, 'durationYears must be at most 7'),
});

/** TypeScript type inferred from {@link CreateProgrammeSchema}. */
export type CreateProgrammeInput = z.infer<typeof CreateProgrammeSchema>;

/**
 * Schema for partially updating an existing programme.
 * `departmentId` is omitted — a programme cannot be moved between departments.
 */
export const UpdateProgrammeSchema = CreateProgrammeSchema.partial().omit({ departmentId: true });

/** TypeScript type inferred from {@link UpdateProgrammeSchema}. */
export type UpdateProgrammeInput = z.infer<typeof UpdateProgrammeSchema>;

/**
 * Schema for validating query parameters on `GET /programmes`.
 *
 * - `departmentId` — Optional UUID filter to return only programmes in a given department.
 * - `page`         — 1-based page number. Defaults to 1.
 * - `pageSize`     — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListProgrammesQuerySchema = z.object({
  departmentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListProgrammesQuerySchema}. */
export type ListProgrammesQuery = z.infer<typeof ListProgrammesQuerySchema>;
