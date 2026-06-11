import type { ExcuseReason } from '../enums/excuse-reason.enum';
import type { ExcuseStatus } from '../enums/excuse-status.enum';

export interface IExcuseLetter {
  id: string;
  studentId: string;
  attendanceRecordId: string | null;
  courseSectionId: string;
  absenceDates: Date[];
  reason: ExcuseReason;
  otherExplanation: string | null;
  documentS3Keys: string[];
  status: ExcuseStatus;
  lecturerComment: string | null;
  lecturerReviewedById: string | null;
  lecturerReviewedAt: Date | null;
  hodComment: string | null;
  hodReviewedById: string | null;
  hodReviewedAt: Date | null;
  appealReason: string | null;
  appealSubmittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
