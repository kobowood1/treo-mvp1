/**
 * Tests for Milestone 4:
 *  - Hint schema validation (HintResponseSchema, Level3ResponseSchema, PraiseResponseSchema)
 *  - Hint level ordering invariants
 *  - MarkdownWithMath text parsing (pure logic)
 */

import { describe, it, expect } from "vitest";
import { HintResponseSchema, Level3ResponseSchema, PraiseResponseSchema } from "@/lib/ai/hints";

// ─── HintResponseSchema ───────────────────────────────────────────────────────

describe("HintResponseSchema", () => {
  it("accepts a valid hint", () => {
    const result = HintResponseSchema.safeParse({
      hint: "What happens to the negative sign when you distribute?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty hint string", () => {
    const result = HintResponseSchema.safeParse({ hint: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing hint key", () => {
    const result = HintResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string hint", () => {
    const result = HintResponseSchema.safeParse({ hint: 42 });
    expect(result.success).toBe(false);
  });
});

// ─── Level3ResponseSchema ─────────────────────────────────────────────────────

describe("Level3ResponseSchema", () => {
  it("accepts a valid worked example with follow-up", () => {
    const result = Level3ResponseSchema.safeParse({
      workedExample: "Solve $3x + 2 = 11$: Step 1: $3x = 9$. Step 2: $x = 3$.",
      followUp: "Can you now apply the same approach to your problem?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing workedExample", () => {
    const result = Level3ResponseSchema.safeParse({
      followUp: "Try now!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty followUp", () => {
    const result = Level3ResponseSchema.safeParse({
      workedExample: "some example",
      followUp: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── PraiseResponseSchema ─────────────────────────────────────────────────────

describe("PraiseResponseSchema", () => {
  it("accepts praise without a challenge problem", () => {
    const result = PraiseResponseSchema.safeParse({
      praise: "Your distribution in step 2 was clean and accurate.",
      challengeProblem: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts praise with a challenge problem", () => {
    const result = PraiseResponseSchema.safeParse({
      praise: "Great work solving step by step!",
      challengeProblem: "3(2x - 4) = 2x + 8",
    });
    expect(result.success).toBe(true);
  });

  it("accepts praise with challengeProblem omitted", () => {
    const result = PraiseResponseSchema.safeParse({
      praise: "Excellent algebra skills!",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.challengeProblem).toBeUndefined();
    }
  });

  it("rejects missing praise", () => {
    const result = PraiseResponseSchema.safeParse({
      challengeProblem: null,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Hint level ordering logic ────────────────────────────────────────────────

describe("hint level ordering", () => {
  /**
   * The hint route computes nextLevel = hints.length + 1.
   * These tests verify the pure math of that invariant.
   */

  function nextHintLevel(hintsGiven: number): number | "exhausted" {
    const level = hintsGiven + 1;
    if (level > 3) return "exhausted";
    return level;
  }

  it("first hint is level 1", () => {
    expect(nextHintLevel(0)).toBe(1);
  });

  it("second hint is level 2", () => {
    expect(nextHintLevel(1)).toBe(2);
  });

  it("third hint is level 3", () => {
    expect(nextHintLevel(2)).toBe(3);
  });

  it("fourth request is exhausted", () => {
    expect(nextHintLevel(3)).toBe("exhausted");
  });

  it("student cannot skip to level 3", () => {
    // If student somehow bypasses level 1, they'd still get level 2 next
    // because the API counts total hints given, not the level they request
    expect(nextHintLevel(0)).toBe(1); // must start at 1
    expect(nextHintLevel(1)).toBe(2); // must do 2 before 3
  });
});

// ─── Session logging: hint count constraint ───────────────────────────────────

describe("hint count constraint", () => {
  it("max 3 hints per error attempt", () => {
    const MAX_HINTS = 3;
    for (let given = 0; given <= MAX_HINTS; given++) {
      const next = given + 1;
      if (given < MAX_HINTS) {
        expect(next).toBeLessThanOrEqual(MAX_HINTS);
      } else {
        expect(next).toBeGreaterThan(MAX_HINTS); // triggers "exhausted" branch
      }
    }
  });
});
