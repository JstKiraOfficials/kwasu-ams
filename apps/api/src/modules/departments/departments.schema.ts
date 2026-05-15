/**
 * @file departments.schema.ts
 * @module modules/departments
 *
 * Zod validation schemas for the departments module.
 *
 * Department codes are normalised to uppercase via `.toUpperCase()` transform
 * in the schema — callers never need to normalise manually.
 */

import { z } from 'zod';

/**
 * Schema for creating a new department.
 *
 * - `name`      — Human-readable department name. Min 2 characters.
 * - `code`      — Short uppercase identifier (e.g. `"BIO"`). Stored uppercase.
 * - `facultyId` — UUID of the parent faculty.
 */
export const CreateDepartmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must be at most 10 characters')
    .transform((v) => v.toUpperCase()),
  facultyId: z.string().uuid('facultyId must be a valid UUID'),
});

/** TypeScript type inferred from {@link CreateDepartmentSchema}. */
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;

/**
 * Schema for partially updating an existing department.
 * `facultyId` is omitted — a department cannot be moved between faculties.
 */
export const UpdateDepartmentSchema = CreateDepartmentSchema.partial().omit({ facultyId: true });

/** TypeScript type inferred from {@link UpdateDepartmentSchema}. */
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

/**
 * Schema for validating query parameters on `GET /departments`.
 *
 * - `facultyId` — Optional UUID filter to return only departments in a given faculty.
 * - `page`      — 1-based page number. Defaults to 1.
 * - `pageSize`  — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListDepartmentsQuerySchema = z.object({
  facultyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListDepartmentsQuerySchema}. */
export type ListDepartmentsQuery = z.infer<typeof ListDepartmentsQuerySchema>;
