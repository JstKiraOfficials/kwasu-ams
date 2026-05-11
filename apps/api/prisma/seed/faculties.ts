import { PrismaClient } from '@prisma/client';

export async function seedUniversityAndFaculties(prisma: PrismaClient): Promise<void> {
  const university = await prisma.university.upsert({
    where: { shortName: 'KWASU' },
    update: {},
    create: {
      name: 'Kwara State University',
      shortName: 'KWASU',
      address: 'Malete, Kwara State, Nigeria',
      website: 'https://www.kwasu.edu.ng',
    },
  });

  const faculties = [
    { name: 'Faculty of Sciences', code: 'SCI' },
    { name: 'Faculty of Arts and Humanities', code: 'ART' },
    { name: 'Faculty of Social Sciences', code: 'SOC' },
  ];

  for (const faculty of faculties) {
    await prisma.faculty.upsert({
      where: { code: faculty.code },
      update: {},
      create: {
        universityId: university.id,
        name: faculty.name,
        code: faculty.code,
      },
    });
  }
}
