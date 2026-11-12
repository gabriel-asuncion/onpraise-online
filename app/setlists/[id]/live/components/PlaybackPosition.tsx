"use client";

import { formatPlaybackTime, getYoutubeTimeForTimeline } from "../utils/timeline";

export function PlaybackPosition({ beat, tempo, offsetMs, section, line, isPlaying }: {
  beat: number;
  tempo: number;
  offsetMs: number;
  section: string;
  line: number;
  isPlaying: boolean;
}) {
  const time = formatPlaybackTime(getYoutubeTimeForTimeline(beat, 0, tempo, offsetMs));
  return <div role="status" className="bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface">
    {isPlaying ? "Playing" : "Paused"} · {time} · {section || "Before first section"}{line >= 0 ? ` · Line ${line + 1}` : ""}
  </div>;
}
