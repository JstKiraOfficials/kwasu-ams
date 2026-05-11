/**
 * @file redis.ts
 * @module config
 *
 * Redis connection configuration derived from validated environment variables.
 * Consumed by `lib/redis.ts` to create the ioredis singleton client.
 */

import { env } from './env.js';

/** Redis connection settings read from the validated environment. */
export const redisConfig = {
  url: env.REDIS_URL,
  password: env.REDIS_PASSWORD,
} as const;
