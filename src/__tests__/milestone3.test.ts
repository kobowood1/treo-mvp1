/**
 * Tests for Milestone 3:
 *  - VerifyResponseSchema validation
 *  - DiagnosisResultSchema validation
 *  - SKILL_NAMES completeness
 *  - Math verifier client schema edge cases
 */

import { describe, it, expect } from "vitest";
import { VerifyResponseSchema, VerifyStepResultSchema } from "@/lib/math/verifier";
import { DiagnosisResultSchema, SKILL_NAMES, ERROR_TYPES } from "@/lib/ai/diagnosis-schema";

// ─── VerifyStepResultSchema ───────────────────────────────────────────────────

describe("VerifyStepResultSchema", () => {
  it("accepts a correct step", () => {
    const result = VerifyStepResultSchema.safeParse({
      index: 1,
      latex: "2x + 3 = 7",
      isCorrect: true,
      error: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an incorrect step with an error message", () => {
    const result = VerifyStepResultSchema.safeParse({
      index: 2,
      latex: "x = 5",
      isCorrect: false,
      error: "Not equivalent to previous step",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a step missing isCorrect", () => {
    const result = VerifyStepResultSchema.safeParse({
      index: 1,
      latex: "x = 1",
      // isCorrect missing
    });
    expect(result.success).toBe(false);
  });
});

// ─── VerifyResponseSchema ─────────────────────────────────────────────────────

describe("VerifyResponseSchema", () => {
  it("accepts a fully correct verification", () => {
    const result = VerifyResponseSchema.safeParse({
      steps: [
        { index: 1, latex: "2x = 4", isCorrect: true, error: null },
        { index: 2, latex: "x = 2", isCorrect: true, error: null },
      ],
      firstErrorIndex: null,
      finalAnswerCorrect: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finalAnswerCorrect).toBe(true);
      expect(result.data.firstErrorIndex).toBeNull();
    }
  });

  it("accepts a verification with first error", () => {
    const result = VerifyResponseSchema.safeParse({
      steps: [
        { index: 1, latex: "2x = 4", isCorrect: true, error: null },
        { index: 2, latex: "x = 5", isCorrect: false, error: "Not equivalent" },
      ],
      firstErrorIndex: 2,
      finalAnswerCorrect: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstErrorIndex).toBe(2);
      expect(result.data.finalAnswerCorrect).toBe(false);
    }
  });

  it("rejects missing finalAnswerCorrect", () => {
    const result = VerifyResponseSchema.safeParse({
      steps: [],
      firstErrorIndex: null,
      // finalAnswerCorrect missing
    });
    expect(result.success).toBe(false);
  });
});

// ─── DiagnosisResultSchema ────────────────────────────────────────────────────

describe("DiagnosisResultSchema", () => {
  it("accepts a valid diagnosis with all error types", () => {
    for (const errorType of ERROR_TYPES) {
      const result = DiagnosisResultSchema.safeParse({
        primarySkill: "Two-step equations",
        additionalSkills: [],
        errorType,
        diagnosisNote: "Student made a sign error when moving terms.",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown error type", () => {
    const result = DiagnosisResultSchema.safeParse({
      primarySkill: "Two-step equations",
      additionalSkills: [],
      errorType: "MADE_UP_ERROR",
      diagnosisNote: "Some note",
    });
    expect(result.success).toBe(false);
  });

  it("defaults additionalSkills to empty array if omitted", () => {
    const result = DiagnosisResultSchema.safeParse({
      primarySkill: "One-step equations",
      errorType: "ARITHMETIC_ERROR",
      diagnosisNote: "Arithmetic mistake in final step",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additionalSkills).toEqual([]);
    }
  });

  it("rejects missing primarySkill", () => {
    const result = DiagnosisResultSchema.safeParse({
      additionalSkills: [],
      errorType: "SIGN_ERROR",
      diagnosisNote: "Note",
    });
    expect(result.success).toBe(false);
  });
});

// ─── SKILL_NAMES completeness ─────────────────────────────────────────────────

describe("SKILL_NAMES", () => {
  it("contains all 12 required algebra skills", () => {
    const required = [
      "Combining like terms",
      "Distributive property",
      "One-step equations",
      "Two-step equations",
      "Multi-step equations",
      "Variables on both sides",
      "Equations with fractions",
      "Linear inequalities (incl. flipping the sign)",
      "Solving for a variable (literal equations)",
      "Slope & linear equations",
      "Systems of equations (substitution)",
      "Systems of equations (elimination)",
    ];
    expect(SKILL_NAMES).toHaveLength(12);
    for (const skill of required) {
      expect(SKILL_NAMES).toContain(skill);
    }
  });
});

// ─── DiagnosisResultSchema — note length sanity ───────────────────────────────

describe("DiagnosisResultSchema — note length sanity", () => {
  it("accepts a long diagnosis note", () => {
    const result = DiagnosisResultSchema.safeParse({
      primarySkill: "Multi-step equations",
      additionalSkills: ["Distributive property"],
      errorType: "DISTRIBUTION_ERROR",
      diagnosisNote:
        "The student correctly combined like terms in steps 1 and 2 but failed to distribute the negative sign across the parentheses in step 3, resulting in an incorrect coefficient for x.",
    });
    expect(result.success).toBe(true);
  });
});
