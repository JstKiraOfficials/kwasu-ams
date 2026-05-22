/**
 * @file excuse-state-machine.test.ts
 * @module modules/excuses/__tests__
 *
 * Unit tests for the excuse letter state machine.
 *
 * Tests all valid and invalid transitions defined in `VALID_TRANSITIONS`.
 *
 * Test coverage:
 * - SUBMITTED → UNDER_REVIEW: valid
 * - UNDER_REVIEW → APPROVED: valid
 * - UNDER_REVIEW → REJECTED: valid
 * - REJECTED → APPEAL_SUBMITTED: valid
 * - APPEAL_SUBMITTED → HOD_APPROVED: valid
 * - APPEAL_SUBMITTED → HOD_REJECTED: valid
 * - APPROVED → APPEAL_SUBMITTED: invalid, throws CONFLICT
 * - HOD_APPROVED → APPEAL_SUBMITTED: invalid, throws CONFLICT
 * - SUBMITTED → APPROVED: invalid (must go through UNDER_REVIEW)
 * - REJECTED → APPROVED: invalid
 * - HOD_REJECTED → HOD_APPROVED: invalid (terminal state)
 */

import { describe, it, expect } from 'vitest';
import { ExcuseStatus } from '@kwasu-ams/types';
import { validateTransition, VALID_TRANSITIONS } from '../excuse-state-machine.js';

describe('VALID_TRANSITIONS map', () => {
  it('has entries for all ExcuseStatus values', () => {
    const statuses = Object.values(ExcuseStatus);
    for (const status of statuses) {
      expect(VALID_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('terminal states have no outgoing transitions', () => {
    expect(VALID_TRANSITIONS[ExcuseStatus.APPROVED]).toHaveLength(0);
    expect(VALID_TRANSITIONS[ExcuseStatus.HOD_APPROVED]).toHaveLength(0);
    expect(VALID_TRANSITIONS[ExcuseStatus.HOD_REJECTED]).toHaveLength(0);
  });
});

describe('validateTransition — valid transitions', () => {
  it('allows SUBMITTED → UNDER_REVIEW', () => {
    expect(() =>
      validateTransition(ExcuseStatus.SUBMITTED, ExcuseStatus.UNDER_REVIEW),
    ).not.toThrow();
  });

  it('allows UNDER_REVIEW → APPROVED', () => {
    expect(() =>
      validateTransition(ExcuseStatus.UNDER_REVIEW, ExcuseStatus.APPROVED),
    ).not.toThrow();
  });

  it('allows UNDER_REVIEW → REJECTED', () => {
    expect(() =>
      validateTransition(ExcuseStatus.UNDER_REVIEW, ExcuseStatus.REJECTED),
    ).not.toThrow();
  });

  it('allows REJECTED → APPEAL_SUBMITTED', () => {
    expect(() =>
      validateTransition(ExcuseStatus.REJECTED, ExcuseStatus.APPEAL_SUBMITTED),
    ).not.toThrow();
  });

  it('allows APPEAL_SUBMITTED → HOD_APPROVED', () => {
    expect(() =>
      validateTransition(ExcuseStatus.APPEAL_SUBMITTED, ExcuseStatus.HOD_APPROVED),
    ).not.toThrow();
  });

  it('allows APPEAL_SUBMITTED → HOD_REJECTED', () => {
    expect(() =>
      validateTransition(ExcuseStatus.APPEAL_SUBMITTED, ExcuseStatus.HOD_REJECTED),
    ).not.toThrow();
  });
});

describe('validateTransition — invalid transitions', () => {
  it('throws CONFLICT for APPROVED → APPEAL_SUBMITTED', () => {
    expect(() => validateTransition(ExcuseStatus.APPROVED, ExcuseStatus.APPEAL_SUBMITTED)).toThrow(
      expect.objectContaining({ code: 'CONFLICT', statusCode: 409 }),
    );
  });

  it('throws CONFLICT for HOD_APPROVED → APPEAL_SUBMITTED', () => {
    expect(() =>
      validateTransition(ExcuseStatus.HOD_APPROVED, ExcuseStatus.APPEAL_SUBMITTED),
    ).toThrow(expect.objectContaining({ code: 'CONFLICT', statusCode: 409 }));
  });

  it('throws CONFLICT for SUBMITTED → APPROVED (must go through UNDER_REVIEW)', () => {
    expect(() => validateTransition(ExcuseStatus.SUBMITTED, ExcuseStatus.APPROVED)).toThrow(
      expect.objectContaining({ code: 'CONFLICT', statusCode: 409 }),
    );
  });

  it('throws CONFLICT for REJECTED → APPROVED', () => {
    expect(() => validateTransition(ExcuseStatus.REJECTED, ExcuseStatus.APPROVED)).toThrow(
      expect.objectContaining({ code: 'CONFLICT', statusCode: 409 }),
    );
  });

  it('throws CONFLICT for HOD_REJECTED → HOD_APPROVED (terminal state)', () => {
    expect(() => validateTransition(ExcuseStatus.HOD_REJECTED, ExcuseStatus.HOD_APPROVED)).toThrow(
      expect.objectContaining({ code: 'CONFLICT', statusCode: 409 }),
    );
  });
});
