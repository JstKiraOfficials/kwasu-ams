import { describe, it, expect } from 'vitest';
import { EligibilityAppealSchema } from './eligibility.schema.js';

describe('EligibilityAppealSchema', () => {
  it('accepts a reason of exactly 20 characters', () => {
    expect(EligibilityAppealSchema.safeParse({ reason: 'A'.repeat(20) }).success).toBe(true);
  });

  it('accepts a long, detailed reason', () => {
    expect(
      EligibilityAppealSchema.safeParse({
        reason:
          'I was hospitalised for two weeks and have medical documentation to support my case.',
      }).success,
    ).toBe(true);
  });

  it('rejects a reason shorter than 20 characters', () => {
    expect(EligibilityAppealSchema.safeParse({ reason: 'Too short' }).success).toBe(false);
  });

  it('rejects an empty reason', () => {
    expect(EligibilityAppealSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('rejects a missing reason field', () => {
    expect(EligibilityAppealSchema.safeParse({}).success).toBe(false);
  });
});
