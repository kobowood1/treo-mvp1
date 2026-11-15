"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Skill = { id: string; name: string; sortOrder: number };

type StudentRow = {
  student: { id: string; firstName: string | null; lastInitial: string | null; displayName: string | null };
  skillMastery: Record<string, { score: number; band: string; sessions: number }>;
  recentSessions: number;
  recentErrors: number;
  avgHints: number;
  needsAttention: boolean;
};

type OverviewData = {
  classroomId: string;
  skills: Skill[];
  students: StudentRow[];
  topErrors: Array<{ type: string; count: number }>;
  totalSessions: number;
  weeklySessions: number;
};

// ── Band color ─────────────────────────────────────────────────────────────────

function bandClass(band: string): string {
  switch (band) {
    case "mastered":   return "bg-green-500 text-white";
    case "proficient": return "bg-green-200 text-green-900";
    case "developing": return "bg-amber-200 text-amber-900";
    case "needs-work": return "bg-red-200 text-red-900";
    default:           return "bg-slate-100 text-slate-300"; // no-data
  }
}

function bandLabel(band: string): string {
  switch (band) {
    case "mastered":   return "M";
    case "proficient": return "P";
    case "developing": return "D";
    case "needs-work": return "N";
    default:           return "–";
  }
}

function errorLabel(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClassroomOverviewClient({ classroomId }: { classroomId: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/teacher/classrooms/${classroomId}/overview`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Could not load class data."))
      .finally(() => setLoading(false));
  }, [classroomId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-red-600 text-sm p-6">{error || "No data."}</p>;
  }

  const needsAttention = data.students.filter((s) => s.needsAttention);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-8">

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions", value: data.totalSessions },
          { label: "This Week", value: data.weeklySessions },
          { label: "Students", value: data.students.length },
          { label: "Need Attention", value: needsAttention.length },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Needs Attention
          </h2>
          <div className="flex flex-wrap gap-2">
            {needsAttention.map(({ student, recentErrors, avgHints, recentSessions }) => (
              <Link
                key={student.id}
                href={`/teacher/students/${student.id}`}
                className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm hover:border-amber-400 transition-colors"
              >
                <span className="font-medium text-amber-900">
                  {student.displayName ?? `${student.firstName} ${student.lastInitial}.`}
                </span>
                <span className="text-amber-600 text-xs ml-2">
                  {recentSessions === 0
                    ? "inactive"
                    : `${recentErrors} errors · ${avgHints} hints/session`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top errors this week */}
      {data.topErrors.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Top Errors This Week
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.topErrors.map(({ type, count }) => (
              <span
                key={type}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700"
              >
                {errorLabel(type)}{" "}
                <span className="font-bold text-slate-900">{count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Skill heatmap */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Skill Heatmap
        </h2>

        {/* Legend */}
        <div className="flex gap-3 mb-4 flex-wrap text-xs">
          {[
            ["mastered",   "Mastered (M)"],
            ["proficient", "Proficient (P)"],
            ["developing", "Developing (D)"],
            ["needs-work", "Needs Work (N)"],
            ["no-data",    "No Data (–)"],
          ].map(([band, label]) => (
            <span key={band} className="flex items-center gap-1">
              <span className={`inline-block w-4 h-4 rounded text-center text-xs leading-4 ${bandClass(band)}`}>
                {bandLabel(band)}
              </span>
              <span className="text-slate-500">{label}</span>
            </span>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" role="grid" aria-label="Skill mastery heatmap">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-left font-medium text-slate-500 py-2 pr-4 whitespace-nowrap sticky left-0 bg-slate-50 z-10 min-w-[140px]"
                >
                  Student
                </th>
                {data.skills.map((skill) => (
                  <th
                    key={skill.id}
                    scope="col"
                    className="text-center font-medium text-slate-500 py-2 px-1 whitespace-nowrap text-xs"
                    title={skill.name}
                  >
                    <span className="inline-block max-w-[80px] overflow-hidden text-ellipsis">
                      {skill.name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.students.map(({ student, skillMastery }) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-4 sticky left-0 bg-white z-10">
                    <Link
                      href={`/teacher/students/${student.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {student.displayName ?? `${student.firstName} ${student.lastInitial}.`}
                    </Link>
                  </td>
                  {data.skills.map((skill) => {
                    const cell = skillMastery[skill.id];
                    const band = cell?.band ?? "no-data";
                    return (
                      <td key={skill.id} className="py-2 px-1 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold ${bandClass(band)}`}
                          title={
                            cell
                              ? `${skill.name}: ${band} (${cell.sessions} sessions)`
                              : `${skill.name}: no data`
                          }
                          aria-label={`${skill.name}: ${band}`}
                        >
                          {bandLabel(band)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
