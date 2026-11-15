/**
 * Math verification client — calls the FastAPI/SymPy service.
 *
 * The service URL is configured via MATH_SERVICE_URL env var.
 * Timeout is 15 s to allow SymPy to handle complex expressions.
 *
 * If the service is unreachable we throw so the caller can surface a
 * user-friendly message rather than silently skip verification.
 */

import { z } from "zod";

const MATH_SERVICE_URL = process.env.MATH_SERVICE_URL ?? "http://localhost:8001";
const TIMEOUT_MS = 15_000;

// ─── Request / response schemas ───────────────────────────────────────────────

export const VerifyStepResultSchema = z.object({
  index: z.number().int(),
  latex: z.string(),
  isCorrect: z.boolean(),
  error: z.string().nullable().optional(),
});

export const VerifyResponseSchema = z.object({
  steps: z.array(VerifyStepResultSchema),
  firstErrorIndex: z.number().int().nullable(),
  finalAnswerCorrect: z.boolean(),
});

export type VerifyStepResult = z.infer<typeof VerifyStepResultSchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

const CheckResponseSchema = z.object({
  equivalent: z.boolean(),
  error: z.string().nullable().optional(),
});

export type CheckResponse = z.infer<typeof CheckResponseSchema>;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ─── verify steps ─────────────────────────────────────────────────────────────

export type VerifyInput = {
  problem: string;
  steps: Array<{ index: number; latex: string }>;
};

export async function verifySteps(input: VerifyInput): Promise<VerifyResponse> {
  const res = await fetchWithTimeout(
    `${MATH_SERVICE_URL}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    TIMEOUT_MS
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Math service error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return VerifyResponseSchema.parse(data);
}

// ─── check two expressions for equivalence ───────────────────────────────────

export async function checkEquivalence(
  expr1: string,
  expr2: string
): Promise<CheckResponse> {
  const res = await fetchWithTimeout(
    `${MATH_SERVICE_URL}/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expr1, expr2 }),
    },
    TIMEOUT_MS
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Math service error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return CheckResponseSchema.parse(data);
}
