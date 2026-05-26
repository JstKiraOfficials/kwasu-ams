/**
 * @file analytics.schema.ts
 * @module modules/analytics
 *
 * Zod validation schemas for the analytics module.
 */

import { z } from 'zod';

/**
 * Schema for query parameters on `GET /analytics/course/:courseSectionId`.
 *
 * - `semesterId` — Optional UUID filter by semester.
 */
export const CourseAnalyticsQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
});

/** TypeScript type inferred from {@link CourseAnalyticsQuerySchema}. */
export type CourseAnalyticsQuery = z.infer<typeof CourseAnalyticsQuerySchema>;

/**
 * Schema for query parameters on `GET /analytics/student/:studentId`.
 *
 * - `semesterId` — Optional UUID filter by semester.
 */
export const StudentAnalyticsQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
});

/** TypeScript type inferred from {@link StudentAnalyticsQuerySchema}. */
export type StudentAnalyticsQuery = z.infer<typeof StudentAnalyticsQuerySchema>;
