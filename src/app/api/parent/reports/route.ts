/**
 * GET  /api/parent/reports         — list all reports for the parent's linked students
 * POST /api/parent/reports/generate — generate on-demand for the current week
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await auth();
  try {
    requireRole(session, Role.PARENT);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;

  // Only return reports for students the parent is linked to with consent
  const links = await prisma.parentLink.findMany({
    where: { parentId: s.user.id, consentGiven: true },
    select: { studentId: true, student: { select: { firstName: true, lastInitial: true } } },
  });

  const studentIds = links.map((l) => l.studentId);

  const reports = await prisma.weeklyParentReport.findMany({
    where: { parentId: s.user.id, studentId: { in: studentIds } },
    orderBy: [{ studentId: "asc" }, { weekStartDate: "desc" }],
  });

  // Mark as viewed
  const unviewed = reports.filter((r) => !r.viewedAt).map((r) => r.id);
  if (unviewed.length > 0) {
    await prisma.weeklyParentReport.updateMany({
      where: { id: { in: unviewed } },
      data: { viewedAt: new Date() },
    });
  }

  return NextResponse.json({ reports, students: links.map((l) => ({ id: l.studentId, ...l.student })) });
}
