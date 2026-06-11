import { describe, it, expect } from 'vitest';
import { CreateStudentSchema } from './student.schema';

const BASE = {
  userId: 'a407cb45-63a6-4ffb-9ebe-16601fa540c6',
  programmeId: '4898aca2-eb50-44a4-b720-598ff049a603',
  level: 200,
};

describe('CreateStudentSchema', () => {
  it('accepts a valid matric number: 22/47CSC/00001', () => {
    const result = CreateStudentSchema.safeParse({ ...BASE, matricNumber: '22/47CSC/00001' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid matric number with D suffix: 21D/12BIO/00234', () => {
    const result = CreateStudentSchema.safeParse({ ...BASE, matricNumber: '21D/12BIO/00234' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid matric number: 2022/BIO/008', () => {
    const result = CreateStudentSchema.safeParse({ ...BASE, matricNumber: '2022/BIO/008' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid matric number: 22/BIOLOGY/008', () => {
    const result = CreateStudentSchema.safeParse({ ...BASE, matricNumber: '22/BIOLOGY/008' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid level: 150', () => {
    const result = CreateStudentSchema.safeParse({
      ...BASE,
      matricNumber: '22/47CSC/00001',
      level: 150,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid levels', () => {
    for (const level of [100, 200, 300, 400, 500, 600]) {
      const result = CreateStudentSchema.safeParse({
        ...BASE,
        matricNumber: '22/47CSC/00001',
        level,
      });
      expect(result.success).toBe(true);
    }
  });
});
