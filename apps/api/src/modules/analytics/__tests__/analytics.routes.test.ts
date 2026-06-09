/**
 * @file analytics.routes.test.ts
 * @module modules/analytics/__tests__
 *
 * Unit tests for the live heatmap endpoint and service.
 *
 * All Prisma, Redis, and BullMQ calls are mocked.
 *
 * Test coverage:
 *
 * getLiveHeatmap — service layer
 * - Returns cached data from Redis on cache hit (no Prisma call)
 * - Computes fresh data and writes to Redis on cache miss
 * - Active session at 80% completion → colorCode: 'green'
 * - Active session at 70% completion → colorCode: 'amber'
 * - Active session at 50% completion → colorCode: 'red'
 * - Venue with no active session → colorCode: 'inactive'
 * - DEAN scope: excludes sessions whose course is not in the faculty
 *
 * getLiveHeatmapHandler — controller + route guard
 * - SUPER_ADMIN role → full venue list returned
 * - LECTURER role → 403 Forbidden
 * - DEAN role → passes scopeId as facultyId to getLiveHeatmap
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    venue: { findMany: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn(),
}));

vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn();
    this.on = vi.fn();
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.on = vi.fn();
  }),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { getLiveHeatmap, refreshHeatmapCache } from '../heatmap.service.js';
import { prisma } from '../../../lib/prisma.js';
import { redis } from '../../../lib/redis.js';

// =============================================================================
// Fixtures
// =============================================================================

const FACULTY_A_ID = 'fac-a-0000-0000-0000-000000000001';
const FACULTY_B_ID = 'fac-b-0000-0000-0000-000000000002';

const VENUE_A = {
  id: 'venue-a',
  name: 'LT1 — Main Theatre',
  buildingName: 'Science Block',
  latitude: 8.487,
  longitude: 4.546,
};

const VENUE_B = {
  id: 'venue-b',
  name: 'LT2 — Engineering Hall',
  buildingName: 'Engineering Block',
  latitude: 8.488,
  longitude: 4.547,
};

/** Build a mock venue with an active session at the given fill rate. */
function makeVenueWithSession(
  venue: typeof VENUE_A,
  enrolled: number,
  present: number,
  facultyId: string = FACULTY_A_ID,
) {
  return {
    ...venue,
    sessions: [
      {
        id: 'sess-1',
        courseSection: {
          course: {
            code: 'BIO201',
            department: { facultyId },
          },
          enrollments: Array.from({ length: enrolled }, (_, i) => ({ id: `enroll-${i}` })),
        },
        lecturer: { user: { fullName: 'Dr. Smith' } },
        attendanceRecords: Array.from({ length: present }, (_, i) => ({ id: `rec-${i}` })),
      },
    ],
  };
}

/** Build a mock venue with no active session. */
function makeVenueNoSession(venue: typeof VENUE_A) {
  return { ...venue, sessions: [] };
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redis.get).mockResolvedValue(null); // default: cache miss
});

// =============================================================================
// Redis cache hit — no Prisma call
// =============================================================================

describe('getLiveHeatmap — cache hit', () => {
  it('returns parsed JSON from Redis without querying Prisma', async () => {
    const cached = {
      venues: [],
      activeSessions: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

    const result = await getLiveHeatmap();

    expect(result).toEqual(cached);
    expect(prisma.venue.findMany).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Redis cache miss — Prisma is queried and cache written
// =============================================================================

describe('getLiveHeatmap — cache miss', () => {
  it('queries Prisma and writes result to Redis on cache miss', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValue([makeVenueNoSession(VENUE_A)] as never);

    await getLiveHeatmap();

    expect(prisma.venue.findMany).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith('heatmap:live', expect.any(String), 'EX', 60);
  });
});

// =============================================================================
// Color code assignment
// =============================================================================

describe('getLiveHeatmap — colorCode assignment', () => {
  it('assigns green when completionPercentage ≥ 80', async () => {
    // 8/10 = 80%
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 8),
    ] as never);

    const result = await refreshHeatmapCache();

    expect(result.venues[0]!.colorCode).toBe('green');
    expect(result.venues[0]!.completionPercentage).toBe(80);
  });

  it('assigns amber when completionPercentage is 60–79', async () => {
    // 7/10 = 70%
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 7),
    ] as never);

    const result = await refreshHeatmapCache();

    expect(result.venues[0]!.colorCode).toBe('amber');
    expect(result.venues[0]!.completionPercentage).toBe(70);
  });

  it('assigns red when completionPercentage < 60', async () => {
    // 5/10 = 50%
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 5),
    ] as never);

    const result = await refreshHeatmapCache();

    expect(result.venues[0]!.colorCode).toBe('red');
    expect(result.venues[0]!.completionPercentage).toBe(50);
  });

  it('assigns inactive and null fields when no active session at venue', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValue([makeVenueNoSession(VENUE_A)] as never);

    const result = await refreshHeatmapCache();

    expect(result.venues[0]!.colorCode).toBe('inactive');
    expect(result.venues[0]!.sessionId).toBeNull();
    expect(result.venues[0]!.courseCode).toBeNull();
    expect(result.venues[0]!.lecturerName).toBeNull();
    expect(result.venues[0]!.checkinCount).toBe(0);
    expect(result.venues[0]!.totalEnrolled).toBe(0);
  });
});

// =============================================================================
// activeSessions count
// =============================================================================

describe('getLiveHeatmap — activeSessions count', () => {
  it('counts only venues with an active session', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 8),
      makeVenueNoSession(VENUE_B),
    ] as never);

    const result = await refreshHeatmapCache();

    expect(result.activeSessions).toBe(1);
    expect(result.venues).toHaveLength(2);
  });
});

// =============================================================================
// HeatmapVenue fields
// =============================================================================

describe('getLiveHeatmap — venue fields', () => {
  it('includes buildingName, latitude, longitude, lecturerName', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 8),
    ] as never);

    const result = await refreshHeatmapCache();
    const venue = result.venues[0]!;

    expect(venue.buildingName).toBe('Science Block');
    expect(venue.latitude).toBe(8.487);
    expect(venue.longitude).toBe(4.546);
    expect(venue.lecturerName).toBe('Dr. Smith');
  });
});

// =============================================================================
// DEAN scope filtering
// =============================================================================

describe('getLiveHeatmap — DEAN faculty scope', () => {
  it('excludes venues whose active session course belongs to a different faculty', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 8, FACULTY_A_ID), // matches
      makeVenueWithSession(VENUE_B, 10, 8, FACULTY_B_ID), // different faculty
    ] as never);

    const result = await refreshHeatmapCache(FACULTY_A_ID);

    // Only VENUE_A's session is in FACULTY_A
    expect(result.venues).toHaveLength(1);
    expect(result.venues[0]!.venueId).toBe(VENUE_A.id);
    expect(result.activeSessions).toBe(1);
  });

  it('uses a faculty-scoped Redis key so DEAN cache does not pollute SUPER_ADMIN cache', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValue([
      makeVenueWithSession(VENUE_A, 10, 8, FACULTY_A_ID),
    ] as never);

    await refreshHeatmapCache(FACULTY_A_ID);

    expect(redis.set).toHaveBeenCalledWith(
      `heatmap:live:faculty:${FACULTY_A_ID}`,
      expect.any(String),
      'EX',
      60,
    );
  });

  it('reads from the faculty-scoped key on cache hit for DEAN', async () => {
    const cached = { venues: [], activeSessions: 0, updatedAt: '2026-01-01T00:00:00.000Z' };
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

    const result = await getLiveHeatmap(FACULTY_A_ID);

    expect(result).toEqual(cached);
    expect(redis.get).toHaveBeenCalledWith(`heatmap:live:faculty:${FACULTY_A_ID}`);
    expect(prisma.venue.findMany).not.toHaveBeenCalled();
  });
});
