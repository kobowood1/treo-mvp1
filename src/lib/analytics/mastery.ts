/**
 * Mastery estimation engine.
 *
 * Formula (documented):
 *   For each session involving a skill, compute a session score:
 *     score = finalAnswerCorrect ? 1.0 : 0.0
 *     penalty = hintsUsed * 0.1          (each hint costs 10%)
 *     adjusted = max(0, score - penalty)
 *
 *   Then apply exponential recency weighting over ordered sessions:
 *     weight_i = decay^(n - 1 - i)       where decay = 0.8, n = total sessions
 *     mastery = Σ(weight_i * adjusted_i) / Σ(weight_i)
 *
 *   Result is clamped to [0, 1].
 *   Minimum sessions to show mastery: 1.
 *
 * This keeps the formula simple, deterministic, and teachable.
 */

export type SessionRecord = {
  finalAnswerCorrect: boolean | null;
  hintsUsed: number;
  createdAt: Date;
};

const DECAY = 0.8;
const HINT_PENALTY = 0.1;

export function estimateMastery(sessions: SessionRecord[]): number {
  if (sessions.length === 0) return 0;

  // Sort ascending by date (oldest first)
  const sorted = [...sessions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const n = sorted.length;
  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < n; i++) {
    const s = sorted[i];
    const score = s.finalAnswerCorrect ? 1.0 : 0.0;
    const penalty = s.hintsUsed * HINT_PENALTY;
    const adjusted = Math.max(0, score - penalty);

    const weight = Math.pow(DECAY, n - 1 - i); // recent sessions weighted higher
    weightedSum += weight * adjusted;
    weightTotal += weight;
  }

  return weightTotal === 0 ? 0 : Math.min(1, weightedSum / weightTotal);
}

/**
 * Mastery band labels.
 *   0.00–0.39 → "needs-work"
 *   0.40–0.69 → "developing"
 *   0.70–0.89 → "proficient"
 *   0.90–1.00 → "mastered"
 */
export type MasteryBand = "needs-work" | "developing" | "proficient" | "mastered";

export function masteryBand(score: number): MasteryBand {
  if (score >= 0.9) return "mastered";
  if (score >= 0.7) return "proficient";
  if (score >= 0.4) return "developing";
  return "needs-work";
}

/** Heatmap cell color class (Tailwind) for a mastery band. */
export function masteryColor(band: MasteryBand): string {
  switch (band) {
    case "mastered":   return "bg-green-500 text-white";
    case "proficient": return "bg-green-200 text-green-900";
    case "developing": return "bg-amber-200 text-amber-900";
    case "needs-work": return "bg-red-200 text-red-900";
  }
}
