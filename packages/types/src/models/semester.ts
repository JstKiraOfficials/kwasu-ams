import type { SemesterType } from '../enums/semester-type.enum';

export interface ISemester {
  id: string;
  academicSessionId: string;
  type: SemesterType;
  startDate: Date;
  endDate: Date;
  examStartDate: Date | null;
  eligibilityComputeDate: Date | null;
  eligibilityThreshold: number;
  appealWindowDays: number;
  maxApprovedExcuses: number;
  isActive: boolean;
  isFrozen: boolean;
  createdAt: Date;
  updatedAt: Date;
}
