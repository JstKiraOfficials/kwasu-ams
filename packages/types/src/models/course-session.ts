import type { SessionStatus } from '../enums/session-status.enum';

export interface ICourseSession {
  id: string;
  courseSectionId: string;
  venueId: string;
  lecturerId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  status: SessionStatus;
  qrToken: string | null;
  qrTokenExpiresAt: Date | null;
  alphanumericCode: string | null;
  codeExpiresAt: Date | null;
  isMakeUp: boolean;
  overrideWindowEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Session shape for general API responses — sensitive tokens omitted. */
export type ICourseSessionPublic = Omit<ICourseSession, 'qrToken' | 'alphanumericCode'>;
