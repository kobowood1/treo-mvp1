/**
 * POST /api/schools — create a school + first admin user
 * Public endpoint (used during initial onboarding only)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";

const createSchoolSchema = z.object({
  schoolName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  adminName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { schoolName, adminEmail, adminPassword, adminName } = parsed.data;

  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Check uniqueness
  const existing = await prisma.school.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: "A school with that name already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await hash(adminPassword, 12);

  const school = await prisma.school.create({
    data: {
      name: schoolName,
      slug,
      users: {
        create: {
          role: Role.SCHOOL_ADMIN,
          email: adminEmail,
          passwordHash,
          displayName: adminName,
        },
      },
    },
    include: { users: { select: { id: true, email: true, role: true } } },
  });

  return NextResponse.json(
    { schoolId: school.id, slug: school.slug },
    { status: 201 }
  );
}
