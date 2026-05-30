/**
 * @file heatmap.service.ts
 * @module modules/analytics
 *
 * Live venue heatmap service for KWASU AMS.
 *
 * `getLiveHeatmap()` returns real-time check-in completion data for all venues
 * with active sessions. Results are cached in Redis with a 60-second safety-net
 * TTL; the BullMQ repeating job (`heatmap-refresh`) refreshes the cache every
 * 30 seconds so the TTL is only hit on cold-start or job failure.
 *
 * Colour codes:
 * - `green`    — completionPercentage ≥ 80%
 * - `amber`    — completionPercentage 60–79%
 * - `red`      — completionPercentage < 60%
 * - `inactive` — no active session at this venue
 *
 * DEAN scope: when `facultyId` is provided only venues whose active session
 * belongs to a course in that faculty are included. Venues with no active
 * session that belong to no courses in the faculty are excluded too.
 */

import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

// =============================================================================
// Types
// =============================================================================

/** A single venue entry in the live heatmap. */
export interface HeatmapVenue {
  /** UUID of the `Venue`. */
  venueId: string;
  /** Human-readable venue name. */
  venueName: string;
  /** Building the venue belongs to. */
  buildingName: string;
  /** Venue's registered GPS latitude (not student GPS). */
  latitude: number;
  /** Venue's registered GPS longitude (not student GPS). */
  longitude: number;
  /** UUID of the active `CourseSession`, or `null` if no active session. */
  sessionId: string | null;
  /** Course code of the active session, or `null`. */
  courseCode: string | null;
  /** Full name of the lecturer running the active session, or `null`. */
  lecturerName: string | null;
  /** Number of students who have checked in (PRESENT | LATE | MANUAL_OVERRIDE). */
  checkinCount: number;
  /** Total enrolled students for the active session. */
  totalEnrolled: number;
  /** Check-in completion percentage (0–100, rounded to 1 dp). */
  completionPercentage: number;
  /** Colour code for UI rendering. */
  colorCode: 'green' | 'amber' | 'red' | 'inactive';
}

/** Full heatmap response. */
export interface HeatmapData {
  /** Array of venue heatmap entries. */
  venues: HeatmapVenue[];
  /** Count of active sessions university-wide (or faculty-wide for DEAN). */
  activeSessions: number;
  /** ISO timestamp of when this data was computed. */
  updatedAt: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Redis cache key for the live heatmap. */
const HEATMAP_CACHE_KEY = 'heatmap:live';

/**
 * Redis TTL for the live heatmap in seconds.
 *
 * Acts as a safety net — the BullMQ job refreshes every 30 s so the cache is
 * normally never older than ~30 s. If the job misses, data stays available for
 * up to 60 s before expiry.
 */
const HEATMAP_TTL_SECONDS = 60;

// =============================================================================
// refreshHeatmapCache
// =============================================================================

/**
 * Computes fresh heatmap data and writes it to Redis.
 *
 * Called by the `heatmap-refresh` BullMQ worker every 30 seconds, and also
 * on-demand by {@link getLiveHeatmap} when the cache is cold.
 *
 * @param facultyId - When provided restricts to venues used by courses in this
 *                    faculty (DEAN scope). `undefined` → university-wide.
 * @returns The freshly computed {@link HeatmapData}.
 */
export async function refreshHeatmapCache(facultyId?: string): Promise<HeatmapData> {
  const data = await computeHeatmap(facultyId);
  // Use cache key scoped by faculty so DEAN and SA caches don't collide
  const cacheKey = facultyId ? `${HEATMAP_CACHE_KEY}:faculty:${facultyId}` : HEATMAP_CACHE_KEY;
  await redis.set(cacheKey, JSON.stringify(data), 'EX', HEATMAP_TTL_SECONDS);
  return data;
}

// =============================================================================
// getLiveHeatmap
// =============================================================================

/**
 * Returns live check-in completion data for all venues (or faculty venues for
 * a DEAN).
 *
 * Checks Redis cache first. On cache miss, calls {@link refreshHeatmapCache}
 * synchronously and returns the fresh data.
 *
 * @param facultyId - When provided restricts the heatmap to courses belonging
 *                    to this faculty (DEAN scope). `undefined` → all venues.
 * @returns The current {@link HeatmapData} with venue completion percentages.
 */
export async function getLiveHeatmap(facultyId?: string): Promise<HeatmapData> {
  const cacheKey = facultyId ? `${HEATMAP_CACHE_KEY}:faculty:${facultyId}` : HEATMAP_CACHE_KEY;
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as HeatmapData;
  }

  return refreshHeatmapCache(facultyId);
}

// =============================================================================
// computeHeatmap (internal)
// =============================================================================

/**
 * Queries the database and builds a fresh {@link HeatmapData}.
 *
 * @param facultyId - Optional faculty scope for DEAN users.
 */
async function computeHeatmap(facultyId?: string): Promise<HeatmapData> {
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      buildingName: true,
      latitude: true,
      longitude: true,
      sessions: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          courseSection: {
            select: {
              course: {
                select: {
                  code: true,
                  department: { select: { facultyId: true } },
                },
              },
              enrollments: {
                where: { droppedAt: null },
                select: { id: true },
              },
            },
          },
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
          attendanceRecords: {
            where: { status: { in: ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'] } },
            select: { id: true },
          },
        },
        take: 1,
      },
    },
  });

  const venueEntries: HeatmapVenue[] = [];

  for (const venue of venues) {
    const activeSession = venue.sessions[0];

    if (!activeSession) {
      // Venue with no active session — include if not scoped by faculty
      if (!facultyId) {
        venueEntries.push({
          venueId: venue.id,
          venueName: venue.name,
          buildingName: venue.buildingName,
          latitude: venue.latitude,
          longitude: venue.longitude,
          sessionId: null,
          courseCode: null,
          lecturerName: null,
          checkinCount: 0,
          totalEnrolled: 0,
          completionPercentage: 0,
          colorCode: 'inactive',
        });
      }
      continue;
    }

    // DEAN scope: skip sessions whose course is not in the target faculty
    if (facultyId && activeSession.courseSection.course.department.facultyId !== facultyId) {
      continue;
    }

    const checkinCount = activeSession.attendanceRecords.length;
    const totalEnrolled = activeSession.courseSection.enrollments.length;
    const completionPercentage =
      totalEnrolled > 0
        ? Math.round((checkinCount / totalEnrolled) * 1000) / 10 // one dp
        : 0;

    let colorCode: 'green' | 'amber' | 'red';
    if (completionPercentage >= 80) colorCode = 'green';
    else if (completionPercentage >= 60) colorCode = 'amber';
    else colorCode = 'red';

    venueEntries.push({
      venueId: venue.id,
      venueName: venue.name,
      buildingName: venue.buildingName,
      latitude: venue.latitude,
      longitude: venue.longitude,
      sessionId: activeSession.id,
      courseCode: activeSession.courseSection.course.code,
      lecturerName: activeSession.lecturer.user.fullName,
      checkinCount,
      totalEnrolled,
      completionPercentage,
      colorCode,
    });
  }

  const activeSessions = venueEntries.filter((v) => v.sessionId !== null).length;

  return {
    venues: venueEntries,
    activeSessions,
    updatedAt: new Date().toISOString(),
  };
}
