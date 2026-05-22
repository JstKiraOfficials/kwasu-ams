/**
 * @file notifications.schema.ts
 * @module modules/notifications
 *
 * Zod validation schemas for the notifications module.
 */

import { z } from 'zod';

/**
 * Schema for query parameters on `GET /notifications`.
 *
 * - `channel`  — Optional filter by notification channel (`PUSH`, `SMS`, `EMAIL`).
 * - `page`     — 1-based page number. Defaults to 1.
 * - `pageSize` — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListNotificationsQuerySchema = z.object({
  channel: z.enum(['PUSH', 'SMS', 'EMAIL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListNotificationsQuerySchema}. */
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

/**
 * Schema for the body of `POST /notifications/fcm-token`.
 *
 * - `fcmToken` — Firebase Cloud Messaging device token. Minimum 10 characters.
 */
export const RegisterFcmTokenSchema = z.object({
  fcmToken: z.string().min(10, 'fcmToken must be at least 10 characters'),
});

/** TypeScript type inferred from {@link RegisterFcmTokenSchema}. */
export type RegisterFcmTokenInput = z.infer<typeof RegisterFcmTokenSchema>;

/**
 * Schema for the body of `POST /notifications/warn-student`.
 *
 * - `studentId`       — UUID of the student to warn.
 * - `courseSectionId` — UUID of the course section.
 */
export const WarnStudentSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID'),
  courseSectionId: z.string().uuid('courseSectionId must be a valid UUID'),
});

/** TypeScript type inferred from {@link WarnStudentSchema}. */
export type WarnStudentInput = z.infer<typeof WarnStudentSchema>;
