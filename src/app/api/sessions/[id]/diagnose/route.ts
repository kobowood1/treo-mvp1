/**
 * POST /api/sessions/[id]/diagnose
 *
 * Runs LLM diagnosis on an already-verified session:
 *   - Labels the primary skill and up to 2 additional skills
 *   - Labels the error type
 *   - Writes an internal diagnosis note for the teacher
 *   - Creates/links SkillTag records on the session
 *
 * Called automatically after verification when there is an error.
 * Safe to call again (idempotent — updates existing records).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";
import { diagnoseSession } from "@/lib/ai/diagnosis";
import { checkRateLimit } from "@/lib/rate-limit";

const AI_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_AI_RPM ?? "20", 10);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const session = await auth();

  try {
    await assertSessionAccess(session, sessionId);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  if (
    session!.user.role !== Role.STUDENT &&
    session!.user.role !== Role.TEACHER
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit AI calls
  const { allowed } = checkRateLimit(`diagnose:${session!.user.id}`, AI_LIMIT_RPM);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    include: { steps: { orderBy: { index: "asc" } } },
  });

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ps.status !== SessionStatus.COACHING) {
    return NextResponse.json(
      { error: `Cannot diagnose a session in status: ${ps.status}` },
      { status: 409 }
    );
  }

  if (ps.firstErrorStepIndex == null) {
    // No error — nothing to diagnose
    return NextResponse.json({
      sessionId,
      diagnosed: false,
      reason: "No error found in this session",
    });
  }

  if (!ps.problemLatex) {
    return NextResponse.json(
      { error: "No problem LaTeX available" },
      { status: 400 }
    );
  }

  // Build steps with isCorrect for the LLM
  const stepsForDiagnosis = ps.steps.map((s) => ({
    index: s.index,
    latex: s.latex,
    isCorrect: s.isCorrect ?? false,
  }));

  let diagnosisResult;
  try {
    diagnosisResult = await diagnoseSession({
      problem: ps.problemLatex,
      steps: stepsForDiagnosis,
      firstErrorIndex: ps.firstErrorStepIndex,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "AI diagnosis temporarily unavailable. Please try again.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }

  // Resolve skill tag IDs (create global tags if missing)
  const allSkills = [
    diagnosisResult.primarySkill,
    ...diagnosisResult.additionalSkills,
  ].filter(Boolean);

  const skillIds: string[] = [];
  for (const skillName of allSkills) {
    // Look for a global tag first, then school-scoped
    const tag = await prisma.skillTag.upsert({
      where: {
        name_schoolId: { name: skillName, schoolId: null as unknown as string },
      },
      update: {},
      create: {
        name: skillName,
        isGlobal: true,
        sortOrder: 0,
      },
    });
    skillIds.push(tag.id);
  }

  // Persist diagnosis
  await prisma.$transaction(async (tx) => {
    await tx.problemSession.update({
      where: { id: sessionId },
      data: {
        errorType: diagnosisResult.errorType,
        diagnosisNote: diagnosisResult.diagnosisNote,
      },
    });

    // Upsert session skill links
    for (let i = 0; i < skillIds.length; i++) {
      await tx.sessionSkill.upsert({
        where: { sessionId_skillId: { sessionId, skillId: skillIds[i] } },
        update: {},
        create: {
          sessionId,
          skillId: skillIds[i],
          isPrimary: i === 0,
        },
      });
    }
  });

  return NextResponse.json({
    sessionId,
    diagnosed: true,
    primarySkill: diagnosisResult.primarySkill,
    additionalSkills: diagnosisResult.additionalSkills,
    errorType: diagnosisResult.errorType,
    // Note: diagnosisNote is NOT returned to students — only accessible via GET /api/sessions/[id] for teachers
  });
}
