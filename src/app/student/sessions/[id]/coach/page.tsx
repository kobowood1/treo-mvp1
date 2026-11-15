"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { KaTeXRenderer, KaTeXBlock } from "@/components/math/KaTeXRenderer";

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionStep = {
  id: string;
  index: number;
  latex: string;
  isCorrect: boolean | null;
};

type HintEvent = {
  id: string;
  level: "LEVEL_1" | "LEVEL_2" | "LEVEL_3";
  hintText: string;
  studentResponse: string | null;
  resolvedAt: string | null;
};

type Session = {
  id: string;
  status: string;
  problemLatex: string | null;
  firstErrorStepIndex: number | null;
  finalAnswerCorrect: boolean | null;
  errorType: string | null;
  steps: SessionStep[];
};

// ── Helper: level label ───────────────────────────────────────────────────────

function levelLabel(level: string) {
  if (level === "LEVEL_1") return "Hint 1";
  if (level === "LEVEL_2") return "Hint 2";
  return "Worked Example";
}

// ── Error step badge ──────────────────────────────────────────────────────────

function StepList({ steps, errorIndex }: { steps: SessionStep[]; errorIndex: number | null }) {
  if (!steps.length) return null;
  return (
    <ol className="space-y-2">
      {steps.map((s) => {
        const isError = errorIndex != null && s.index === errorIndex;
        const correct = s.isCorrect === true;
        const wrong = s.isCorrect === false;
        return (
          <li
            key={s.id}
            className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
              isError
                ? "border-amber-300 bg-amber-50"
                : correct
                ? "border-green-200 bg-green-50"
                : wrong
                ? "border-red-200 bg-red-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <span className="text-xs font-medium text-slate-400 shrink-0">
              Step {s.index}
            </span>
            <span className="flex-1 min-w-0 overflow-x-auto">
              <KaTeXRenderer latex={s.latex} />
            </span>
            <span className="shrink-0 text-base" aria-hidden="true">
              {correct ? "✓" : wrong ? "✗" : isError ? "⚠" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Hint bubble ───────────────────────────────────────────────────────────────

function HintBubble({ hint, index }: { hint: HintEvent; index: number }) {
  const isWorked = hint.level === "LEVEL_3";
  return (
    <div className="space-y-2">
      <div
        className={`rounded-xl px-4 py-3 text-sm ${
          isWorked
            ? "bg-violet-50 border border-violet-200 text-slate-800"
            : "bg-blue-50 border border-blue-200 text-slate-800"
        }`}
        aria-label={`${levelLabel(hint.level)} from Treo`}
      >
        <p className="text-xs font-semibold text-slate-400 mb-1">
          {levelLabel(hint.level)}
        </p>
        {/* Render inline $...$ LaTeX inside hint text */}
        <MarkdownWithMath text={hint.hintText} />
      </div>
      {hint.studentResponse && (
        <div className="ml-4 bg-slate-100 rounded-xl px-4 py-3 text-sm text-slate-700 border border-slate-200">
          <p className="text-xs font-semibold text-slate-400 mb-1">Your response</p>
          <KaTeXRenderer latex={hint.studentResponse} />
        </div>
      )}
    </div>
  );
}

// ── Render text with inline $...$ LaTeX ──────────────────────────────────────

function MarkdownWithMath({ text }: { text: string }) {
  // Split on $...$ patterns and render math inline
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <KaTeXRenderer key={i} latex={part.slice(1, -1)} />
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Response input ────────────────────────────────────────────────────────────

function ResponseInput({
  errorStep,
  onSubmit,
  loading,
}: {
  errorStep: SessionStep;
  onSubmit: (latex: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setPreview(e.target.value);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="text-sm font-medium text-slate-700">
        Rewrite Step {errorStep.index} using LaTeX:
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={`e.g. ${errorStep.latex}`}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`Revised step ${errorStep.index}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onSubmit(value.trim());
              setValue("");
              setPreview("");
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (value.trim()) {
              onSubmit(value.trim());
              setValue("");
              setPreview("");
            }
          }}
          disabled={loading || !value.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {loading ? "…" : "Submit"}
        </button>
      </div>
      {preview && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span className="text-xs text-slate-400 mr-2">Preview:</span>
          <KaTeXRenderer latex={preview} />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [hints, setHints] = useState<HintEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hinting, setHinting] = useState(false);
  const [responding, setResponding] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [praise, setPraise] = useState<string | null>(null);
  const [challengeProblem, setChallengeProblem] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [allHintsUsed, setAllHintsUsed] = useState(false);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) { setError("Session not found."); setLoading(false); return; }
    const data: Session & { hints?: HintEvent[] } = await res.json();
    setSession(data);
    if (data.status === "RESOLVED") setResolved(true);
    setLoading(false);
  }, [sessionId]);

  // Also fetch hint events
  const fetchHints = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/hints`);
    if (res.ok) {
      const data = await res.json();
      setHints(data.hints ?? []);
      setAllHintsUsed((data.hints ?? []).length >= 3);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
    fetchHints();
  }, [fetchSession, fetchHints]);

  // If all correct from the start, auto-resolve
  useEffect(() => {
    if (!session) return;
    if (
      session.status === "COACHING" &&
      session.finalAnswerCorrect === true &&
      session.firstErrorStepIndex == null &&
      !resolved
    ) {
      handleResolve();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleGetHint = async () => {
    setHinting(true);
    setError("");
    const res = await fetch(`/api/sessions/${sessionId}/hint`, { method: "POST" });
    const data = await res.json();
    setHinting(false);

    if (!res.ok) {
      if (data.allHintsUsed) setAllHintsUsed(true);
      else setError(data.error ?? "Could not get a hint. Please try again.");
      return;
    }

    setAllHintsUsed(data.allHintsUsed ?? false);
    setHints((prev) => [
      ...prev,
      {
        id: data.hintId,
        level: `LEVEL_${data.level}` as HintEvent["level"],
        hintText: data.hint,
        studentResponse: null,
        resolvedAt: null,
      },
    ]);
  };

  const handleRespond = async (latex: string) => {
    if (!session?.firstErrorStepIndex) return;
    setResponding(true);
    setError("");
    const res = await fetch(`/api/sessions/${sessionId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIndex: session.firstErrorStepIndex, latex }),
    });
    const data = await res.json();
    setResponding(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    // Update hints to show the response
    setHints((prev) =>
      prev.map((h, i) =>
        i === prev.length - 1 ? { ...h, studentResponse: latex } : h
      )
    );

    if (data.resolved) {
      setPraise(data.praise);
      setChallengeProblem(data.challengeProblem ?? null);
      setResolved(true);
      await fetchSession();
    } else {
      // Reset hints used count — student can get more hints for next attempt
      setAllHintsUsed(false);
      await fetchSession();
    }
  };

  const handleResolve = async () => {
    const res = await fetch(`/api/sessions/${sessionId}/resolve`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setPraise(data.praise ?? null);
      setChallengeProblem(data.challengeProblem ?? null);
      setResolved(true);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      </main>
    );
  }

  if (!session || error) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-sm">
          <p className="text-slate-500 text-sm">{error || "Session not found."}</p>
          <a href="/student" className="mt-4 inline-block text-blue-600 text-sm hover:underline">← Back to Home</a>
        </div>
      </main>
    );
  }

  const errorStep = session.steps.find((s) => s.index === session.firstErrorStepIndex) ?? null;
  const hasError = session.firstErrorStepIndex != null && !resolved;

  // ── Resolved / Praise state ──────────────────────────────────────────────────

  if (resolved) {
    return (
      <main className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
          <a href="/student" className="text-slate-400 hover:text-slate-600 text-sm">← Home</a>
          <h1 className="text-lg font-bold text-slate-900">Nice Work!</h1>
        </header>
        <div className="max-w-xl mx-auto px-6 py-8 space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <p className="text-4xl mb-3" aria-hidden="true">🎉</p>
            <h2 className="text-xl font-bold text-green-800 mb-3">
              {session.finalAnswerCorrect ? "You got it right!" : "Great effort!"}
            </h2>
            {praise && (
              <p className="text-green-700 text-sm leading-relaxed">
                <MarkdownWithMath text={praise} />
              </p>
            )}
          </div>

          {challengeProblem && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-2">
                Want a challenge? Try this:
              </p>
              <KaTeXBlock latex={challengeProblem} />
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-600 mb-3">Your Work</p>
            <StepList steps={session.steps} errorIndex={null} />
          </div>

          <a
            href="/student/upload"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center rounded-xl py-3 text-base font-semibold transition-colors"
          >
            + Practice Another Problem
          </a>
        </div>
      </main>
    );
  }

  // ── Main coaching UI ─────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <a href="/student" className="text-slate-400 hover:text-slate-600 text-sm">← Home</a>
        <h1 className="text-lg font-bold text-slate-900">Let&apos;s Figure It Out</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

        {/* Problem */}
        {session.problemLatex && (
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Problem</p>
            <KaTeXBlock latex={session.problemLatex} />
          </section>
        )}

        {/* Steps */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Your Work
          </p>
          <StepList steps={session.steps} errorIndex={session.firstErrorStepIndex} />
        </section>

        {/* Error callout */}
        {hasError && errorStep && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900"
          >
            <strong>There&apos;s something to look at in Step {errorStep.index}.</strong>{" "}
            Don&apos;t worry — let&apos;s work through it together.
          </div>
        )}

        {/* Hint trail */}
        {hints.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Hints
            </p>
            {hints.map((h, i) => (
              <HintBubble key={h.id} hint={h} index={i} />
            ))}
          </section>
        )}

        {/* Error message */}
        {error && (
          <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {/* Actions */}
        {hasError && (
          <div className="space-y-3">
            {/* Response input — always shown when there's an error */}
            {errorStep && (
              <ResponseInput
                errorStep={errorStep}
                onSubmit={handleRespond}
                loading={responding}
              />
            )}

            {/* Get hint button */}
            {!allHintsUsed && (
              <button
                type="button"
                onClick={handleGetHint}
                disabled={hinting || responding}
                className="w-full bg-white border border-slate-200 hover:border-blue-300 text-slate-700 rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {hinting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
                    Getting a hint…
                  </span>
                ) : (
                  `Get a Hint (${hints.length}/3 used)`
                )}
              </button>
            )}

            {allHintsUsed && hints.length >= 3 && (
              <p className="text-center text-xs text-slate-400">
                All 3 hints used — try submitting your best answer above.
              </p>
            )}
          </div>
        )}

        {/* All correct — no error */}
        {!hasError && !resolved && session.finalAnswerCorrect === true && (
          <div className="text-center space-y-3">
            <p className="text-green-700 font-medium">All steps look correct! 🎉</p>
            <button
              type="button"
              onClick={handleResolve}
              className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-6 py-3 text-sm font-semibold transition-colors"
            >
              See your praise →
            </button>
          </div>
        )}

        {/* Unknown result — math service was down */}
        {!hasError && !resolved && session.finalAnswerCorrect == null && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
            We couldn&apos;t check your math automatically right now.{" "}
            <button
              type="button"
              onClick={fetchSession}
              className="text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
