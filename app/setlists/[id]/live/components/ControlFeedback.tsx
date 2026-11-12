"use client";

export function ControlFeedback({ feedback }: { feedback: { label: string; value: string } }) {
  return <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-[250002] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-primary/40 bg-surface-container-highest/95 px-4 py-2.5 text-xs text-on-surface shadow-2xl backdrop-blur">
    <span className="font-semibold text-on-surface-variant">{feedback.label}</span>
    <span className="font-mono text-sm font-black text-primary">{feedback.value}</span>
  </div>;
}
