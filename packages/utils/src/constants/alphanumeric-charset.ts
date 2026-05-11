/**
 * Unambiguous character set for alphanumeric attendance codes.
 * 31 characters: 23 uppercase letters (A–Z minus O, I, S) + 8 digits (2–9).
 * Excluded: O (looks like 0), I (looks like 1), S (looks like 5), 0, 1.
 */
export const ALPHANUMERIC_CHARSET: string = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

/** Minimum length for a generated alphanumeric code. */
export const ALPHANUMERIC_CODE_MIN_LENGTH: number = 6;

/** Maximum length for a generated alphanumeric code. */
export const ALPHANUMERIC_CODE_MAX_LENGTH: number = 8;
