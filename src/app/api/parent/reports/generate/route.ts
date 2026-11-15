/**
 * POST /api/parent/reports/generate
 *
 * Generates (or refreshes) the current week's report for all of a parent's
 * linked students with consent. Safe to call multiple times in a week —
 * upserts on (parentId, studentId, weekStartDate).
 *
 * Also callable by a teacher for their student (to preview what the parent sees).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import { generateWeeklyReport, currentWeekStart } from "@/lib/reports/weeklyReport";
import { checkRateLimit } from "@/lib/rate-limit";

const AI_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_AI_RPM ?? "20", 10);

export async function POST(req: NextRequest) {
  const session = await auth();
  try {
    requireRole(session, Role.PARENT, Role.TEACHER);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;

  const { allowed } = checkRateLimit(`report-gen:${s.user.id}`, AI_LIMIT_RPM);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  const weekStart = currentWeekStart();

  // For parents: generate for all their linked + consented students
  // For teachers: optionally pass { studentId } in body to generate for a specific student
  let studentLinks: Array<{
    parentId: string;
    studentId: string;
    firstName: string;
  }> = [];

  if (s.user.role === Role.PARENT) {
    const links = await prisma.parentLink.findMany({
      where: { parentId: s.user.id, consentGiven: true },
      include: { student: { select: { firstName: true } } },
    });
    studentLinks = links.map((l) => ({
      parentId: s.user.id,
      studentId: l.studentId,
      firstName: l.student.firstName ?? "your child",
    }));
  } else {
    // Teacher preview: expects { studentId } in body
    const body = await req.json().catch(() => ({}));
    const { studentId } = body as { studentId?: string };
    if (!studentId) {
      return NextResponse.json({ error: "studentId required for teacher preview" }, { status: 400 });
    }
    // Verify teacher has access to this student
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, classroom: { teacherId: s.user.id } },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Student not in your classroom" }, { status: 403 });
    }
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { firstName: true },
    });
    // Use a "preview" parent link — find the actual parent
    const link = await prisma.parentLink.findFirst({
      where: { studentId, consentGiven: true },
    });
    if (link) {
      studentLinks = [{
        parentId: link.parentId,
        studentId,
        firstName: student?.firstName ?? "the student",
      }];
    }
  }

  if (studentLinks.length === 0) {
    return NextResponse.json({ generated: 0, message: "No linked students with consent found." });
  }

  const generated: string[] = [];

  for (const link of studentLinks) {
    try {
      const { content, activityCount } = await generateWeeklyReport({
        studentId: link.studentId,
        parentId: link.parentId,
        firstName: link.firstName,
        weekStartDate: weekStart,
      });

      await prisma.weeklyParentReport.upsert({
        where: {
          parentId_studentId_weekStartDate: {
            parentId: link.parentId,
            studentId: link.studentId,
            weekStartDate: weekStart,
          },
        },
        update: {
          goingWell: content.goingWell,
          workOn: content.workOn,
          helpAtHome: content.helpAtHome,
          activityCount,
          generatedAt: new Date(),
          viewedAt: null,
        },
        create: {
          parentId: link.parentId,
          studentId: link.studentId,
          weekStartDate: weekStart,
          goingWell: content.goingWell,
          workOn: content.workOn,
          helpAtHome: content.helpAtHome,
          activityCount,
        },
      });

      generated.push(link.studentId);
    } catch {
      // Skip this student if generation fails
    }
  }

  return NextResponse.json({ generated: generated.length, studentIds: generated });
}
