/**
 * Authorization helper — every server query/action must call assertCan().
 *
 * Design:
 *  - All data is scoped by schoolId.
 *  - Role hierarchy: SCHOOL_ADMIN > TEACHER > STUDENT | PARENT
 *  - Each permission check encodes the minimum role + optional relationship
 *    check (teacher→own class, parent→linked student).
 *
 * Usage:
 *   const session = await auth(); // Auth.js session
 *   assertCan(session, "READ_CLASS_ROSTER", { schoolId, classroomId });
 */

import { Role } from "@prisma/client";
import { prisma } from "./prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuthSession = {
  user: {
    id: string;
    role: Role;
    schoolId: string;
  };
};

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

export function requireRole(session: AuthSession | null, ...roles: Role[]) {
  if (!session) throw new AuthorizationError("Not authenticated");
  if (!roles.includes(session.user.role)) {
    throw new AuthorizationError(
      `Requires one of: ${roles.join(", ")}; got ${session.user.role}`
    );
  }
}

export function requireSameSchool(
  session: AuthSession | null,
  schoolId: string
) {
  if (!session) throw new AuthorizationError("Not authenticated");
  if (session.user.schoolId !== schoolId) {
    throw new AuthorizationError("Cross-school access denied");
  }
}

// ─── Classroom ownership ──────────────────────────────────────────────────────

/** Teacher must own the classroom, or be a school admin in the same school. */
export async function assertClassroomAccess(
  session: AuthSession | null,
  classroomId: string
) {
  if (!session) throw new AuthorizationError("Not authenticated");
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { schoolId: true, teacherId: true },
  });
  if (!classroom) throw new AuthorizationError("Classroom not found");
  requireSameSchool(session, classroom.schoolId);

  if (session.user.role === Role.SCHOOL_ADMIN) return;
  if (session.user.role === Role.TEACHER) {
    if (classroom.teacherId !== session.user.id) {
      throw new AuthorizationError("Not your classroom");
    }
    return;
  }
  throw new AuthorizationError("Insufficient role for classroom access");
}

// ─── Student access ───────────────────────────────────────────────────────────

/** Student can only access their own data. Teacher must own a classroom the student is in. Admin same school. */
export async function assertStudentAccess(
  session: AuthSession | null,
  studentId: string
) {
  if (!session) throw new AuthorizationError("Not authenticated");

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { schoolId: true, role: true },
  });
  if (!student) throw new AuthorizationError("Student not found");
  requireSameSchool(session, student.schoolId);

  if (student.role !== Role.STUDENT)
    throw new AuthorizationError("Target user is not a student");

  if (session.user.role === Role.SCHOOL_ADMIN) return;

  if (session.user.role === Role.STUDENT) {
    if (session.user.id !== studentId)
      throw new AuthorizationError("Students can only access their own data");
    return;
  }

  if (session.user.role === Role.TEACHER) {
    // Teacher must have at least one classroom containing this student
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
        classroom: { teacherId: session.user.id },
      },
    });
    if (!enrollment) throw new AuthorizationError("Student not in your class");
    return;
  }

  if (session.user.role === Role.PARENT) {
    // Parent must be linked to the student with consent
    const link = await prisma.parentLink.findFirst({
      where: {
        parentId: session.user.id,
        studentId,
        consentGiven: true,
      },
    });
    if (!link)
      throw new AuthorizationError(
        "Not linked to this student or consent not given"
      );
    return;
  }

  throw new AuthorizationError("Insufficient role");
}

// ─── Session (ProblemSession) access ─────────────────────────────────────────

export async function assertSessionAccess(
  session: AuthSession | null,
  problemSessionId: string
) {
  if (!session) throw new AuthorizationError("Not authenticated");

  const ps = await prisma.problemSession.findUnique({
    where: { id: problemSessionId },
    select: {
      studentId: true,
      classroom: { select: { schoolId: true, teacherId: true } },
    },
  });
  if (!ps) throw new AuthorizationError("Session not found");
  requireSameSchool(session, ps.classroom.schoolId);

  if (session.user.role === Role.SCHOOL_ADMIN) return;

  if (session.user.role === Role.STUDENT) {
    if (ps.studentId !== session.user.id)
      throw new AuthorizationError("Not your session");
    return;
  }

  if (session.user.role === Role.TEACHER) {
    if (ps.classroom.teacherId !== session.user.id)
      throw new AuthorizationError("Session not in your classroom");
    return;
  }

  if (session.user.role === Role.PARENT) {
    const link = await prisma.parentLink.findFirst({
      where: {
        parentId: session.user.id,
        studentId: ps.studentId,
        consentGiven: true,
      },
    });
    if (!link) throw new AuthorizationError("Not linked to this student");
    return;
  }

  throw new AuthorizationError("Insufficient role");
}

// ─── Weekly report access ─────────────────────────────────────────────────────

export async function assertReportAccess(
  session: AuthSession | null,
  reportId: string
) {
  if (!session) throw new AuthorizationError("Not authenticated");
  const report = await prisma.weeklyParentReport.findUnique({
    where: { id: reportId },
    select: { parentId: true, studentId: true },
  });
  if (!report) throw new AuthorizationError("Report not found");

  if (session.user.role === Role.SCHOOL_ADMIN) {
    // Admins cannot see individual student data; reports are parent-only
    throw new AuthorizationError("Admins cannot view individual reports");
  }

  if (session.user.role === Role.PARENT) {
    if (report.parentId !== session.user.id)
      throw new AuthorizationError("Not your report");
    return;
  }

  if (session.user.role === Role.TEACHER) {
    // Teachers can view reports for their students
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: report.studentId,
        classroom: { teacherId: session.user.id },
      },
    });
    if (!enrollment)
      throw new AuthorizationError("Student not in your classroom");
    return;
  }

  throw new AuthorizationError("Insufficient role");
}
