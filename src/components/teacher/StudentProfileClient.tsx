"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SkillMastery = {
  skillId: string;
  skillName: string;
  score: number | null;
  band: string;
  sessionCount: number;
};

type SessionSummary = {
  id: string;
  createdAt: string;
  status: string;
  finalAnswerCorrect: boolean | null;
  hintsUsed: number;
  errorType: string | null;
  skills: string[];
};

type ProfileData = {
  student: { id: string; firstName: string | null; lastInitial: string | null; displayName: string | null };
  skillMasteries: SkillMastery[];
  strengths: Array<{ skillName: string; score: number; band: string }>;
  growthAreas: Array<{ skillName: string; score: number; band: string }>;
  recurringErrors: Array<{ type: string; count: number }>;
  sessions: SessionSummary[];
  weeklyActivity: Array<{ week: string; sessions: number }>;
};

function bandClass(band: string): string {
  switch (band) {
    case "mastered":   return "bg-green-100 text-green-800 border-green-200";
    case "proficient": return "bg-green-50 text-green-700 border-green-100";
    case "developing": return "bg-amber-100 text-amber-800 border-amber-200";
    case "needs-work": return "bg-red-100 text-red-800 border-red-200";
    default:           return "bg-slate-100 text-slate-400 border-slate-200";
  }
}

function errorLabel(type: string): string {
  return type.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(score: number | null): string {
  if (score == null) return "–";
  return `${Math.round(score * 100)}%`;
}

export function StudentProfileClient({ studentId }: { studentId: string }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/teacher/students/${studentId}/profile`)
      .then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then(setData)
      .catch(() => setError("Could not load student data."))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (error || !data) return <p className="text-red-600 p-6 text-sm">{error || "No data."}</p>;

  const { student, strengths, growthAreas, recurringErrors, sessions, skillMasteries, weeklyActivity } = data;
  const name = student.displayName ?? `${student.firstName ?? ""} ${student.lastInitial ?? ""}.`.trim();

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">

      {/* Strengths & growth areas */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            {name}&apos;s Strengths
          </h2>
          {strengths.length === 0 ? (
            <p className="text-slate-400 text-sm">No data yet.</p>
          ) : (
            <ul className="space-y-2">
              {strengths.map((s) => (
                <li key={s.skillName} className={`rounded-lg border px-3 py-2 text-sm flex justify-between ${bandClass(s.band)}`}>
                  <span>{s.skillName}</span>
                  <span className="font-mono font-semibold">{pct(s.score)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Growth Areas</h2>
          {growthAreas.length === 0 ? (
            <p className="text-slate-400 text-sm">No data yet.</p>
          ) : (
            <ul className="space-y-2">
              {growthAreas.map((s) => (
                <li key={s.skillName} className={`rounded-lg border px-3 py-2 text-sm flex justify-between ${bandClass(s.band)}`}>
                  <span>{s.skillName}</span>
                  <span className="font-mono font-semibold">{pct(s.score)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recurring errors */}
      {recurringErrors.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Recurring Errors</h2>
          <div className="flex flex-wrap gap-2">
            {recurringErrors.map(({ type, count }) => (
              <span key={type} className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-sm text-red-800">
                {errorLabel(type)} <span className="font-bold">×{count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Weekly activity bar */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Activity (last 8 weeks)</h2>
        <div className="flex items-end gap-2 h-20" aria-label="Weekly activity chart">
          {weeklyActivity.map(({ week, sessions: cnt }) => {
            const maxSessions = Math.max(...weeklyActivity.map((w) => w.sessions), 1);
            const height = Math.round((cnt / maxSessions) * 100);
            return (
              <div key={week} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${height}%` }}
                  title={`${week}: ${cnt} sessions`}
                  role="img"
                  aria-label={`Week of ${week}: ${cnt} sessions`}
                />
                <span className="text-xs text-slate-400 rotate-45 origin-left whitespace-nowrap hidden sm:block">
                  {week.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* All skill mastery */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">All Skills</h2>
        <div className="space-y-2">
          {skillMasteries.map((sm) => (
            <div key={sm.skillId} className="flex items-center gap-3">
              <span className="text-sm text-slate-700 w-56 shrink-0">{sm.skillName}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2">
                {sm.score != null && (
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.round(sm.score * 100)}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(sm.score * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={sm.skillName}
                  />
                )}
              </div>
              <span className="text-xs font-mono text-slate-500 w-10 text-right shrink-0">
                {pct(sm.score)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Session list */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-slate-400 text-sm">No sessions yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/teacher/sessions/${s.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
              >
                <div>
                  <p className="text-sm text-slate-700 font-medium">
                    {s.skills.slice(0, 2).join(", ") || "Unknown skill"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(s.createdAt).toLocaleDateString()} · {s.hintsUsed} hint{s.hintsUsed !== 1 ? "s" : ""} used
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  s.finalAnswerCorrect === true
                    ? "bg-green-100 text-green-700"
                    : s.finalAnswerCorrect === false
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {s.finalAnswerCorrect === true ? "Correct" : s.finalAnswerCorrect === false ? "Incorrect" : "Pending"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
