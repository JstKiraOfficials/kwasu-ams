import { env } from './env.js';

export const redisConfig = {
  url: env.REDIS_URL,
  password: env.REDIS_PASSWORD,
} as const;
