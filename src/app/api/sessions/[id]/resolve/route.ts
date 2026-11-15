/**
 * POST /api/sessions/[id]/resolve
 *
 * Marks a session as RESOLVED when the student confirms they understand,
 * or when all steps were correct from the start (praise flow).
 *
 * Also handles the "all correct on first submission" path:
 * generates praise if it hasn't been generated yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";
import { generatePraise } from "@/lib/ai/hints";
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

  if (session!.user.role !== Role.STUDENT) {
    return NextResponse.json({ error: "Only students can resolve sessions" }, { status: 403 });
  }

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    include: {
      steps: { orderBy: { index: "asc" } },
      skills: { include: { skill: true }, where: { isPrimary: true } },
    },
  });

  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ps.status === SessionStatus.RESOLVED) {
    return NextResponse.json({ sessionId, alreadyResolved: true });
  }

  if (ps.status !== SessionStatus.COACHING) {
    return NextResponse.json(
      { error: `Cannot resolve a session in status: ${ps.status}` },
      { status: 409 }
    );
  }

  let praise: string | null = null;
  let challengeProblem: string | null = null;

  // Generate praise when all steps are correct
  if (ps.finalAnswerCorrect && ps.problemLatex) {
    const { allowed } = checkRateLimit(`praise:${session!.user.id}`, AI_LIMIT_RPM);

    if (allowed) {
      try {
        const primarySkill = ps.skills[0]?.skill.name ?? "Algebra";
        const praiseResult = await generatePraise({
          problem: ps.problemLatex,
          steps: ps.steps.map(({ index, latex }) => ({ index, latex })),
          primarySkill,
        });
        praise = praiseResult.praise;
        challengeProblem = praiseResult.challengeProblem ?? null;
      } catch {
        praise = "Great work! Everything looks correct!";
      }
    }
  }

  await prisma.problemSession.update({
    where: { id: sessionId },
    data: { status: SessionStatus.RESOLVED, resolvedAt: new Date() },
  });

  return NextResponse.json({
    sessionId,
    resolved: true,
    praise,
    challengeProblem,
  });
}
