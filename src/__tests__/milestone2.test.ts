/**
 * Tests for Milestone 2:
 *  - ExtractionResultSchema validation (valid + invalid cases)
 *  - Rate limiter logic
 *  - sessionImageKey format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExtractionResultSchema } from "@/lib/ai/extraction";
import { checkRateLimit } from "@/lib/rate-limit";
import { sessionImageKey } from "@/lib/storage/s3";

// ─── ExtractionResultSchema ───────────────────────────────────────────────────

describe("ExtractionResultSchema", () => {
  it("accepts a valid readable extraction", () => {
    const result = ExtractionResultSchema.safeParse({
      readable: true,
      problem: "2x + 3 = 7",
      steps: [
        { index: 1, latex: "2x = 4", confidence: 0.95 },
        { index: 2, latex: "x = 2", confidence: 0.98 },
      ],
      overallConfidence: 0.96,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an unreadable extraction", () => {
    const result = ExtractionResultSchema.safeParse({
      readable: false,
      unreadableReason: "Image is too blurry",
      problem: "",
      steps: [],
      overallConfidence: 0.1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.readable).toBe(false);
    }
  });

  it("rejects missing problem field", () => {
    const result = ExtractionResultSchema.safeParse({
      readable: true,
      steps: [],
      overallConfidence: 0.9,
      // problem is missing
    });
    expect(result.success).toBe(false);
  });

  it("rejects step with confidence out of range", () => {
    const result = ExtractionResultSchema.safeParse({
      readable: true,
      problem: "x = 1",
      steps: [{ index: 1, latex: "x = 1", confidence: 1.5 }], // > 1.0
      overallConfidence: 0.9,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative step index", () => {
    const result = ExtractionResultSchema.safeParse({
      readable: true,
      problem: "x = 1",
      steps: [{ index: -1, latex: "x = 1", confidence: 0.9 }],
      overallConfidence: 0.9,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Rate limiter ─────────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Clear module state by reimporting is complex; instead manipulate via the function
    // Reset is implicit: each test uses a unique identifier
  });

  it("allows requests under the limit", () => {
    const id = `test-user-${Math.random()}`;
    const r1 = checkRateLimit(id, 5);
    const r2 = checkRateLimit(id, 5);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(3);
  });

  it("blocks requests over the limit", () => {
    const id = `test-user-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(id, 5);
    const over = checkRateLimit(id, 5);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("allows exactly limit-many requests before blocking", () => {
    const id = `test-user-${Math.random()}`;
    const results = Array.from({ length: 5 }, () => checkRateLimit(id, 5));
    expect(results.every((r) => r.allowed)).toBe(true);
    const blocked = checkRateLimit(id, 5);
    expect(blocked.allowed).toBe(false);
  });

  it("different identifiers are independent", () => {
    const id1 = `user-a-${Math.random()}`;
    const id2 = `user-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(id1, 5);
    const r = checkRateLimit(id2, 5);
    expect(r.allowed).toBe(true);
  });
});

// ─── sessionImageKey ──────────────────────────────────────────────────────────

describe("sessionImageKey", () => {
  it("generates correct key format", () => {
    const key = sessionImageKey({
      schoolId: "school-1",
      sessionId: "session-abc",
      index: 2,
      ext: "jpg",
    });
    expect(key).toBe("schools/school-1/sessions/session-abc/image-2.jpg");
  });

  it("does not include a public path prefix", () => {
    const key = sessionImageKey({
      schoolId: "s1",
      sessionId: "sess1",
      index: 1,
      ext: "png",
    });
    expect(key).not.toMatch(/^public\//);
  });
});
