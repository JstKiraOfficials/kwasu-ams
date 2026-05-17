/**
 * @file courses.schema.ts
 * @module modules/courses
 *
 * Zod validation schemas for the courses module.
 *
 * Course codes are normalised to uppercase via `.toUpperCase()` transform.
 * Section labels are also normalised to uppercase.
 */

import { z } from 'zod';

/** Valid course levels per KWASU academic structure. */
const VALID_LEVELS = [100, 200, 300, 400, 500, 600] as const;

/**
 * Schema for creating a new course.
 */
export const CreateCourseSchema = z.object({
  departmentId: z.string().uuid('departmentId must be a valid UUID'),
  code: z
    .string()
    .min(3, 'Course code must be at least 3 characters')
    .max(10, 'Course code must be at most 10 characters')
    .transform((v) => v.toUpperCase()),
  title: z.string().min(3, 'Course title must be at least 3 characters'),
  creditUnits: z
    .number()
    .int('Credit units must be an integer')
    .min(1, 'Credit units must be at least 1')
    .max(6, 'Credit units must be at most 6'),
  level: z
    .number()
    .int('Level must be an integer')
    .refine((v) => VALID_LEVELS.includes(v as (typeof VALID_LEVELS)[number]), {
      message: 'Level must be 100, 200, 300, 400, 500, or 600',
    }),
  isElective: z.boolean().default(false),
});

/** TypeScript type inferred from {@link CreateCourseSchema}. */
export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;

/**
 * Schema for partially updating an existing course.
 * `departmentId` is omitted — a course cannot be moved between departments.
 */
export const UpdateCourseSchema = CreateCourseSchema.partial().omit({ departmentId: true });

/** TypeScript type inferred from {@link UpdateCourseSchema}. */
export type UpdateCourseInput = z.infer<typeof UpdateCourseSchema>;

/**
 * Schema for validating query parameters on `GET /courses`.
 */
export const ListCoursesQuerySchema = z.object({
  departmentId: z.string().uuid().optional(),
  level: z.coerce.number().int().optional(),
  semesterId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListCoursesQuerySchema}. */
export type ListCoursesQuery = z.infer<typeof ListCoursesQuerySchema>;

/**
 * Schema for creating a new course section.
 */
export const CreateSectionSchema = z.object({
  sectionLabel: z
    .string()
    .min(1, 'Section label must be at least 1 character')
    .max(5, 'Section label must be at most 5 characters')
    .transform((v) => v.toUpperCase()),
  semesterId: z.string().uuid('semesterId must be a valid UUID'),
  lecturerId: z.string().uuid('lecturerId must be a valid UUID').optional(),
  maxEnrollment: z.number().int().min(1).default(200),
});

/** TypeScript type inferred from {@link CreateSectionSchema}. */
export type CreateSectionInput = z.infer<typeof CreateSectionSchema>;

/**
 * Schema for batch-enrolling students into a course section.
 */
export const EnrollStudentsSchema = z.object({
  studentIds: z
    .array(z.string().uuid('Each studentId must be a valid UUID'))
    .min(1, 'At least one student ID is required')
    .max(500, 'Cannot enroll more than 500 students at once'),
  isCarryOver: z.boolean().default(false),
});

/** TypeScript type inferred from {@link EnrollStudentsSchema}. */
export type EnrollStudentsInput = z.infer<typeof EnrollStudentsSchema>;

/**
 * Schema for assigning a lecturer to a course section.
 */
export const AssignLecturerSchema = z.object({
  lecturerId: z.string().uuid('lecturerId must be a valid UUID'),
});

/** TypeScript type inferred from {@link AssignLecturerSchema}. */
export type AssignLecturerInput = z.infer<typeof AssignLecturerSchema>;

/**
 * Schema for paginated query on `GET /courses/:id/students`.
 */
export const ListCourseStudentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListCourseStudentsQuerySchema}. */
export type ListCourseStudentsQuery = z.infer<typeof ListCourseStudentsQuerySchema>;
