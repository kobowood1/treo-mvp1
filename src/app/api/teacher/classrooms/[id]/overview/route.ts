/**
 * GET /api/teacher/classrooms/[id]/overview
 *
 * Returns:
 *  - students array with per-skill mastery scores (heatmap data)
 *  - top error types this week
 *  - "needs attention" students (repeated errors, high hint usage, inactive)
 *
 * Teacher must own the classroom or be school admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClassroomAccess, AuthorizationError } from "@/lib/auth-helpers";
import { estimateMastery, masteryBand } from "@/lib/analytics/mastery";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

  const oneWeekAgo = new Date(Date.now() - WEEK_MS);

  // Load all enrolled students with their sessions
  const enrollments = await prisma.enrollment.findMany({
    where: { classroomId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastInitial: true,
          displayName: true,
        },
      },
    },
  });

  // Load all sessions for this classroom
  const sessions = await prisma.problemSession.findMany({
    where: { classroomId },
    include: {
      hints: { select: { id: true } },
      skills: { include: { skill: true } },
      override: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Gather all global skill tags (the fixed 12)
  const allSkills = await prisma.skillTag.findMany({
    where: { isGlobal: true },
    orderBy: { sortOrder: "asc" },
  });

  // Build per-student mastery per skill
  const studentMastery = enrollments.map((e) => {
    const studentSessions = sessions.filter((s) => s.studentId === e.student.id);

    const skillMastery: Record<string, { score: number; band: string; sessions: number }> = {};

    for (const skill of allSkills) {
      const sessionsForSkill = studentSessions.filter((s) =>
        s.skills.some((sk) => sk.skillId === skill.id)
      );

      if (sessionsForSkill.length === 0) {
        skillMastery[skill.id] = { score: -1, band: "no-data", sessions: 0 };
        continue;
      }

      const records = sessionsForSkill.map((s) => {
        const effectiveCorrect =
          s.override?.isCorrect ?? s.finalAnswerCorrect;
        return {
          finalAnswerCorrect: effectiveCorrect,
          hintsUsed: s.hints.length,
          createdAt: s.createdAt,
        };
      });

      const score = estimateMastery(records);
      skillMastery[skill.id] = {
        score,
        band: masteryBand(score),
        sessions: sessionsForSkill.length,
      };
    }

    // Needs attention signals
    const recentSessions = studentSessions.filter(
      (s) => s.createdAt >= oneWeekAgo
    );
    const recentErrors = recentSessions.filter(
      (s) => (s.override?.isCorrect ?? s.finalAnswerCorrect) === false
    ).length;
    const avgHints =
      recentSessions.length > 0
        ? recentSessions.reduce((sum, s) => sum + s.hints.length, 0) /
          recentSessions.length
        : 0;
    const inactive = recentSessions.length === 0;

    return {
      student: e.student,
      skillMastery,
      recentSessions: recentSessions.length,
      recentErrors,
      avgHints: Math.round(avgHints * 10) / 10,
      needsAttention: recentErrors >= 3 || avgHints >= 2.5 || inactive,
    };
  });

  // Top error types this week
  const recentSessions = sessions.filter((s) => s.createdAt >= oneWeekAgo);
  const errorCounts: Record<string, number> = {};
  for (const s of recentSessions) {
    const et = s.override?.errorType ?? s.errorType;
    if (et) errorCounts[et] = (errorCounts[et] ?? 0) + 1;
  }
  const topErrors = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  return NextResponse.json({
    classroomId,
    skills: allSkills.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
    students: studentMastery,
    topErrors,
    totalSessions: sessions.length,
    weeklySessions: recentSessions.length,
  });
}
