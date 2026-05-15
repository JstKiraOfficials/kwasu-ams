/**
 * @file faculties.schema.ts
 * @module modules/faculties
 *
 * Zod validation schemas for the faculties module.
 *
 * Faculty codes are normalised to uppercase via `.toUpperCase()` transform
 * in the schema — callers never need to normalise manually.
 */

import { z } from 'zod';

/**
 * Schema for creating a new faculty.
 *
 * - `name`         — Human-readable faculty name. Min 2 characters.
 * - `code`         — Short uppercase identifier (e.g. `"SCI"`). Stored uppercase.
 * - `universityId` — UUID of the parent university.
 */
export const CreateFacultySchema = z.object({
  name: z.string().min(2, 'Faculty name must be at least 2 characters'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must be at most 10 characters')
    .transform((v) => v.toUpperCase()),
  universityId: z.string().uuid('universityId must be a valid UUID'),
});

/** TypeScript type inferred from {@link CreateFacultySchema}. */
export type CreateFacultyInput = z.infer<typeof CreateFacultySchema>;

/**
 * Schema for partially updating an existing faculty.
 * `universityId` is omitted — a faculty cannot be moved between universities.
 */
export const UpdateFacultySchema = CreateFacultySchema.partial().omit({ universityId: true });

/** TypeScript type inferred from {@link UpdateFacultySchema}. */
export type UpdateFacultyInput = z.infer<typeof UpdateFacultySchema>;

/**
 * Schema for validating query parameters on `GET /faculties`.
 *
 * - `page`     — 1-based page number. Defaults to 1.
 * - `pageSize` — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListFacultiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListFacultiesQuerySchema}. */
export type ListFacultiesQuery = z.infer<typeof ListFacultiesQuerySchema>;
