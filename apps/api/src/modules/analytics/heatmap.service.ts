/**
 * @file heatmap.service.ts
 * @module modules/analytics
 *
 * Live venue heatmap service for KWASU AMS.
 *
 * `getLiveHeatmap()` returns real-time check-in completion data for all venues
 * with active sessions. Results are cached in Redis with a 30-second TTL.
 *
 * Colour codes:
 * - `green`    — completionPercentage ≥ 80%
 * - `amber`    — completionPercentage 60–79%
 * - `red`      — completionPercentage < 60%
 * - `inactive` — no active session at this venue
 */

import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { computeAttendancePercentage } from '@kwasu-ams/utils';

// =============================================================================
// Types
// =============================================================================

/** A single venue entry in the live heatmap. */
export interface HeatmapVenue {
  /** UUID of the `Venue`. */
  venueId: string;
  /** Human-readable venue name. */
  venueName: string;
  /** UUID of the active `CourseSession`, or `null` if no active session. */
  sessionId: string | null;
  /** Course code of the active session, or `null`. */
  courseCode: string | null;
  /** Number of students who have checked in. */
  checkinCount: number;
  /** Total enrolled students for the active session. */
  totalEnrolled: number;
  /** Check-in completion percentage (0–100). */
  completionPercentage: number;
  /** Colour code for UI rendering. */
  colorCode: 'green' | 'amber' | 'red' | 'inactive';
}

/** Full heatmap response. */
export interface HeatmapData {
  /** Array of venue heatmap entries. */
  venues: HeatmapVenue[];
  /** Timestamp of when this data was computed. */
  updatedAt: Date;
}

// =============================================================================
// Constants
// =============================================================================

/** Redis cache key for the live heatmap. */
const HEATMAP_CACHE_KEY = 'heatmap:live';

/** Redis TTL for the live heatmap in seconds (30 seconds). */
const HEATMAP_TTL_SECONDS = 30;

// =============================================================================
// getLiveHeatmap
// =============================================================================

/**
 * Returns live check-in completion data for all venues.
 *
 * Checks Redis cache first (30s TTL). On cache miss, queries the database
 * for all active sessions and their check-in counts.
 *
 * @returns The current {@link HeatmapData} with venue completion percentages.
 */
export async function getLiveHeatmap(): Promise<HeatmapData> {
  // Check cache
  const cached = await redis.get(HEATMAP_CACHE_KEY);
  if (cached !== null) {
    return JSON.parse(cached) as HeatmapData;
  }

  const data = await computeHeatmap();

  void redis.set(HEATMAP_CACHE_KEY, JSON.stringify(data), 'EX', HEATMAP_TTL_SECONDS);

  return data;
}

/**
 * Computes fresh heatmap data from the database.
 *
 * @returns Computed {@link HeatmapData}.
 */
async function computeHeatmap(): Promise<HeatmapData> {
  // All venues
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sessions: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          courseSectionId: true,
          courseSection: {
            select: {
              course: { select: { code: true } },
              enrollments: { select: { id: true } },
            },
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

  const venueEntries: HeatmapVenue[] = venues.map((venue) => {
    const activeSession = venue.sessions[0];

    if (!activeSession) {
      return {
        venueId: venue.id,
        venueName: venue.name,
        sessionId: null,
        courseCode: null,
        checkinCount: 0,
        totalEnrolled: 0,
        completionPercentage: 0,
        colorCode: 'inactive',
      };
    }

    const checkinCount = activeSession.attendanceRecords.length;
    const totalEnrolled = activeSession.courseSection.enrollments.length;
    const completionPercentage = computeAttendancePercentage(checkinCount, totalEnrolled);

    let colorCode: 'green' | 'amber' | 'red';
    if (completionPercentage >= 80) colorCode = 'green';
    else if (completionPercentage >= 60) colorCode = 'amber';
    else colorCode = 'red';

    return {
      venueId: venue.id,
      venueName: venue.name,
      sessionId: activeSession.id,
      courseCode: activeSession.courseSection.course.code,
      checkinCount,
      totalEnrolled,
      completionPercentage,
      colorCode,
    };
  });

  return { venues: venueEntries, updatedAt: new Date() };
}
