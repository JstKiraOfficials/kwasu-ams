import { describe, it, expect } from 'vitest';
import {
  addMinutes,
  addHours,
  addDays,
  isWithinWindow,
  formatNigeriaTime,
  getBusinessDaysFromNow,
} from './date';

const BASE = new Date('2024-10-01T10:00:00.000Z');

describe('addMinutes', () => {
  it('adds 30 minutes', () => {
    const result = addMinutes(BASE, 30);
    expect(result.getTime()).toBe(BASE.getTime() + 30 * 60 * 1000);
  });

  it('does not mutate the original date', () => {
    const original = BASE.getTime();
    addMinutes(BASE, 30);
    expect(BASE.getTime()).toBe(original);
  });
});

describe('addHours', () => {
  it('adds 48 hours', () => {
    const result = addHours(BASE, 48);
    expect(result.getTime()).toBe(BASE.getTime() + 48 * 60 * 60 * 1000);
  });
});

describe('addDays', () => {
  it('adds 7 days', () => {
    const result = addDays(BASE, 7);
    expect(result.getTime()).toBe(BASE.getTime() + 7 * 24 * 60 * 60 * 1000);
  });
});

describe('isWithinWindow', () => {
  it('returns true when date is before windowEnd', () => {
    const windowEnd = addHours(BASE, 48);
    expect(isWithinWindow(BASE, windowEnd)).toBe(true);
  });

  it('returns false when date equals windowEnd', () => {
    expect(isWithinWindow(BASE, BASE)).toBe(false);
  });

  it('returns false when date is after windowEnd', () => {
    const past = addHours(BASE, -1);
    expect(isWithinWindow(BASE, past)).toBe(false);
  });
});

describe('formatNigeriaTime', () => {
  it('formats a UTC date in Nigeria Standard Time (UTC+1)', () => {
    // 2024-10-01T10:00:00Z = 11:00 in Nigeria (UTC+1)
    const formatted = formatNigeriaTime(BASE);
    expect(formatted).toContain('2024');
    expect(formatted).toContain('Oct');
    // Should show 11:00 (UTC+1)
    expect(formatted).toMatch(/11:00/);
  });
});

describe('getBusinessDaysFromNow', () => {
  it('returns a date in the future', () => {
    const result = getBusinessDaysFromNow(5);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('skips weekends — result is a weekday', () => {
    const result = getBusinessDaysFromNow(1);
    const dow = result.getDay();
    expect(dow).not.toBe(0); // not Sunday
    expect(dow).not.toBe(6); // not Saturday
  });

  it('returns at least 5 calendar days for 5 business days (accounts for weekends)', () => {
    const result = getBusinessDaysFromNow(5);
    const diffDays = (result.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(5);
  });
});
