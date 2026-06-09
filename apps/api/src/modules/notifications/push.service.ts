/**
 * @file push.service.ts
 * @module modules/notifications
 *
 * Firebase Cloud Messaging push notification service.
 *
 * Sends push notifications to individual users via their stored FCM token.
 * If the token is stale (`messaging/registration-token-not-registered`), it is
 * cleared from the user record automatically.
 *
 * Push failures are logged but never thrown — a failed push must not block
 * the application or the request cycle.
 */

import { fcm } from '../../lib/firebase.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Sends a push notification to a user via Firebase Cloud Messaging.
 *
 * Looks up the user's FCM token from the database. If no token is stored,
 * the function returns silently (user has not enabled push notifications).
 * If FCM reports the token is no longer registered, it is cleared from the
 * user record.
 *
 * @param userId - UUID of the `User` to send the notification to.
 * @param title  - Notification title displayed on the device.
 * @param body   - Notification body text.
 * @param data   - Optional key-value payload for tap-to-navigate handling.
 * @returns A promise that resolves once the send attempt completes (or is skipped).
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  if (!user?.fcmToken) {
    return; // User has not enabled push notifications
  }

  if (!fcm) {
    // Firebase not initialised (placeholder credentials in dev) — skip silently
    return;
  }

  try {
    await fcm.send({
      token: user.fcmToken,
      notification: { title, body },
      data: data ?? {},
    });
  } catch (err) {
    const errorCode = (err as { errorInfo?: { code?: string } }).errorInfo?.code;
    if (errorCode === 'messaging/registration-token-not-registered') {
      // Token is stale — clear it so we don't attempt again
      void prisma.user.update({
        where: { id: userId },
        data: { fcmToken: null },
      });
    } else {
      console.error(`[Push] Failed to send to user ${userId}:`, errorCode ?? err);
    }
  }
}
