/**
 * @file redis.ts
 * @module lib
 *
 * Exports two ioredis client singletons:
 * - `redis` — general-purpose client for caching, pub/sub, and ad-hoc commands.
 * - `workerRedis` — BullMQ-compatible client with `maxRetriesPerRequest: null`,
 *   used exclusively by BullMQ Queues and Workers.
 *
 * Also exports `connectRedis()` which must be called once at application startup
 * to establish the `redis` singleton connection.
 *
 * In development, both clients suppress noisy reconnect chatter. Only a single
 * startup message and genuine fatal errors are surfaced.
 */
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';

const isDev = process.env['NODE_ENV'] !== 'production';

/**
 * Singleton ioredis client for general use (queries, pub/sub, caching).
 *
 * `lazyConnect: true` — connection is established explicitly via `connectRedis()`.
 * In development, reconnect noise is suppressed; only fatal errors are logged.
 */
export const redis = new Redis(redisConfig.url, {
  password: redisConfig.password ?? undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  // Suppress ioredis's built-in unhandled-error stderr output in dev
  showFriendlyErrorStack: !isDev,
});

/**
 * Dedicated ioredis client for BullMQ Queues and Workers.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on all worker connections.
 * Must NOT be shared with the general `redis` singleton.
 * In development, reconnect noise is suppressed via a no-op error listener.
 */
export const workerRedis = new Redis(redisConfig.url, {
  password: redisConfig.password ?? undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  showFriendlyErrorStack: !isDev,
});

// In production, surface all errors. In dev, suppress noisy reconnect chatter
// and only log genuine connection failures (i.e. first connect or persistent loss).
if (isDev) {
  // Attach a no-op listener to prevent Node's default unhandled-error crash,
  // without printing every reconnect attempt to the console.
  redis.on('error', () => {
    /* suppressed in development */
  });
  workerRedis.on('error', () => {
    /* suppressed in development */
  });
} else {
  redis.on('error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.error('[Redis] Connection error:', err.message);
  });
  workerRedis.on('error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.error('[Redis:worker] Connection error:', err.message);
  });
}

/**
 * Establishes the `redis` singleton connection.
 *
 * Must be called once during application startup before any Redis operations.
 * Logs a single success line on connect; re-throws on failure so the process
 * aborts rather than starting in a broken state.
 *
 * @returns A promise that resolves when the connection is ready.
 * @throws {Error} Re-throws any connection error after logging it.
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    // eslint-disable-next-line no-console
    console.info('[Redis] Connected successfully');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Redis] Failed to connect:', err);
    throw err;
  }
}
