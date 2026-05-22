/**
 * @file excuse-state-machine.ts
 * @module modules/excuses
 *
 * State machine for the `ExcuseLetter` lifecycle.
 *
 * Valid transitions:
 * ```
 * SUBMITTED       → UNDER_REVIEW
 * UNDER_REVIEW    → APPROVED
 * UNDER_REVIEW    → REJECTED
 * REJECTED        → APPEAL_SUBMITTED
 * APPEAL_SUBMITTED → HOD_APPROVED
 * APPEAL_SUBMITTED → HOD_REJECTED
 * ```
 *
 * All other transitions are invalid and throw `409 CONFLICT`.
 * Terminal states (`APPROVED`, `HOD_APPROVED`, `HOD_REJECTED`) have no
 * valid outgoing transitions.
 */

import { ExcuseStatus } from '@kwasu-ams/types';
import { AppError } from '../../middleware/error-handler.js';

// =============================================================================
// Valid transitions map
// =============================================================================

/**
 * Maps each `ExcuseStatus` to the set of statuses it may legally transition to.
 *
 * Terminal states (`APPROVED`, `HOD_APPROVED`, `HOD_REJECTED`) map to empty
 * arrays — no further transitions are permitted.
 */
export const VALID_TRANSITIONS: Record<ExcuseStatus, ExcuseStatus[]> = {
  [ExcuseStatus.SUBMITTED]: [ExcuseStatus.UNDER_REVIEW],
  [ExcuseStatus.UNDER_REVIEW]: [ExcuseStatus.APPROVED, ExcuseStatus.REJECTED],
  [ExcuseStatus.APPROVED]: [],
  [ExcuseStatus.REJECTED]: [ExcuseStatus.APPEAL_SUBMITTED],
  [ExcuseStatus.APPEAL_SUBMITTED]: [ExcuseStatus.HOD_APPROVED, ExcuseStatus.HOD_REJECTED],
  [ExcuseStatus.HOD_APPROVED]: [],
  [ExcuseStatus.HOD_REJECTED]: [],
};

// =============================================================================
// validateTransition
// =============================================================================

/**
 * Validates that a state transition is permitted by the excuse state machine.
 *
 * Throws `409 CONFLICT` if the transition from `currentStatus` to
 * `targetStatus` is not in {@link VALID_TRANSITIONS}.
 *
 * @param currentStatus - The excuse's current `ExcuseStatus`.
 * @param targetStatus  - The desired next `ExcuseStatus`.
 * @throws {AppError} `CONFLICT` (409) — transition is not permitted.
 */
export function validateTransition(currentStatus: ExcuseStatus, targetStatus: ExcuseStatus): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(targetStatus)) {
    throw new AppError(
      'CONFLICT',
      `Invalid state transition: ${currentStatus} → ${targetStatus}.`,
      409,
    );
  }
}
