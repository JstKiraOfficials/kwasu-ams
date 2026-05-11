export interface IDepartment {
  id: string;
  facultyId: string;
  name: string;
  code: string;
  hodId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
