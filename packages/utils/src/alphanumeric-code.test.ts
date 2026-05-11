import { describe, it, expect } from 'vitest';
import { generateAlphanumericCode, validateAlphanumericCode } from './alphanumeric-code.js';
import { ALPHANUMERIC_CHARSET } from './constants/alphanumeric-charset.js';
import { isOk, isErr } from './result.js';

describe('generateAlphanumericCode', () => {
  it('generates a 6-character code by default', () => {
    const result = generateAlphanumericCode(6);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(6);
    }
  });

  it('generates an 8-character code', () => {
    const result = generateAlphanumericCode(8);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(8);
    }
  });

  it('all characters in a 6-char code are in ALPHANUMERIC_CHARSET', () => {
    const result = generateAlphanumericCode(6);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      for (const char of result.value) {
        expect(ALPHANUMERIC_CHARSET).toContain(char);
      }
    }
  });

  it('all characters in an 8-char code are in ALPHANUMERIC_CHARSET', () => {
    const result = generateAlphanumericCode(8);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      for (const char of result.value) {
        expect(ALPHANUMERIC_CHARSET).toContain(char);
      }
    }
  });

  it('returns err for length 5 (below minimum)', () => {
    const result = generateAlphanumericCode(5);
    expect(isErr(result)).toBe(true);
  });

  it('returns err for length 9 (above maximum)', () => {
    const result = generateAlphanumericCode(9);
    expect(isErr(result)).toBe(true);
  });

  it('generates different codes on successive calls (probabilistic)', () => {
    const a = generateAlphanumericCode(8);
    const b = generateAlphanumericCode(8);
    // Probability of collision is (1/31)^8 ≈ 1 in 852 billion — safe to assert
    if (isOk(a) && isOk(b)) {
      expect(a.value).not.toBe(b.value);
    }
  });
});

describe('validateAlphanumericCode', () => {
  it('returns true for a valid 6-char code', () =>
    expect(validateAlphanumericCode('ABCDEF')).toBe(true));

  it('returns true for a valid 8-char code', () =>
    expect(validateAlphanumericCode('ABCDEFGH')).toBe(true));

  it('returns false for a code containing 0 (excluded)', () =>
    expect(validateAlphanumericCode('ABCDE0')).toBe(false));

  it('returns false for a code containing 1 (excluded)', () =>
    expect(validateAlphanumericCode('ABCDE1')).toBe(false));

  it('returns false for a code containing O (excluded)', () =>
    expect(validateAlphanumericCode('ABCDEO')).toBe(false));

  it('returns false for a code containing I (excluded)', () =>
    expect(validateAlphanumericCode('ABCDEI')).toBe(false));

  it('returns false for a code containing S (excluded)', () =>
    expect(validateAlphanumericCode('ABCDES')).toBe(false));

  it('returns false for a 5-char code (too short)', () =>
    expect(validateAlphanumericCode('ABCDE')).toBe(false));

  it('returns false for a 9-char code (too long)', () =>
    expect(validateAlphanumericCode('ABCDEFGHI')).toBe(false));

  it('returns false for lowercase characters', () =>
    expect(validateAlphanumericCode('abcdef')).toBe(false));
});
