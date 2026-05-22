/**
 * @file appeal.service.ts
 * @module modules/eligibility
 *
 * Business logic for the exam eligibility appeal workflow.
 *
 * Students may appeal a `BARRED` eligibility status within the semester's
 * configured appeal window (`semester.appealWindowDays`). Appeals are decided
 * by lecturers, HODs, Deans, or SUPER_ADMINs.
 *
 * State transitions:
 * - `BARRED` → appeal submitted (appealSubmittedAt set, status remains BARRED)
 * - Appeal `APPROVED` → status becomes `ELIGIBLE`
 * - Appeal `REJECTED` → status remains `BARRED`, appealDecision set
 *
 * All transitions write `AuditLog` entries.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IExamEligibility, Role, EligibilityStatus } from '@kwasu-ams/types';
import { addDays } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry. Errors are swallowed.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
 * @returns A promise that resolves once the log is written (or silently fails).
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

// =============================================================================
// submitAppeal
// =============================================================================

/**
 * Submits an eligibility appeal for a `BARRED` student.
 *
 * Validates that:
 * - The eligibility record is in `BARRED` status.
 * - The student owns the eligibility record.
 * - The appeal window (`semester.appealWindowDays` from `semester.endDate`) has not closed.
 *
 * @param eligibilityId - UUID of the `ExamEligibility` record to appeal.
 * @param reason        - Student's appeal justification. Minimum 20 characters.
 * @param studentUserId - UUID of the authenticated student `User`.
 * @returns The updated {@link IExamEligibility} record.
 * @throws {AppError} `NOT_FOUND` (404) — eligibility record does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — student does not own this record.
 * @throws {AppError} `CONFLICT` (409)  — status is not BARRED, or appeal window has closed.
 */
export async function submitAppeal(
  eligibilityId: string,
  reason: string,
  studentUserId: string,
): Promise<IExamEligibility> {
  const eligibility = await prisma.examEligibility.findUnique({
    where: { id: eligibilityId },
    include: {
      student: { include: { user: { select: { id: true } } } },
      semester: { select: { id: true, endDate: true, appealWindowDays: true } },
    },
  });
  if (!eligibility) throw new AppError('NOT_FOUND', 'Eligibility record not found.', 404);

  // Ownership check
  if (eligibility.student.user.id !== studentUserId) {
    throw new AppError('FORBIDDEN', 'You do not have access to this eligibility record.', 403);
  }

  // Status check — only BARRED records can be appealed
  if (eligibility.status !== EligibilityStatus.BARRED) {
    throw new AppError('CONFLICT', 'Only BARRED eligibility records can be appealed.', 409);
  }

  // Appeal window check
  const windowEnd = addDays(eligibility.semester.endDate, eligibility.semester.appealWindowDays);
  if (new Date() > windowEnd) {
    throw new AppError('CONFLICT', 'Appeal window has closed.', 409);
  }

  const updated = await prisma.examEligibility.update({
    where: { id: eligibilityId },
    data: {
      appealSubmittedAt: new Date(),
      appealDecision: null,
      appealDecidedAt: null,
    },
  });

  void writeAuditLog(
    studentUserId,
    'STUDENT',
    'ELIGIBILITY_OVERRIDDEN',
    'ExamEligibility',
    eligibilityId,
    { appealSubmitted: true, reason },
  );

  return updated as unknown as IExamEligibility;
}

// =============================================================================
// decideAppeal
// =============================================================================

/**
 * Decides an eligibility appeal. Called by lecturers, HODs, Deans, or SUPER_ADMINs.
 *
 * On `APPROVED`: updates `status` to `ELIGIBLE` and sets `appealDecision = 'APPROVED'`.
 * On `REJECTED`: sets `appealDecision = 'REJECTED'`, status remains `BARRED`.
 *
 * @param eligibilityId - UUID of the `ExamEligibility` record.
 * @param decision      - `'APPROVED'` or `'REJECTED'`.
 * @param reason        - Decision justification. Minimum 10 characters.
 * @param actorId       - UUID of the authenticated reviewer.
 * @param actorRole     - Role of the reviewer (for audit trail).
 * @returns The updated {@link IExamEligibility} record.
 * @throws {AppError} `NOT_FOUND` (404) — eligibility record does not exist.
 * @throws {AppError} `CONFLICT` (409)  — no appeal has been submitted for this record.
 */
export async function decideAppeal(
  eligibilityId: string,
  decision: 'APPROVED' | 'REJECTED',
  reason: string,
  actorId: string,
  actorRole: Role,
): Promise<IExamEligibility> {
  const eligibility = await prisma.examEligibility.findUnique({
    where: { id: eligibilityId },
    select: { id: true, status: true, appealSubmittedAt: true },
  });
  if (!eligibility) throw new AppError('NOT_FOUND', 'Eligibility record not found.', 404);

  if (eligibility.appealSubmittedAt === null) {
    throw new AppError('CONFLICT', 'No appeal has been submitted for this record.', 409);
  }

  const now = new Date();
  const newStatus =
    decision === 'APPROVED'
      ? EligibilityStatus.ELIGIBLE
      : (eligibility.status as EligibilityStatus);

  const updated = await prisma.examEligibility.update({
    where: { id: eligibilityId },
    data: {
      status: newStatus,
      appealDecision: decision,
      appealDecidedAt: now,
    },
  });

  void writeAuditLog(
    actorId,
    actorRole,
    'ELIGIBILITY_OVERRIDDEN',
    'ExamEligibility',
    eligibilityId,
    {
      decision,
      reason,
      previousStatus: eligibility.status,
      newStatus,
    },
  );

  return updated as unknown as IExamEligibility;
}
