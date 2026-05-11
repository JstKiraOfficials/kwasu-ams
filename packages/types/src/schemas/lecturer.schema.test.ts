import { describe, it, expect } from 'vitest';
import { CreateLecturerSchema } from './lecturer.schema.js';

const BASE = {
  userId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
  departmentId: '4898aca2-eb50-44a4-b720-598ff049a603',
};

describe('CreateLecturerSchema', () => {
  it('accepts a valid staff ID: KWASU/LEC/CSC/00134', () => {
    const result = CreateLecturerSchema.safeParse({ ...BASE, staffId: 'KWASU/LEC/CSC/00134' });
    expect(result.success).toBe(true);
  });

  it('accepts lowercase kwasu prefix: kwasu/LEC/CSC/00134', () => {
    const result = CreateLecturerSchema.safeParse({ ...BASE, staffId: 'kwasu/LEC/CSC/00134' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid staff ID: KWASTATE/LEC/CSC/001', () => {
    const result = CreateLecturerSchema.safeParse({ ...BASE, staffId: 'KWASTATE/LEC/CSC/001' });
    expect(result.success).toBe(false);
  });

  it('rejects staff ID with missing segment: KWASU/LEC/00134', () => {
    const result = CreateLecturerSchema.safeParse({ ...BASE, staffId: 'KWASU/LEC/00134' });
    expect(result.success).toBe(false);
  });

  it('accepts optional title', () => {
    const result = CreateLecturerSchema.safeParse({
      ...BASE,
      staffId: 'KWASU/LEC/CSC/00134',
      title: 'Dr.',
    });
    expect(result.success).toBe(true);
  });
});
