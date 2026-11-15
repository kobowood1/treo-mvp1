/**
 * GET /api/teacher/students/[id]/profile
 *
 * Full student profile for a teacher:
 *  - Strengths (top skills by mastery)
 *  - Growth areas (weakest skills with >= 1 session)
 *  - Recurring errors
 *  - Mastery per skill over time (trend)
 *  - All sessions (summary)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertStudentAccess, AuthorizationError } from "@/lib/auth-helpers";
import { estimateMastery, masteryBand } from "@/lib/analytics/mastery";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params;
  const session = await auth();

  try {
    await assertStudentAccess(session, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, firstName: true, lastInitial: true, displayName: true },
  });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allSessions = await prisma.problemSession.findMany({
    where: { studentId },
    include: {
      hints: { select: { id: true } },
      skills: { include: { skill: true } },
      override: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const allSkills = await prisma.skillTag.findMany({
    where: { isGlobal: true },
    orderBy: { sortOrder: "asc" },
  });

  // Per-skill mastery
  const skillMasteries = allSkills.map((skill) => {
    const sessionsForSkill = allSessions.filter((s) =>
      s.skills.some((sk) => sk.skillId === skill.id)
    );

    if (sessionsForSkill.length === 0) {
      return { skill, score: null, band: "no-data", sessionCount: 0 };
    }

    const records = sessionsForSkill.map((s) => ({
      finalAnswerCorrect: s.override?.isCorrect ?? s.finalAnswerCorrect,
      hintsUsed: s.hints.length,
      createdAt: s.createdAt,
    }));

    const score = estimateMastery(records);
    return { skill, score, band: masteryBand(score), sessionCount: sessionsForSkill.length };
  });

  const withData = skillMasteries.filter((sm) => sm.score !== null) as Array<
    typeof skillMasteries[number] & { score: number }
  >;

  const strengths = [...withData]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const growthAreas = [...withData]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  // Recurring errors
  const errorCounts: Record<string, number> = {};
  for (const s of allSessions) {
    const et = s.override?.errorType ?? s.errorType;
    if (et) errorCounts[et] = (errorCounts[et] ?? 0) + 1;
  }
  const recurringErrors = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  // Session summary list
  const sessionSummaries = allSessions
    .slice()
    .reverse()
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      status: s.status,
      finalAnswerCorrect: s.override?.isCorrect ?? s.finalAnswerCorrect,
      hintsUsed: s.hints.length,
      errorType: s.override?.errorType ?? s.errorType,
      skills: s.skills.map((sk) => sk.skill.name),
    }));

  // Weekly activity trend (last 8 weeks)
  const weeklyActivity: Array<{ week: string; sessions: number }> = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(Date.now() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000);
    const count = allSessions.filter(
      (s) => s.createdAt >= start && s.createdAt < end
    ).length;
    weeklyActivity.push({
      week: start.toISOString().slice(0, 10),
      sessions: count,
    });
  }

  return NextResponse.json({
    student,
    skillMasteries: skillMasteries.map(({ skill, score, band, sessionCount }) => ({
      skillId: skill.id,
      skillName: skill.name,
      score,
      band,
      sessionCount,
    })),
    strengths: strengths.map(({ skill, score, band }) => ({
      skillName: skill.name,
      score,
      band,
    })),
    growthAreas: growthAreas.map(({ skill, score, band }) => ({
      skillName: skill.name,
      score,
      band,
    })),
    recurringErrors,
    sessions: sessionSummaries,
    weeklyActivity,
  });
}
