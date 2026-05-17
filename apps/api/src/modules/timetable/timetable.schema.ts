/**
 * @file timetable.schema.ts
 * @module modules/timetable
 *
 * Zod validation schemas for the timetable module.
 *
 * Times are stored and compared as `HH:MM` 24-hour strings in Nigeria Standard
 * Time (UTC+1). Lexicographic string comparison is valid for `HH:MM` format.
 * The `startTime < endTime` invariant is enforced via `.superRefine()`.
 */

import { z } from 'zod';

/** Valid days of the week for timetable scheduling. */
const DAY_OF_WEEK_VALUES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/** Zod enum for the days of the week. */
export const DayOfWeekEnum = z.enum(DAY_OF_WEEK_VALUES);

/** TypeScript type inferred from {@link DayOfWeekEnum}. */
export type DayOfWeekValue = z.infer<typeof DayOfWeekEnum>;

/** Regex pattern for validating `HH:MM` 24-hour time strings. */
const TIME_REGEX = /^\d{2}:\d{2}$/;

/**
 * Schema for creating a new timetable entry.
 *
 * Enforces that `startTime` is strictly before `endTime` via `.superRefine()`.
 * Both times must be in `HH:MM` 24-hour format.
 */
export const CreateTimetableEntrySchema = z
  .object({
    courseSectionId: z.string().uuid('courseSectionId must be a valid UUID'),
    semesterId: z.string().uuid('semesterId must be a valid UUID'),
    venueId: z.string().uuid('venueId must be a valid UUID'),
    dayOfWeek: DayOfWeekEnum,
    startTime: z.string().regex(TIME_REGEX, 'startTime must be in HH:MM format'),
    endTime: z.string().regex(TIME_REGEX, 'endTime must be in HH:MM format'),
  })
  .superRefine((data, ctx) => {
    if (data.startTime >= data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startTime must be before endTime',
        path: ['startTime'],
      });
    }
  });

/** TypeScript type inferred from {@link CreateTimetableEntrySchema}. */
export type CreateTimetableEntryInput = z.infer<typeof CreateTimetableEntrySchema>;

/**
 * Schema for partially updating an existing timetable entry.
 * All fields are optional — only provided fields are updated.
 * Note: `startTime < endTime` is only validated when both are present.
 */
export const UpdateTimetableEntrySchema = z
  .object({
    courseSectionId: z.string().uuid('courseSectionId must be a valid UUID').optional(),
    semesterId: z.string().uuid('semesterId must be a valid UUID').optional(),
    venueId: z.string().uuid('venueId must be a valid UUID').optional(),
    dayOfWeek: DayOfWeekEnum.optional(),
    startTime: z.string().regex(TIME_REGEX, 'startTime must be in HH:MM format').optional(),
    endTime: z.string().regex(TIME_REGEX, 'endTime must be in HH:MM format').optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.startTime !== undefined &&
      data.endTime !== undefined &&
      data.startTime >= data.endTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startTime must be before endTime',
        path: ['startTime'],
      });
    }
  });

/** TypeScript type inferred from {@link UpdateTimetableEntrySchema}. */
export type UpdateTimetableEntryInput = z.infer<typeof UpdateTimetableEntrySchema>;

/**
 * Schema for validating query parameters on `GET /timetable`.
 *
 * - `semesterId`      — Optional UUID filter by semester.
 * - `courseSectionId` — Optional UUID filter by course section.
 * - `venueId`         — Optional UUID filter by venue.
 * - `dayOfWeek`       — Optional day-of-week filter.
 * - `page`            — 1-based page number. Defaults to 1.
 * - `pageSize`        — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListTimetableQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
  courseSectionId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  dayOfWeek: DayOfWeekEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListTimetableQuerySchema}. */
export type ListTimetableQuery = z.infer<typeof ListTimetableQuerySchema>;

/**
 * Schema for validating query parameters on student/lecturer timetable endpoints.
 *
 * - `semesterId` — Optional UUID to filter entries by semester.
 */
export const TimetablePersonQuerySchema = z.object({
  semesterId: z.string().uuid().optional(),
});

/** TypeScript type inferred from {@link TimetablePersonQuerySchema}. */
export type TimetablePersonQuery = z.infer<typeof TimetablePersonQuerySchema>;
