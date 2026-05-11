import { PrismaClient } from '@prisma/client';

const DEPT_CODES = ['BIO', 'CHM', 'CSC', 'MTH', 'ENG', 'HIS', 'PHI', 'ECO', 'POL', 'SOC_DEP'];

const DEPT_NAMES: Record<string, string> = {
  BIO: 'Biology',
  CHM: 'Chemistry',
  CSC: 'Computer Science',
  MTH: 'Mathematics',
  ENG: 'English',
  HIS: 'History',
  PHI: 'Philosophy',
  ECO: 'Economics',
  POL: 'Political Science',
  SOC_DEP: 'Sociology',
};

export async function seedProgrammes(prisma: PrismaClient): Promise<void> {
  for (const code of DEPT_CODES) {
    const dept = await prisma.department.findUniqueOrThrow({ where: { code } });
    const name = DEPT_NAMES[code] ?? code;

    await prisma.programme.upsert({
      where: { code: `BSC-${code}` },
      update: {},
      create: {
        departmentId: dept.id,
        name: `B.Sc. ${name}`,
        code: `BSC-${code}`,
        durationYears: 4,
      },
    });

    await prisma.programme.upsert({
      where: { code: `MSC-${code}` },
      update: {},
      create: {
        departmentId: dept.id,
        name: `M.Sc. ${name}`,
        code: `MSC-${code}`,
        durationYears: 2,
      },
    });
  }
}
