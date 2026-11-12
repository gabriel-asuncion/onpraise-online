"use client";

export function EqualizerStatus({ presetName, error, onShuffle, onClose }: {
  presetName: string;
  error: string | null;
  onShuffle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface-container px-3 py-2 text-xs">
      <button type="button" className="font-bold" onClick={onShuffle} aria-label={`Shuffle light show, current preset ${presetName}`}>EQ Mode · {presetName}</button>
      <button type="button" className="rounded bg-primary px-2 py-1 text-on-primary" onClick={onShuffle}>Shuffle</button>
      <button type="button" className="rounded bg-surface-container-high px-2 py-1" onClick={onClose}>Exit EQ Mode</button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
