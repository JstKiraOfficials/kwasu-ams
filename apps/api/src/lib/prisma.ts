import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// Extend globalThis to hold the Prisma singleton in development
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query', 'error', 'warn'],
  });
}

/**
 * Singleton Prisma client.
 * In development, stored on globalThis to survive hot-reload without leaking connections.
 * In production, a single instance is created at startup.
 */
export const prisma: PrismaClient =
  env.NODE_ENV !== 'production'
    ? (globalThis.__prisma ?? (globalThis.__prisma = createPrismaClient()))
    : createPrismaClient();
