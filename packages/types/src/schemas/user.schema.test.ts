import { describe, it, expect } from 'vitest';
import { CreateUserSchema, UpdateUserSchema, UpdateProfileSchema } from './user.schema';
import { Role } from '../enums/role.enum';

const VALID_UUID = 'a0000000-0000-4000-8000-000000000001';

describe('CreateUserSchema', () => {
  const valid = {
    identifier: '22/47CSC/00001',
    fullName: 'John Doe',
    email: 'john.doe@kwasu.edu.ng',
    phone: '08012345678',
    role: Role.STUDENT,
  };

  it('accepts a valid user payload', () => {
    expect(CreateUserSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an optional scopeId', () => {
    expect(CreateUserSchema.safeParse({ ...valid, scopeId: VALID_UUID }).success).toBe(true);
  });

  it('rejects an invalid scopeId (not a UUID)', () => {
    expect(CreateUserSchema.safeParse({ ...valid, scopeId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects empty identifier', () => {
    expect(CreateUserSchema.safeParse({ ...valid, identifier: '' }).success).toBe(false);
  });

  it('rejects fullName shorter than 2 characters', () => {
    expect(CreateUserSchema.safeParse({ ...valid, fullName: 'J' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(CreateUserSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects phone shorter than 10 characters', () => {
    expect(CreateUserSchema.safeParse({ ...valid, phone: '080123' }).success).toBe(false);
  });

  it('rejects an invalid role', () => {
    expect(CreateUserSchema.safeParse({ ...valid, role: 'UNKNOWN_ROLE' }).success).toBe(false);
  });

  it('accepts all valid roles', () => {
    for (const role of Object.values(Role)) {
      expect(CreateUserSchema.safeParse({ ...valid, role }).success).toBe(true);
    }
  });
});

describe('UpdateUserSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(UpdateUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial update', () => {
    expect(UpdateUserSchema.safeParse({ fullName: 'Jane Doe' }).success).toBe(true);
  });

  it('rejects updating to an invalid email', () => {
    expect(UpdateUserSchema.safeParse({ email: 'bad' }).success).toBe(false);
  });
});

describe('UpdateProfileSchema', () => {
  it('accepts an empty object', () => {
    expect(UpdateProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid email update', () => {
    expect(UpdateProfileSchema.safeParse({ email: 'new@kwasu.edu.ng' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(UpdateProfileSchema.safeParse({ email: 'not-email' }).success).toBe(false);
  });

  it('accepts valid language preferences', () => {
    for (const lang of ['en', 'yo'] as const) {
      expect(UpdateProfileSchema.safeParse({ languagePreference: lang }).success).toBe(true);
    }
  });

  it('rejects an unsupported language', () => {
    expect(UpdateProfileSchema.safeParse({ languagePreference: 'fr' }).success).toBe(false);
  });
});
