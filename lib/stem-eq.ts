import type { StemSlot } from "./stem-slots";

export interface PeakingBand {
  frequency: number;
  gain: number;
  Q: number;
}

export interface StemEqPreset {
  label: string;
  highPassHz: number;
  highPassSlope: 18 | 24;
  lowMidCleanup: PeakingBand;
  presence: PeakingBand | null;
  highNotch?: PeakingBand;
  highEndControl:
    | { kind: "lowpass"; frequency: number }
    | { kind: "highshelf"; frequency: number; gain: number };
}

export const STEM_EQ_PRESETS: Record<StemSlot, StemEqPreset> = {
  vocals: {
    label: "Vocals",
    highPassHz: 90,
    highPassSlope: 24,
    lowMidCleanup: { frequency: 280, gain: -2.5, Q: 2.0 },
    presence: { frequency: 3200, gain: 1.5, Q: 1.5 },
    highNotch: { frequency: 6500, gain: -2.0, Q: 3.0 },
    highEndControl: { kind: "lowpass", frequency: 16500 },
  },
  drums: {
    label: "Drums",
    highPassHz: 30,
    highPassSlope: 24,
    lowMidCleanup: { frequency: 350, gain: -3.0, Q: 2.5 },
    presence: { frequency: 2500, gain: 1.5, Q: 1.5 },
    highEndControl: { kind: "highshelf", frequency: 10000, gain: 1.5 },
  },
  bass: {
    label: "Bass",
    highPassHz: 25,
    highPassSlope: 24,
    lowMidCleanup: { frequency: 220, gain: -2.0, Q: 2.0 },
    presence: { frequency: 800, gain: 1.5, Q: 2.0 },
    highEndControl: { kind: "lowpass", frequency: 4500 },
  },
  guitars: {
    label: "Guitar",
    highPassHz: 85,
    highPassSlope: 18,
    lowMidCleanup: { frequency: 250, gain: -2.5, Q: 2.0 },
    presence: { frequency: 2800, gain: 1.5, Q: 1.5 },
    highEndControl: { kind: "lowpass", frequency: 12000 },
  },
  keys: {
    label: "Keyboard",
    highPassHz: 70,
    highPassSlope: 18,
    lowMidCleanup: { frequency: 300, gain: -2.0, Q: 1.8 },
    presence: { frequency: 4000, gain: 1.0, Q: 1.5 },
    highEndControl: { kind: "lowpass", frequency: 14000 },
  },
  other: {
    label: "Other",
    highPassHz: 100,
    highPassSlope: 18,
    lowMidCleanup: { frequency: 300, gain: -3.0, Q: 2.0 },
    presence: null,
    highEndControl: { kind: "lowpass", frequency: 11000 },
  },
};

export interface StemEqChain {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
}

function createFirstOrderHighPass(context: AudioContext, cutoffHz: number): AudioNode | null {
  if (typeof context.createIIRFilter !== "function") return null;
  const clampedHz = Math.max(10, Math.min(context.sampleRate * 0.45, cutoffHz));
  const k = Math.tan((Math.PI * clampedHz) / context.sampleRate);
  const norm = 1 / (1 + k);
  return context.createIIRFilter([norm, -norm], [1, (k - 1) * norm]);
}

function createPeakingFilter(context: AudioContext, band: PeakingBand): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = "peaking";
  filter.frequency.value = band.frequency;
  filter.gain.value = band.gain;
  filter.Q.value = band.Q;
  return filter;
}

export function createStemEqChain(context: AudioContext, slot: StemSlot): StemEqChain {
  const preset = STEM_EQ_PRESETS[slot];
  const nodes: AudioNode[] = [];

  if (preset.highPassSlope === 24) {
    // 4th-order Butterworth high-pass (24 dB/oct): two cascaded 2nd-order stages
    for (const q of [0.5411961, 1.306563]) {
      const stage = context.createBiquadFilter();
      stage.type = "highpass";
      stage.frequency.value = preset.highPassHz;
      stage.Q.value = q;
      nodes.push(stage);
    }
  } else {
    // 3rd-order Butterworth high-pass (18 dB/oct): 1st-order + 2nd-order (Q = 1.0)
    const firstOrder = createFirstOrderHighPass(context, preset.highPassHz);
    if (firstOrder) nodes.push(firstOrder);
    const secondOrder = context.createBiquadFilter();
    secondOrder.type = "highpass";
    secondOrder.frequency.value = preset.highPassHz;
    secondOrder.Q.value = firstOrder ? 1.0 : Math.SQRT1_2;
    nodes.push(secondOrder);
  }

  nodes.push(createPeakingFilter(context, preset.lowMidCleanup));

  if (preset.presence) {
    nodes.push(createPeakingFilter(context, preset.presence));
  }

  if (preset.highNotch) {
    nodes.push(createPeakingFilter(context, preset.highNotch));
  }

  const highEnd = context.createBiquadFilter();
  if (preset.highEndControl.kind === "lowpass") {
    highEnd.type = "lowpass";
    highEnd.frequency.value = preset.highEndControl.frequency;
    highEnd.Q.value = Math.SQRT1_2; // 12 dB/oct Butterworth
  } else {
    highEnd.type = "highshelf";
    highEnd.frequency.value = preset.highEndControl.frequency;
    highEnd.gain.value = preset.highEndControl.gain;
  }
  nodes.push(highEnd);

  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].connect(nodes[i + 1]);
  }

  return {
    input: nodes[0],
    output: nodes[nodes.length - 1],
    nodes,
  };
}