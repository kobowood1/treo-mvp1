/**
 * Diagnosis service — given a verified session, asks the LLM to:
 *   1. Identify the primary skill tag
 *   2. Identify the error type
 *   3. Write a short internal note for the teacher
 *
 * Returns structured JSON validated with Zod. Retries once on bad output.
 */

import { createAIProvider } from "@/lib/ai/provider";
import { readFileSync } from "fs";
import { join } from "path";
import { ErrorType } from "@prisma/client";
import {
  DiagnosisResultSchema,
  DiagnosisResult,
  SKILL_NAMES,
  SkillName,
} from "./diagnosis-schema";

// Re-export for convenience
export { DiagnosisResultSchema, SKILL_NAMES };
export type { DiagnosisResult, SkillName };

// ─── Load prompt ──────────────────────────────────────────────────────────────

function loadDiagnosisPrompt(): string {
  const promptPath = join(process.cwd(), "prompts", "diagnosis.v1.md");
  const raw = readFileSync(promptPath, "utf-8");
  return raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

// ─── Main diagnosis function ──────────────────────────────────────────────────

export type DiagnoseInput = {
  problem: string;
  steps: Array<{ index: number; latex: string; isCorrect: boolean }>;
  firstErrorIndex: number;
};

export async function diagnoseSession(input: DiagnoseInput): Promise<DiagnosisResult> {
  const ai = createAIProvider();
  const systemPrompt = loadDiagnosisPrompt();

  const userContent = JSON.stringify({
    problem: input.problem,
    steps: input.steps,
    firstErrorIndex: input.firstErrorIndex,
  });

  async function attempt(): Promise<DiagnosisResult> {
    const raw = await ai.complete({
      systemPrompt,
      messages: [
        {
          role: "user",
          content: `Diagnose this algebra session:\n\n${userContent}\n\nReturn ONLY valid JSON.`,
        },
      ],
      maxTokens: 512,
      temperature: 0,
    });

    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw.trim();
    const parsed = JSON.parse(jsonStr);

    // Map LLM's errorType string to Prisma enum before validation
    if (parsed.errorType && !Object.values(ErrorType).includes(parsed.errorType)) {
      parsed.errorType = "OTHER";
    }

    return DiagnosisResultSchema.parse(parsed);
  }

  try {
    return await attempt();
  } catch {
    return await attempt(); // one retry
  }
}
