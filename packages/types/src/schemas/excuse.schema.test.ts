import { describe, it, expect } from 'vitest';
import { SubmitExcuseSchema } from './excuse.schema.js';
import { ExcuseReason } from '../enums/excuse-reason.enum.js';

const BASE_VALID = {
  courseSectionId: '4898aca2-eb50-44a4-b720-598ff049a603',
  absenceDates: ['2024-10-01T00:00:00.000Z'],
};

describe('SubmitExcuseSchema', () => {
  it('accepts reason MEDICAL without otherExplanation', () => {
    const result = SubmitExcuseSchema.safeParse({
      ...BASE_VALID,
      reason: ExcuseReason.MEDICAL,
    });
    expect(result.success).toBe(true);
  });

  it('rejects reason OTHER without otherExplanation', () => {
    const result = SubmitExcuseSchema.safeParse({
      ...BASE_VALID,
      reason: ExcuseReason.OTHER,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join('.'));
      expect(fields).toContain('otherExplanation');
    }
  });

  it('rejects reason OTHER with otherExplanation shorter than 30 characters', () => {
    const result = SubmitExcuseSchema.safeParse({
      ...BASE_VALID,
      reason: ExcuseReason.OTHER,
      otherExplanation: 'Too short',
    });
    expect(result.success).toBe(false);
  });

  it('accepts reason OTHER with otherExplanation of 30+ characters', () => {
    const result = SubmitExcuseSchema.safeParse({
      ...BASE_VALID,
      reason: ExcuseReason.OTHER,
      otherExplanation: 'This is a sufficiently long explanation for the absence.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty absenceDates array', () => {
    const result = SubmitExcuseSchema.safeParse({
      ...BASE_VALID,
      absenceDates: [],
      reason: ExcuseReason.MEDICAL,
    });
    expect(result.success).toBe(false);
  });
});
