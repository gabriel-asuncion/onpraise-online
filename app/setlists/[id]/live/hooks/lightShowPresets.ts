import type { FeedbackScene } from "../../../../songs/[id]/edit/midiFeedback";

export interface LightShowPreset {
  id: string;
  name: string;
  category: "EQ & Meters" | "Waves & Sweeps" | "Geometric" | "Cascades & Pulse";
  isLit: (row: number, col: number, step: number, beatPhase: number, beatInMeasure: number) => boolean;
}

export const SMC_MATRIX_NOTES = [
  [24, 25, 26, 27, 28, 29, 30, 31],
  [0, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21, 22, 23],
] as const;

const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const level = (step: number, col: number) =>
  Math.round(((Math.sin(step * 0.35 + col * 1.1) + Math.cos(step * 0.2 - col * 0.7) + 2) / 4) * 3.8);
const bounce = (step: number, max: number) => {
  const position = mod(step, max * 2);
  return position <= max ? position : max * 2 - position;
};

export const LIGHT_SHOW_PRESETS: readonly LightShowPreset[] = [
  { id: "eq_classic", name: "Classic 8-Band EQ", category: "EQ & Meters", isLit: (r, c, s) => r <= level(s, c) },
  { id: "eq_inverted", name: "Ceiling Drop EQ", category: "EQ & Meters", isLit: (r, c, s) => 3 - r <= level(s, c) },
  { id: "eq_center_mirror", name: "Center-Out EQ", category: "EQ & Meters", isLit: (r, c, s) => Math.abs(r - 1.5) <= level(s, c) / 2 },
  { id: "eq_bass_heavy", name: "Sub-Bass Pump", category: "EQ & Meters", isLit: (r, c, s, p) => c <= 2 ? r < Math.ceil((1 - p) * 4) : c >= 5 ? (s + c + r) % 3 === 0 : r < 2 },
  { id: "eq_peak_hold", name: "Peak-Hold Meter", category: "EQ & Meters", isLit: (r, c, s) => {
    const bar = Math.min(3, Math.floor(level(s, c) * 0.75));
    const peak = Math.min(3, Math.max(bar + 1, Math.floor(level(Math.max(0, s - 5), c))));
    return r < bar || r === peak;
  } },
  { id: "eq_stereo_vu", name: "Stereo Bridge VU", category: "EQ & Meters", isLit: (_r, c, s) => c <= level(s, 1) || 7 - c <= level(s, 1) },
  { id: "wave_sine", name: "Smooth Sine Wave", category: "Waves & Sweeps", isLit: (r, c, s) => Math.round((Math.sin(s * 0.25 + c * 0.65) + 1) * 1.5) === r },
  { id: "wave_double_helix", name: "Double Helix", category: "Waves & Sweeps", isLit: (r, c, s) => {
    const phase = s * 0.25 + c * 0.65;
    return r === Math.round((Math.sin(phase) + 1) * 1.5) || r === Math.round((Math.sin(phase + Math.PI) + 1) * 1.5);
  } },
  { id: "wave_diagonal_up", name: "Diagonal Chevrons Up", category: "Waves & Sweeps", isLit: (r, c, s) => mod(c + r - Math.floor(s * 0.4), 4) === 0 },
  { id: "wave_diagonal_down", name: "Diagonal Stripes Down", category: "Waves & Sweeps", isLit: (r, c, s) => mod(c - r + Math.floor(s * 0.4), 4) === 0 },
  { id: "sweep_scanner", name: "Stage Scanner", category: "Waves & Sweeps", isLit: (r, c, s) => {
    const step = Math.floor(s * 0.4);
    return c === bounce(step, 7) || (c === bounce(step - 1, 7) && (r + s) % 2 === 0);
  } },
  { id: "sweep_curtain", name: "Theater Curtain", category: "Waves & Sweeps", isLit: (_r, c, s) => Math.min(Math.abs(c - 3), Math.abs(c - 4)) <= bounce(Math.floor(s * 0.3), 3) },
  { id: "geo_center_swell", name: "Center Swell", category: "Geometric", isLit: (r, c, s) => {
    const size = (Math.sin(s * 0.25) + 1) / 2;
    return Math.abs(c - 3.5) <= 0.5 + 3 * size && Math.abs(r - 1.5) <= 0.5 + size;
  } },
  { id: "geo_implosion", name: "Outer Implosion", category: "Geometric", isLit: (r, c, s) => {
    const ring = mod(Math.floor(s * 0.25), 2);
    return r >= ring && r <= 3 - ring && c >= ring * 3 && c <= 7 - ring * 3 &&
      (r === ring || r === 3 - ring || c === ring * 3 || c === 7 - ring * 3);
  } },
  { id: "geo_checkerboard", name: "1x1 Checkerboard", category: "Geometric", isLit: (r, c, s) => (r + c + Math.floor(s * 0.25)) % 2 === 0 },
  { id: "geo_double_checker", name: "2x2 Block Flip", category: "Geometric", isLit: (r, c, s) => (Math.floor(r / 2) + Math.floor(c / 2) + Math.floor(s * 0.25)) % 2 === 0 },
  { id: "geo_crosshair", name: "Target Crosshair", category: "Geometric", isLit: (r, c, s) => r === bounce(Math.floor(s * 0.2), 3) || c === bounce(Math.floor(s * 0.3), 7) },
  { id: "geo_x_pulse", name: "Hourglass / X-Pulse", category: "Geometric", isLit: (r, c, _s, p) => p < 0.5 && (Math.floor(c / 2) === r || Math.floor(c / 2) === 3 - r) },
  { id: "rain_cascade", name: "Falling Rain", category: "Cascades & Pulse", isLit: (r, c, s) => r === 3 - mod(Math.floor(s * 0.3) + c * 3, 4) },
  { id: "rain_fountain", name: "Rising Bubbles", category: "Cascades & Pulse", isLit: (r, c, s) => r === mod(Math.floor(s * 0.3) + c * 3, 4) },
  { id: "matrix_stream", name: "Digital Matrix", category: "Cascades & Pulse", isLit: (r, c, s) => mod(3 - r - Math.floor(s * (0.18 + (c % 3) * 0.06)) - c * 3, 7) < 2 + c % 2 },
  { id: "sparkle_twinkle", name: "Starfield Twinkle", category: "Cascades & Pulse", isLit: (r, c, s) => (Math.imul(r * 7 + c * 13 + Math.floor(s * 0.3), 2654435761) >>> 0) % 10 < 3 },
  { id: "beat_strobe_bars", name: "Alternating Pillars", category: "Cascades & Pulse", isLit: (_r, c, _s, _p, beat) => c % 2 === mod(beat, 2) },
  { id: "beat_row_ladder", name: "4-Step Beat Ladder", category: "Cascades & Pulse", isLit: (r, _c, _s, _p, beat) => r === mod(beat, 4) },
];

export function pickNextRandomPresetIndex(currentIndex: number, totalPresets: number, random = Math.random): number {
  if (totalPresets <= 1) return 0;
  if (currentIndex < 0 || currentIndex >= totalPresets) return Math.floor(random() * totalPresets);
  const next = Math.floor(random() * (totalPresets - 1));
  return next >= currentIndex ? next + 1 : next;
}

export function shouldShuffleLightShow(started: boolean, wasPlaying: boolean, isPlaying: boolean, previousMeasure: number | null, measure: number, manual = false): boolean {
  return !started || (isPlaying && (!wasPlaying || (!manual && previousMeasure !== null && Math.abs(measure - previousMeasure) >= 4)));
}

export function moveLightShowPreset(currentIndex: number, delta: number, totalPresets: number): number {
  return mod(Math.max(0, currentIndex) + Math.trunc(delta), totalPresets);
}

export function createLightShowScene(preset: LightShowPreset, step: number, phase: number, beat: number): FeedbackScene {
  const scene: FeedbackScene = new Map();
  SMC_MATRIX_NOTES.forEach((notes, row) => notes.forEach((note, col) => {
    const control = { type: "note" as const, channel: 0, noteOrCcNumber: note };
    scene.set(`note:0:${note}`, { control, active: preset.isLit(row, col, step, phase, beat) });
  }));
  return scene;
}
