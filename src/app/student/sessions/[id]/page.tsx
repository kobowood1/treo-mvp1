"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { KaTeXRenderer, KaTeXBlock } from "@/components/math/KaTeXRenderer";

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionStep = {
  id: string;
  index: number;
  latex: string;
  confidence: number | null;
  isCorrect: boolean | null;
  editedBy: string | null;
};

type Session = {
  id: string;
  status: string;
  workStatus: string;
  problemLatex: string | null;
  overallConfidence: number | null;
  firstErrorStepIndex: number | null;
  finalAnswerCorrect: boolean | null;
  errorType: string | null;
  steps: SessionStep[];
};

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const label = value >= 0.9 ? "High" : value >= 0.7 ? "Medium" : "Low";
  const color =
    value >= 0.9
      ? "bg-green-100 text-green-700"
      : value >= 0.7
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {label} confidence
    </span>
  );
}

// ── Editable step row ─────────────────────────────────────────────────────────

function StepRow({
  step,
  isError,
  onEdit,
}: {
  step: SessionStep;
  isError: boolean;
  onEdit: (index: number, latex: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(step.latex);

  const save = () => {
    onEdit(step.index, value.trim() || step.latex);
    setEditing(false);
  };

  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        isError
          ? "border-amber-300 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-400 shrink-0">
          Step {step.index}
        </span>

        {editing ? (
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              aria-label={`Edit step ${step.index} LaTeX`}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            />
            <button
              type="button"
              onClick={save}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setValue(step.latex); setEditing(false); }}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex-1 min-w-0 overflow-x-auto">
            <KaTeXRenderer latex={value} />
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {step.confidence != null && step.confidence < 0.7 && !editing && (
            <span className="text-xs text-amber-600" title="Low confidence — please check">⚠</span>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
              aria-label={`Edit step ${step.index}`}
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<SessionStep[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) { setError("Session not found."); setLoading(false); return; }
    const data: Session = await res.json();
    setSession(data);
    setSteps(data.steps);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
    // Fetch the signed image URL
    fetch(`/api/sessions/${sessionId}/image-url?index=1`)
      .then((r) => r.json())
      .then((d) => setImageUrl(d.url))
      .catch(() => {}); // image URL is optional — don't block
  }, [sessionId, fetchSession]);

  // Poll while still extracting
  useEffect(() => {
    if (!session) return;
    if (session.status === "PENDING_EXTRACTION") {
      const t = setInterval(fetchSession, 2000);
      return () => clearInterval(t);
    }
  }, [session, fetchSession]);

  const handleStepEdit = (index: number, latex: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.index === index ? { ...s, latex } : s))
    );
  };

  const [confirmStage, setConfirmStage] = useState<"idle" | "saving" | "verifying" | "done">("idle");

  const handleConfirm = async () => {
    setConfirmError("");
    setConfirming(true);
    setConfirmStage("saving");

    // Brief delay so the stage label is visible before the long request starts
    await new Promise((r) => setTimeout(r, 300));
    setConfirmStage("verifying");

    const res = await fetch(`/api/sessions/${sessionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: steps.map(({ index, latex }) => ({ index, latex })) }),
    });
    const data = await res.json();
    setConfirming(false);
    setConfirmStage("idle");

    if (!res.ok) {
      setConfirmError(data.error ?? "Something went wrong.");
      return;
    }
    // Verification + diagnosis done on the server — head straight to coaching
    router.push(`/student/sessions/${sessionId}/coach`);
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-3" aria-hidden="true" />
          <p className="text-slate-500 text-sm">Reading your work…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-sm w-full">
          <p className="text-2xl mb-2" aria-hidden="true">😕</p>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Hmm, something went wrong</h1>
          <p className="text-slate-500 text-sm mb-4">{error}</p>
          <a href="/student/upload" className="text-blue-600 text-sm hover:underline">Try again</a>
        </div>
      </main>
    );
  }

  if (session?.status === "PENDING_EXTRACTION") {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-xs">
          <div className="inline-block w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-3" aria-hidden="true" />
          <p className="text-slate-600">Reading your handwriting…</p>
          <p className="text-slate-400 text-sm mt-1">This usually takes about 10 seconds.</p>
        </div>
      </main>
    );
  }

  const lowConfidence = (session?.overallConfidence ?? 1) < 0.7;

  // ── Already confirmed / in coaching ─────────────────────────────────────────

  if (session?.status === "VERIFIED" || session?.status === "COACHING" || session?.status === "RESOLVED") {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-sm w-full">
          <p className="text-2xl mb-2" aria-hidden="true">✅</p>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Already confirmed!</h1>
          <a
            href={`/student/sessions/${sessionId}/coach`}
            className="inline-block mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium"
          >
            Continue to coaching →
          </a>
        </div>
      </main>
    );
  }

  // ── Main confirmation UI ─────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <a href="/student" className="text-slate-400 hover:text-slate-600 text-sm">← Back</a>
        <h1 className="text-lg font-bold text-slate-900">Check Your Work</h1>
        {session?.overallConfidence != null && (
          <ConfidenceBadge value={session.overallConfidence} />
        )}
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left column: original image */}
        <section>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
            Your Original Work
          </h2>
          {imageUrl ? (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Your handwritten algebra work"
                className="w-full object-contain"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-100 h-64 flex items-center justify-center">
              <p className="text-slate-400 text-sm">Image loading…</p>
            </div>
          )}
        </section>

        {/* Right column: transcription */}
        <section>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
            What We Read
          </h2>

          {lowConfidence && (
            <div
              role="alert"
              className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800"
            >
              <strong>We weren&apos;t totally sure about some parts.</strong> Please check each step carefully and fix anything that looks wrong.
            </div>
          )}

          {/* Problem statement */}
          {session?.problemLatex && (
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-4">
              <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Problem</p>
              <KaTeXBlock latex={session.problemLatex} />
            </div>
          )}

          {/* Steps */}
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Steps</p>
            {steps.length > 0 ? (
              <ol className="space-y-2" aria-label="Transcribed steps">
                {steps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    isError={false}
                    onEdit={handleStepEdit}
                  />
                ))}
              </ol>
            ) : (
              <p className="text-slate-400 text-sm">No steps detected.</p>
            )}
          </div>

          <p className="text-xs text-slate-400 mb-4">
            Does everything look right? You can tap <strong>Edit</strong> on any step to fix it before continuing.
          </p>

          {confirmError && (
            <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3 mb-4">
              {confirmError}
            </p>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-base font-semibold transition-colors disabled:opacity-60"
          >
            {confirming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                {confirmStage === "verifying"
                  ? "Checking your math…"
                  : "Saving…"}
              </span>
            ) : (
              "Yes, this looks right →"
            )}
          </button>
        </section>
      </div>
    </main>
  );
}
