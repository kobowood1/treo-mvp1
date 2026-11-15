/**
 * POST /api/sessions/[id]/respond
 *
 * Student submits a revised step after receiving hints.
 * Body: { stepIndex: number, latex: string }
 *
 * Flow:
 *  1. Update the step in the DB
 *  2. Re-verify from that step onward
 *  3. If now correct → generate praise → RESOLVED
 *  4. If still wrong → stay in COACHING (student can request more hints or re-respond)
 *  5. Log the response on the most recent HintEvent
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";
import { z } from "zod";
import { verifySteps } from "@/lib/math/verifier";
import { generatePraise } from "@/lib/ai/hints";

const respondSchema = z.object({
  stepIndex: z.number().int().positive(),
  latex: z.string().min(1),
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
    return NextResponse.json({ error: "Only students can submit responses" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { stepIndex, latex } = parsed.data;

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    include: {
      steps: { orderBy: { index: "asc" } },
      hints: { orderBy: { createdAt: "desc" }, take: 1 },
      skills: { include: { skill: true }, where: { isPrimary: true } },
    },
  });

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ps.status !== SessionStatus.COACHING) {
    return NextResponse.json(
      { error: "Session is not in coaching mode" },
      { status: 409 }
    );
  }
  if (!ps.problemLatex) {
    return NextResponse.json({ error: "No problem data" }, { status: 400 });
  }

  // 1. Update the student's revised step
  await prisma.sessionStep.upsert({
    where: { sessionId_index: { sessionId, index: stepIndex } },
    update: { latex, editedBy: "student", isCorrect: null },
    create: { sessionId, index: stepIndex, latex, editedBy: "student" },
  });

  // Log on the most recent hint event if there is one
  if (ps.hints[0]) {
    await prisma.hintEvent.update({
      where: { id: ps.hints[0].id },
      data: { studentResponse: latex, responseLatex: latex },
    });
  }

  // 2. Re-verify the full step sequence with the updated step
  const updatedSteps = ps.steps.map((s) =>
    s.index === stepIndex ? { index: s.index, latex } : { index: s.index, latex: s.latex }
  );

  let newFirstError: number | null = null;
  let finalCorrect = false;
  let verified = false;

  try {
    const verifyResult = await verifySteps({
      problem: ps.problemLatex,
      steps: updatedSteps,
    });

    newFirstError = verifyResult.firstErrorIndex;
    finalCorrect = verifyResult.finalAnswerCorrect;
    verified = true;

    // Persist updated correctness
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
          firstErrorStepIndex: newFirstError,
          finalAnswerCorrect: finalCorrect,
          verificationJson: verifyResult as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    });
  } catch {
    // Math service down — continue without re-verification
  }

  // 3. If now correct → praise → RESOLVED
  let praise: string | null = null;
  let challengeProblem: string | null = null;

  if (verified && finalCorrect) {
    // Mark hint as resolved
    if (ps.hints[0]) {
      await prisma.hintEvent.update({
        where: { id: ps.hints[0].id },
        data: { resolvedAt: new Date() },
      });
    }

    try {
      const primarySkill = ps.skills[0]?.skill.name ?? "Algebra";
      const praiseResult = await generatePraise({
        problem: ps.problemLatex,
        steps: updatedSteps,
        primarySkill,
      });
      praise = praiseResult.praise;
      challengeProblem = praiseResult.challengeProblem ?? null;
    } catch {
      praise = "Great job! You got it right!";
    }

    await prisma.problemSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  return NextResponse.json({
    sessionId,
    resolved: finalCorrect,
    firstErrorIndex: newFirstError,
    finalAnswerCorrect: finalCorrect,
    praise,
    challengeProblem,
    verified,
  });
}
