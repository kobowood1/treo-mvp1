/**
 * Shared schema and constants for diagnosis — no Prisma/fs dependencies.
 * Importable in tests without side effects.
 */

import { z } from "zod";

// ─── All 12 fixed skill names ─────────────────────────────────────────────────

export const SKILL_NAMES = [
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
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

// ─── ErrorType enum (mirrors Prisma — avoids Prisma import in tests) ──────────

export const ERROR_TYPES = [
  "SIGN_ERROR",
  "DISTRIBUTION_ERROR",
  "ARITHMETIC_ERROR",
  "INVERSE_OPERATION_ERROR",
  "COMBINING_UNLIKE_TERMS",
  "INEQUALITY_DIRECTION_ERROR",
  "INCOMPLETE_SOLUTION",
  "CONCEPTUAL_MISUNDERSTANDING",
  "OTHER",
] as const;

export type ErrorTypeLiteral = (typeof ERROR_TYPES)[number];

// ─── Zod schema ───────────────────────────────────────────────────────────────

export const DiagnosisResultSchema = z.object({
  primarySkill: z.string(),
  additionalSkills: z.array(z.string()).default([]),
  errorType: z.enum(ERROR_TYPES),
  diagnosisNote: z.string(),
});

export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;
