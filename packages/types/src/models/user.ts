import type { Role } from '../enums/role.enum';

export interface IUser {
  id: string;
  identifier: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  scopeId: string | null;
  passwordHash: string;
  mustChangePassword: boolean;
  totpSecret: string | null;
  totpEnrolled: boolean;
  totpBackupCodes: string[];
  failedAttempts: number;
  lockoutUntil: Date | null;
  languagePreference: string;
  fcmToken: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Safe user shape for API responses — sensitive auth fields omitted. */
export type IUserPublic = Omit<
  IUser,
  'passwordHash' | 'totpSecret' | 'totpBackupCodes' | 'failedAttempts' | 'lockoutUntil'
>;
