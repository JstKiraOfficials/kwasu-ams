/**
 * @file smart-conflict-detector.service.ts
 * @module modules/timetable
 *
 * Smart timetable conflict detector service (Phase 32).
 *
 * Detects students who are absent at the same day-of-week and start-time
 * across 3 or more courses for 3 or more consecutive weeks. Such a pattern
 * indicates a probable timetable clash the student cannot resolve themselves.
 *
 * When detected, an `AnomalyFlag` of type `REPEATED_DAY_PATTERN` is created
 * and `ACADEMIC_AFFAIRS` is notified. No attendance records, eligibility
 * records, or timetable entries are modified — this is advisory only.
 */

import { prisma } from '../../lib/prisma.js';
import { AnomalyType } from '@kwasu-ams/types';
import { notificationQueue } from '../../jobs/queue.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Returns the ISO 8601 week number (1–53) for a given date.
 *
 * @param date - The date to compute the ISO week number for.
 * @returns ISO week number.
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // treat Sunday as 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Returns `true` if a sorted array of ISO week numbers contains a run of
 * 3 or more consecutive weeks.
 *
 * @param weeks - Sorted array of distinct ISO week numbers.
 * @returns `true` when 3+ consecutive weeks are present.
 */
function hasThreeConsecutiveWeeks(weeks: number[]): boolean {
  if (weeks.length < 3) return false;
  let streak = 1;
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i] === weeks[i - 1]! + 1) {
      streak++;
      if (streak >= 3) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}

// =============================================================================
// detectTimetableConflicts
// =============================================================================

/**
 * Scans the active semester for students with a repeated absence pattern that
 * suggests a timetable conflict.
 *
 * For each student enrolled in 2+ courses, groups ABSENT records by
 * `[dayOfWeek, startTime]` and flags the student when absences span 3+
 * distinct courses AND 3+ consecutive ISO weeks.
 *
 * @param semesterId - UUID of the active `Semester` to analyse.
 * @returns A promise that resolves once all flags and notifications are written.
 */
export async function detectTimetableConflicts(semesterId: string): Promise<void> {
  // Find students enrolled in 2+ courses this semester
  const enrollmentGroups = await prisma.courseEnrollment.groupBy({
    by: ['studentId'],
    where: { courseSection: { semesterId }, droppedAt: null },
    having: { studentId: { _count: { gte: 2 } } },
  });

  if (enrollmentGroups.length === 0) return;

  const studentIds = enrollmentGroups.map((g) => g.studentId);
  let newFlagCount = 0;

  for (const studentId of studentIds) {
    // Fetch all ABSENT records with timetable slot context
    const absences = await prisma.attendanceRecord.findMany({
      where: {
        studentId,
        status: 'ABSENT',
        session: { courseSection: { semesterId } },
      },
      select: {
        session: {
          select: {
            scheduledStart: true,
            courseSectionId: true,
            timetableEntry: { select: { dayOfWeek: true, startTime: true } },
          },
        },
      },
    });

    // Group by dayOfWeek|startTime slot
    const slotMap = new Map<string, { courseSectionIds: Set<string>; weeks: Set<number> }>();
    for (const absence of absences) {
      const entry = absence.session.timetableEntry;
      if (!entry) continue;

      const slotKey = `${entry.dayOfWeek}|${entry.startTime}`;
      const isoWeek = getISOWeek(absence.session.scheduledStart);
      const existing = slotMap.get(slotKey) ?? {
        courseSectionIds: new Set<string>(),
        weeks: new Set<number>(),
      };
      existing.courseSectionIds.add(absence.session.courseSectionId);
      existing.weeks.add(isoWeek);
      slotMap.set(slotKey, existing);
    }

    // Check each slot for the REPEATED_DAY_PATTERN condition
    for (const [slotKey, { courseSectionIds, weeks }] of slotMap) {
      if (courseSectionIds.size < 3) continue;

      const sortedWeeks = Array.from(weeks).sort((a, b) => a - b);
      if (!hasThreeConsecutiveWeeks(sortedWeeks)) continue;

      const [dayOfWeek, startTime] = slotKey.split('|') as [string, string];
      const courseCount = courseSectionIds.size;
      const weekCount = sortedWeeks.length;
      const description =
        `Student absent on ${dayOfWeek} at ${startTime} across ${courseCount} courses ` +
        `for ${weekCount} consecutive weeks. Possible timetable conflict.`;

      // Upsert flag — REPEATED_DAY_PATTERN is not tied to a single session
      await prisma.anomalyFlag.upsert({
        where: {
          studentId_sessionId_flagType: {
            studentId,
            sessionId: '',
            flagType: AnomalyType.REPEATED_DAY_PATTERN,
          },
        },
        create: {
          studentId,
          sessionId: null,
          flagType: AnomalyType.REPEATED_DAY_PATTERN,
          description,
        },
        update: { description },
      });

      newFlagCount++;
    }
  }

  // Notify ACADEMIC_AFFAIRS if any patterns were detected
  if (newFlagCount > 0) {
    const academicAffairsUsers = await prisma.user.findMany({
      where: { role: 'ACADEMIC_AFFAIRS' },
      select: { id: true },
    });

    for (const user of academicAffairsUsers) {
      void notificationQueue.add('dispatch', {
        recipientId: user.id,
        trigger: 'ANOMALY_FLAGGED',
        data: {
          recipientName: 'Academic Affairs',
          courseCode: 'N/A',
          average: String(newFlagCount),
          summary: `Possible timetable conflict detected for ${newFlagCount} student(s). Review anomaly flags.`,
        },
      });
    }
  }

  console.info(
    `[smart-conflict-detector] Semester ${semesterId}: scanned ${studentIds.length} students, flagged ${newFlagCount} REPEATED_DAY_PATTERN.`,
  );
}
