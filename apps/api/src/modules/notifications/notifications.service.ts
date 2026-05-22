/**
 * @file notifications.service.ts
 * @module modules/notifications
 *
 * Business logic for the notifications module.
 *
 * Responsibilities:
 * - `getNotifications`   — Paginated list of a user's own notifications.
 * - `markAsRead`         — Marks a notification as DELIVERED (read).
 * - `registerFcmToken`   — Stores a device's FCM token on the user record.
 * - `warnStudent`        — Lecturer manually triggers a STUDENT_BELOW_75 warning.
 */

import { type INotification, type PaginatedResponse } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { dispatch } from './notification-dispatcher.service.js';
import { type ListNotificationsQuery, type WarnStudentInput } from './notifications.schema.js';

/**
 * Returns a paginated list of notifications for the authenticated user.
 *
 * @param userId - UUID of the authenticated `User`.
 * @param query  - Validated query params from {@link ListNotificationsQuerySchema}.
 * @returns Paginated list of {@link INotification} records.
 */
export async function getNotifications(
  userId: string,
  query: ListNotificationsQuery,
): Promise<PaginatedResponse<INotification>> {
  const { page, pageSize, channel } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    recipientId: userId,
    ...(channel !== undefined ? { channel } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    data: notifications as unknown as INotification[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/**
 * Marks a notification as read (status: `DELIVERED`) for the authenticated user.
 *
 * @param notificationId - UUID of the `Notification` to mark as read.
 * @param userId         - UUID of the authenticated `User` (ownership check).
 * @returns A promise that resolves once the update completes.
 * @throws {AppError} `NOT_FOUND` (404) — notification does not exist or belongs to another user.
 */
export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, recipientId: true },
  });

  if (!notification || notification.recipientId !== userId) {
    throw new AppError('NOT_FOUND', 'Notification not found.', 404);
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
}

/**
 * Stores a Firebase Cloud Messaging device token on the user record.
 *
 * Called by the mobile app after login to enable push notifications.
 *
 * @param userId   - UUID of the authenticated `User`.
 * @param fcmToken - FCM device token string from the mobile app.
 * @returns A promise that resolves once the token is stored.
 */
export async function registerFcmToken(userId: string, fcmToken: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  });
}

/**
 * Allows a lecturer to manually trigger a `STUDENT_BELOW_75` attendance warning
 * notification to a specific student in their course.
 *
 * Verifies the student is enrolled in a course section taught by the lecturer
 * before dispatching the notification.
 *
 * @param lecturerUserId - UUID of the authenticated lecturer `User`.
 * @param data           - Validated input containing `studentId` and `courseSectionId`.
 * @returns A promise that resolves once the notification is dispatched.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer record not found.
 * @throws {AppError} `FORBIDDEN` (403) — student is not enrolled in the lecturer's course.
 */
export async function warnStudent(lecturerUserId: string, data: WarnStudentInput): Promise<void> {
  const lecturer = await prisma.lecturer.findUnique({
    where: { userId: lecturerUserId },
    select: { id: true },
  });
  if (!lecturer) throw new AppError('NOT_FOUND', 'Lecturer not found.', 404);

  const enrollment = await prisma.courseEnrollment.findFirst({
    where: {
      studentId: data.studentId,
      courseSectionId: data.courseSectionId,
      courseSection: { lecturerId: lecturer.id },
    },
    include: {
      student: { include: { user: { select: { id: true } } } },
      courseSection: { include: { course: { select: { code: true } } } },
    },
  });

  if (!enrollment) {
    throw new AppError('FORBIDDEN', 'Student is not enrolled in your course.', 403);
  }

  const studentUserId = enrollment.student.user.id;
  const courseCode = enrollment.courseSection.course.code;

  void dispatch(studentUserId, 'STUDENT_BELOW_75', { courseCode });
}
