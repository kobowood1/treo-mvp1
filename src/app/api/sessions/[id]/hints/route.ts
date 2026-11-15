/**
 * GET /api/sessions/[id]/hints
 * Returns all hint events for a session, in order.
 * Accessible to the student (own session), teacher, and admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";

export async function GET(
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

  const hints = await prisma.hintEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      level: true,
      hintText: true,
      studentResponse: true,
      responseLatex: true,
      resolvedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ hints });
}
