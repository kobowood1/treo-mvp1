/**
 * POST /api/sessions/[id]/confirm
 *
 * Student confirms (or edits) the transcribed steps before verification.
 * Body: { steps: [{ index: number, latex: string }] }
 *
 * Flow (all in one request):
 *  1. Save edited steps → status VERIFIED
 *  2. Call math service → record per-step correctness + firstErrorIndex
 *  3. If there's an error → call LLM diagnosis → record errorType + skills
 *  4. Return { sessionId, finalAnswerCorrect, firstErrorIndex, verified: true }
 *
 * If the math service is down, we still advance to COACHING so the student
 * isn't blocked — coaching will use the unverified steps gracefully.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";
import { z } from "zod";
import { verifySteps } from "@/lib/math/verifier";
import { diagnoseSession } from "@/lib/ai/diagnosis";

const confirmSchema = z.object({
  steps: z.array(
    z.object({
      index: z.number().int().positive(),
      latex: z.string().min(1),
    })
  ),
});

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

  if (session!.user.role !== Role.STUDENT) {
    return NextResponse.json(
      { error: "Only students can confirm transcriptions" },
      { status: 403 }
    );
  }

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    select: { status: true, studentId: true, problemLatex: true },
  });

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ps.status !== SessionStatus.PENDING_CONFIRMATION) {
    return NextResponse.json(
      { error: "Session is not awaiting confirmation" },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { steps } = parsed.data;

  // ── 1. Save edited steps ──────────────────────────────────────────────────

  await prisma.$transaction(async (tx) => {
    for (const step of steps) {
      await tx.sessionStep.upsert({
        where: { sessionId_index: { sessionId, index: step.index } },
        update: { latex: step.latex, editedBy: "student" },
        create: {
          sessionId,
          index: step.index,
          latex: step.latex,
          editedBy: "student",
        },
      });
    }
    await tx.problemSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.VERIFIED },
    });
  });

  // ── 2. Math verification ──────────────────────────────────────────────────

  let firstErrorIndex: number | null = null;
  let finalAnswerCorrect = false;
  let verificationSucceeded = false;

  if (ps.problemLatex && steps.length > 0) {
    try {
      const verifyResult = await verifySteps({
        problem: ps.problemLatex,
        steps: steps.map(({ index, latex }) => ({ index, latex })),
      });

      firstErrorIndex = verifyResult.firstErrorIndex;
      finalAnswerCorrect = verifyResult.finalAnswerCorrect;
      verificationSucceeded = true;

      // Persist per-step correctness
      await prisma.$transaction(async (tx) => {
        for (const sr of verifyResult.steps) {
          await tx.sessionStep.updateMany({
            where: { sessionId, index: sr.index },
            data: { isCorrect: sr.isCorrect },
          });
        }
        await tx.problemSession.update({
          where: { id: sessionId },
          data: {
            firstErrorStepIndex: firstErrorIndex,
            finalAnswerCorrect,
            verificationJson: verifyResult as unknown as import("@prisma/client").Prisma.InputJsonValue,
            status: SessionStatus.COACHING,
          },
        });
      });
    } catch {
      // Math service down — advance to COACHING anyway so student isn't blocked
      await prisma.problemSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.COACHING },
      });
    }
  } else {
    await prisma.problemSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.COACHING },
    });
  }

  // ── 3. LLM diagnosis (only when there's an error) ─────────────────────────

  let primarySkill: string | null = null;
  let errorType: string | null = null;

  if (verificationSucceeded && firstErrorIndex != null && ps.problemLatex) {
    const stepsWithCorrectness = steps.map(({ index, latex }) => {
      const verifiedStep = steps.find((s) => s.index === index);
      // isCorrect = true if index is before the first error
      const isCorrect = firstErrorIndex == null || index < firstErrorIndex;
      return { index: verifiedStep?.index ?? index, latex, isCorrect };
    });

    try {
      const diagnosis = await diagnoseSession({
        problem: ps.problemLatex,
        steps: stepsWithCorrectness,
        firstErrorIndex,
      });

      primarySkill = diagnosis.primarySkill;
      errorType = diagnosis.errorType;

      // Resolve / create skill tags and link to session
      const allSkills = [diagnosis.primarySkill, ...diagnosis.additionalSkills].filter(Boolean);
      const skillIds: string[] = [];

      for (const skillName of allSkills) {
        const tag = await prisma.skillTag.upsert({
          where: { name_schoolId: { name: skillName, schoolId: null as unknown as string } },
          update: {},
          create: { name: skillName, isGlobal: true, sortOrder: 0 },
        });
        skillIds.push(tag.id);
      }

      await prisma.$transaction(async (tx) => {
        await tx.problemSession.update({
          where: { id: sessionId },
          data: {
            errorType: diagnosis.errorType,
            diagnosisNote: diagnosis.diagnosisNote,
          },
        });
        for (let i = 0; i < skillIds.length; i++) {
          await tx.sessionSkill.upsert({
            where: { sessionId_skillId: { sessionId, skillId: skillIds[i] } },
            update: {},
            create: { sessionId, skillId: skillIds[i], isPrimary: i === 0 },
          });
        }
      });
    } catch {
      // Diagnosis failed — coaching will proceed without it
    }
  }

  return NextResponse.json({
    sessionId,
    status: SessionStatus.COACHING,
    verified: verificationSucceeded,
    finalAnswerCorrect,
    firstErrorIndex,
    primarySkill,
    errorType,
  });
}
