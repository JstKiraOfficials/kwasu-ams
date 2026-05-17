/**
 * @file conflict-detector.service.ts
 * @module modules/timetable
 *
 * Timetable conflict detection service.
 *
 * Detects three types of scheduling conflicts for a proposed timetable entry:
 * 1. **VENUE** — same venue booked at an overlapping time on the same day.
 * 2. **LECTURER** — same lecturer assigned to an overlapping slot on the same day.
 * 3. **SECTION** — same course section scheduled at an overlapping time on the same day.
 *
 * Time overlap algorithm: two ranges [s1, e1] and [s2, e2] overlap when
 * `s1 < e2 && e1 > s2`. For `HH:MM` strings, lexicographic comparison is
 * correct because all values are zero-padded to the same width.
 *
 * This service is consumed by `timetable.service.ts` on every create/update
 * operation and will also be consumed by the smart conflict detector in Phase 32.
 */

import { prisma } from '../../lib/prisma.js';
import { type DayOfWeekValue } from './timetable.schema.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Input shape describing the proposed timetable entry to check for conflicts.
 * Mirrors the fields of `CreateTimetableEntrySchema` that are relevant to
 * conflict detection.
 */
export interface TimetableEntryInput {
  /** UUID of the course section being scheduled. */
  courseSectionId: string;
  /** UUID of the semester this entry belongs to. */
  semesterId: string;
  /** UUID of the venue where the class will be held. */
  venueId: string;
  /** Day of the week for this entry. */
  dayOfWeek: DayOfWeekValue;
  /** Start time in `HH:MM` 24-hour format. */
  startTime: string;
  /** End time in `HH:MM` 24-hour format. */
  endTime: string;
}

/**
 * Describes a single detected scheduling conflict.
 */
export interface ConflictResult {
  /** The type of conflict detected. */
  type: 'VENUE' | 'LECTURER' | 'SECTION';
  /** UUID of the existing timetable entry that conflicts with the proposed one. */
  conflictingEntryId: string;
  /** Human-readable description of the conflict. */
  description: string;
}

// =============================================================================
// Time overlap helper
// =============================================================================

/**
 * Returns `true` if two `HH:MM` time ranges overlap.
 *
 * Uses the standard interval overlap test: `s1 < e2 && e1 > s2`.
 * Lexicographic string comparison is valid for zero-padded `HH:MM` strings.
 * Adjacent ranges (e.g. 08:00–10:00 and 10:00–12:00) do NOT overlap.
 *
 * @param s1 - Start time of the first range (`HH:MM`).
 * @param e1 - End time of the first range (`HH:MM`).
 * @param s2 - Start time of the second range (`HH:MM`).
 * @param e2 - End time of the second range (`HH:MM`).
 * @returns `true` if the ranges overlap, `false` otherwise.
 */
function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && e1 > s2;
}

// =============================================================================
// detectConflicts
// =============================================================================

/**
 * Detects all scheduling conflicts for a proposed timetable entry.
 *
 * Checks three conflict types in parallel:
 * 1. **VENUE** — another entry uses the same venue on the same day with an
 *    overlapping time range.
 * 2. **LECTURER** — the lecturer assigned to `courseSectionId` is already
 *    scheduled in another section at an overlapping time on the same day.
 * 3. **SECTION** — the same course section is already scheduled at an
 *    overlapping time on the same day (a section cannot be in two places at once).
 *
 * When `excludeId` is provided (update operations), the entry with that ID is
 * excluded from all conflict queries so a section does not conflict with itself.
 *
 * @param entry     - The proposed timetable entry to check.
 * @param excludeId - Optional UUID of an existing entry to exclude (for updates).
 * @returns Array of {@link ConflictResult} objects. Empty array means no conflicts.
 */
export async function detectConflicts(
  entry: TimetableEntryInput,
  excludeId?: string,
): Promise<ConflictResult[]> {
  const { courseSectionId, semesterId, venueId, dayOfWeek, startTime, endTime } = entry;
  const conflicts: ConflictResult[] = [];

  // Base exclusion filter applied to all queries
  const notExcluded = excludeId !== undefined ? { id: { not: excludeId } } : {};

  // ── 1. Venue conflict ────────────────────────────────────────────────────
  const venueEntries = await prisma.timetableEntry.findMany({
    where: { venueId, semesterId, dayOfWeek, ...notExcluded },
    select: { id: true, startTime: true, endTime: true },
  });

  for (const existing of venueEntries) {
    if (timesOverlap(startTime, endTime, existing.startTime, existing.endTime)) {
      conflicts.push({
        type: 'VENUE',
        conflictingEntryId: existing.id,
        description: `Venue is already booked from ${existing.startTime} to ${existing.endTime} on ${dayOfWeek}.`,
      });
    }
  }

  // ── 2. Lecturer conflict ─────────────────────────────────────────────────
  // Resolve the lecturer assigned to this course section
  const section = await prisma.courseSection.findUnique({
    where: { id: courseSectionId },
    select: { lecturerId: true },
  });

  if (section?.lecturerId !== null && section?.lecturerId !== undefined) {
    const lecturerId = section.lecturerId;

    // Find all sections assigned to this lecturer in the same semester
    const lecturerEntries = await prisma.timetableEntry.findMany({
      where: {
        semesterId,
        dayOfWeek,
        courseSection: { lecturerId },
        ...notExcluded,
      },
      select: { id: true, startTime: true, endTime: true },
    });

    for (const existing of lecturerEntries) {
      if (timesOverlap(startTime, endTime, existing.startTime, existing.endTime)) {
        conflicts.push({
          type: 'LECTURER',
          conflictingEntryId: existing.id,
          description: `Lecturer is already scheduled from ${existing.startTime} to ${existing.endTime} on ${dayOfWeek}.`,
        });
      }
    }
  }

  // ── 3. Section conflict ──────────────────────────────────────────────────
  const sectionEntries = await prisma.timetableEntry.findMany({
    where: { courseSectionId, semesterId, dayOfWeek, ...notExcluded },
    select: { id: true, startTime: true, endTime: true },
  });

  for (const existing of sectionEntries) {
    if (timesOverlap(startTime, endTime, existing.startTime, existing.endTime)) {
      conflicts.push({
        type: 'SECTION',
        conflictingEntryId: existing.id,
        description: `Course section is already scheduled from ${existing.startTime} to ${existing.endTime} on ${dayOfWeek}.`,
      });
    }
  }

  return conflicts;
}
