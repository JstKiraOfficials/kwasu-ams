import { describe, it, expect } from 'vitest';
import { CreateTimetableEntrySchema } from './timetable.schema';

const VALID_UUID = 'a0000000-0000-4000-8000-000000000001';

describe('CreateTimetableEntrySchema', () => {
  const valid = {
    courseSectionId: VALID_UUID,
    semesterId: VALID_UUID,
    venueId: VALID_UUID,
    dayOfWeek: 'MONDAY' as const,
    startTime: '08:00',
    endTime: '10:00',
  };

  it('accepts a valid timetable entry', () => {
    expect(CreateTimetableEntrySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all valid days of week', () => {
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
    for (const dayOfWeek of days) {
      expect(CreateTimetableEntrySchema.safeParse({ ...valid, dayOfWeek }).success).toBe(true);
    }
  });

  it('rejects SUNDAY as day of week', () => {
    expect(CreateTimetableEntrySchema.safeParse({ ...valid, dayOfWeek: 'SUNDAY' }).success).toBe(
      false,
    );
  });

  it('rejects invalid time format for startTime', () => {
    expect(CreateTimetableEntrySchema.safeParse({ ...valid, startTime: '8:00' }).success).toBe(
      false,
    );
    expect(CreateTimetableEntrySchema.safeParse({ ...valid, startTime: '08:00:00' }).success).toBe(
      false,
    );
    expect(
      CreateTimetableEntrySchema.safeParse({ ...valid, startTime: 'not-a-time' }).success,
    ).toBe(false);
  });

  it('rejects invalid time format for endTime', () => {
    expect(CreateTimetableEntrySchema.safeParse({ ...valid, endTime: '10am' }).success).toBe(false);
  });

  it('rejects invalid UUID for courseSectionId', () => {
    expect(
      CreateTimetableEntrySchema.safeParse({ ...valid, courseSectionId: 'not-a-uuid' }).success,
    ).toBe(false);
  });
});
