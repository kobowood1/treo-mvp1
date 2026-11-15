/**
 * Treo Seed Script
 *
 * Creates:
 *   1 school  — "Demo High School"
 *   1 admin   — admin@demo.edu / password: DemoAdmin123
 *   2 teachers — teacher1@demo.edu / teacher2@demo.edu  (password: DemoTeacher123)
 *   3 classrooms — Algebra 1 – Period 1/2/3
 *  15 students (5 per class) with usernames + PINs
 *   8 parents (linked with consent to select students)
 *  ~60 problem sessions spread across all 12 skills and all error types
 *  12 global skill tags (fixed taxonomy)
 *
 * Run: npm run db:seed
 */

import { PrismaClient, Role, SessionStatus, HintLevel, ErrorType } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "admin@demo.edu";
const ADMIN_PASSWORD = "DemoAdmin123";
const TEACHER_PASSWORD = "DemoTeacher123";
const PARENT_PASSWORD = "DemoParent123";
const STUDENT_PIN = "1234";

const SKILL_NAMES = [
  "Combining like terms",
  "Distributive property",
  "One-step equations",
  "Two-step equations",
  "Multi-step equations",
  "Variables on both sides",
  "Equations with fractions",
  "Linear inequalities (incl. flipping the sign)",
  "Solving for a variable (literal equations)",
  "Slope & linear equations",
  "Systems of equations (substitution)",
  "Systems of equations (elimination)",
];

const ERROR_TYPES = Object.values(ErrorType);

const SAMPLE_PROBLEMS = [
  { problem: "2x + 3 = 7",          skill: "Two-step equations" },
  { problem: "3(x - 2) = 9",        skill: "Distributive property" },
  { problem: "5x - 2x + 4 = 10",    skill: "Combining like terms" },
  { problem: "x/3 + 1 = 4",         skill: "Equations with fractions" },
  { problem: "2x + 1 = x - 5",      skill: "Variables on both sides" },
  { problem: "4x + 2(x-1) = 10",    skill: "Multi-step equations" },
  { problem: "x + 7 = 12",          skill: "One-step equations" },
  { problem: "2x - 3y = 12, x = y + 2", skill: "Systems of equations (substitution)" },
  { problem: "3x + 2y = 10, x - y = 1", skill: "Systems of equations (elimination)" },
  { problem: "2x > 8",              skill: "Linear inequalities (incl. flipping the sign)" },
  { problem: "y = 2x + 1",          skill: "Slope & linear equations" },
  { problem: "A = lw; solve for l", skill: "Solving for a variable (literal equations)" },
];

const SAMPLE_STEPS = {
  "2x + 3 = 7":    [{ latex: "2x = 4" }, { latex: "x = 2" }],
  "3(x - 2) = 9":  [{ latex: "3x - 6 = 9" }, { latex: "3x = 15" }, { latex: "x = 5" }],
  "x + 7 = 12":    [{ latex: "x = 5" }],
  "2x > 8":        [{ latex: "x > 4" }],
  "y = 2x + 1":    [{ latex: "\\text{slope} = 2, \\text{y-intercept} = 1" }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function randomJoinCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding Treo demo data…");

  // ── Wipe existing demo school ────────────────────────────────────────────────
  const existingSchool = await prisma.school.findUnique({
    where: { slug: "demo-high-school" },
  });
  if (existingSchool) {
    console.log("  Removing existing demo school…");
    // Cascade: delete all related data
    const schoolUserIds = await prisma.user
      .findMany({ where: { schoolId: existingSchool.id }, select: { id: true } })
      .then((u) => u.map((x) => x.id));
    await prisma.teacherOverride.deleteMany({ where: { teacher: { schoolId: existingSchool.id } } });
    await prisma.hintEvent.deleteMany({ where: { session: { classroom: { schoolId: existingSchool.id } } } });
    await prisma.sessionSkill.deleteMany({ where: { session: { classroom: { schoolId: existingSchool.id } } } });
    await prisma.sessionStep.deleteMany({ where: { session: { classroom: { schoolId: existingSchool.id } } } });
    await prisma.problemSession.deleteMany({ where: { classroom: { schoolId: existingSchool.id } } });
    await prisma.weeklyParentReport.deleteMany({ where: { parent: { schoolId: existingSchool.id } } });
    await prisma.parentLink.deleteMany({ where: { parent: { schoolId: existingSchool.id } } });
    await prisma.enrollment.deleteMany({ where: { classroom: { schoolId: existingSchool.id } } });
    await prisma.classroom.deleteMany({ where: { schoolId: existingSchool.id } });
    await prisma.invitation.deleteMany({ where: { schoolId: existingSchool.id } });
    await prisma.user.deleteMany({ where: { schoolId: existingSchool.id } });
    await prisma.skillTag.deleteMany({ where: { schoolId: existingSchool.id } });
    await prisma.school.delete({ where: { id: existingSchool.id } });
  }

  // ── Global skill tags ─────────────────────────────────────────────────────
  console.log("  Creating global skill tags…");
  const skillTagMap: Record<string, string> = {}; // name → id
  for (let i = 0; i < SKILL_NAMES.length; i++) {
    const tag = await prisma.skillTag.upsert({
      where: { name_schoolId: { name: SKILL_NAMES[i], schoolId: null as unknown as string } },
      update: {},
      create: { name: SKILL_NAMES[i], isGlobal: true, sortOrder: i + 1 },
    });
    skillTagMap[tag.name] = tag.id;
  }

  // ── School ────────────────────────────────────────────────────────────────
  console.log("  Creating school…");
  const school = await prisma.school.create({
    data: { name: "Demo High School", slug: "demo-high-school" },
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  const adminPwHash = await hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.create({
    data: {
      role: Role.SCHOOL_ADMIN,
      schoolId: school.id,
      email: ADMIN_EMAIL,
      displayName: "Demo Admin",
      passwordHash: adminPwHash,
    },
  });

  // ── Teachers ──────────────────────────────────────────────────────────────
  console.log("  Creating teachers…");
  const teacherPwHash = await hash(TEACHER_PASSWORD, 10);
  const [teacher1, teacher2] = await Promise.all([
    prisma.user.create({
      data: {
        role: Role.TEACHER,
        schoolId: school.id,
        email: "teacher1@demo.edu",
        displayName: "Ms. Rivera",
        passwordHash: teacherPwHash,
      },
    }),
    prisma.user.create({
      data: {
        role: Role.TEACHER,
        schoolId: school.id,
        email: "teacher2@demo.edu",
        displayName: "Mr. Thompson",
        passwordHash: teacherPwHash,
      },
    }),
  ]);

  // ── Classrooms ─────────────────────────────────────────────────────────────
  console.log("  Creating classrooms…");
  const [class1, class2, class3] = await Promise.all([
    prisma.classroom.create({
      data: { name: "Algebra 1 — Period 1", schoolId: school.id, teacherId: teacher1.id, joinCode: randomJoinCode() },
    }),
    prisma.classroom.create({
      data: { name: "Algebra 1 — Period 2", schoolId: school.id, teacherId: teacher1.id, joinCode: randomJoinCode() },
    }),
    prisma.classroom.create({
      data: { name: "Algebra 1 — Period 3", schoolId: school.id, teacherId: teacher2.id, joinCode: randomJoinCode() },
    }),
  ]);

  const classrooms = [class1, class2, class3];

  // ── Students (5 per classroom = 15 total) ─────────────────────────────────
  console.log("  Creating students…");
  const studentNames = [
    { first: "Alex",    last: "M" },
    { first: "Jordan",  last: "S" },
    { first: "Casey",   last: "L" },
    { first: "Taylor",  last: "W" },
    { first: "Morgan",  last: "B" },
    { first: "Riley",   last: "H" },
    { first: "Quinn",   last: "P" },
    { first: "Avery",   last: "N" },
    { first: "Blake",   last: "K" },
    { first: "Sam",     last: "T" },
    { first: "Drew",    last: "V" },
    { first: "Jamie",   last: "R" },
    { first: "Devon",   last: "C" },
    { first: "Reese",   last: "G" },
    { first: "Peyton",  last: "F" },
  ];

  const pinHash = await hash(STUDENT_PIN, 10);
  const students: { id: string; classroomId: string; firstName: string }[] = [];

  for (let i = 0; i < studentNames.length; i++) {
    const classroom = classrooms[Math.floor(i / 5)];
    const { first, last } = studentNames[i];
    const username = `${first.toLowerCase()}${last.toLowerCase()}${i + 1}`;

    const student = await prisma.user.create({
      data: {
        role: Role.STUDENT,
        schoolId: school.id,
        firstName: first,
        lastInitial: last,
        username,
        pinHash,
        displayName: `${first} ${last}.`,
        enrollments: { create: { classroomId: classroom.id } },
      },
    });
    students.push({ id: student.id, classroomId: classroom.id, firstName: first });
  }

  // ── Parents (8 parents, linked to first 8 students with consent) ──────────
  console.log("  Creating parents…");
  const parentPwHash = await hash(PARENT_PASSWORD, 10);
  const parentEmails = [
    "parent1@example.com", "parent2@example.com", "parent3@example.com", "parent4@example.com",
    "parent5@example.com", "parent6@example.com", "parent7@example.com", "parent8@example.com",
  ];

  for (let i = 0; i < 8; i++) {
    const parent = await prisma.user.create({
      data: {
        role: Role.PARENT,
        schoolId: school.id,
        email: parentEmails[i],
        displayName: `Parent of ${students[i].firstName}`,
        passwordHash: parentPwHash,
      },
    });
    await prisma.parentLink.create({
      data: {
        parentId: parent.id,
        studentId: students[i].id,
        consentGiven: true,
        consentAt: daysAgo(30),
      },
    });
  }

  // ── Sessions (~60 total, ~4 per student, spread across days + skills) ─────
  console.log("  Creating sessions…");

  let sessionCount = 0;
  for (const student of students) {
    const numSessions = 3 + Math.floor(Math.random() * 3); // 3–5 sessions each
    for (let s = 0; s < numSessions; s++) {
      const prob = pick(SAMPLE_PROBLEMS);
      const skillId = skillTagMap[prob.skill];
      const createdAt = daysAgo(Math.floor(Math.random() * 45)); // up to 6 weeks ago
      const errorType = Math.random() > 0.4 ? pick(ERROR_TYPES) : null;
      const correct = errorType === null || Math.random() > 0.6;
      const hintsUsed = correct ? 0 : Math.floor(Math.random() * 3);
      const stepsData = (SAMPLE_STEPS as Record<string, Array<{ latex: string }>>)[prob.problem] ?? [
        { latex: "\\text{Step 1}" },
        { latex: "\\text{Step 2}" },
      ];

      const session = await prisma.problemSession.create({
        data: {
          studentId: student.id,
          classroomId: student.classroomId,
          imageKeys: [`schools/${school.id}/sessions/seed-${sessionCount}/image-1.jpg`],
          status: SessionStatus.RESOLVED,
          workStatus: "complete",
          problemLatex: prob.problem,
          overallConfidence: 0.85 + Math.random() * 0.15,
          firstErrorStepIndex: correct ? null : stepsData.length,
          finalAnswerCorrect: correct,
          errorType: errorType,
          diagnosisNote: errorType
            ? `Student made a ${errorType.toLowerCase().replace(/_/g, " ")} error.`
            : null,
          startedAt: createdAt,
          resolvedAt: new Date(createdAt.getTime() + (5 + Math.random() * 15) * 60 * 1000),
          createdAt,
          updatedAt: createdAt,
        },
      });

      // Steps
      for (let idx = 0; idx < stepsData.length; idx++) {
        await prisma.sessionStep.create({
          data: {
            sessionId: session.id,
            index: idx + 1,
            latex: stepsData[idx].latex,
            confidence: 0.9,
            isCorrect: correct || idx < stepsData.length - 1,
          },
        });
      }

      // Skill link
      if (skillId) {
        await prisma.sessionSkill.create({
          data: { sessionId: session.id, skillId, isPrimary: true },
        });
      }

      // Hints (for incorrect sessions)
      const levels = [HintLevel.LEVEL_1, HintLevel.LEVEL_2, HintLevel.LEVEL_3];
      for (let h = 0; h < hintsUsed; h++) {
        await prisma.hintEvent.create({
          data: {
            sessionId: session.id,
            level: levels[h],
            hintText: `Hint ${h + 1}: Think about what operation undoes what you did in step ${stepsData.length}.`,
            studentResponse: h === hintsUsed - 1 ? (correct ? stepsData[stepsData.length - 1].latex : null) : null,
            resolvedAt: correct ? new Date(createdAt.getTime() + 10 * 60 * 1000) : null,
          },
        });
      }

      sessionCount++;
    }
  }

  // ── Weekly parent reports (for current week) ───────────────────────────────
  console.log("  Creating sample parent reports…");
  const weekStart = (() => {
    const now = new Date();
    const day = now.getUTCDay();
    const daysToMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  })();

  // Get the parent users again
  const parentUsers = await prisma.user.findMany({
    where: { schoolId: school.id, role: Role.PARENT },
    include: { parentLinksAsParent: { include: { student: { select: { firstName: true } } } } },
  });

  for (const parent of parentUsers.slice(0, 4)) {
    const link = parent.parentLinksAsParent[0];
    if (!link) continue;
    await prisma.weeklyParentReport.create({
      data: {
        parentId: parent.id,
        studentId: link.studentId,
        weekStartDate: weekStart,
        goingWell: `${link.student.firstName} is showing solid progress with two-step equations and has been consistent with their practice this week.`,
        workOn: "They're still building confidence with distributing negative signs — a common sticking point at this stage.",
        helpAtHome: [
          `Ask ${link.student.firstName} to explain out loud how they know which side to move a variable to.`,
          "Encourage them to check their answer by substituting it back into the original equation.",
        ],
        activityCount: 3 + Math.floor(Math.random() * 4),
      },
    });
  }

  console.log(`
✅ Seed complete!

School:   Demo High School (slug: demo-high-school)
Admin:    ${ADMIN_EMAIL}          password: ${ADMIN_PASSWORD}
Teacher1: teacher1@demo.edu       password: ${TEACHER_PASSWORD}
Teacher2: teacher2@demo.edu       password: ${TEACHER_PASSWORD}
Parent:   parent1@example.com     password: ${PARENT_PASSWORD}
Student:  username alexm1         class code: ${class1.joinCode}  PIN: ${STUDENT_PIN}

Sessions created: ${sessionCount}
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
