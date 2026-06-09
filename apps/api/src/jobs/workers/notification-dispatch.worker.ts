/**
 * @file notification-dispatch.worker.ts
 * @module jobs/workers
 *
 * BullMQ worker for notification dispatch jobs.
 *
 * Processes `notification-dispatch` jobs by calling `dispatch()` from the
 * notification dispatcher service. Handles push, SMS, and email channels
 * based on the trigger configuration.
 */

import { Worker, type Job } from 'bullmq';
import { workerRedis } from '../../lib/redis.js';
import { dispatch } from '../../modules/notifications/notification-dispatcher.service.js';
import { type NotificationJobData } from '../queue.js';
import { type NotificationTrigger } from '../../modules/notifications/notification-dispatcher.service.js';

/**
 * Processes a single `notification-dispatch` job.
 *
 * @param job - BullMQ job containing {@link NotificationJobData}.
 * @returns A promise that resolves once all channel sends are attempted.
 */
export async function processNotificationDispatch(job: Job<NotificationJobData>): Promise<void> {
  const { recipientId, trigger, data } = job.data;
  await dispatch(recipientId, trigger as NotificationTrigger, data);
}

/**
 * BullMQ worker instance for the `notification-dispatch` queue.
 *
 * Concurrency 3 — limits simultaneous FCM/SMS/email calls.
 */
export const notificationDispatchWorker = new Worker<NotificationJobData>(
  'notification-dispatch',
  processNotificationDispatch,
  { connection: workerRedis, concurrency: 3 },
);

notificationDispatchWorker.on('failed', (job, err) => {
  console.error(
    `[notification-dispatch] Job ${job?.id ?? 'unknown'} failed for recipient ${job?.data.recipientId ?? 'unknown'}:`,
    err.message,
  );
});
