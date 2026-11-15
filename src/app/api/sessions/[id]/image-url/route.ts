/**
 * GET /api/sessions/[id]/image-url?index=1
 * Returns a short-lived signed URL for one of the session's images.
 * Access-controlled: only the owning student, their teacher, or admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionAccess, AuthorizationError } from "@/lib/auth-helpers";
import { getSignedReadUrl } from "@/lib/storage/s3";

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

  const ps = await prisma.problemSession.findUnique({
    where: { id: sessionId },
    select: { imageKeys: true },
  });
  if (!ps) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const indexParam = req.nextUrl.searchParams.get("index");
  const index = indexParam ? parseInt(indexParam, 10) - 1 : 0; // 1-based → 0-based

  if (index < 0 || index >= ps.imageKeys.length) {
    return NextResponse.json({ error: "Image index out of range" }, { status: 400 });
  }

  const url = await getSignedReadUrl(ps.imageKeys[index]);
  return NextResponse.json({ url, expiresIn: process.env.STORAGE_URL_EXPIRY_SECONDS ?? 3600 });
}
