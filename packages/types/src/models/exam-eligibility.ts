import type { EligibilityStatus } from '../enums/eligibility-status.enum';

export interface IExamEligibility {
  id: string;
  studentId: string;
  enrollmentId: string;
  semesterId: string;
  rawPercentage: number;
  effectivePercentage: number;
  status: EligibilityStatus;
  atRiskPredicted: boolean;
  appealSubmittedAt: Date | null;
  appealDecidedAt: Date | null;
  appealDecision: string | null;
  computedAt: Date | null;
  frozenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
