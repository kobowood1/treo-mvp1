/**
 * GET /api/admin/teachers  — list all teachers in the school
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await auth();
  try {
    requireRole(session, Role.SCHOOL_ADMIN);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const teachers = await prisma.user.findMany({
    where: { schoolId: session!.user.schoolId, role: Role.TEACHER },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      _count: { select: { classrooms: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const pendingInvites = await prisma.invitation.findMany({
    where: {
      schoolId: session!.user.schoolId,
      role: Role.TEACHER,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, email: true, createdAt: true, expiresAt: true },
  });

  return NextResponse.json({ teachers, pendingInvites });
}
