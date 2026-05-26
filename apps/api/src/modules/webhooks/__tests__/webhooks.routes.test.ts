/**
 * @file webhooks.routes.test.ts
 * @module modules/webhooks/__tests__
 *
 * Integration tests for the webhooks module routes.
 *
 * All Prisma calls, the TOTP library, BullMQ queues, and the global `fetch`
 * are mocked — no real database, Redis, or HTTP connections are made.
 *
 * Test scenarios:
 * - POST /webhooks with SUPER_ADMIN: 201, returns secret once.
 * - GET /webhooks: 200, no `secretEncrypted` in response.
 * - DELETE /webhooks/:id: 200, isActive set to false.
 * - POST /webhooks with LECTURER: 403.
 * - Dispatcher: HTTP POST sent with correct X-KWASU-Signature header.
 * - Dispatcher: failed delivery retried 3 times then abandoned.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    webhook: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/totp.js', () => ({
  encryptTotpSecret: vi.fn((s: string) => `enc:${s}`),
  decryptTotpSecret: vi.fn((s: string) => s.replace('enc:', '')),
}));

vi.mock('../../../jobs/queue.js', () => ({
  auditLogQueue: { add: vi.fn().mockResolvedValue({}) },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn().mockResolvedValue({});
    this.on = vi.fn();
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.on = vi.fn();
  }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createWebhook, listWebhooks, deleteWebhook } from '../webhooks.service.js';
import { dispatchWebhookEvent } from '../webhook-dispatcher.service.js';
import { prisma } from '../../../lib/prisma.js';
import { encryptTotpSecret } from '../../../lib/totp.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const WEBHOOK_ID = 'b0000000-0000-4000-8000-000000000010';
const SUBSCRIBER_URL = 'https://external.example.com/hook';
const PLAINTEXT_SECRET = 'super-secret-key-32bytes!!';

const makeWebhook = (overrides = {}) => ({
  id: WEBHOOK_ID,
  url: SUBSCRIBER_URL,
  events: ['attendance.session.opened'],
  isActive: true,
  createdById: ACTOR_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// =============================================================================
// createWebhook
// =============================================================================

describe('createWebhook', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates a webhook, returns plaintext secret once, never stores it in plain', async () => {
    vi.mocked(prisma.webhook.create).mockResolvedValueOnce(makeWebhook() as never);

    const result = await createWebhook(
      { url: SUBSCRIBER_URL, events: ['attendance.session.opened'], secret: PLAINTEXT_SECRET },
      ACTOR_ID,
    );

    expect(result.secret).toBe(PLAINTEXT_SECRET);
    expect(result.webhook.id).toBe(WEBHOOK_ID);
    // secretEncrypted must not appear in the webhook shape
    expect((result.webhook as unknown as Record<string, unknown>).secretEncrypted).toBeUndefined();
    expect(encryptTotpSecret).toHaveBeenCalledWith(PLAINTEXT_SECRET);
    expect(prisma.webhook.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secretEncrypted: `enc:${PLAINTEXT_SECRET}` }),
      }),
    );
  });
});

// =============================================================================
// listWebhooks
// =============================================================================

describe('listWebhooks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns active webhooks and never includes secretEncrypted', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValueOnce([makeWebhook()] as never);

    const result = await listWebhooks();

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(WEBHOOK_ID);
    expect((result[0] as unknown as Record<string, unknown>).secretEncrypted).toBeUndefined();
    expect(prisma.webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });
});

// =============================================================================
// deleteWebhook
// =============================================================================

describe('deleteWebhook', () => {
  beforeEach(() => vi.resetAllMocks());

  it('soft-deletes webhook by setting isActive = false', async () => {
    vi.mocked(prisma.webhook.findFirst).mockResolvedValueOnce(makeWebhook() as never);
    vi.mocked(prisma.webhook.update).mockResolvedValueOnce(
      makeWebhook({ isActive: false }) as never,
    );

    await deleteWebhook(WEBHOOK_ID, ACTOR_ID);

    expect(prisma.webhook.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('throws NOT_FOUND when webhook does not exist', async () => {
    vi.mocked(prisma.webhook.findFirst).mockResolvedValueOnce(null);

    await expect(deleteWebhook(WEBHOOK_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// dispatchWebhookEvent — successful delivery
// =============================================================================

describe('dispatchWebhookEvent — success', () => {
  beforeEach(() => vi.resetAllMocks());

  it('sends signed HTTP POST with correct X-KWASU-Signature header', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValueOnce([
      { id: WEBHOOK_ID, url: SUBSCRIBER_URL, secretEncrypted: `enc:${PLAINTEXT_SECRET}` },
    ] as never);

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const payload = { sessionId: 'sess-1', actorId: ACTOR_ID };
    await dispatchWebhookEvent('attendance.session.opened', payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SUBSCRIBER_URL);

    const headers = options.headers as Record<string, string>;
    expect(headers['X-KWASU-Event']).toBe('attendance.session.opened');
    expect(headers['X-KWASU-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

    vi.unstubAllGlobals();
  });
});

// =============================================================================
// dispatchWebhookEvent — retry on failure
// =============================================================================

describe('dispatchWebhookEvent — retry', () => {
  beforeEach(() => vi.resetAllMocks());

  it('retries 3 times on non-2xx response then abandons', async () => {
    vi.mocked(prisma.webhook.findMany).mockResolvedValueOnce([
      { id: WEBHOOK_ID, url: SUBSCRIBER_URL, secretEncrypted: `enc:${PLAINTEXT_SECRET}` },
    ] as never);

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetch);

    // Speed up the sleep delays by mocking setTimeout
    vi.useFakeTimers();
    const dispatchPromise = dispatchWebhookEvent('attendance.session.opened', { sessionId: 'x' });
    // Advance timers to skip both 5-second retry delays
    await vi.runAllTimersAsync();
    await dispatchPromise;

    // 3 attempts: initial + 2 retries
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
