/**
 * @file sessions.schema.ts
 * @module modules/sessions
 *
 * Zod validation schemas for the sessions module.
 *
 * `scheduledStart < scheduledEnd` is enforced via `.superRefine()`.
 * All datetime strings must be ISO 8601 format.
 */

import { z } from 'zod';
import { SessionStatus } from '@kwasu-ams/types';

/**
 * Schema for creating a new course session.
 *
 * - `courseSectionId` — UUID of the course section this session belongs to.
 * - `venueId`         — UUID of the venue where the session will be held.
 * - `scheduledStart`  — ISO 8601 datetime string for the planned start time.
 * - `scheduledEnd`    — ISO 8601 datetime string for the planned end time.
 * - `isMakeUp`        — Whether this is a make-up session. Defaults to `false`.
 */
export const CreateSessionSchema = z
  .object({
    courseSectionId: z.string().uuid('courseSectionId must be a valid UUID'),
    venueId: z.string().uuid('venueId must be a valid UUID'),
    scheduledStart: z.string().datetime('scheduledStart must be a valid ISO 8601 datetime'),
    scheduledEnd: z.string().datetime('scheduledEnd must be a valid ISO 8601 datetime'),
    isMakeUp: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (new Date(data.scheduledStart) >= new Date(data.scheduledEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scheduledStart must be before scheduledEnd',
        path: ['scheduledStart'],
      });
    }
  });

/** TypeScript type inferred from {@link CreateSessionSchema}. */
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

/**
 * Schema for validating query parameters on `GET /sessions`.
 *
 * - `courseSectionId` — Optional UUID filter by course section.
 * - `status`          — Optional filter by {@link SessionStatus} enum value.
 * - `startDate`       — Optional ISO 8601 lower bound for `scheduledStart`.
 * - `endDate`         — Optional ISO 8601 upper bound for `scheduledStart`.
 * - `page`            — 1-based page number. Defaults to 1.
 * - `pageSize`        — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListSessionsQuerySchema = z.object({
  courseSectionId: z.string().uuid().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListSessionsQuerySchema}. */
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;
