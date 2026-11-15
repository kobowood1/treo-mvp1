"use client";

import { useEffect, useState } from "react";
import { KaTeXRenderer, KaTeXBlock } from "@/components/math/KaTeXRenderer";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = { id: string; index: number; latex: string; isCorrect: boolean | null; editedBy: string | null };
type Skill = { id: string; skill: { id: string; name: string }; isPrimary: boolean };
type Override = {
  id: string;
  errorType: string | null;
  skillTagIds: string[];
  isCorrect: boolean | null;
  note: string | null;
} | null;

type SessionDetail = {
  id: string;
  status: string;
  workStatus: string;
  problemLatex: string | null;
  overallConfidence: number | null;
  firstErrorStepIndex: number | null;
  finalAnswerCorrect: boolean | null;
  errorType: string | null;
  diagnosisNote: string | null;
  steps: Step[];
  skills: Skill[];
  override: Override;
  startedAt: string;
  resolvedAt: string | null;
};

type HintEvent = {
  id: string;
  level: string;
  hintText: string;
  studentResponse: string | null;
  createdAt: string;
};

const ERROR_TYPES = [
  "SIGN_ERROR", "DISTRIBUTION_ERROR", "ARITHMETIC_ERROR", "INVERSE_OPERATION_ERROR",
  "COMBINING_UNLIKE_TERMS", "INEQUALITY_DIRECTION_ERROR", "INCOMPLETE_SOLUTION",
  "CONCEPTUAL_MISUNDERSTANDING", "OTHER",
];

function errorLabel(type: string): string {
  return type.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Override form ──────────────────────────────────────────────────────────────

function OverrideForm({
  sessionId,
  current,
  onSaved,
}: {
  sessionId: string;
  current: Override;
  onSaved: () => void;
}) {
  const [errorType, setErrorType] = useState(current?.errorType ?? "");
  const [isCorrect, setIsCorrect] = useState<string>(
    current?.isCorrect == null ? "" : current.isCorrect ? "true" : "false"
  );
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/sessions/${sessionId}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorType: errorType || undefined,
        isCorrect: isCorrect === "" ? undefined : isCorrect === "true",
        note: note || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); onSaved(); }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-amber-900 text-sm">Teacher Override</h3>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Error Type</label>
          <select
            value={errorType}
            onChange={(e) => setErrorType(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">AI diagnosis</option>
            {ERROR_TYPES.map((t) => (
              <option key={t} value={t}>{errorLabel(t)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Correctness</label>
          <select
            value={isCorrect}
            onChange={(e) => setIsCorrect(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">AI result</option>
            <option value="true">Mark Correct</option>
            <option value="false">Mark Incorrect</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Note (internal)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Override"}
        </button>
        {saved && <span className="text-green-700 text-sm">Saved ✓</span>}
      </div>
    </div>
  );
}

// ── Main client ────────────────────────────────────────────────────────────────

export function SessionDetailClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [hints, setHints] = useState<HintEvent[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [sRes, hRes, imgRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/hints`),
      fetch(`/api/sessions/${sessionId}/image-url?index=1`),
    ]);
    if (sRes.ok) setSession(await sRes.json());
    if (hRes.ok) { const d = await hRes.json(); setHints(d.hints ?? []); }
    if (imgRes.ok) { const d = await imgRes.json(); setImageUrl(d.url); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!session) return <p className="p-6 text-slate-500 text-sm">Session not found.</p>;

  const effectiveCorrect = session.override?.isCorrect ?? session.finalAnswerCorrect;
  const effectiveErrorType = session.override?.errorType ?? session.errorType;

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          effectiveCorrect === true ? "bg-green-100 text-green-700"
          : effectiveCorrect === false ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-500"
        }`}>
          {effectiveCorrect === true ? "Correct" : effectiveCorrect === false ? "Incorrect" : "Pending"}
        </span>
        {effectiveErrorType && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {errorLabel(effectiveErrorType)}
          </span>
        )}
        {session.skills.map(({ skill, isPrimary }) => (
          <span key={skill.id} className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isPrimary ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
          }`}>
            {skill.name}
          </span>
        ))}
        <span className="text-slate-400 text-xs ml-auto">
          {new Date(session.startedAt).toLocaleString()}
        </span>
      </div>

      {/* Diagnosis note (teacher-only) */}
      {session.diagnosisNote && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">AI Diagnosis Note</p>
          <p className="text-sm text-slate-700">{session.diagnosisNote}</p>
          {session.override?.note && (
            <p className="text-sm text-amber-800 mt-2 border-t border-slate-200 pt-2">
              <strong>Teacher note:</strong> {session.override.note}
            </p>
          )}
        </div>
      )}

      {/* Side-by-side: image + transcription */}
      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Original Image</h2>
          {imageUrl ? (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Student's handwritten work" className="w-full object-contain" />
            </div>
          ) : (
            <div className="rounded-xl bg-slate-100 border border-slate-200 h-40 flex items-center justify-center">
              <p className="text-slate-400 text-sm">No image</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Transcription</h2>
          {session.problemLatex && (
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3">
              <p className="text-xs text-slate-400 mb-1">Problem</p>
              <KaTeXBlock latex={session.problemLatex} />
            </div>
          )}
          <ol className="space-y-2">
            {session.steps.map((s) => (
              <li key={s.id} className={`rounded-lg border px-4 py-3 flex items-center gap-3 text-sm ${
                s.isCorrect === true ? "border-green-200 bg-green-50"
                : s.isCorrect === false ? "border-red-200 bg-red-50"
                : "border-slate-200 bg-white"
              }`}>
                <span className="text-xs text-slate-400 shrink-0">Step {s.index}</span>
                <span className="flex-1 overflow-x-auto"><KaTeXRenderer latex={s.latex} /></span>
                <span aria-hidden="true">{s.isCorrect === true ? "✓" : s.isCorrect === false ? "✗" : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Hint trail */}
      {hints.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Hint Trail ({hints.length} hint{hints.length !== 1 ? "s" : ""} used)
          </h2>
          <div className="space-y-3">
            {hints.map((h, i) => (
              <div key={h.id} className="space-y-2">
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-slate-700">
                  <p className="text-xs font-medium text-slate-400 mb-1">
                    {h.level === "LEVEL_1" ? "Hint 1" : h.level === "LEVEL_2" ? "Hint 2" : "Worked Example"}
                  </p>
                  <p>{h.hintText}</p>
                </div>
                {h.studentResponse && (
                  <div className="ml-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm">
                    <p className="text-xs text-slate-400 mb-1">Student response</p>
                    <KaTeXRenderer latex={h.studentResponse} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Override form */}
      <OverrideForm
        sessionId={sessionId}
        current={session.override}
        onSaved={fetchAll}
      />
    </div>
  );
}
