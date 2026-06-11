import { describe, it, expect } from 'vitest';
import { LoginSchema, VerifyTotpSchema, ChangePasswordSchema } from './auth.schema';

describe('LoginSchema', () => {
  it('accepts valid identifier and password', () => {
    const result = LoginSchema.safeParse({ identifier: '22/47CSC/00001', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('rejects empty identifier', () => {
    const result = LoginSchema.safeParse({ identifier: '', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = LoginSchema.safeParse({ identifier: '22/47CSC/00001', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('VerifyTotpSchema', () => {
  it('accepts exactly 6 digits', () => {
    const result = VerifyTotpSchema.safeParse({ code: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects 5 digits', () => {
    const result = VerifyTotpSchema.safeParse({ code: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects 7 digits', () => {
    const result = VerifyTotpSchema.safeParse({ code: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric string', () => {
    const result = VerifyTotpSchema.safeParse({ code: 'abcdef' });
    expect(result.success).toBe(false);
  });

  it('rejects mixed alphanumeric', () => {
    const result = VerifyTotpSchema.safeParse({ code: '12345a' });
    expect(result.success).toBe(false);
  });
});

describe('ChangePasswordSchema', () => {
  it('accepts a valid complex password of 12+ characters', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPassword1!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a password of 11 characters', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'Short1!Pass',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password with no uppercase letter', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'nouppercase1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password with no digit', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NoDigitPassword!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password with no special character', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NoSpecialChar1A',
    });
    expect(result.success).toBe(false);
  });
});
