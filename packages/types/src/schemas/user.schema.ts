import { z } from 'zod';
import { Role } from '../enums/role.enum';

export const CreateUserSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 characters'),
  role: z.nativeEnum(Role),
  scopeId: z.string().uuid().optional(),
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({ identifier: true });

export const UpdateProfileSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().min(10, 'Phone number must be at least 10 characters').optional(),
  languagePreference: z.enum(['en', 'yo']).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
