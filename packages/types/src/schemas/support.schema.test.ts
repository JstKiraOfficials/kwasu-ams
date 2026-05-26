import { describe, it, expect } from 'vitest';
import { CreateTicketSchema } from './support.schema.js';
import { TicketCategory } from '../enums/ticket-status.enum.js';

describe('CreateTicketSchema', () => {
  const valid = {
    category: TicketCategory.ATTENDANCE_DISPUTE,
    subject: 'My attendance is wrong',
    description: 'I attended the lecture on 12th September but my record shows absent.',
  };

  it('accepts a valid ticket payload', () => {
    expect(CreateTicketSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an invalid category', () => {
    expect(CreateTicketSchema.safeParse({ ...valid, category: 'INVALID' }).success).toBe(false);
  });

  it('rejects subject shorter than 5 characters', () => {
    expect(CreateTicketSchema.safeParse({ ...valid, subject: 'Hi' }).success).toBe(false);
  });

  it('rejects description shorter than 20 characters', () => {
    expect(CreateTicketSchema.safeParse({ ...valid, description: 'Too short' }).success).toBe(
      false,
    );
  });

  it('accepts all TicketCategory values', () => {
    for (const category of Object.values(TicketCategory)) {
      expect(CreateTicketSchema.safeParse({ ...valid, category }).success).toBe(true);
    }
  });
});
