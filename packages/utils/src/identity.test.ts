import { describe, it, expect } from 'vitest';
import {
  validateMatricNumber,
  validateStaffId,
  normaliseMatricNumber,
} from './constants/identity.js';

describe('validateMatricNumber', () => {
  // Valid formats
  it('accepts 22D/52EN/2024', () => expect(validateMatricNumber('22D/52EN/2024')).toBe(true));
  it('accepts 21/64BI/008', () => expect(validateMatricNumber('21/64BI/008')).toBe(true));
  it('accepts 20/12CS/10034', () => expect(validateMatricNumber('20/12CS/10034')).toBe(true));
  it('accepts 19d/4CM/00712', () => expect(validateMatricNumber('19d/4CM/00712')).toBe(true));
  it('accepts 22/47CSC/00001', () => expect(validateMatricNumber('22/47CSC/00001')).toBe(true));

  // Invalid formats
  it('rejects 2022/BIO/008 (4-digit year)', () =>
    expect(validateMatricNumber('2022/BIO/008')).toBe(false));
  it('rejects 22/BIOLOGY/008 (dept code too long)', () =>
    expect(validateMatricNumber('22/BIOLOGY/008')).toBe(false));
  it('rejects 22/BIO/08 (serial too short)', () =>
    expect(validateMatricNumber('22/BIO/08')).toBe(false));
  it('rejects empty string', () => expect(validateMatricNumber('')).toBe(false));
  it('rejects plain text', () => expect(validateMatricNumber('not-a-matric')).toBe(false));
});

describe('validateStaffId', () => {
  // Valid formats
  it('accepts KWASU/LEC/CSC/00134', () =>
    expect(validateStaffId('KWASU/LEC/CSC/00134')).toBe(true));
  it('accepts kwasu/HOD/BIO/012', () => expect(validateStaffId('kwasu/HOD/BIO/012')).toBe(true));
  it('accepts KWASU/DEAN/SCI/00001', () =>
    expect(validateStaffId('KWASU/DEAN/SCI/00001')).toBe(true));
  it('accepts KWASU/ADM/SYS/00001', () =>
    expect(validateStaffId('KWASU/ADM/SYS/00001')).toBe(true));

  // Invalid formats
  it('rejects KWASTATE/LEC/CSC/001 (wrong prefix)', () =>
    expect(validateStaffId('KWASTATE/LEC/CSC/001')).toBe(false));
  it('rejects KWASU/LECTURER/CSC/001 (rank too long)', () =>
    expect(validateStaffId('KWASU/LECTURER/CSC/001')).toBe(false));
  it('rejects KWASU/LEC/001 (missing dept segment)', () =>
    expect(validateStaffId('KWASU/LEC/001')).toBe(false));
  it('rejects empty string', () => expect(validateStaffId('')).toBe(false));
});

describe('normaliseMatricNumber', () => {
  it('uppercases a lowercase matric number', () =>
    expect(normaliseMatricNumber('22d/47csc/00001')).toBe('22D/47CSC/00001'));
  it('leaves already-uppercase unchanged', () =>
    expect(normaliseMatricNumber('22/47CSC/00001')).toBe('22/47CSC/00001'));
});
