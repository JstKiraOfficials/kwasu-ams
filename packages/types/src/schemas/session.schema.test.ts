import { describe, it, expect } from 'vitest';
import { CreateSessionSchema, OverrideAttendanceSchema } from './session.schema';
import { AttendanceStatus } from '../enums/attendance-status.enum';

const VALID_UUID = 'a0000000-0000-4000-8000-000000000001';

describe('CreateSessionSchema', () => {
  const valid = {
    courseSectionId: VALID_UUID,
    venueId: VALID_UUID,
    scheduledStart: '2025-09-01T08:00:00.000Z',
    scheduledEnd: '2025-09-01T10:00:00.000Z',
    isMakeUp: false,
  };

  it('accepts a valid session payload', () => {
    expect(CreateSessionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid courseSectionId (not a UUID)', () => {
    expect(CreateSessionSchema.safeParse({ ...valid, courseSectionId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects invalid venueId (not a UUID)', () => {
    expect(CreateSessionSchema.safeParse({ ...valid, venueId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a non-datetime scheduledStart', () => {
    expect(CreateSessionSchema.safeParse({ ...valid, scheduledStart: '2025-09-01' }).success).toBe(
      false,
    );
  });

  it('rejects a non-datetime scheduledEnd', () => {
    expect(CreateSessionSchema.safeParse({ ...valid, scheduledEnd: '10:00' }).success).toBe(false);
  });

  it('defaults isMakeUp to false when omitted', () => {
    const { isMakeUp: _, ...withoutMakeUp } = valid;
    const result = CreateSessionSchema.safeParse(withoutMakeUp);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isMakeUp).toBe(false);
  });
});

describe('OverrideAttendanceSchema', () => {
  it('accepts a valid status and justification', () => {
    expect(
      OverrideAttendanceSchema.safeParse({
        status: AttendanceStatus.PRESENT,
        justification: 'Student was present but the system malfunctioned during check-in.',
      }).success,
    ).toBe(true);
  });

  it('accepts all valid AttendanceStatus values', () => {
    for (const status of Object.values(AttendanceStatus)) {
      expect(
        OverrideAttendanceSchema.safeParse({ status, justification: 'A'.repeat(20) }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown status value', () => {
    expect(
      OverrideAttendanceSchema.safeParse({ status: 'UNKNOWN', justification: 'A'.repeat(20) })
        .success,
    ).toBe(false);
  });

  it('rejects justification shorter than 20 characters', () => {
    expect(
      OverrideAttendanceSchema.safeParse({
        status: AttendanceStatus.ABSENT,
        justification: 'Too short',
      }).success,
    ).toBe(false);
  });
});
