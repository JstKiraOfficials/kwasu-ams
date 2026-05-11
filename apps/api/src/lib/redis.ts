import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.js';

/**
 * Singleton ioredis client.
 * lazyConnect: true — connection is established explicitly via connectRedis().
 */
export const redis = new Redis(redisConfig.url, {
  password: redisConfig.password ?? undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err.message);
});

/** Establishes the Redis connection. Called once at startup. */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    console.info('[Redis] Connected successfully');
  } catch (err) {
    console.error('[Redis] Failed to connect:', err);
    throw err;
  }
}
