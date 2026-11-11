export function adjustMidiLineBeats(
  currentBeats: number,
  rawValue: number,
  delta?: number,
): number {
  if (delta !== undefined) return Math.max(0, currentBeats + delta);
  return Math.round((rawValue / 127) * 64);
}

export function getMidiLaneIndex(count: number, currentIndex: number, rawValue: number, delta?: number): number {
  if (count <= 0) return -1;
  if (delta === undefined) return Math.round((rawValue / 127) * (count - 1));
  return Math.max(0, Math.min(count - 1, (currentIndex < 0 ? 0 : currentIndex) + delta));
}

export function getMidiSectionTimingValue(
  field: "measures" | "beats" | "repeats",
  current: number,
  rawValue: number,
  measureBeats: number,
  delta?: number,
): number {
  if (delta !== undefined) return Math.max(field === "measures" ? 1 : 0, current + delta);
  const maximum = field === "measures" ? 63 : field === "beats" ? Math.max(0, measureBeats - 1) : 8;
  const value = Math.round((rawValue / 127) * maximum);
  return field === "measures" ? Math.max(1, value + 1) : value;
}

export function getMidiScrubTime(
  currentTime: number,
  previousSeek: { time: number; timestamp: number } | null,
  now: number,
  bpm: number,
  start: number,
  end: number,
  maxTime: number,
  rawValue: number,
  delta?: number,
): number {
  const scrubTime = previousSeek && now - previousSeek.timestamp < 350
    ? previousSeek.time
    : currentTime;
  const target = delta !== undefined
    ? scrubTime + delta * 0.25 * 60 / bpm
    : start + (rawValue / 127) * Math.max(0, end - start);
  return Math.max(0, Math.min(maxTime, target));
}
