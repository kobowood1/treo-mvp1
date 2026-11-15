/**
 * POST /api/upload
 *
 * Accepts 1–3 image files (multipart/form-data), fields:
 *   images[]    — the image files (JPEG/PNG/HEIC, max 10MB each)
 *   classroomId — the student's classroom
 *   workStatus  — "complete" | "stuck"
 *
 * Flow:
 *  1. Validate auth (student only)
 *  2. Rate-limit check
 *  3. Store images in S3
 *  4. Create ProblemSession record (PENDING_EXTRACTION)
 *  5. Fetch image buffers, call LLM extraction
 *  6. Update session with extraction result (PENDING_CONFIRMATION)
 *  7. Return session id
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthorizationError } from "@/lib/auth-helpers";
import { Role, SessionStatus } from "@prisma/client";
import { uploadFile, sessionImageKey } from "@/lib/storage/s3";
import { extractFromImages } from "@/lib/ai/extraction";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
const UPLOAD_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_UPLOAD_RPM ?? "10", 10);

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
  };
  return map[mime] ?? "jpg";
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  try {
    requireRole(session, Role.STUDENT);
  } catch (e) {
    if (e instanceof AuthorizationError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const s = session!;

  // 2. Rate limit
  const { allowed } = checkRateLimit(`upload:${s.user.id}`, UPLOAD_LIMIT_RPM);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a minute." },
      { status: 429 }
    );
  }

  // 3. Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const classroomId = formData.get("classroomId") as string | null;
  const workStatus = (formData.get("workStatus") as string | null) ?? "complete";

  if (!classroomId) {
    return NextResponse.json({ error: "classroomId is required" }, { status: 400 });
  }

  // Verify student is enrolled in this classroom
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_classroomId: { studentId: s.user.id, classroomId } },
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "Not enrolled in this classroom" },
      { status: 403 }
    );
  }

  // Collect image files
  const imageFiles = formData.getAll("images[]") as File[];
  if (imageFiles.length === 0 || imageFiles.length > 3) {
    return NextResponse.json(
      { error: "Please upload 1–3 images" },
      { status: 400 }
    );
  }

  // Validate each file
  for (const file of imageFiles) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Use JPEG, PNG, or HEIC.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${file.name}. Maximum is 10 MB.` },
        { status: 400 }
      );
    }
  }

  // 4. Create session record first (we need the id for the storage key)
  const problemSession = await prisma.problemSession.create({
    data: {
      studentId: s.user.id,
      classroomId,
      imageKeys: [],
      status: SessionStatus.PENDING_EXTRACTION,
      workStatus: workStatus === "stuck" ? "stuck" : "complete",
    },
  });

  // 5. Upload images to S3 and build image buffers for extraction
  const imageBuffers: Array<{ buffer: Buffer; mimeType: string }> = [];
  const imageKeys: string[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = extFromMime(file.type);
    const key = sessionImageKey({
      schoolId: s.user.schoolId,
      sessionId: problemSession.id,
      index: i + 1,
      ext,
    });

    await uploadFile({ key, buffer, contentType: file.type });
    imageKeys.push(key);
    imageBuffers.push({ buffer, mimeType: file.type });
  }

  // Update session with image keys
  await prisma.problemSession.update({
    where: { id: problemSession.id },
    data: { imageKeys },
  });

  // 6. Run LLM extraction
  let extractionResult;
  try {
    extractionResult = await extractFromImages(imageBuffers);
  } catch (err) {
    // Mark session as abandoned on extraction failure
    await prisma.problemSession.update({
      where: { id: problemSession.id },
      data: { status: SessionStatus.ABANDONED },
    });
    return NextResponse.json(
      {
        error: "Could not read the image. Please try again with a clearer photo.",
        sessionId: problemSession.id,
      },
      { status: 422 }
    );
  }

  if (!extractionResult.readable) {
    await prisma.problemSession.update({
      where: { id: problemSession.id },
      data: { status: SessionStatus.ABANDONED },
    });
    return NextResponse.json(
      {
        error:
          extractionResult.unreadableReason ??
          "The image doesn't appear to contain algebra work, or it's too blurry to read. Please try again.",
        sessionId: problemSession.id,
      },
      { status: 422 }
    );
  }

  // 7. Persist extraction result and create SessionSteps
  await prisma.$transaction(async (tx) => {
    await tx.problemSession.update({
      where: { id: problemSession.id },
      data: {
        status: SessionStatus.PENDING_CONFIRMATION,
        problemLatex: extractionResult.problem,
        extractionJson: extractionResult as unknown as import("@prisma/client").Prisma.InputJsonValue,
        overallConfidence: extractionResult.overallConfidence,
        aiLogOutput: JSON.stringify(extractionResult),
      },
    });

    // Create a step for each extracted step
    for (const step of extractionResult.steps) {
      await tx.sessionStep.create({
        data: {
          sessionId: problemSession.id,
          index: step.index,
          latex: step.latex,
          confidence: step.confidence,
        },
      });
    }
  });

  return NextResponse.json(
    {
      sessionId: problemSession.id,
      overallConfidence: extractionResult.overallConfidence,
      lowConfidence: extractionResult.overallConfidence < 0.7,
    },
    { status: 201 }
  );
}
