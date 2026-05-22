/**
 * @file eligibility.schema.ts
 * @module modules/eligibility
 *
 * Zod validation schemas for the eligibility module.
 */

import { z } from 'zod';
import { EligibilityStatus } from '@kwasu-ams/types';

/**
 * Schema for the body of `POST /eligibility/compute`.
 *
 * - `semesterId` — UUID of the semester to compute eligibility for.
 */
export const TriggerComputationSchema = z.object({
  semesterId: z.string().uuid('semesterId must be a valid UUID'),
});

/** TypeScript type inferred from {@link TriggerComputationSchema}. */
export type TriggerComputationInput = z.infer<typeof TriggerComputationSchema>;

/**
 * Schema for query parameters on `GET /eligibility/student/:studentId`.
 *
 * - `semesterId` — Optional UUID filter by semester.
 */
export const GetStudentEligibilityQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
});

/** TypeScript type inferred from {@link GetStudentEligibilityQuerySchema}. */
export type GetStudentEligibilityQuery = z.infer<typeof GetStudentEligibilityQuerySchema>;

/**
 * Schema for query parameters on `GET /eligibility/course/:courseSectionId`.
 *
 * - `semesterId` — Optional UUID filter by semester.
 * - `page`       — 1-based page number. Defaults to 1.
 * - `pageSize`   — Records per page. Min 1, max 100. Defaults to 20.
 */
export const GetCourseEligibilityQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link GetCourseEligibilityQuerySchema}. */
export type GetCourseEligibilityQuery = z.infer<typeof GetCourseEligibilityQuerySchema>;

/**
 * Schema for the body of `PATCH /eligibility/:id/override`.
 *
 * - `status` — New {@link EligibilityStatus} to assign.
 * - `reason` — Justification for the override. Minimum 10 characters.
 */
export const OverrideEligibilitySchema = z.object({
  status: z.nativeEnum(EligibilityStatus, { error: 'Invalid eligibility status' }),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

/** TypeScript type inferred from {@link OverrideEligibilitySchema}. */
export type OverrideEligibilityInput = z.infer<typeof OverrideEligibilitySchema>;

/**
 * Schema for the body of `POST /eligibility/:id/appeal`.
 *
 * - `reason` — Student's appeal justification. Minimum 20 characters.
 */
export const SubmitAppealSchema = z.object({
  reason: z.string().min(20, 'Appeal reason must be at least 20 characters'),
});

/** TypeScript type inferred from {@link SubmitAppealSchema}. */
export type SubmitAppealInput = z.infer<typeof SubmitAppealSchema>;

/**
 * Schema for the body of `PATCH /eligibility/:id/appeal/decide`.
 *
 * - `decision` — `'APPROVED'` or `'REJECTED'`.
 * - `reason`   — Decision justification. Minimum 10 characters.
 */
export const DecideAppealSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

/** TypeScript type inferred from {@link DecideAppealSchema}. */
export type DecideAppealInput = z.infer<typeof DecideAppealSchema>;
