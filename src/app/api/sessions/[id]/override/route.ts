/**
 * POST /api/sessions/[id]/override
 *
 * Teacher overrides the AI diagnosis for a session:
 *  - errorType
 *  - skillTagIds
 *  - isCorrect
 *  - note
 *
 * Analytics use the override when present (the GET /api/sessions/[id] already does this).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { Role, ErrorType } from "@prisma/client";
import { z } from "zod";

const overrideSchema = z.object({
  errorType: z.nativeEnum(ErrorType).optional(),
  skillTagIds: z.array(z.string()).optional(),
  isCorrect: z.boolean().optional(),
  note: z.string().optional(),
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

  if (session!.user.role !== Role.TEACHER && session!.user.role !== Role.SCHOOL_ADMIN) {
    return NextResponse.json({ error: "Only teachers can override diagnoses" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { errorType, skillTagIds, isCorrect, note } = parsed.data;

  const override = await prisma.teacherOverride.upsert({
    where: { sessionId },
    update: {
      errorType: errorType ?? null,
      skillTagIds: skillTagIds ?? [],
      isCorrect: isCorrect ?? null,
      note: note ?? null,
      teacherId: session!.user.id,
    },
    create: {
      sessionId,
      teacherId: session!.user.id,
      errorType: errorType ?? null,
      skillTagIds: skillTagIds ?? [],
      isCorrect: isCorrect ?? null,
      note: note ?? null,
    },
  });

  return NextResponse.json(override);
}

export async function DELETE(
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

  if (session!.user.role !== Role.TEACHER && session!.user.role !== Role.SCHOOL_ADMIN) {
    return NextResponse.json({ error: "Only teachers can remove overrides" }, { status: 403 });
  }

  await prisma.teacherOverride.deleteMany({ where: { sessionId } });
  return NextResponse.json({ deleted: true });
}
