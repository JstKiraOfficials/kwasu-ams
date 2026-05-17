/**
 * @file conflict-detector.test.ts
 * @module modules/timetable/__tests__
 *
 * Unit tests for the conflict detection service.
 *
 * All Prisma calls are mocked — no real database connection is used.
 * Tests cover all three conflict types (VENUE, LECTURER, SECTION),
 * non-overlapping adjacent times, multiple simultaneous conflicts,
 * and the excludeId bypass for update operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    timetableEntry: {
      findMany: vi.fn(),
    },
    courseSection: {
      findUnique: vi.fn(),
    },
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { detectConflicts } from '../conflict-detector.service.js';
import { prisma } from '../../../lib/prisma.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SECTION_ID = 'a0000000-0000-4000-8000-000000000010';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000020';
const VENUE_ID = 'a0000000-0000-4000-8000-000000000030';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000040';
const ENTRY_ID_1 = 'a0000000-0000-4000-8000-000000000050';
const ENTRY_ID_2 = 'a0000000-0000-4000-8000-000000000051';

/** A base proposed entry used across most tests. */
const BASE_ENTRY = {
  courseSectionId: SECTION_ID,
  semesterId: SEMESTER_ID,
  venueId: VENUE_ID,
  dayOfWeek: 'MONDAY' as const,
  startTime: '10:00',
  endTime: '12:00',
};

// =============================================================================
// No conflicts
// =============================================================================

describe('detectConflicts — no conflicts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns empty array when no existing entries exist', async () => {
    vi.mocked(prisma.timetableEntry.findMany).mockResolvedValue([]);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(0);
  });

  it('returns empty array for adjacent non-overlapping times (08:00–10:00 and 10:00–12:00)', async () => {
    // Existing entry ends exactly when proposed entry starts — no overlap
    vi.mocked(prisma.timetableEntry.findMany).mockResolvedValue([
      { id: ENTRY_ID_1, startTime: '08:00', endTime: '10:00' },
    ] as never);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: null,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// VENUE conflict
// =============================================================================

describe('detectConflicts — VENUE conflict', () => {
  beforeEach(() => vi.resetAllMocks());

  it('detects VENUE conflict when same venue has overlapping time on same day', async () => {
    // Venue query returns overlapping entry; lecturer and section queries return empty
    vi.mocked(prisma.timetableEntry.findMany)
      .mockResolvedValueOnce([{ id: ENTRY_ID_1, startTime: '09:00', endTime: '11:00' }] as never) // venue
      .mockResolvedValueOnce([]) // lecturer
      .mockResolvedValueOnce([]); // section
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('VENUE');
    expect(result[0]?.conflictingEntryId).toBe(ENTRY_ID_1);
  });

  it('does not detect VENUE conflict when times do not overlap', async () => {
    // Existing entry 08:00–10:00, proposed 10:00–12:00 — adjacent, no overlap
    vi.mocked(prisma.timetableEntry.findMany)
      .mockResolvedValueOnce([{ id: ENTRY_ID_1, startTime: '08:00', endTime: '10:00' }] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// LECTURER conflict
// =============================================================================

describe('detectConflicts — LECTURER conflict', () => {
  beforeEach(() => vi.resetAllMocks());

  it('detects LECTURER conflict when lecturer has overlapping slot on same day', async () => {
    vi.mocked(prisma.timetableEntry.findMany)
      .mockResolvedValueOnce([]) // venue — no conflict
      .mockResolvedValueOnce([{ id: ENTRY_ID_1, startTime: '11:00', endTime: '13:00' }] as never) // lecturer overlap
      .mockResolvedValueOnce([]); // section
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('LECTURER');
    expect(result[0]?.conflictingEntryId).toBe(ENTRY_ID_1);
  });

  it('skips lecturer conflict check when section has no assigned lecturer', async () => {
    vi.mocked(prisma.timetableEntry.findMany)
      .mockResolvedValueOnce([]) // venue
      .mockResolvedValueOnce([]); // section (lecturer query skipped)
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: null,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    // findMany called only twice (venue + section), not three times
    expect(prisma.timetableEntry.findMany).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// SECTION conflict
// =============================================================================

describe('detectConflicts — SECTION conflict', () => {
  beforeEach(() => vi.resetAllMocks());

  it('detects SECTION conflict when same section is scheduled at overlapping time', async () => {
    vi.mocked(prisma.timetableEntry.findMany)
      .mockResolvedValueOnce([]) // venue
      .mockResolvedValueOnce([]) // lecturer
      .mockResolvedValueOnce([{ id: ENTRY_ID_1, startTime: '10:30', endTime: '12:30' }] as never); // section overlap
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('SECTION');
    expect(result[0]?.conflictingEntryId).toBe(ENTRY_ID_1);
  });
});

// =============================================================================
// Multiple conflicts simultaneously
// =============================================================================

describe('detectConflicts — multiple conflicts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns all conflict types when venue, lecturer, and section all conflict', async () => {
    vi.mocked(prisma.timetableEntry.findMany)
      .mockResolvedValueOnce([{ id: ENTRY_ID_1, startTime: '09:00', endTime: '11:00' }] as never) // venue
      .mockResolvedValueOnce([{ id: ENTRY_ID_2, startTime: '10:00', endTime: '12:00' }] as never) // lecturer
      .mockResolvedValueOnce([{ id: ENTRY_ID_1, startTime: '09:30', endTime: '11:30' }] as never); // section
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY);

    expect(result).toHaveLength(3);
    const types = result.map((c) => c.type);
    expect(types).toContain('VENUE');
    expect(types).toContain('LECTURER');
    expect(types).toContain('SECTION');
  });
});

// =============================================================================
// excludeId — update operations
// =============================================================================

describe('detectConflicts — excludeId', () => {
  beforeEach(() => vi.resetAllMocks());

  it('excludes the specified entry from conflict checks (for update operations)', async () => {
    // All queries return empty — the existing entry is excluded
    vi.mocked(prisma.timetableEntry.findMany).mockResolvedValue([]);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      lecturerId: LECTURER_ID,
    } as never);

    const result = await detectConflicts(BASE_ENTRY, ENTRY_ID_1);

    expect(result).toHaveLength(0);
    // Verify the exclusion filter was passed to all findMany calls
    expect(prisma.timetableEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: ENTRY_ID_1 } }),
      }),
    );
  });
});
