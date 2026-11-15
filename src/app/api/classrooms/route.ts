/**
 * GET  /api/classrooms        — list classrooms for the authed teacher (or all for admin)
 * POST /api/classrooms        — create a classroom (teacher or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSameSchool, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import { z } from "zod";
import { randomBytes } from "crypto";

const createClassSchema = z.object({
  name: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  try {
    requireRole(session, Role.TEACHER, Role.SCHOOL_ADMIN);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;
  const where =
    s.user.role === Role.TEACHER
      ? { teacherId: s.user.id, schoolId: s.user.schoolId }
      : { schoolId: s.user.schoolId };

  const classrooms = await prisma.classroom.findMany({
    where,
    include: {
      teacher: { select: { displayName: true, email: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(classrooms);
}

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
  const parsed = createClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const s = session!;

  // Generate a unique 6-char alphanumeric join code
  const joinCode = randomBytes(3).toString("hex").toUpperCase();

  const classroom = await prisma.classroom.create({
    data: {
      name: parsed.data.name,
      joinCode,
      schoolId: s.user.schoolId,
      teacherId: s.user.id,
    },
  });

  return NextResponse.json(classroom, { status: 201 });
}
