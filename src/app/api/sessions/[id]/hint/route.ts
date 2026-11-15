/**
 * POST /api/sessions/[id]/hint
 *
 * Generates the next hint in the 3-level ladder and logs a HintEvent.
 *
 * Rules:
 *  - Levels must be requested in order (1 → 2 → 3)
 *  - Cannot request level N until level N-1 has been given
 *  - Session must be in COACHING status
 *  - Never reveals the correct answer for the student's own problem
 *
 * Body: { level?: 1|2|3 }  (omit to auto-select next level)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus, HintLevel } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  generateHint1,
  generateHint2,
  generateHint3,
} from "@/lib/ai/hints";

const AI_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_AI_RPM ?? "20", 10);

const HINT_LEVEL_MAP: Record<number, HintLevel> = {
  1: HintLevel.LEVEL_1,
  2: HintLevel.LEVEL_2,
  3: HintLevel.LEVEL_3,
};

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
    return NextResponse.json({ error: "Only students can request hints" }, { status: 403 });
  }

  const { allowed } = checkRateLimit(`hint:${session!.user.id}`, AI_LIMIT_RPM);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  // Load session with hints already given
  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    include: {
      steps: { orderBy: { index: "asc" } },
      hints: { orderBy: { createdAt: "asc" } },
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

  if (ps.firstErrorStepIndex == null) {
    return NextResponse.json(
      { error: "No error found — no hints needed!" },
      { status: 400 }
    );
  }

  if (!ps.problemLatex) {
    return NextResponse.json({ error: "No problem data" }, { status: 400 });
  }

  // Determine which level to give next
  const hintsGiven = ps.hints.length;
  const nextLevel = hintsGiven + 1;

  if (nextLevel > 3) {
    return NextResponse.json(
      {
        error: "All three hints have been given.",
        allHintsUsed: true,
      },
      { status: 400 }
    );
  }

  // Find the error step
  const errorStep = ps.steps.find((s) => s.index === ps.firstErrorStepIndex);
  if (!errorStep) {
    return NextResponse.json({ error: "Error step not found" }, { status: 400 });
  }

  const errorType = ps.errorType ?? "OTHER";
  const primarySkill = ps.skills[0]?.skill.name ?? "Algebra";

  // Generate the hint
  let hintText: string;
  let workedExample: string | undefined;
  let followUp: string | undefined;

  try {
    if (nextLevel === 1) {
      const result = await generateHint1({
        problem: ps.problemLatex,
        errorStep: { index: errorStep.index, latex: errorStep.latex },
        errorType,
      });
      hintText = result.hint;
    } else if (nextLevel === 2) {
      const level1 = ps.hints[0]?.hintText ?? "";
      const result = await generateHint2({
        problem: ps.problemLatex,
        errorStep: { index: errorStep.index, latex: errorStep.latex },
        errorType,
        level1Hint: level1,
      });
      hintText = result.hint;
    } else {
      // Level 3 — worked example
      const result = await generateHint3({
        problem: ps.problemLatex,
        errorStep: { index: errorStep.index, latex: errorStep.latex },
        errorType,
        primarySkill,
      });
      hintText = result.workedExample;
      workedExample = result.workedExample;
      followUp = result.followUp;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not generate a hint right now. Please try again.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }

  // Log the hint event
  const hintEvent = await prisma.hintEvent.create({
    data: {
      sessionId,
      level: HINT_LEVEL_MAP[nextLevel],
      hintText,
    },
  });

  return NextResponse.json({
    hintId: hintEvent.id,
    level: nextLevel,
    hint: hintText,
    workedExample,
    followUp,
    hintsUsed: nextLevel,
    allHintsUsed: nextLevel === 3,
  });
}
