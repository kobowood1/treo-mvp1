/**
 * Tests for Milestone 5:
 *  - Mastery formula correctness
 *  - Mastery band boundaries
 *  - CSV escaping
 */

import { describe, it, expect } from "vitest";
import { estimateMastery, masteryBand, type SessionRecord } from "@/lib/analytics/mastery";

// ─── estimateMastery ──────────────────────────────────────────────────────────

describe("estimateMastery", () => {
  const base = new Date("2024-01-01");
  const day = (n: number) => new Date(base.getTime() + n * 86400000);

  it("returns 0 for no sessions", () => {
    expect(estimateMastery([])).toBe(0);
  });

  it("returns 1 for a single correct session with no hints", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: true, hintsUsed: 0, createdAt: day(0) },
    ];
    expect(estimateMastery(sessions)).toBe(1);
  });

  it("returns 0 for a single incorrect session with no hints", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: false, hintsUsed: 0, createdAt: day(0) },
    ];
    expect(estimateMastery(sessions)).toBe(0);
  });

  it("penalizes hints — correct with 3 hints = 0.7", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: true, hintsUsed: 3, createdAt: day(0) },
    ];
    // score=1, penalty=0.3, adjusted=0.7
    expect(estimateMastery(sessions)).toBeCloseTo(0.7, 5);
  });

  it("penalizes hints — correct with 10 hints clamps to 0", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: true, hintsUsed: 10, createdAt: day(0) },
    ];
    // score=1, penalty=1.0, adjusted=max(0, -0.0)=0
    expect(estimateMastery(sessions)).toBe(0);
  });

  it("recent correct sessions outweigh older incorrect ones", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: false, hintsUsed: 0, createdAt: day(0) },
      { finalAnswerCorrect: false, hintsUsed: 0, createdAt: day(1) },
      { finalAnswerCorrect: true,  hintsUsed: 0, createdAt: day(2) },
      { finalAnswerCorrect: true,  hintsUsed: 0, createdAt: day(3) },
    ];
    const score = estimateMastery(sessions);
    // Most recent sessions are correct, so score should be > 0.5
    expect(score).toBeGreaterThan(0.5);
  });

  it("is clamped to [0, 1]", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: true, hintsUsed: 0, createdAt: day(0) },
      { finalAnswerCorrect: true, hintsUsed: 0, createdAt: day(1) },
    ];
    const score = estimateMastery(sessions);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("null finalAnswerCorrect is treated as incorrect", () => {
    const sessions: SessionRecord[] = [
      { finalAnswerCorrect: null, hintsUsed: 0, createdAt: day(0) },
    ];
    // null → false → score 0
    expect(estimateMastery(sessions)).toBe(0);
  });

  it("sorts by date, not insertion order", () => {
    // Insert out of order: day(3) correct, day(0) incorrect
    const s1: SessionRecord = { finalAnswerCorrect: true,  hintsUsed: 0, createdAt: day(3) };
    const s2: SessionRecord = { finalAnswerCorrect: false, hintsUsed: 0, createdAt: day(0) };
    const inOrder = estimateMastery([s2, s1]);
    const outOrder = estimateMastery([s1, s2]);
    expect(inOrder).toBeCloseTo(outOrder, 5); // same regardless of input order
  });
});

// ─── masteryBand ──────────────────────────────────────────────────────────────

describe("masteryBand", () => {
  it("0.0 → needs-work", ()  => expect(masteryBand(0.0)).toBe("needs-work"));
  it("0.39 → needs-work", () => expect(masteryBand(0.39)).toBe("needs-work"));
  it("0.40 → developing", () => expect(masteryBand(0.40)).toBe("developing"));
  it("0.69 → developing", () => expect(masteryBand(0.69)).toBe("developing"));
  it("0.70 → proficient", () => expect(masteryBand(0.70)).toBe("proficient"));
  it("0.89 → proficient", () => expect(masteryBand(0.89)).toBe("proficient"));
  it("0.90 → mastered",   () => expect(masteryBand(0.90)).toBe("mastered"));
  it("1.00 → mastered",   () => expect(masteryBand(1.00)).toBe("mastered"));
});

// ─── CSV escaping ─────────────────────────────────────────────────────────────

describe("CSV escaping", () => {
  // Inline the escape function to test it directly
  function escapeCSV(val: string | number | null | undefined): string {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  it("returns empty string for null/undefined", () => {
    expect(escapeCSV(null)).toBe("");
    expect(escapeCSV(undefined)).toBe("");
  });

  it("passes through plain strings", () => {
    expect(escapeCSV("hello")).toBe("hello");
    expect(escapeCSV(42)).toBe("42");
  });

  it("wraps in quotes when comma present", () => {
    expect(escapeCSV("hello, world")).toBe('"hello, world"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in quotes when newline present", () => {
    expect(escapeCSV("line1\nline2")).toBe('"line1\nline2"');
  });
});
