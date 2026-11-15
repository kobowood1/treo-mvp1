/**
 * Authorization tests for Treo
 *
 * Tests:
 *  1. Teacher cannot read another teacher's classroom
 *  2. Parent cannot read an unlinked student's data
 *  3. Student cannot read another student's session
 *  4. Admin can read across classrooms in the same school
 *  5. Admin cannot cross schools
 *  6. Teacher cannot read a classroom they don't own
 *  7. Parent with consent can read their linked student
 *  8. Teacher with student in their class can access student
 *
 * Uses a mock Prisma client so no real DB is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuthorizationError,
  assertClassroomAccess,
  assertStudentAccess,
  assertSessionAccess,
  AuthSession,
} from "@/lib/auth-helpers";

// ─── Mock prisma ──────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    classroom: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
    },
    parentLink: {
      findFirst: vi.fn(),
    },
    problemSession: {
      findUnique: vi.fn(),
    },
    weeklyParentReport: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// ─── Helper builders ──────────────────────────────────────────────────────────

function makeSession(role: Role, schoolId = "school-1", id = "user-1"): AuthSession {
  return { user: { id, role, schoolId } };
}

// ─── assertClassroomAccess ────────────────────────────────────────────────────

describe("assertClassroomAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a teacher to access their own classroom", async () => {
    vi.mocked(prisma.classroom.findUnique).mockResolvedValue({
      schoolId: "school-1",
      teacherId: "teacher-1",
    } as any);

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertClassroomAccess(session, "class-1")).resolves.not.toThrow();
  });

  it("denies a teacher from accessing another teacher's classroom", async () => {
    vi.mocked(prisma.classroom.findUnique).mockResolvedValue({
      schoolId: "school-1",
      teacherId: "teacher-2",  // different teacher
    } as any);

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertClassroomAccess(session, "class-1")).rejects.toThrow(
      AuthorizationError
    );
    await expect(assertClassroomAccess(session, "class-1")).rejects.toThrow(
      "Not your classroom"
    );
  });

  it("allows a school admin to access any classroom in their school", async () => {
    vi.mocked(prisma.classroom.findUnique).mockResolvedValue({
      schoolId: "school-1",
      teacherId: "teacher-2",
    } as any);

    const session = makeSession(Role.SCHOOL_ADMIN, "school-1", "admin-1");
    await expect(assertClassroomAccess(session, "class-1")).resolves.not.toThrow();
  });

  it("denies cross-school access for admin", async () => {
    vi.mocked(prisma.classroom.findUnique).mockResolvedValue({
      schoolId: "school-2",  // different school
      teacherId: "teacher-1",
    } as any);

    const session = makeSession(Role.SCHOOL_ADMIN, "school-1", "admin-1");
    await expect(assertClassroomAccess(session, "class-1")).rejects.toThrow(
      "Cross-school access denied"
    );
  });

  it("denies unauthenticated requests", async () => {
    await expect(assertClassroomAccess(null, "class-1")).rejects.toThrow(
      "Not authenticated"
    );
  });
});

// ─── assertStudentAccess ──────────────────────────────────────────────────────

describe("assertStudentAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a student to access their own data", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);

    const session = makeSession(Role.STUDENT, "school-1", "student-1");
    await expect(assertStudentAccess(session, "student-1")).resolves.not.toThrow();
  });

  it("denies a student from accessing another student's data", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);

    const session = makeSession(Role.STUDENT, "school-1", "student-1");
    await expect(assertStudentAccess(session, "student-2")).rejects.toThrow(
      "Students can only access their own data"
    );
  });

  it("allows a teacher to access a student in their classroom", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);
    vi.mocked(prisma.enrollment.findFirst).mockResolvedValue({
      id: "enrollment-1",
    } as any);

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertStudentAccess(session, "student-1")).resolves.not.toThrow();
  });

  it("denies a teacher from accessing a student not in their classroom", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);
    vi.mocked(prisma.enrollment.findFirst).mockResolvedValue(null); // not enrolled

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertStudentAccess(session, "student-1")).rejects.toThrow(
      "Student not in your class"
    );
  });

  it("allows a parent with consent to access their linked student", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);
    vi.mocked(prisma.parentLink.findFirst).mockResolvedValue({
      id: "link-1",
      consentGiven: true,
    } as any);

    const session = makeSession(Role.PARENT, "school-1", "parent-1");
    await expect(assertStudentAccess(session, "student-1")).resolves.not.toThrow();
  });

  it("denies a parent without consent to access a student", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);
    vi.mocked(prisma.parentLink.findFirst).mockResolvedValue(null); // no link/consent

    const session = makeSession(Role.PARENT, "school-1", "parent-1");
    await expect(assertStudentAccess(session, "student-1")).rejects.toThrow(
      AuthorizationError
    );
  });

  it("denies a parent from accessing an unlinked student", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-1",
      role: Role.STUDENT,
    } as any);
    vi.mocked(prisma.parentLink.findFirst).mockResolvedValue(null);

    const session = makeSession(Role.PARENT, "school-1", "parent-1");
    await expect(assertStudentAccess(session, "student-99")).rejects.toThrow(
      "Not linked to this student or consent not given"
    );
  });

  it("denies cross-school access", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      schoolId: "school-2",  // different school
      role: Role.STUDENT,
    } as any);

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertStudentAccess(session, "student-1")).rejects.toThrow(
      "Cross-school access denied"
    );
  });
});

// ─── assertSessionAccess ─────────────────────────────────────────────────────

describe("assertSessionAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a student to access their own session", async () => {
    vi.mocked(prisma.problemSession.findUnique).mockResolvedValue({
      studentId: "student-1",
      classroom: { schoolId: "school-1", teacherId: "teacher-1" },
    } as any);

    const session = makeSession(Role.STUDENT, "school-1", "student-1");
    await expect(assertSessionAccess(session, "session-1")).resolves.not.toThrow();
  });

  it("denies a student from accessing another student's session", async () => {
    vi.mocked(prisma.problemSession.findUnique).mockResolvedValue({
      studentId: "student-2",
      classroom: { schoolId: "school-1", teacherId: "teacher-1" },
    } as any);

    const session = makeSession(Role.STUDENT, "school-1", "student-1");
    await expect(assertSessionAccess(session, "session-1")).rejects.toThrow(
      "Not your session"
    );
  });

  it("allows a teacher to access a session in their classroom", async () => {
    vi.mocked(prisma.problemSession.findUnique).mockResolvedValue({
      studentId: "student-1",
      classroom: { schoolId: "school-1", teacherId: "teacher-1" },
    } as any);

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertSessionAccess(session, "session-1")).resolves.not.toThrow();
  });

  it("denies a teacher from accessing a session in another teacher's classroom", async () => {
    vi.mocked(prisma.problemSession.findUnique).mockResolvedValue({
      studentId: "student-1",
      classroom: { schoolId: "school-1", teacherId: "teacher-2" },
    } as any);

    const session = makeSession(Role.TEACHER, "school-1", "teacher-1");
    await expect(assertSessionAccess(session, "session-1")).rejects.toThrow(
      "Session not in your classroom"
    );
  });
});
