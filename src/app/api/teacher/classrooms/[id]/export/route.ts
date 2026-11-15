/**
 * GET /api/teacher/classrooms/[id]/export
 *
 * Exports a CSV of the class summary:
 *  Student Name, Username, Sessions, Correct, Hints Used, Top Skill, Weak Skill, Last Active
 *
 * Teacher must own the classroom.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClassroomAccess, AuthorizationError } from "@/lib/auth-helpers";
import { estimateMastery } from "@/lib/analytics/mastery";

function escapeCSV(val: string | number | null | undefined): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
          firstName: true,
          lastInitial: true,
          username: true,
        },
      },
    },
  });

  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { name: true },
  });

  const allSkills = await prisma.skillTag.findMany({
    where: { isGlobal: true },
    orderBy: { sortOrder: "asc" },
  });

  const rows: string[][] = [];
  const headers = [
    "Student Name",
    "Username",
    "Total Sessions",
    "Correct (no hints)",
    "Total Hints Used",
    "Top Skill",
    "Weakest Skill",
    "Last Active",
  ];
  rows.push(headers);

  for (const e of enrollments) {
    const sessions = await prisma.problemSession.findMany({
      where: { studentId: e.student.id, classroomId },
      include: {
        hints: { select: { id: true } },
        skills: { include: { skill: true } },
        override: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalSessions = sessions.length;
    const correctNoHints = sessions.filter(
      (s) =>
        (s.override?.isCorrect ?? s.finalAnswerCorrect) === true &&
        s.hints.length === 0
    ).length;
    const totalHints = sessions.reduce((sum, s) => sum + s.hints.length, 0);
    const lastActive =
      sessions.length > 0
        ? sessions[sessions.length - 1].createdAt.toISOString().slice(0, 10)
        : "never";

    // Top and weakest skill
    let topSkillName = "";
    let weakestSkillName = "";

    const skillScores = allSkills.map((skill) => {
      const sk = sessions.filter((s) =>
        s.skills.some((ss) => ss.skillId === skill.id)
      );
      if (sk.length === 0) return { name: skill.name, score: null };
      const score = estimateMastery(
        sk.map((s) => ({
          finalAnswerCorrect: s.override?.isCorrect ?? s.finalAnswerCorrect,
          hintsUsed: s.hints.length,
          createdAt: s.createdAt,
        }))
      );
      return { name: skill.name, score };
    });

    const withData = skillScores.filter((s) => s.score !== null) as Array<{
      name: string;
      score: number;
    }>;
    if (withData.length > 0) {
      const sorted = [...withData].sort((a, b) => b.score - a.score);
      topSkillName = sorted[0].name;
      weakestSkillName = sorted[sorted.length - 1].name;
    }

    rows.push([
      `${e.student.firstName ?? ""} ${e.student.lastInitial ?? ""}.`.trim(),
      e.student.username ?? "",
      String(totalSessions),
      String(correctNoHints),
      String(totalHints),
      topSkillName,
      weakestSkillName,
      lastActive,
    ]);
  }

  const csv = rows.map((row) => row.map(escapeCSV).join(",")).join("\r\n");
  const filename = `treo-${(classroom?.name ?? "class").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
