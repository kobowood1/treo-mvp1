/**
 * GET  /api/invitations/[token] — get invitation details (for accept page)
 * POST /api/invitations/[token] — accept invitation, create account
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";

const acceptSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      school: { select: { name: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.acceptedAt) {
    return NextResponse.json(
      { error: "Invitation already used" },
      { status: 410 }
    );
  }
  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  }

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    schoolName: invitation.school.name,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invitation = await prisma.invitation.findUnique({
    where: { token },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.acceptedAt) {
    return NextResponse.json(
      { error: "Invitation already used" },
      { status: 410 }
    );
  }
  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  }

  const body = await req.json();
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, password } = parsed.data;
  const passwordHash = await hash(password, 12);

  // Create user and mark invitation as accepted
  const user = await prisma.user.create({
    data: {
      role: invitation.role,
      schoolId: invitation.schoolId,
      email: invitation.email,
      displayName: name,
      passwordHash,
    },
    select: { id: true, role: true, email: true },
  });

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  // If parent, create the parent link (needs studentId from invitation metadata)
  // The teacher who invited includes studentId in a separate step via /api/parent-links

  return NextResponse.json({ userId: user.id, role: user.role }, { status: 201 });
}
