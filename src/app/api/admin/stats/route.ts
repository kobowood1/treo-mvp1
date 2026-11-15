/**
 * GET /api/admin/stats
 * School-level aggregate stats for the school admin.
 * No individual student data — only aggregate counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  try {
    requireRole(session, Role.SCHOOL_ADMIN);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;
  const schoolId = s.user.schoolId;
  const oneWeekAgo = new Date(Date.now() - WEEK_MS);

  const [
    teacherCount,
    studentCount,
    classroomCount,
    totalSessions,
    weeklySessions,
    classrooms,
  ] = await Promise.all([
    prisma.user.count({ where: { schoolId, role: Role.TEACHER } }),
    prisma.user.count({ where: { schoolId, role: Role.STUDENT } }),
    prisma.classroom.count({ where: { schoolId } }),
    prisma.problemSession.count({ where: { classroom: { schoolId } } }),
    prisma.problemSession.count({
      where: { classroom: { schoolId }, createdAt: { gte: oneWeekAgo } },
    }),
    prisma.classroom.findMany({
      where: { schoolId },
      include: {
        teacher: { select: { displayName: true, email: true } },
        _count: { select: { enrollments: true, sessions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Top struggling skills school-wide (skills with lowest average mastery this week)
  const recentSessions = await prisma.problemSession.findMany({
    where: {
      classroom: { schoolId },
      createdAt: { gte: oneWeekAgo },
    },
    include: {
      skills: { include: { skill: true } },
      override: true,
    },
  });

  const skillErrors: Record<string, { name: string; errors: number; total: number }> = {};
  for (const ps of recentSessions) {
    const isCorrect = ps.override?.isCorrect ?? ps.finalAnswerCorrect;
    for (const sk of ps.skills) {
      const key = sk.skillId;
      if (!skillErrors[key]) {
        skillErrors[key] = { name: sk.skill.name, errors: 0, total: 0 };
      }
      skillErrors[key].total++;
      if (!isCorrect) skillErrors[key].errors++;
    }
  }

  const strugglingSkills = Object.values(skillErrors)
    .filter((s) => s.total >= 3)
    .map((s) => ({ name: s.name, errorRate: s.errors / s.total, total: s.total }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 5);

  return NextResponse.json({
    teacherCount,
    studentCount,
    classroomCount,
    totalSessions,
    weeklySessions,
    classrooms: classrooms.map((c) => ({
      id: c.id,
      name: c.name,
      teacherName: c.teacher.displayName ?? c.teacher.email,
      studentCount: c._count.enrollments,
      sessionCount: c._count.sessions,
    })),
    strugglingSkills,
  });
}
