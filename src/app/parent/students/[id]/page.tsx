"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Report = {
  id: string;
  weekStartDate: string;
  goingWell: string;
  workOn: string;
  helpAtHome: string[];
  activityCount: number;
  generatedAt: string;
};

type Student = {
  id: string;
  firstName: string | null;
  lastInitial: string | null;
};

function WeekLabel(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ParentStudentPage() {
  const params = useParams();
  const studentId = params.id as string;

  const [reports, setReports] = useState<Report[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const fetchReports = async () => {
    const res = await fetch("/api/parent/reports");
    if (!res.ok) { setError("Could not load reports."); setLoading(false); return; }
    const data = await res.json();
    const myReports: Report[] = (data.reports ?? []).filter(
      (r: Report & { studentId: string }) => r.studentId === studentId
    );
    setReports(myReports);
    const st = (data.students ?? []).find((s: Student) => s.id === studentId);
    if (st) setStudent(st);
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, [studentId]);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await fetch("/api/parent/reports/generate", { method: "POST" });
    setGenerating(false);
    if (res.ok) await fetchReports();
  };

  const name = student
    ? `${student.firstName ?? ""} ${student.lastInitial ? student.lastInitial + "." : ""}`.trim()
    : "Your Child";

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/parent" className="text-slate-400 hover:text-slate-600 text-sm">← Home</a>
          <h1 className="text-lg font-bold text-slate-900">{name}&apos;s Progress</h1>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
        >
          {generating ? "Generating…" : "Refresh This Week's Report"}
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>
        )}

        {reports.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-2xl mb-2" aria-hidden="true">📊</p>
            <p className="text-slate-600 font-medium mb-2">No reports yet</p>
            <p className="text-slate-400 text-sm mb-4">
              Reports are generated automatically each week. You can also generate one now.
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate Now"}
            </button>
          </div>
        ) : (
          reports.map((report) => (
            <article
              key={report.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
              aria-label={`Weekly report for week of ${WeekLabel(report.weekStartDate)}`}
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Week of {WeekLabel(report.weekStartDate)}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {report.activityCount} problem{report.activityCount !== 1 ? "s" : ""} practiced
                  </p>
                </div>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Going well */}
                <section>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-green-600 text-base" aria-hidden="true">✅</span>
                    <h3 className="text-sm font-semibold text-slate-800">What&apos;s Going Well</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{report.goingWell}</p>
                </section>

                {/* Work on */}
                <section>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-amber-500 text-base" aria-hidden="true">🎯</span>
                    <h3 className="text-sm font-semibold text-slate-800">Something to Work On</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{report.workOn}</p>
                </section>

                {/* Help at home */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-blue-500 text-base" aria-hidden="true">🏠</span>
                    <h3 className="text-sm font-semibold text-slate-800">Ways to Help at Home</h3>
                  </div>
                  <ul className="space-y-2">
                    {report.helpAtHome.map((tip, i) => (
                      <li key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </article>
          ))
        )}
      </div>
    </main>
  );
}
