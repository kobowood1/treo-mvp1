/**
 * Hint generation service — three-level Socratic hint ladder.
 *
 * Level 1: Guiding question (nudge without revealing)
 * Level 2: Pointed at the specific step & operation
 * Level 3: Fully worked SIMILAR problem with different numbers
 *
 * Praise: specific praise + optional challenge problem when all correct.
 *
 * INVARIANT: NEVER reveals the final answer or corrected step for the
 * student's own problem. The prompts enforce this; this code also never
 * passes the correct answer to the LLM.
 */

import { z } from "zod";
import { createAIProvider } from "./provider";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const HintResponseSchema = z.object({
  hint: z.string().min(1),
});

export const Level3ResponseSchema = z.object({
  workedExample: z.string().min(1),
  followUp: z.string().min(1),
});

export const PraiseResponseSchema = z.object({
  praise: z.string().min(1),
  challengeProblem: z.string().nullable().optional(),
});

export type HintResponse = z.infer<typeof HintResponseSchema>;
export type Level3Response = z.infer<typeof Level3ResponseSchema>;
export type PraiseResponse = z.infer<typeof PraiseResponseSchema>;

// ─── Load prompts ─────────────────────────────────────────────────────────────

function loadPrompt(filename: string): string {
  const raw = readFileSync(join(process.cwd(), "prompts", filename), "utf-8");
  return raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

// ─── Generic LLM call with retry ─────────────────────────────────────────────

async function callWithRetry<T>(
  systemPrompt: string,
  userContent: string,
  schema: z.ZodType<T>
): Promise<T> {
  const ai = createAIProvider();

  async function attempt(): Promise<T> {
    const raw = await ai.complete({
      systemPrompt,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 1024,
      temperature: 0.3, // slight creativity for hints
    });
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw.trim();
    return schema.parse(JSON.parse(jsonStr));
  }

  try {
    return await attempt();
  } catch {
    return await attempt();
  }
}

// ─── Hint Level 1 ─────────────────────────────────────────────────────────────

export type HintInput = {
  problem: string;
  errorStep: { index: number; latex: string };
  errorType: string;
};

export async function generateHint1(input: HintInput): Promise<HintResponse> {
  const systemPrompt = loadPrompt("hint-level-1.v1.md");
  const userContent = JSON.stringify(input);
  return callWithRetry(systemPrompt, userContent, HintResponseSchema);
}

// ─── Hint Level 2 ─────────────────────────────────────────────────────────────

export type Hint2Input = HintInput & {
  level1Hint: string;
};

export async function generateHint2(input: Hint2Input): Promise<HintResponse> {
  const systemPrompt = loadPrompt("hint-level-2.v1.md");
  return callWithRetry(systemPrompt, JSON.stringify(input), HintResponseSchema);
}

// ─── Hint Level 3 ─────────────────────────────────────────────────────────────

export type Hint3Input = HintInput & {
  primarySkill: string;
};

export async function generateHint3(input: Hint3Input): Promise<Level3Response> {
  const systemPrompt = loadPrompt("hint-level-3.v1.md");
  return callWithRetry(systemPrompt, JSON.stringify(input), Level3ResponseSchema);
}

// ─── Praise ───────────────────────────────────────────────────────────────────

export type PraiseInput = {
  problem: string;
  steps: Array<{ index: number; latex: string }>;
  primarySkill: string;
};

export async function generatePraise(input: PraiseInput): Promise<PraiseResponse> {
  const systemPrompt = loadPrompt("praise.v1.md");
  return callWithRetry(systemPrompt, JSON.stringify(input), PraiseResponseSchema);
}
