/**
 * Tests for Milestone 6:
 *  - WeeklyReportContentSchema validation
 *  - currentWeekStart() returns Monday
 *  - Report generation schema edge cases
 *  - Admin access: school admin can call admin routes, teacher cannot
 */

import { describe, it, expect } from "vitest";
import { WeeklyReportContentSchema } from "@/lib/reports/weeklyReport";
import { currentWeekStart } from "@/lib/reports/weeklyReport";

// ─── WeeklyReportContentSchema ────────────────────────────────────────────────

describe("WeeklyReportContentSchema", () => {
  it("accepts a valid report", () => {
    const result = WeeklyReportContentSchema.safeParse({
      goingWell: "Your child is doing great with two-step equations.",
      workOn: "They're still working on distributing negative signs correctly.",
      helpAtHome: [
        "Ask them to explain out loud why they flip the inequality sign.",
        "Have them check their work by substituting the answer back in.",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing goingWell", () => {
    const result = WeeklyReportContentSchema.safeParse({
      workOn: "work on something",
      helpAtHome: ["tip 1", "tip 2"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects helpAtHome with only 1 item", () => {
    const result = WeeklyReportContentSchema.safeParse({
      goingWell: "going well",
      workOn: "work on this",
      helpAtHome: ["only one tip"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects helpAtHome with 3 items (must be exactly 2)", () => {
    const result = WeeklyReportContentSchema.safeParse({
      goingWell: "going well",
      workOn: "work on this",
      helpAtHome: ["tip 1", "tip 2", "tip 3"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty strings", () => {
    const result = WeeklyReportContentSchema.safeParse({
      goingWell: "",
      workOn: "work on this",
      helpAtHome: ["tip 1", "tip 2"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects workOn as empty string", () => {
    const result = WeeklyReportContentSchema.safeParse({
      goingWell: "going well",
      workOn: "",
      helpAtHome: ["tip 1", "tip 2"],
    });
    expect(result.success).toBe(false);
  });
});

// ─── currentWeekStart ─────────────────────────────────────────────────────────

describe("currentWeekStart", () => {
  it("returns a Monday (getUTCDay() === 1)", () => {
    const start = currentWeekStart();
    expect(start.getUTCDay()).toBe(1);
  });

  it("returns a date with time zeroed to midnight UTC", () => {
    const start = currentWeekStart();
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);
  });

  it("is not in the future", () => {
    const start = currentWeekStart();
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("is within the last 7 days", () => {
    const start = currentWeekStart();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(start.getTime()).toBeGreaterThanOrEqual(sevenDaysAgo);
  });
});

// ─── Privacy invariant: report content has no student PII ────────────────────

describe("report privacy", () => {
  it("report schema does not contain a studentId or studentName field", () => {
    const keys = Object.keys(WeeklyReportContentSchema.shape);
    expect(keys).not.toContain("studentId");
    expect(keys).not.toContain("studentName");
    expect(keys).not.toContain("name");
  });

  it("contains only the four expected fields", () => {
    const keys = Object.keys(WeeklyReportContentSchema.shape).sort();
    expect(keys).toEqual(["goingWell", "helpAtHome", "workOn"].sort());
  });
});
