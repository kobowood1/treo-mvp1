/**
 * POST /api/sessions/[id]/verify
 *
 * Calls the math verification service on the confirmed session steps,
 * records the first error index and per-step correctness,
 * and advances the session status to COACHING (or RESOLVED if all correct).
 *
 * Called automatically after the student confirms transcription.
 * Can also be called manually (e.g., after a student submits a revised step).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";
import { verifySteps } from "@/lib/math/verifier";

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

  // Only students and teachers can trigger verification
  if (
    session!.user.role !== Role.STUDENT &&
    session!.user.role !== Role.TEACHER
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    include: { steps: { orderBy: { index: "asc" } } },
  });

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Allow re-verification when status is VERIFIED or COACHING
  if (
    ps.status !== SessionStatus.VERIFIED &&
    ps.status !== SessionStatus.COACHING
  ) {
    return NextResponse.json(
      { error: `Cannot verify a session in status: ${ps.status}` },
      { status: 409 }
    );
  }

  if (!ps.problemLatex) {
    return NextResponse.json(
      { error: "No problem LaTeX — confirm transcription first" },
      { status: 400 }
    );
  }

  if (ps.steps.length === 0) {
    return NextResponse.json(
      { error: "No steps to verify" },
      { status: 400 }
    );
  }

  // Call the math service
  let verifyResult;
  try {
    verifyResult = await verifySteps({
      problem: ps.problemLatex,
      steps: ps.steps.map(({ index, latex }) => ({ index, latex })),
    });
  } catch (err) {
    // Math service unreachable — return a friendly error but don't crash
    return NextResponse.json(
      {
        error:
          "The math checker is temporarily unavailable. Please try again in a moment.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }

  // Persist per-step correctness
  await prisma.$transaction(async (tx) => {
    for (const stepResult of verifyResult.steps) {
      await tx.sessionStep.updateMany({
        where: { sessionId, index: stepResult.index },
        data: { isCorrect: stepResult.isCorrect },
      });
    }

    // Determine new status
    const newStatus = verifyResult.finalAnswerCorrect
      ? SessionStatus.COACHING // will be set to RESOLVED after praise
      : SessionStatus.COACHING;

    await tx.problemSession.update({
      where: { id: sessionId },
      data: {
        firstErrorStepIndex: verifyResult.firstErrorIndex,
        finalAnswerCorrect: verifyResult.finalAnswerCorrect,
        verificationJson: verifyResult as unknown as import("@prisma/client").Prisma.InputJsonValue,
        status: newStatus,
      },
    });
  });

  return NextResponse.json({
    sessionId,
    firstErrorIndex: verifyResult.firstErrorIndex,
    finalAnswerCorrect: verifyResult.finalAnswerCorrect,
    steps: verifyResult.steps,
  });
}
