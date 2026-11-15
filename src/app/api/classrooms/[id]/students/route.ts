/**
 * POST /api/classrooms/[id]/students — add a student to a classroom
 * GET  /api/classrooms/[id]/students — list students in a classroom
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClassroomAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

const addStudentSchema = z.object({
  firstName: z.string().min(1),
  lastInitial: z.string().length(1),
  username: z.string().min(2).max(30),
  pin: z.string().min(4).max(8),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;
  const session = await auth();

  try {
    await assertClassroomAccess(session, classroomId);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { classroomId },
    include: {
      student: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastInitial: true,
          displayName: true,
          createdAt: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json(enrollments.map((e) => e.student));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;
  const session = await auth();

  try {
    await assertClassroomAccess(session, classroomId);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { schoolId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = addStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { firstName, lastInitial, username, pin } = parsed.data;
  const pinHash = await hash(pin, 12);

  // Check username uniqueness in school
  const existing = await prisma.user.findFirst({
    where: { schoolId: classroom.schoolId, username },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Username already taken in this school" },
      { status: 409 }
    );
  }

  const student = await prisma.user.create({
    data: {
      role: Role.STUDENT,
      schoolId: classroom.schoolId,
      firstName,
      lastInitial,
      username,
      pinHash,
      displayName: `${firstName} ${lastInitial}.`,
      enrollments: {
        create: { classroomId },
      },
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastInitial: true,
      displayName: true,
    },
  });

  return NextResponse.json(student, { status: 201 });
}
