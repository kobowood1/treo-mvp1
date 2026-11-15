"use client";

import { useEffect, useRef } from "react";

interface KaTeXRendererProps {
  latex: string;
  displayMode?: boolean;
  className?: string;
}

/**
 * Renders a LaTeX string using KaTeX (client-side).
 * Falls back to the raw LaTeX string if KaTeX fails.
 */
export function KaTeXRenderer({ latex, displayMode = false, className = "" }: KaTeXRendererProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    import("katex").then(({ default: katex }) => {
      try {
        katex.render(latex, ref.current!, {
          displayMode,
          throwOnError: false,
          strict: false,
          trust: false,
        });
      } catch {
        if (ref.current) {
          ref.current.textContent = latex;
        }
      }
    });
  }, [latex, displayMode]);

  return (
    <span
      ref={ref}
      className={className}
      aria-label={`Math expression: ${latex}`}
    >
      {/* KaTeX renders into this span */}
    </span>
  );
}

/**
 * Renders a block (display-mode) LaTeX equation.
 */
export function KaTeXBlock({ latex, className = "" }: { latex: string; className?: string }) {
  return (
    <div className={`overflow-x-auto py-2 ${className}`}>
      <KaTeXRenderer latex={latex} displayMode className="block text-center" />
    </div>
  );
}
