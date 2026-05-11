/**
 * @file sentry.ts
 * @module config
 *
 * Sentry error-tracking configuration derived from validated environment variables.
 * Consumed by `lib/logger.ts` and the Sentry SDK initialisation in `app.ts`.
 */

import { env } from './env.js';

/**
 * Sentry DSN and environment label read from the validated environment.
 * `dsn` is optional — Sentry is disabled when not set.
 */
export const sentryConfig = {
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
} as const;
