/**
 * POST /api/admin/retention
 *
 * Deletes images from S3 for sessions older than IMAGE_RETENTION_DAYS (default 180).
 * Designed to be called by a cron job (e.g., daily at 2am).
 * Secured with a pre-shared CRON_SECRET header.
 *
 * Does NOT delete session records — only the image files in storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFiles } from "@/lib/storage/s3";

const RETENTION_DAYS = parseInt(process.env.IMAGE_RETENTION_DAYS ?? "180", 10);
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  // Simple pre-shared secret auth for cron calls
  const authHeader = req.headers.get("x-cron-secret");
  if (CRON_SECRET && authHeader !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Find sessions with images older than retention cutoff
  const sessions = await prisma.problemSession.findMany({
    where: {
      createdAt: { lt: cutoff },
      imageKeys: { isEmpty: false },
    },
    select: { id: true, imageKeys: true },
    take: 500, // process in batches
  });

  if (sessions.length === 0) {
    return NextResponse.json({ deleted: 0, message: "Nothing to clean up." });
  }

  const allKeys = sessions.flatMap((s) => s.imageKeys);
  let deleted = 0;

  try {
    await deleteFiles(allKeys);
    deleted = allKeys.length;

    // Clear the imageKeys array — keep the session record
    await prisma.problemSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { imageKeys: [] },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Partial deletion failed", detail: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    deleted,
    sessions: sessions.length,
    message: `Deleted ${deleted} images from ${sessions.length} sessions.`,
  });
}
