export type MetronomeSpeed = "default" | "double" | "half";
export type MetronomePattern = "default" | "no-downbeat" | "backbeat" | "alternate";

export const METRONOME_SPEEDS: MetronomeSpeed[] = ["default", "double", "half"];
export const METRONOME_PATTERNS: MetronomePattern[] = ["default", "no-downbeat", "backbeat", "alternate"];

export function isClickVolumeMuted(volumePercent: number): boolean {
  return volumePercent < 1;
}

export function getMetronomeStep(speed: MetronomeSpeed): number {
  return speed === "double" ? 0.5 : speed === "half" ? 2 : 1;
}

export function getMissedClickSteps(nextTime: number, currentTime: number, interval: number): number {
  if (!Number.isFinite(nextTime) || !Number.isFinite(currentTime) || !Number.isFinite(interval) || interval <= 0) return 0;
  return Math.max(0, Math.ceil((currentTime - nextTime) / interval));
}

export function getMetronomePulse(
  clickIndex: number,
  speed: MetronomeSpeed,
  pattern: MetronomePattern,
  beatsPerMeasure: number,
): 1 | 2 | null {
  const position = clickIndex * getMetronomeStep(speed);
  const measureBeat = ((Math.floor(position + 1e-8) % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure + 1;
  const onBeat = Math.abs(position - Math.round(position)) < 1e-8;
  if (pattern === "backbeat") return onBeat && (measureBeat === 2 || measureBeat === 4) ? 2 : null;
  if (pattern === "no-downbeat") return 2;
  if (pattern === "alternate") return ((clickIndex % 2) + 2) % 2 === 0 ? 1 : 2;
  return onBeat && measureBeat === 1 ? 1 : 2;
}
