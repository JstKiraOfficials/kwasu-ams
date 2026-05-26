/**
 * @file weekly-scheduler.ts
 * @module jobs/schedulers
 *
 * BullMQ cron schedulers for weekly background jobs.
 *
 * All schedules use `tz: 'Africa/Lagos'` (UTC+1, no DST) to ensure correct
 * Nigeria Standard Time execution.
 *
 * Schedule:
 * - Monday 06:00 NST — `welfare-check` job for the active semester.
 * - Monday 06:00 NST — `weekly-summary` job for the active semester.
 * - Monday 07:00 NST — `early-intervention` job for the active semester.
 * - Monday 08:00 NST — `lecturer-accountability` job for the active semester.
 *
 * The scheduler resolves the active semester at job execution time (not at
 * registration time) so it always uses the current active semester.
 */

import {
  welfareCheckQueue,
  weeklySummaryQueue,
  earlyInterventionQueue,
  accountabilityQueue,
} from '../queue.js';
import { prisma } from '../../lib/prisma.js';

/** Nigeria Standard Time timezone identifier. */
const NST_TZ = 'Africa/Lagos';

/**
 * Resolves the active semester ID from the database.
 *
 * @returns The active semester UUID, or `null` if no active semester exists.
 */
async function getActiveSemesterId(): Promise<string | null> {
  const semester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return semester?.id ?? null;
}

/**
 * Registers all weekly cron-scheduled BullMQ jobs.
 *
 * Called once at server startup from `index.ts`. Uses BullMQ's `repeat`
 * option with cron expressions and the Africa/Lagos timezone.
 *
 * @returns A promise that resolves once all schedulers are registered.
 */
export async function registerWeeklySchedulers(): Promise<void> {
  const semesterId = await getActiveSemesterId();
  if (!semesterId) {
    console.warn('[weekly-scheduler] No active semester — skipping scheduler registration');
    return;
  }

  // Monday 06:00 NST — welfare check
  await welfareCheckQueue.add(
    'weekly-welfare-check',
    { semesterId },
    { repeat: { pattern: '0 6 * * 1', tz: NST_TZ }, jobId: `welfare-check-${semesterId}` },
  );

  // Monday 06:00 NST — weekly summary
  await weeklySummaryQueue.add(
    'weekly-summary',
    { semesterId },
    { repeat: { pattern: '0 6 * * 1', tz: NST_TZ }, jobId: `weekly-summary-${semesterId}` },
  );

  // Monday 07:00 NST — early intervention
  await earlyInterventionQueue.add(
    'early-intervention',
    { semesterId },
    { repeat: { pattern: '0 7 * * 1', tz: NST_TZ }, jobId: `early-intervention-${semesterId}` },
  );

  // Monday 08:00 NST — lecturer accountability
  await accountabilityQueue.add(
    'lecturer-accountability',
    { semesterId },
    { repeat: { pattern: '0 8 * * 1', tz: NST_TZ }, jobId: `accountability-${semesterId}` },
  );

  console.info('[weekly-scheduler] Registered 4 weekly scheduled jobs');
}
