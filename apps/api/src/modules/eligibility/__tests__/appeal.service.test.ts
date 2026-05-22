/**
 * @file appeal.service.test.ts
 * @module modules/eligibility/__tests__
 *
 * Unit tests for the eligibility appeal service.
 *
 * All Prisma calls are mocked. Tests cover the appeal submission and decision
 * workflows including all guard conditions.
 *
 * Test coverage:
 *
 * submitAppeal
 * - Succeeds on BARRED record within appeal window
 * - Throws CONFLICT when status is not BARRED (e.g. ELIGIBLE)
 * - Throws CONFLICT when appeal window has closed
 * - Throws FORBIDDEN when student does not own the record
 *
 * decideAppeal
 * - APPROVED → status becomes ELIGIBLE
 * - REJECTED → status remains BARRED, appealDecision set
 * - Throws CONFLICT when no appeal has been submitted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    examEligibility: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { submitAppeal, decideAppeal } from '../appeal.service.js';
import { prisma } from '../../../lib/prisma.js';
import { EligibilityStatus, Role } from '@kwasu-ams/types';

// =============================================================================
// Fixtures
// =============================================================================

const STUDENT_USER_ID = 'a0000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'a0000000-0000-4000-8000-000000000099';
const ACTOR_ID = 'a0000000-0000-4000-8000-000000000002';
const ELIGIBILITY_ID = 'a0000000-0000-4000-8000-000000000003';

/** Appeal window end date 10 days in the future. */
const FUTURE_WINDOW_END = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
/** Semester end date such that window has already closed. */
const PAST_SEMESTER_END = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);

const makeEligibility = (
  status: EligibilityStatus = EligibilityStatus.BARRED,
  semesterEndDate: Date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
  appealWindowDays = 10,
  appealSubmittedAt: Date | null = null,
) => ({
  id: ELIGIBILITY_ID,
  status,
  appealSubmittedAt,
  student: { user: { id: STUDENT_USER_ID } },
  semester: {
    id: 'sem-1',
    endDate: semesterEndDate,
    appealWindowDays,
  },
});

const VALID_APPEAL_REASON =
  'I was genuinely ill and have additional documentation to support my case.';

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

// =============================================================================
// submitAppeal
// =============================================================================

describe('submitAppeal', () => {
  it('succeeds on a BARRED record within the appeal window', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.BARRED) as never,
    );
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({
      ...makeEligibility(EligibilityStatus.BARRED),
      appealSubmittedAt: new Date(),
    } as never);

    const result = await submitAppeal(ELIGIBILITY_ID, VALID_APPEAL_REASON, STUDENT_USER_ID);

    expect(prisma.examEligibility.update).toHaveBeenCalledOnce();
    expect(result).toBeDefined();
  });

  it('throws CONFLICT when status is ELIGIBLE (not BARRED)', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.ELIGIBLE) as never,
    );

    await expect(
      submitAppeal(ELIGIBILITY_ID, VALID_APPEAL_REASON, STUDENT_USER_ID),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('throws CONFLICT when the appeal window has closed', async () => {
    // Semester ended 20 days ago, window is 5 days → window closed 15 days ago
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.BARRED, PAST_SEMESTER_END, 5) as never,
    );

    await expect(
      submitAppeal(ELIGIBILITY_ID, VALID_APPEAL_REASON, STUDENT_USER_ID),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('throws FORBIDDEN when student does not own the record', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.BARRED) as never,
    );

    await expect(
      submitAppeal(ELIGIBILITY_ID, VALID_APPEAL_REASON, OTHER_USER_ID),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });
});

// =============================================================================
// decideAppeal
// =============================================================================

describe('decideAppeal', () => {
  it('sets status to ELIGIBLE on APPROVED decision', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.BARRED, new Date(), 5, new Date()) as never,
    );
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({
      ...makeEligibility(EligibilityStatus.ELIGIBLE, new Date(), 5, new Date()),
      appealDecision: 'APPROVED',
      appealDecidedAt: new Date(),
    } as never);

    const result = await decideAppeal(
      ELIGIBILITY_ID,
      'APPROVED',
      'Student provided valid documentation.',
      ACTOR_ID,
      Role.HOD,
    );

    expect(prisma.examEligibility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EligibilityStatus.ELIGIBLE,
          appealDecision: 'APPROVED',
        }),
      }),
    );
    expect(result).toBeDefined();
  });

  it('keeps status BARRED on REJECTED decision', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.BARRED, new Date(), 5, new Date()) as never,
    );
    vi.mocked(prisma.examEligibility.update).mockResolvedValue({
      ...makeEligibility(EligibilityStatus.BARRED, new Date(), 5, new Date()),
      appealDecision: 'REJECTED',
      appealDecidedAt: new Date(),
    } as never);

    await decideAppeal(
      ELIGIBILITY_ID,
      'REJECTED',
      'Insufficient documentation provided.',
      ACTOR_ID,
      Role.HOD,
    );

    expect(prisma.examEligibility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EligibilityStatus.BARRED,
          appealDecision: 'REJECTED',
        }),
      }),
    );
  });

  it('throws CONFLICT when no appeal has been submitted', async () => {
    vi.mocked(prisma.examEligibility.findUnique).mockResolvedValue(
      makeEligibility(EligibilityStatus.BARRED, new Date(), 5, null) as never, // no appeal
    );

    await expect(
      decideAppeal(ELIGIBILITY_ID, 'APPROVED', 'Valid documentation.', ACTOR_ID, Role.HOD),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});
