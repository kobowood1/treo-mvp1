/**
 * GET /api/sessions/[id] — get session details for the student/teacher
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  try {
    await assertSessionAccess(session, id);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const ps = await prisma.problemSession.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { index: "asc" } },
      skills: { include: { skill: true } },
      override: true,
    },
  });

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Never expose diagnosisNote to students
  const isStudent = session!.user.role === "STUDENT";

  return NextResponse.json({
    id: ps.id,
    status: ps.status,
    workStatus: ps.workStatus,
    problemLatex: ps.problemLatex,
    overallConfidence: ps.overallConfidence,
    firstErrorStepIndex: ps.firstErrorStepIndex,
    finalAnswerCorrect: ps.finalAnswerCorrect,
    errorType: ps.errorType,
    diagnosisNote: isStudent ? undefined : ps.diagnosisNote,
    steps: ps.steps,
    skills: ps.skills,
    override: isStudent ? undefined : ps.override,
    startedAt: ps.startedAt,
    resolvedAt: ps.resolvedAt,
  });
}
