import { describe, it, expect } from 'vitest';
import { ReportFilterSchema } from './report.schema.js';

const VALID_UUID = 'a0000000-0000-4000-8000-000000000001';

describe('ReportFilterSchema', () => {
  it('accepts a minimal payload with only format', () => {
    expect(ReportFilterSchema.safeParse({ format: 'PDF' }).success).toBe(true);
  });

  it('accepts all formats', () => {
    for (const format of ['PDF', 'EXCEL', 'CSV'] as const) {
      expect(ReportFilterSchema.safeParse({ format }).success).toBe(true);
    }
  });

  it('rejects an unknown format', () => {
    expect(ReportFilterSchema.safeParse({ format: 'WORD' }).success).toBe(false);
  });

  it('rejects missing format', () => {
    expect(ReportFilterSchema.safeParse({}).success).toBe(false);
  });

  it('accepts optional UUID fields when provided', () => {
    expect(
      ReportFilterSchema.safeParse({
        format: 'EXCEL',
        facultyId: VALID_UUID,
        departmentId: VALID_UUID,
        courseId: VALID_UUID,
        studentId: VALID_UUID,
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid UUID for facultyId', () => {
    expect(ReportFilterSchema.safeParse({ format: 'PDF', facultyId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('accepts valid ISO datetime strings for startDate and endDate', () => {
    expect(
      ReportFilterSchema.safeParse({
        format: 'CSV',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T23:59:59.999Z',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-datetime startDate', () => {
    expect(ReportFilterSchema.safeParse({ format: 'PDF', startDate: '2025-01-01' }).success).toBe(
      false,
    );
  });
});
