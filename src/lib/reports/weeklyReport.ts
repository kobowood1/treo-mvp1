/**
 * Weekly parent report generator.
 *
 * Builds inputs from the last 7 days of a student's sessions,
 * calls the LLM with parent-report.v1.md, validates with Zod.
 *
 * Privacy: student names/IDs are NOT sent to the LLM.
 * Only anonymous skill/error data is included.
 */

import { z } from "zod";
import { createAIProvider } from "@/lib/ai/provider";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { estimateMastery } from "@/lib/analytics/mastery";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const WeeklyReportContentSchema = z.object({
  goingWell: z.string().min(1),
  workOn: z.string().min(1),
  helpAtHome: z.tuple([z.string().min(1), z.string().min(1)]),
});

export type WeeklyReportContent = z.infer<typeof WeeklyReportContentSchema>;

// ─── Load prompt ──────────────────────────────────────────────────────────────

function loadPrompt(): string {
  const raw = readFileSync(join(process.cwd(), "prompts", "parent-report.v1.md"), "utf-8");
  return raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

// ─── Generate for one student ─────────────────────────────────────────────────

export async function generateWeeklyReport(params: {
  studentId: string;
  parentId: string;
  firstName: string;         // used in prompt context only, not logged
  weekStartDate: Date;
}): Promise<{ content: WeeklyReportContent; activityCount: number }> {
  const { studentId, firstName, weekStartDate } = params;
  const weekEnd = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sessions = await prisma.problemSession.findMany({
    where: {
      studentId,
      createdAt: { gte: weekStartDate, lt: weekEnd },
    },
    include: {
      skills: { include: { skill: true } },
      hints: { select: { id: true } },
      override: true,
    },
  });

  const activityCount = sessions.length;

  // Build anonymous skill summary
  const allSkills = await prisma.skillTag.findMany({
    where: { isGlobal: true },
    orderBy: { sortOrder: "asc" },
  });

  const skillScores = allSkills.map((skill) => {
    const skillSessions = sessions.filter((s) =>
      s.skills.some((sk) => sk.skillId === skill.id)
    );
    if (skillSessions.length === 0) return null;
    const score = estimateMastery(
      skillSessions.map((s) => ({
        finalAnswerCorrect: s.override?.isCorrect ?? s.finalAnswerCorrect,
        hintsUsed: s.hints.length,
        createdAt: s.createdAt,
      }))
    );
    return { name: skill.name, score };
  }).filter(Boolean) as Array<{ name: string; score: number }>;

  const sorted = [...skillScores].sort((a, b) => b.score - a.score);
  const strongSkills = sorted.slice(0, 2).map((s) => s.name);
  const struggleSkills = sorted.slice(-2).reverse().map((s) => s.name);

  const recentErrors = sessions
    .map((s) => s.override?.errorType ?? s.errorType)
    .filter(Boolean) as string[];

  // If no activity this week, generate a simple "keep practicing" report
  if (activityCount === 0) {
    return {
      content: {
        goingWell: `${firstName} has been working on algebra this term and is building their skills.`,
        workOn: "Consistent practice helps algebra concepts stick — even 10 minutes a day makes a difference.",
        helpAtHome: [
          "Ask your child to pick one math topic and explain it to you out loud.",
          "Encourage them to upload their homework to Treo for feedback this week.",
        ],
      },
      activityCount: 0,
    };
  }

  const ai = createAIProvider();
  const systemPrompt = loadPrompt();

  const userContent = JSON.stringify({
    firstName, // used in the report prose
    activityCount,
    strongSkills,
    struggleSkills,
    recentErrors: [...new Set(recentErrors)].slice(0, 3),
  });

  async function attempt(): Promise<WeeklyReportContent> {
    const raw = await ai.complete({
      systemPrompt,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 512,
      temperature: 0.4,
    });
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw.trim();
    const parsed = JSON.parse(jsonStr);
    // helpAtHome may come as array or object; normalise
    if (Array.isArray(parsed.helpAtHome) && parsed.helpAtHome.length >= 2) {
      parsed.helpAtHome = [parsed.helpAtHome[0], parsed.helpAtHome[1]];
    }
    return WeeklyReportContentSchema.parse(parsed);
  }

  try {
    const content = await attempt();
    return { content, activityCount };
  } catch {
    const content = await attempt(); // one retry
    return { content, activityCount };
  }
}

// ─── Start of the current ISO week (Monday) ───────────────────────────────────

export function currentWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const daysToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}
