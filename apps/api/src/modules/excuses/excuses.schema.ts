/**
 * @file excuses.schema.ts
 * @module modules/excuses
 *
 * Zod validation schemas for the excuses module.
 *
 * `ExcuseReason.OTHER` requires `otherExplanation` of at least 30 characters,
 * enforced via `.superRefine()`. All other reasons must not provide
 * `otherExplanation`.
 */

import { z } from 'zod';
import { ExcuseReason, ExcuseStatus } from '@kwasu-ams/types';

// =============================================================================
// SubmitExcuseSchema
// =============================================================================

/**
 * Schema for the body fields of `POST /excuses` (multipart form).
 *
 * - `courseSectionId`  — UUID of the course section the absence relates to.
 * - `absenceDates`     — One or more ISO 8601 datetime strings for the absent dates.
 * - `reason`           — {@link ExcuseReason} enum value.
 * - `otherExplanation` — Required when `reason === 'OTHER'`, minimum 30 characters.
 */
export const SubmitExcuseSchema = z
  .object({
    courseSectionId: z.string().uuid('courseSectionId must be a valid UUID'),
    absenceDates: z
      .array(z.string().datetime('Each absenceDate must be a valid ISO 8601 datetime'))
      .min(1, 'At least one absence date is required'),
    reason: z.nativeEnum(ExcuseReason, { error: 'Invalid excuse reason' }),
    otherExplanation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === ExcuseReason.OTHER) {
      if (!data.otherExplanation || data.otherExplanation.length < 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'otherExplanation must be at least 30 characters when reason is OTHER',
          path: ['otherExplanation'],
        });
      }
    }
  });

/** TypeScript type inferred from {@link SubmitExcuseSchema}. */
export type SubmitExcuseInput = z.infer<typeof SubmitExcuseSchema>;

// =============================================================================
// ReviewExcuseSchema
// =============================================================================

/**
 * Schema for the body of `PATCH /excuses/:id/review`.
 *
 * - `decision` — `'APPROVED'` or `'REJECTED'`.
 * - `comment`  — Lecturer's review comment. Minimum 5 characters.
 */
export const ReviewExcuseSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().min(5, 'Comment must be at least 5 characters'),
});

/** TypeScript type inferred from {@link ReviewExcuseSchema}. */
export type ReviewExcuseInput = z.infer<typeof ReviewExcuseSchema>;

// =============================================================================
// AppealExcuseSchema
// =============================================================================

/**
 * Schema for the body of `PATCH /excuses/:id/appeal`.
 *
 * - `appealReason` — Student's appeal justification. Minimum 20 characters.
 */
export const AppealExcuseSchema = z.object({
  appealReason: z.string().min(20, 'Appeal reason must be at least 20 characters'),
});

/** TypeScript type inferred from {@link AppealExcuseSchema}. */
export type AppealExcuseInput = z.infer<typeof AppealExcuseSchema>;

// =============================================================================
// HodReviewExcuseSchema
// =============================================================================

/**
 * Schema for the body of `PATCH /excuses/:id/hod-review`.
 *
 * - `decision` — `'HOD_APPROVED'` or `'HOD_REJECTED'`.
 * - `comment`  — HOD's review comment. Minimum 5 characters.
 */
export const HodReviewExcuseSchema = z.object({
  decision: z.enum(['HOD_APPROVED', 'HOD_REJECTED']),
  comment: z.string().min(5, 'Comment must be at least 5 characters'),
});

/** TypeScript type inferred from {@link HodReviewExcuseSchema}. */
export type HodReviewExcuseInput = z.infer<typeof HodReviewExcuseSchema>;

// =============================================================================
// ListExcusesQuerySchema
// =============================================================================

/**
 * Schema for validating query parameters on `GET /excuses`.
 *
 * - `status`          — Optional filter by {@link ExcuseStatus}.
 * - `courseSectionId` — Optional UUID filter by course section.
 * - `page`            — 1-based page number. Defaults to 1.
 * - `pageSize`        — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListExcusesQuerySchema = z.object({
  status: z.nativeEnum(ExcuseStatus).optional(),
  courseSectionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListExcusesQuerySchema}. */
export type ListExcusesQuery = z.infer<typeof ListExcusesQuerySchema>;
