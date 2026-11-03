import React, { useEffect, useRef } from "react";
import { ArrangementSection, CompiledSectionToken } from "../types/setlist";
import { MemoizedLyricLine } from "./MemoizedLyricLine";

interface TracksViewProps {
  sections: ArrangementSection[];
  songAst: CompiledSectionToken[];
  sectionStarts: number[];
  sectionDurations: number[];
  totalBeats: number;
  activeSectionIndex: number;
  queuedSectionIndex: number | null;
  activeLineIndex: number;
  playheadBeat: number;
  isPlaying: boolean;
  tempo: number;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
  chordFormat: "Key" | "Numbers";
  activeDisplayKey: string;
}

const TRACK_COLORS = [
  "border-blue-300 bg-blue-600",
  "border-violet-300 bg-violet-600",
  "border-emerald-300 bg-emerald-600",
  "border-amber-300 bg-amber-600",
  "border-pink-300 bg-pink-600",
  "border-cyan-300 bg-cyan-600",
];

export function TracksView({
  sections,
  songAst,
  sectionStarts,
  sectionDurations,
  totalBeats,
  activeSectionIndex,
  queuedSectionIndex,
  activeLineIndex,
  playheadBeat,
  isPlaying,
  tempo,
  showChords,
  lyricsFontSize,
  lineSpacing,
  chordFormat,
  activeDisplayKey,
}: TracksViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const anchorBeatRef = useRef(playheadBeat);
  const anchorTimeRef = useRef(0);
  const beatsPerMeasure = 4;
  const pixelsPerBeat = 18;
  const canvasWidth = Math.max(360, totalBeats * pixelsPerBeat + 32);
  const lyricSectionIndex = queuedSectionIndex ?? activeSectionIndex;
  const lyricSection = songAst[lyricSectionIndex];
  const lyricSectionLabel = sections[lyricSectionIndex]?.section_name ?? lyricSection?.section_name ?? "Section";

  useEffect(() => {
    anchorBeatRef.current = playheadBeat;
    anchorTimeRef.current = performance.now();
  }, [playheadBeat]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      return;
    }

    const renderFrame = (now: number) => {
      const viewport = viewportRef.current;
      const playhead = playheadRef.current;
      if (viewport && playhead) {
        const beat = anchorBeatRef.current + ((now - anchorTimeRef.current) * Math.max(1, tempo)) / 60_000;
        const left = Math.max(0, beat) * pixelsPerBeat;
        playhead.style.transform = `translateX(${left}px)`;
        const targetScroll = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, left - viewport.clientWidth * 0.35));
        viewport.scrollLeft = targetScroll;
      }
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animationFrameRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [isPlaying, pixelsPerBeat, tempo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <section className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8" aria-live="polite">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-black uppercase tracking-widest text-primary">{lyricSectionLabel}</h2>
            {queuedSectionIndex !== null && (
              <span className="rounded bg-violet-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">Queued</span>
            )}
          </div>
          <div className="space-y-2 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 md:p-6">
            {lyricSection?.lines.map((line, lineIndex) => (
              <MemoizedLyricLine
                key={`${lyricSection.id}-${lineIndex}`}
                line={line}
                sectionIndex={lyricSectionIndex}
                lineIndex={lineIndex}
                isCurrentlyPlayingLine={queuedSectionIndex === null && lineIndex === activeLineIndex}
                showChords={showChords}
                lyricsFontSize={lyricsFontSize}
                lineSpacing={lineSpacing}
                chordFormat={chordFormat}
                activeDisplayKey={activeDisplayKey}
              />
            ))}
            {!lyricSection?.lines.length && (
              <p className="py-6 text-center text-sm font-medium text-on-surface-variant">No lyrics in this section.</p>
            )}
          </div>
        </div>
      </section>

      <section className="absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-24px)] max-w-5xl -translate-x-1/2 rounded-2xl border border-outline-variant/30 bg-surface-container-low/95 p-3 shadow-2xl backdrop-blur-md" aria-label="Read-only song timeline">
        <div ref={viewportRef} className="overflow-x-hidden overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="relative h-20 select-none" style={{ width: `${canvasWidth}px` }}>
            <div className="absolute inset-x-0 top-0 h-7 border-b border-outline-variant/30">
              {Array.from({ length: Math.ceil(totalBeats / beatsPerMeasure) + 1 }, (_, index) => (
                <div
                  key={index}
                  className="absolute inset-y-0 border-l border-outline-variant/50 pl-1.5 pt-1 font-mono text-[9px] font-bold text-on-surface-variant"
                  style={{ left: `${index * beatsPerMeasure * pixelsPerBeat}px` }}
                >
                  {index + 1}
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 top-8 h-10 border-y border-outline-variant/30 bg-surface-container-high">
              {sections.map((section, index) => {
                const start = sectionStarts[index] ?? 0;
                const duration = sectionDurations[index] ?? 0;
                const colorIndex = Array.from(section.section_name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % TRACK_COLORS.length;
                const isActive = index === activeSectionIndex;
                const isQueued = index === queuedSectionIndex;
                return (
                  <div
                    key={section.id}
                    className={`absolute inset-y-0 flex items-center overflow-hidden rounded-md border px-2 text-[10px] font-black text-white ${TRACK_COLORS[colorIndex]} ${isActive ? "z-10 ring-2 ring-white" : ""} ${isQueued ? "z-10 ring-2 ring-violet-200" : ""}`}
                    style={{
                      left: `${start * pixelsPerBeat + 1}px`,
                      width: `${Math.max(28, duration * pixelsPerBeat - 2)}px`,
                    }}
                    title={section.section_name}
                  >
                    <span className="truncate">{section.section_name}</span>
                  </div>
                );
              })}
            </div>
            <div
              ref={playheadRef}
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-error"
              style={{ left: 0, transform: `translateX(${Math.max(0, playheadBeat) * pixelsPerBeat}px)` }}
              aria-hidden="true"
            />
          </div>
        </div>
        <p className="mt-1 text-center text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">Tracks · follows playback</p>
      </section>
    </div>
  );
}
