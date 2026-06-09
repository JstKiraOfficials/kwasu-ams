import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

// Mock prisma and redis before importing app
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

vi.mock('../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn().mockResolvedValue(undefined),
}));

// Mock all plugins to avoid needing real connections
vi.mock('../plugins/cors.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../plugins/helmet.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../plugins/rate-limiter.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../plugins/swagger.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with status ok when DB and Redis are connected', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; db: string; redis: string }>();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.redis).toBe('connected');
    await app.close();
  });

  it('returns 503 with status degraded when DB is disconnected', async () => {
    const { prisma } = await import('../lib/prisma.js');
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('DB connection failed'));

    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    const body = response.json<{ status: string; db: string }>();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('disconnected');
    await app.close();
  });
});
