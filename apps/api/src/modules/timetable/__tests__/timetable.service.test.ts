/**
 * @file timetable.service.test.ts
 * @module modules/timetable/__tests__
 *
 * Unit tests for the timetable service layer.
 *
 * All Prisma calls and the conflict detector are mocked — no real database
 * connection is used. Tests cover happy paths, conflict rejection, not-found
 * errors, and the excludeId passthrough on updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    timetableEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    student: { findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// Mock the conflict detector so service tests are isolated from its logic
vi.mock('../conflict-detector.service.js', () => ({
  detectConflicts: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  createTimetableEntry,
  getTimetableEntryById,
  updateTimetableEntry,
  deleteTimetableEntry,
  getStudentTimetable,
  getLecturerTimetable,
} from '../timetable.service.js';
import { prisma } from '../../../lib/prisma.js';
import { detectConflicts } from '../conflict-detector.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000010';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000020';
const VENUE_ID = 'a0000000-0000-4000-8000-000000000030';
const ENTRY_ID = 'a0000000-0000-4000-8000-000000000040';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000050';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000060';

const ENTRY_RECORD = {
  id: ENTRY_ID,
  courseSectionId: SECTION_ID,
  semesterId: SEMESTER_ID,
  venueId: VENUE_ID,
  dayOfWeek: 'MONDAY',
  startTime: '08:00',
  endTime: '10:00',
  createdAt: new Date(),
  updatedAt: new Date(),
  courseSection: {
    sectionLabel: 'A',
    lecturerId: null,
    course: { code: 'BIO201', title: 'Biology' },
  },
  venue: { name: 'LT1', buildingName: 'Main Block' },
};

const CREATE_INPUT = {
  courseSectionId: SECTION_ID,
  semesterId: SEMESTER_ID,
  venueId: VENUE_ID,
  dayOfWeek: 'MONDAY' as const,
  startTime: '08:00',
  endTime: '10:00',
};

// =============================================================================
// createTimetableEntry
// =============================================================================

describe('createTimetableEntry', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates an entry when no conflicts are detected', async () => {
    vi.mocked(detectConflicts).mockResolvedValueOnce([]);
    vi.mocked(prisma.timetableEntry.create).mockResolvedValueOnce(ENTRY_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await createTimetableEntry(CREATE_INPUT, ACTOR_ID);

    expect(result.id).toBe(ENTRY_ID);
    expect(detectConflicts).toHaveBeenCalledWith(CREATE_INPUT);
    expect(prisma.timetableEntry.create).toHaveBeenCalledOnce();
  });

  it('throws CONFLICT when conflicts are detected', async () => {
    vi.mocked(detectConflicts).mockResolvedValueOnce([
      { type: 'VENUE', conflictingEntryId: 'other-id', description: 'Venue conflict' },
    ]);

    await expect(createTimetableEntry(CREATE_INPUT, ACTOR_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    expect(prisma.timetableEntry.create).not.toHaveBeenCalled();
  });
});

// =============================================================================
// getTimetableEntryById
// =============================================================================

describe('getTimetableEntryById', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the entry when it exists', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce(ENTRY_RECORD as never);

    const result = await getTimetableEntryById(ENTRY_ID);

    expect(result.id).toBe(ENTRY_ID);
  });

  it('throws NOT_FOUND when entry does not exist', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce(null);

    await expect(getTimetableEntryById(ENTRY_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// updateTimetableEntry
// =============================================================================

describe('updateTimetableEntry', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates entry when no conflicts detected', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce(ENTRY_RECORD as never);
    vi.mocked(detectConflicts).mockResolvedValueOnce([]);
    vi.mocked(prisma.timetableEntry.update).mockResolvedValueOnce({
      ...ENTRY_RECORD,
      startTime: '09:00',
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await updateTimetableEntry(ENTRY_ID, { startTime: '09:00' }, ACTOR_ID);

    expect(result.startTime).toBe('09:00');
    // excludeId must be passed so the entry doesn't conflict with itself
    expect(detectConflicts).toHaveBeenCalledWith(expect.any(Object), ENTRY_ID);
  });

  it('throws NOT_FOUND when entry does not exist', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce(null);

    await expect(
      updateTimetableEntry(ENTRY_ID, { startTime: '09:00' }, ACTOR_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws CONFLICT when update causes a scheduling conflict', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce(ENTRY_RECORD as never);
    vi.mocked(detectConflicts).mockResolvedValueOnce([
      { type: 'LECTURER', conflictingEntryId: 'other-id', description: 'Lecturer conflict' },
    ]);

    await expect(
      updateTimetableEntry(ENTRY_ID, { startTime: '09:00' }, ACTOR_ID),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    expect(prisma.timetableEntry.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// deleteTimetableEntry
// =============================================================================

describe('deleteTimetableEntry', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes entry successfully', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce({ id: ENTRY_ID } as never);
    vi.mocked(prisma.timetableEntry.delete).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await expect(deleteTimetableEntry(ENTRY_ID, ACTOR_ID)).resolves.toBeUndefined();
    expect(prisma.timetableEntry.delete).toHaveBeenCalledWith({ where: { id: ENTRY_ID } });
  });

  it('throws NOT_FOUND when entry does not exist', async () => {
    vi.mocked(prisma.timetableEntry.findUnique).mockResolvedValueOnce(null);

    await expect(deleteTimetableEntry(ENTRY_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// getStudentTimetable
// =============================================================================

describe('getStudentTimetable', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns timetable entries for enrolled student', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValueOnce({ id: STUDENT_ID } as never);
    vi.mocked(prisma.timetableEntry.findMany).mockResolvedValueOnce([ENTRY_RECORD] as never);

    const result = await getStudentTimetable(STUDENT_ID, {});

    expect(result).toHaveLength(1);
    expect(prisma.timetableEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          courseSection: { enrollments: { some: { studentId: STUDENT_ID } } },
        }),
      }),
    );
  });

  it('throws NOT_FOUND when student does not exist', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValueOnce(null);

    await expect(getStudentTimetable(STUDENT_ID, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// getLecturerTimetable
// =============================================================================

describe('getLecturerTimetable', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns timetable entries for assigned lecturer', async () => {
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({ id: LECTURER_ID } as never);
    vi.mocked(prisma.timetableEntry.findMany).mockResolvedValueOnce([ENTRY_RECORD] as never);

    const result = await getLecturerTimetable(LECTURER_ID, {});

    expect(result).toHaveLength(1);
    expect(prisma.timetableEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          courseSection: { lecturerId: LECTURER_ID },
        }),
      }),
    );
  });

  it('throws NOT_FOUND when lecturer does not exist', async () => {
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce(null);

    await expect(getLecturerTimetable(LECTURER_ID, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});
