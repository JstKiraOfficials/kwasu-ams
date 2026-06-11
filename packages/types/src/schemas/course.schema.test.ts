import { describe, it, expect } from 'vitest';
import { CreateCourseSchema, EnrollStudentsSchema } from './course.schema';

describe('CreateCourseSchema', () => {
  const valid = {
    departmentId: 'a0000000-0000-4000-8000-000000000001',
    code: 'CSC401',
    title: 'Software Engineering',
    creditUnits: 3,
    level: 400,
    isElective: false,
  };

  it('accepts a valid course', () => {
    expect(CreateCourseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid departmentId (not a UUID)', () => {
    expect(CreateCourseSchema.safeParse({ ...valid, departmentId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects code shorter than 3 characters', () => {
    expect(CreateCourseSchema.safeParse({ ...valid, code: 'CS' }).success).toBe(false);
  });

  it('rejects title shorter than 3 characters', () => {
    expect(CreateCourseSchema.safeParse({ ...valid, title: 'AB' }).success).toBe(false);
  });

  it('rejects creditUnits of 0', () => {
    expect(CreateCourseSchema.safeParse({ ...valid, creditUnits: 0 }).success).toBe(false);
  });

  it('rejects creditUnits above 6', () => {
    expect(CreateCourseSchema.safeParse({ ...valid, creditUnits: 7 }).success).toBe(false);
  });

  it('rejects invalid level (e.g. 150)', () => {
    expect(CreateCourseSchema.safeParse({ ...valid, level: 150 }).success).toBe(false);
  });

  it('accepts all valid levels', () => {
    for (const level of [100, 200, 300, 400, 500, 600]) {
      expect(CreateCourseSchema.safeParse({ ...valid, level }).success).toBe(true);
    }
  });

  it('defaults isElective to false when omitted', () => {
    const { isElective: _, ...withoutElective } = valid;
    const result = CreateCourseSchema.safeParse(withoutElective);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isElective).toBe(false);
  });
});

describe('EnrollStudentsSchema', () => {
  const validId = 'b0000000-0000-4000-8000-000000000001';

  it('accepts an array with one valid UUID', () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: [validId] }).success).toBe(true);
  });

  it('rejects an empty studentIds array', () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: [] }).success).toBe(false);
  });

  it('rejects non-UUID entries', () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: ['not-a-uuid'] }).success).toBe(false);
  });
});
