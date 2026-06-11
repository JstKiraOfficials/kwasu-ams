import { describe, it, expect } from 'vitest';
import { NotificationPreferencesSchema } from './notification.schema';

describe('NotificationPreferencesSchema', () => {
  it('accepts all channels enabled', () => {
    expect(
      NotificationPreferencesSchema.safeParse({ push: true, sms: true, email: true }).success,
    ).toBe(true);
  });

  it('accepts all channels disabled', () => {
    expect(
      NotificationPreferencesSchema.safeParse({ push: false, sms: false, email: false }).success,
    ).toBe(true);
  });

  it('accepts a mixed configuration', () => {
    expect(
      NotificationPreferencesSchema.safeParse({ push: true, sms: false, email: true }).success,
    ).toBe(true);
  });

  it('rejects a non-boolean push value', () => {
    expect(
      NotificationPreferencesSchema.safeParse({ push: 'yes', sms: true, email: true }).success,
    ).toBe(false);
  });

  it('rejects missing sms field', () => {
    expect(NotificationPreferencesSchema.safeParse({ push: true, email: true }).success).toBe(
      false,
    );
  });
});
