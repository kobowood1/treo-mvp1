/**
 * POST /api/invitations — invite a teacher (by admin) or parent (by teacher)
 * GET  /api/invitations — list pending invitations (scoped to sender's school)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import { z } from "zod";
import { randomBytes } from "crypto";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([Role.TEACHER, Role.PARENT]),
  // For parent invitations: the studentId to link
  studentId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  try {
    requireRole(session, Role.SCHOOL_ADMIN, Role.TEACHER);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const s = session!;
  const { email, role, studentId } = parsed.data;

  // Admins can only invite teachers; teachers can only invite parents
  if (s.user.role === Role.SCHOOL_ADMIN && role !== Role.TEACHER) {
    return NextResponse.json(
      { error: "Admins can only invite teachers" },
      { status: 400 }
    );
  }
  if (s.user.role === Role.TEACHER && role !== Role.PARENT) {
    return NextResponse.json(
      { error: "Teachers can only invite parents" },
      { status: 400 }
    );
  }

  // For parent invitations, validate the studentId belongs to teacher's class
  if (role === Role.PARENT) {
    if (!studentId) {
      return NextResponse.json(
        { error: "studentId required for parent invitation" },
        { status: 400 }
      );
    }
    if (s.user.role === Role.TEACHER) {
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId,
          classroom: { teacherId: s.user.id },
        },
      });
      if (!enrollment) {
        return NextResponse.json(
          { error: "Student not in your classroom" },
          { status: 403 }
        );
      }
    }
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72); // 72 hours

  const invitation = await prisma.invitation.create({
    data: {
      schoolId: s.user.schoolId,
      invitedById: s.user.id,
      email,
      role,
      token,
      expiresAt,
    },
  });

  // In a real app: send invitation email here
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

  return NextResponse.json(
    { id: invitation.id, email, role, inviteUrl },
    { status: 201 }
  );
}

export async function GET() {
  const session = await auth();
  try {
    requireRole(session, Role.SCHOOL_ADMIN, Role.TEACHER);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;
  const invitations = await prisma.invitation.findMany({
    where: {
      schoolId: s.user.schoolId,
      ...(s.user.role === Role.TEACHER ? { invitedById: s.user.id } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invitations);
}
