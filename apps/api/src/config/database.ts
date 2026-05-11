import { env } from './env.js';

export const databaseConfig = {
  url: env.DATABASE_URL,
  directUrl: env.DATABASE_DIRECT_URL,
} as const;
