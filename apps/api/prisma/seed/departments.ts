import { PrismaClient } from '@prisma/client';

export async function seedDepartments(prisma: PrismaClient): Promise<void> {
  const sci = await prisma.faculty.findUniqueOrThrow({ where: { code: 'SCI' } });
  const art = await prisma.faculty.findUniqueOrThrow({ where: { code: 'ART' } });
  const soc = await prisma.faculty.findUniqueOrThrow({ where: { code: 'SOC' } });

  const departments = [
    // Faculty of Sciences
    { facultyId: sci.id, name: 'Department of Biology', code: 'BIO' },
    { facultyId: sci.id, name: 'Department of Chemistry', code: 'CHM' },
    { facultyId: sci.id, name: 'Department of Computer Science', code: 'CSC' },
    { facultyId: sci.id, name: 'Department of Mathematics', code: 'MTH' },
    // Faculty of Arts and Humanities
    { facultyId: art.id, name: 'Department of English', code: 'ENG' },
    { facultyId: art.id, name: 'Department of History', code: 'HIS' },
    { facultyId: art.id, name: 'Department of Philosophy', code: 'PHI' },
    // Faculty of Social Sciences
    { facultyId: soc.id, name: 'Department of Economics', code: 'ECO' },
    { facultyId: soc.id, name: 'Department of Political Science', code: 'POL' },
    { facultyId: soc.id, name: 'Department of Sociology', code: 'SOC_DEP' },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
  }
}
