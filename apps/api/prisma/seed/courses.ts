import { PrismaClient } from '@prisma/client';

// 5 courses per department × 10 departments = 50 courses
const COURSES: Record<
  string,
  Array<{ code: string; title: string; level: number; creditUnits: number }>
> = {
  BIO: [
    { code: 'BIO101', title: 'General Biology I', level: 100, creditUnits: 3 },
    { code: 'BIO201', title: 'General Biology II', level: 200, creditUnits: 3 },
    { code: 'BIO202', title: 'Cell Biology', level: 200, creditUnits: 3 },
    { code: 'BIO301', title: 'Genetics', level: 300, creditUnits: 3 },
    { code: 'BIO401', title: 'Ecology and Evolution', level: 400, creditUnits: 3 },
  ],
  CHM: [
    { code: 'CHM101', title: 'General Chemistry I', level: 100, creditUnits: 3 },
    { code: 'CHM201', title: 'Organic Chemistry I', level: 200, creditUnits: 3 },
    { code: 'CHM202', title: 'Physical Chemistry', level: 200, creditUnits: 3 },
    { code: 'CHM301', title: 'Analytical Chemistry', level: 300, creditUnits: 3 },
    { code: 'CHM401', title: 'Industrial Chemistry', level: 400, creditUnits: 3 },
  ],
  CSC: [
    { code: 'CSC101', title: 'Introduction to Computing', level: 100, creditUnits: 3 },
    { code: 'CSC201', title: 'Data Structures and Algorithms', level: 200, creditUnits: 3 },
    { code: 'CSC301', title: 'Database Systems', level: 300, creditUnits: 3 },
    { code: 'CSC302', title: 'Operating Systems', level: 300, creditUnits: 3 },
    { code: 'CSC401', title: 'Software Engineering', level: 400, creditUnits: 3 },
  ],
  MTH: [
    { code: 'MTH101', title: 'Elementary Mathematics I', level: 100, creditUnits: 3 },
    { code: 'MTH201', title: 'Mathematical Analysis', level: 200, creditUnits: 3 },
    { code: 'MTH202', title: 'Linear Algebra', level: 200, creditUnits: 3 },
    { code: 'MTH301', title: 'Real Analysis', level: 300, creditUnits: 3 },
    { code: 'MTH401', title: 'Numerical Methods', level: 400, creditUnits: 3 },
  ],
  ENG: [
    { code: 'ENG101', title: 'Use of English I', level: 100, creditUnits: 2 },
    { code: 'ENG201', title: 'Introduction to Literature', level: 200, creditUnits: 3 },
    { code: 'ENG202', title: 'Linguistics and Language', level: 200, creditUnits: 3 },
    { code: 'ENG301', title: 'African Literature', level: 300, creditUnits: 3 },
    { code: 'ENG401', title: 'Creative Writing', level: 400, creditUnits: 3 },
  ],
  HIS: [
    { code: 'HIS101', title: 'Introduction to History', level: 100, creditUnits: 2 },
    { code: 'HIS201', title: 'History of West Africa', level: 200, creditUnits: 3 },
    { code: 'HIS202', title: 'Nigerian History', level: 200, creditUnits: 3 },
    { code: 'HIS301', title: 'Colonial History', level: 300, creditUnits: 3 },
    { code: 'HIS401', title: 'Contemporary African History', level: 400, creditUnits: 3 },
  ],
  PHI: [
    { code: 'PHI101', title: 'Introduction to Philosophy', level: 100, creditUnits: 2 },
    { code: 'PHI201', title: 'Logic and Critical Thinking', level: 200, creditUnits: 3 },
    { code: 'PHI202', title: 'Ethics', level: 200, creditUnits: 3 },
    { code: 'PHI301', title: 'African Philosophy', level: 300, creditUnits: 3 },
    { code: 'PHI401', title: 'Philosophy of Science', level: 400, creditUnits: 3 },
  ],
  ECO: [
    { code: 'ECO101', title: 'Principles of Economics I', level: 100, creditUnits: 3 },
    { code: 'ECO201', title: 'Microeconomics', level: 200, creditUnits: 3 },
    { code: 'ECO202', title: 'Macroeconomics', level: 200, creditUnits: 3 },
    { code: 'ECO301', title: 'Development Economics', level: 300, creditUnits: 3 },
    { code: 'ECO401', title: 'International Economics', level: 400, creditUnits: 3 },
  ],
  POL: [
    { code: 'POL101', title: 'Introduction to Political Science', level: 100, creditUnits: 2 },
    { code: 'POL201', title: 'Nigerian Government and Politics', level: 200, creditUnits: 3 },
    { code: 'POL202', title: 'Comparative Politics', level: 200, creditUnits: 3 },
    { code: 'POL301', title: 'International Relations', level: 300, creditUnits: 3 },
    { code: 'POL401', title: 'Public Administration', level: 400, creditUnits: 3 },
  ],
  SOC_DEP: [
    { code: 'SOC101', title: 'Introduction to Sociology', level: 100, creditUnits: 2 },
    { code: 'SOC201', title: 'Social Research Methods', level: 200, creditUnits: 3 },
    { code: 'SOC202', title: 'Social Theory', level: 200, creditUnits: 3 },
    { code: 'SOC301', title: 'Urban Sociology', level: 300, creditUnits: 3 },
    { code: 'SOC401', title: 'Sociology of Development', level: 400, creditUnits: 3 },
  ],
};

export async function seedCourses(prisma: PrismaClient): Promise<void> {
  for (const [deptCode, courses] of Object.entries(COURSES)) {
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: deptCode } });

    for (const course of courses) {
      await prisma.course.upsert({
        where: { code: course.code },
        update: {},
        create: {
          departmentId: dept.id,
          code: course.code,
          title: course.title,
          level: course.level,
          creditUnits: course.creditUnits,
          isElective: false,
        },
      });
    }
  }
}
