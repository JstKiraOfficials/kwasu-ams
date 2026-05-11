export interface ICourse {
  id: string;
  departmentId: string;
  code: string;
  title: string;
  creditUnits: number;
  level: number;
  isElective: boolean;
  createdAt: Date;
  updatedAt: Date;
}
