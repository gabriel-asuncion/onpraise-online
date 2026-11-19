import type { FeedbackScene } from "../../../../songs/[id]/edit/midiFeedback";

export interface AudioIntensityFrame {
  levels: readonly number[];
  peaks: readonly number[];
  energy: number;
  bass: number;
  highs: number;
}

export interface LightShowPreset {
  id: string;
  name: string;
  category: "EQ & Meters" | "Waves & Sweeps" | "Geometric" | "Cascades & Pulse";
  isLit: (
    row: number,
    col: number,
    step: number,
    beatPhase: number,
    beatInMeasure: number,
    audio?: AudioIntensityFrame | null,
  ) => boolean;
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

const getBarRows = (value: number): number => {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  if (clamped < 0.10) return 0;
  if (clamped < 0.34) return 1;
  if (clamped < 0.60) return 2;
  if (clamped < 0.82) return 3;
  return 4;
};

const getPeakRowFromBottom = (peak: number): number => {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(peak) ? peak : 0));
  return clamped <= 0.04 ? -1 : Math.min(3, Math.floor(clamped * 3.99));
};

export const LIGHT_SHOW_PRESETS: readonly LightShowPreset[] = [
  { id: "eq_peak_hold", name: "Peak-Hold Meter", category: "EQ & Meters", isLit: (r, c, s, _p, _b, audio) => {
    if (audio) {
      const barRows = getBarRows(audio.levels[c] ?? 0);
      const peakRow = getPeakRowFromBottom(audio.peaks[c] ?? 0);
      return r < barRows || (peakRow >= 0 && r === peakRow);
    }
    const bar = Math.min(3, Math.floor(level(s, c) * 0.75));
    const peak = Math.min(3, Math.max(bar + 1, Math.floor(level(Math.max(0, s - 5), c))));
    return r < bar || r === peak;
  } },
  { id: "eq_classic", name: "Classic 8-Band EQ", category: "EQ & Meters", isLit: (r, c, s, _p, _b, audio) => {
    if (audio) {
      const barRows = getBarRows(audio.levels[c] ?? 0);
      return r < barRows;
    }
    return r <= level(s, c);
  } },
  { id: "eq_inverted", name: "Ceiling Drop EQ", category: "EQ & Meters", isLit: (r, c, s, _p, _b, audio) => {
    if (audio) {
      const barRows = getBarRows(audio.levels[c] ?? 0);
      const peakRow = getPeakRowFromBottom(audio.peaks[c] ?? 0);
      return r < barRows || (peakRow >= 0 && r === peakRow);
    }
    return 3 - r <= level(s, c);
  } },
  { id: "eq_center_mirror", name: "Center-Out EQ", category: "EQ & Meters", isLit: (r, c, s, _p, _b, audio) => {
    if (audio) {
      const amp = Math.max(0, Math.min(1, audio.levels[c] ?? 0));
      return amp > 0.03 && Math.abs(r - 1.5) <= amp * 2;
    }
    return Math.abs(r - 1.5) <= level(s, c) / 2;
  } },
  { id: "eq_bass_heavy", name: "Sub-Bass Pump", category: "EQ & Meters", isLit: (r, c, s, p, _b, audio) => {
    if (audio) {
      const fromBottom = 3 - r;
      if (c <= 2) return fromBottom < getBarRows(audio.bass);
      if (c >= 5) return fromBottom < getBarRows(audio.highs);
      return fromBottom < getBarRows(audio.levels[c] ?? audio.energy);
    }
    return c <= 2 ? r < Math.ceil((1 - p) * 4) : c >= 5 ? (s + c + r) % 3 === 0 : r < 2;
  } },
  { id: "eq_stereo_vu", name: "Stereo Bridge VU", category: "EQ & Meters", isLit: (r, c, s, _p, _b, audio) => {
    if (audio) {
      const span = Math.round(audio.energy * 4);
      const bandRows = getBarRows(audio.levels[c] ?? 0);
      return (c < span || 7 - c < span) && 3 - r < Math.max(1, bandRows);
    }
    return c <= level(s, 1) || 7 - c <= level(s, 1);
  } },
  { id: "wave_sine", name: "Smooth Sine Wave", category: "Waves & Sweeps", isLit: (r, c, s, _p, _b, audio) => {
    const amp = audio ? 0.25 + audio.energy * 1.25 : 1.5;
    if (audio && audio.energy < 0.03) return false;
    return Math.round(1.5 + Math.sin(s * 0.25 + c * 0.65) * amp) === r;
  } },
  { id: "wave_double_helix", name: "Double Helix", category: "Waves & Sweeps", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && audio.energy < 0.03) return false;
    const amp = audio ? 0.35 + audio.energy * 1.15 : 1.5;
    const phase = s * 0.25 + c * 0.65;
    return r === Math.round(1.5 + Math.sin(phase) * amp) || r === Math.round(1.5 + Math.sin(phase + Math.PI) * amp);
  } },
  { id: "wave_diagonal_up", name: "Diagonal Chevrons Up", category: "Waves & Sweeps", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && (3 - r) >= getBarRows(Math.max(audio.energy, audio.levels[c] ?? 0))) return false;
    return mod(c + r - Math.floor(s * 0.4), 4) === 0;
  } },
  { id: "wave_diagonal_down", name: "Diagonal Stripes Down", category: "Waves & Sweeps", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && (3 - r) >= getBarRows(Math.max(audio.energy, audio.levels[c] ?? 0))) return false;
    return mod(c - r + Math.floor(s * 0.4), 4) === 0;
  } },
  { id: "sweep_scanner", name: "Stage Scanner", category: "Waves & Sweeps", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && audio.energy < 0.03) return false;
    const step = Math.floor(s * 0.4);
    const heightOk = !audio || (3 - r) < Math.max(1, getBarRows(audio.energy));
    return heightOk && (c === bounce(step, 7) || (c === bounce(step - 1, 7) && (r + s) % 2 === 0));
  } },
  { id: "sweep_curtain", name: "Theater Curtain", category: "Waves & Sweeps", isLit: (_r, c, s, _p, _b, audio) => {
    const spread = audio ? Math.round(audio.energy * 3.5) : bounce(Math.floor(s * 0.3), 3);
    return (!audio || audio.energy >= 0.03) && Math.min(Math.abs(c - 3), Math.abs(c - 4)) <= spread;
  } },
  { id: "geo_center_swell", name: "Center Swell", category: "Geometric", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && audio.energy < 0.03) return false;
    const size = audio ? audio.energy : (Math.sin(s * 0.25) + 1) / 2;
    return Math.abs(c - 3.5) <= 0.5 + 3 * size && Math.abs(r - 1.5) <= 0.5 + size;
  } },
  { id: "geo_implosion", name: "Outer Implosion", category: "Geometric", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && audio.energy < 0.03) return false;
    const ring = audio ? (audio.bass > 0.45 ? 0 : 1) : mod(Math.floor(s * 0.25), 2);
    return r >= ring && r <= 3 - ring && c >= ring * 3 && c <= 7 - ring * 3 &&
      (r === ring || r === 3 - ring || c === ring * 3 || c === 7 - ring * 3);
  } },
  { id: "geo_checkerboard", name: "1x1 Checkerboard", category: "Geometric", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && (3 - r) >= getBarRows(audio.levels[c] ?? audio.energy)) return false;
    return (r + c + Math.floor(s * 0.25)) % 2 === 0;
  } },
  { id: "geo_double_checker", name: "2x2 Block Flip", category: "Geometric", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && audio.energy < 0.05) return false;
    return (Math.floor(r / 2) + Math.floor(c / 2) + Math.floor(s * 0.25)) % 2 === 0;
  } },
  { id: "geo_crosshair", name: "Target Crosshair", category: "Geometric", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && audio.energy < 0.03) return false;
    const targetRow = audio ? 3 - Math.min(3, Math.floor(audio.bass * 3.99)) : bounce(Math.floor(s * 0.2), 3);
    return r === targetRow || c === bounce(Math.floor(s * 0.3), 7);
  } },
  { id: "geo_x_pulse", name: "Hourglass / X-Pulse", category: "Geometric", isLit: (r, c, _s, p, _b, audio) => {
    const active = audio ? audio.energy > 0.22 : p < 0.5;
    return active && (Math.floor(c / 2) === r || Math.floor(c / 2) === 3 - r);
  } },
  { id: "rain_cascade", name: "Falling Rain", category: "Cascades & Pulse", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && (audio.levels[c] ?? 0) < 0.08) return false;
    return r === 3 - mod(Math.floor(s * 0.3) + c * 3, 4);
  } },
  { id: "rain_fountain", name: "Rising Bubbles", category: "Cascades & Pulse", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && (3 - r) >= getBarRows(audio.levels[c] ?? 0)) return false;
    return r === mod(Math.floor(s * 0.3) + c * 3, 4);
  } },
  { id: "matrix_stream", name: "Digital Matrix", category: "Cascades & Pulse", isLit: (r, c, s, _p, _b, audio) => {
    if (audio && (3 - r) >= getBarRows(Math.max(audio.energy * 0.8, audio.levels[c] ?? 0))) return false;
    return mod(3 - r - Math.floor(s * (0.18 + (c % 3) * 0.06)) - c * 3, 7) < 2 + c % 2;
  } },
  { id: "sparkle_twinkle", name: "Starfield Twinkle", category: "Cascades & Pulse", isLit: (r, c, s, _p, _b, audio) => {
    const threshold = audio ? Math.round(audio.highs * 10) : 3;
    return (Math.imul(r * 7 + c * 13 + Math.floor(s * 0.3), 2654435761) >>> 0) % 10 < threshold;
  } },
  { id: "beat_strobe_bars", name: "Alternating Pillars", category: "Cascades & Pulse", isLit: (r, c, _s, _p, beat, audio) => {
    if (audio && (3 - r) >= getBarRows(audio.bass)) return false;
    return c % 2 === mod(beat, 2);
  } },
  { id: "beat_row_ladder", name: "4-Step Beat Ladder", category: "Cascades & Pulse", isLit: (r, _c, _s, _p, beat, audio) => {
    if (audio) return 3 - r < getBarRows(audio.energy);
    return r === mod(beat, 4);
  } },
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

export function createLightShowScene(
  preset: LightShowPreset,
  step: number,
  phase: number,
  beat: number,
  audio?: AudioIntensityFrame | null,
): FeedbackScene {
  const scene: FeedbackScene = new Map();
  SMC_MATRIX_NOTES.forEach((notes, row) => notes.forEach((note, col) => {
    const control = { type: "note" as const, channel: 0, noteOrCcNumber: note };
    scene.set(`note:0:${note}`, { control, active: preset.isLit(row, col, step, phase, beat, audio) });
  }));
  return scene;
}

export function createFrequencyScene(bands: readonly number[]): FeedbackScene {
  const scene: FeedbackScene = new Map();
  SMC_MATRIX_NOTES.forEach((notes, row) => notes.forEach((note, col) => {
    const barRows = getBarRows(bands[col] ?? 0);
    const control = { type: "note" as const, channel: 0, noteOrCcNumber: note };
    scene.set(`note:0:${note}`, { control, active: row < barRows });
  }));
  return scene;
}
