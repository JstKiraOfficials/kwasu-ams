import { env } from './env.js';

export const sentryConfig = {
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
} as const;
