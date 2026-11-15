/**
 * Extraction service — calls the LLM with the student's image(s) and
 * returns structured extraction JSON, validated with Zod.
 *
 * Retries once on invalid JSON output.
 */

import { z } from "zod";
import { createAIProvider } from "./provider";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Zod schema for extraction output ────────────────────────────────────────

const ExtractionStepSchema = z.object({
  index: z.number().int().positive(),
  latex: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ExtractionResultSchema = z.object({
  readable: z.boolean(),
  unreadableReason: z.string().nullable().optional(),
  problem: z.string(),
  steps: z.array(ExtractionStepSchema),
  overallConfidence: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ExtractionStep = z.infer<typeof ExtractionStepSchema>;

// ─── Load prompt from file ────────────────────────────────────────────────────

function loadExtractionPrompt(): string {
  const promptPath = join(process.cwd(), "prompts", "extraction.v1.md");
  const raw = readFileSync(promptPath, "utf-8");
  // Strip frontmatter (--- ... ---)
  return raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

// ─── Main extraction function ─────────────────────────────────────────────────

export async function extractFromImages(
  imageBuffers: Array<{ buffer: Buffer; mimeType: string }>
): Promise<ExtractionResult> {
  const ai = createAIProvider();
  const systemPrompt = loadExtractionPrompt();

  const images = imageBuffers.map(({ buffer, mimeType }) => ({
    data: buffer.toString("base64"),
    mimeType,
  }));

  async function attempt(): Promise<ExtractionResult> {
    const raw = await ai.complete({
      systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Please transcribe the algebra work in this image. Return ONLY valid JSON matching the schema in your instructions.",
        },
      ],
      images,
      maxTokens: 2048,
      temperature: 0,
    });

    // Extract JSON from the response (model sometimes wraps in ```json ... ```)
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw.trim();

    const parsed = JSON.parse(jsonStr);
    return ExtractionResultSchema.parse(parsed);
  }

  try {
    return await attempt();
  } catch {
    // Retry once on parse/validation failure
    try {
      return await attempt();
    } catch (retryErr) {
      throw new Error(`Extraction failed after retry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
    }
  }
}
