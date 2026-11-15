/**
 * POST /api/parent-links — link a parent to a student (teacher or admin only)
 * GET  /api/parent-links — list parent links (teacher sees their students'; parent sees their own)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import { z } from "zod";

const linkSchema = z.object({
  parentId: z.string(),
  studentId: z.string(),
  consentGiven: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  try {
    requireRole(session, Role.TEACHER, Role.SCHOOL_ADMIN);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const s = session!;
  const { parentId, studentId, consentGiven } = parsed.data;

  // Verify parent is in same school
  const parent = await prisma.user.findFirst({
    where: { id: parentId, schoolId: s.user.schoolId, role: Role.PARENT },
  });
  if (!parent) {
    return NextResponse.json(
      { error: "Parent not found in your school" },
      { status: 404 }
    );
  }

  // Verify student is in teacher's class (or same school for admin)
  const student = await prisma.user.findFirst({
    where: { id: studentId, schoolId: s.user.schoolId, role: Role.STUDENT },
    include: {
      enrollments: {
        include: { classroom: { select: { teacherId: true } } },
      },
    },
  });
  if (!student) {
    return NextResponse.json(
      { error: "Student not found in your school" },
      { status: 404 }
    );
  }

  if (s.user.role === Role.TEACHER) {
    const inMyClass = student.enrollments.some(
      (e) => e.classroom.teacherId === s.user.id
    );
    if (!inMyClass) {
      return NextResponse.json(
        { error: "Student not in your classroom" },
        { status: 403 }
      );
    }
  }

  const link = await prisma.parentLink.upsert({
    where: { parentId_studentId: { parentId, studentId } },
    create: {
      parentId,
      studentId,
      consentGiven,
      consentAt: consentGiven ? new Date() : null,
    },
    update: {
      consentGiven,
      consentAt: consentGiven ? new Date() : undefined,
    },
  });

  return NextResponse.json(link, { status: 201 });
}

export async function GET() {
  const session = await auth();
  try {
    requireRole(
      session,
      Role.TEACHER,
      Role.SCHOOL_ADMIN,
      Role.PARENT
    );
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;

  if (s.user.role === Role.PARENT) {
    const links = await prisma.parentLink.findMany({
      where: { parentId: s.user.id },
      include: {
        student: {
          select: { id: true, firstName: true, lastInitial: true, displayName: true },
        },
      },
    });
    return NextResponse.json(links);
  }

  // Teacher: see links for students in their classrooms
  const where =
    s.user.role === Role.TEACHER
      ? {
          student: {
            enrollments: {
              some: { classroom: { teacherId: s.user.id } },
            },
          },
        }
      : { student: { schoolId: s.user.schoolId } };

  const links = await prisma.parentLink.findMany({
    where,
    include: {
      parent: { select: { id: true, email: true, displayName: true } },
      student: {
        select: { id: true, firstName: true, lastInitial: true, displayName: true },
      },
    },
  });

  return NextResponse.json(links);
}
