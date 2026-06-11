import { describe, it, expect } from 'vitest';
import { CreateWebhookSchema } from './webhook.schema';

describe('CreateWebhookSchema', () => {
  const valid = {
    url: 'https://external.example.com/hook',
    events: ['attendance.session.opened'],
    secret: 'super-secret-key-32bytes!!',
  };

  it('accepts a valid webhook payload', () => {
    expect(CreateWebhookSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts multiple valid events', () => {
    expect(
      CreateWebhookSchema.safeParse({
        ...valid,
        events: ['attendance.session.opened', 'attendance.checkin.recorded', 'excuse.approved'],
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid URL', () => {
    expect(CreateWebhookSchema.safeParse({ ...valid, url: 'not-a-url' }).success).toBe(false);
  });

  it('rejects an empty events array', () => {
    expect(CreateWebhookSchema.safeParse({ ...valid, events: [] }).success).toBe(false);
  });

  it('rejects an unknown event type', () => {
    expect(
      CreateWebhookSchema.safeParse({ ...valid, events: ['unknown.event.type'] }).success,
    ).toBe(false);
  });

  it('rejects a secret shorter than 16 characters', () => {
    expect(CreateWebhookSchema.safeParse({ ...valid, secret: 'short' }).success).toBe(false);
  });

  it('accepts a secret of exactly 16 characters', () => {
    expect(CreateWebhookSchema.safeParse({ ...valid, secret: '1234567890123456' }).success).toBe(
      true,
    );
  });

  it('accepts all valid event types', () => {
    const allEvents = [
      'attendance.session.opened',
      'attendance.session.closed',
      'attendance.checkin.recorded',
      'student.eligibility.barred',
      'student.eligibility.confirmed',
      'excuse.approved',
      'excuse.rejected',
    ];
    expect(CreateWebhookSchema.safeParse({ ...valid, events: allEvents }).success).toBe(true);
  });
});
