import { describe, it, expect } from 'vitest';
import {
  computeAttendancePercentage,
  getAttendanceStatus,
  classesNeededForThreshold,
  projectFinalPercentage,
} from './attendance';

describe('computeAttendancePercentage', () => {
  it('returns 75 for 15/20', () => expect(computeAttendancePercentage(15, 20)).toBe(75));
  it('returns 80 for 16/20', () => expect(computeAttendancePercentage(16, 20)).toBe(80));
  it('returns 100 for 20/20', () => expect(computeAttendancePercentage(20, 20)).toBe(100));
  it('returns 0 for 0/0 (no division by zero)', () =>
    expect(computeAttendancePercentage(0, 0)).toBe(0));
  it('returns 0 for 0/20', () => expect(computeAttendancePercentage(0, 20)).toBe(0));
  it('rounds to 2 decimal places', () => expect(computeAttendancePercentage(1, 3)).toBe(33.33));
});

describe('getAttendanceStatus', () => {
  it('returns safe for 80%', () => expect(getAttendanceStatus(80)).toBe('safe'));
  it('returns safe for 100%', () => expect(getAttendanceStatus(100)).toBe('safe'));
  it('returns warning for 79%', () => expect(getAttendanceStatus(79)).toBe('warning'));
  it('returns warning for 75%', () => expect(getAttendanceStatus(75)).toBe('warning'));
  it('returns danger for 74%', () => expect(getAttendanceStatus(74)).toBe('danger'));
  it('returns danger for 0%', () => expect(getAttendanceStatus(0)).toBe('danger'));
});

describe('classesNeededForThreshold', () => {
  it('returns correct classes needed: 14 present, 20 total, 5 remaining, 75% threshold', () => {
    // requiredPresent = ceil(0.75 * 25) = ceil(18.75) = 19
    // needed = 19 - 14 = 5
    expect(classesNeededForThreshold(14, 20, 5, 75)).toBe(5);
  });

  it('returns 0 when student has already met the threshold', () => {
    // 16/20 = 80% — already above 75%
    // requiredPresent = ceil(0.75 * 20) = 15; needed = 15 - 16 = -1 → max(0, -1) = 0
    expect(classesNeededForThreshold(16, 20, 0, 75)).toBe(0);
  });

  it('returns 0 when student is exactly at threshold', () => {
    // 15/20 = 75% exactly
    expect(classesNeededForThreshold(15, 20, 0, 75)).toBe(0);
  });

  it('handles case where student needs all remaining sessions', () => {
    // 10 present, 20 total, 5 remaining, 75% threshold
    // requiredPresent = ceil(0.75 * 25) = 19; needed = 19 - 10 = 9 > 5 remaining
    // Returns 9 (caller interprets > remainingSessions as impossible)
    expect(classesNeededForThreshold(10, 20, 5, 75)).toBe(9);
  });

  it('returns 0 for a student with 0 sessions and 0 remaining', () => {
    expect(classesNeededForThreshold(0, 0, 0, 75)).toBe(0);
  });
});

describe('projectFinalPercentage', () => {
  it('projects 100% if student attends all 5 remaining sessions (15 present, 20 total)', () => {
    // (15 + 5) / (20 + 5) = 20/25 = 80%
    expect(projectFinalPercentage(15, 20, 5)).toBe(80);
  });

  it('projects 75% for 15 present, 20 total, 0 remaining', () => {
    expect(projectFinalPercentage(15, 20, 0)).toBe(75);
  });
});
