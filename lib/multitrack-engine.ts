import { inferStemRole, type StemRole } from "./offline-audio";
import { getStemSlot } from "./stem-slots";
import { createStemEqChain } from "./stem-eq";

export interface DecodedStem {
  id: string;
  buffer: AudioBuffer;
  volume: number;
  muted: boolean;
  solo: boolean;
  role?: StemRole;
  sourceVersion?: string;
}

export interface StemWaveform {
  id: string;
  peaks: number[];
  durationSeconds: number;
}

const waveformCache = new WeakMap<AudioBuffer, number[]>();

function computeBufferPeaks(buffer: AudioBuffer, bucketCount = 240): number[] {
  const cached = waveformCache.get(buffer);
  if (cached && cached.length === bucketCount) return cached;

  const channelCount = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  if (channelCount === 0 || totalSamples === 0) return Array(bucketCount).fill(0);

  const channels = Array.from({ length: channelCount }, (_, ch) => buffer.getChannelData(ch));
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / bucketCount));
  const peaks: number[] = new Array(bucketCount).fill(0);
  let maxPeak = 0.001;

  for (let i = 0; i < bucketCount; i++) {
    const start = i * samplesPerBucket;
    const end = i === bucketCount - 1 ? totalSamples : Math.min(totalSamples, start + samplesPerBucket);
    const step = Math.max(1, Math.floor((end - start) / 64));
    let peak = 0;
    for (let s = start; s < end; s += step) {
      for (let ch = 0; ch < channelCount; ch++) {
        const abs = Math.abs(channels[ch][s]);
        if (abs > peak) peak = abs;
      }
    }
    peaks[i] = peak;
    if (peak > maxPeak) maxPeak = peak;
  }

  const normalized = peaks.map((p) => Math.min(1, p / maxPeak));
  waveformCache.set(buffer, normalized);
  return normalized;
}

export class MultitrackEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private stems: DecodedStem[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private filterNodes: AudioNode[] = [];
  private gains = new Map<string, GainNode>();
  private eqEnabled = true;
  private preSoloMuteSnapshot: Map<string, boolean> | null = null;
  private listeners = new Set<() => void>();
  private startAt = 0;
  private offset = 0;
  private rate = 1;
  private playing = false;

  constructor(context: AudioContext) {
    this.context = context;
    this.master = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.minDecibels = -70;
    this.analyser.maxDecibels = -14;
    this.analyser.smoothingTimeConstant = 0;
    this.master.connect(this.analyser);
    this.analyser.connect(context.destination);
  }

  get durationSeconds(): number {
    return Math.max(0, ...this.stems.map((stem) => stem.buffer.duration));
  }

  get currentTimeSeconds(): number {
    return Math.min(this.durationSeconds, this.offset + (this.playing ? Math.max(0, this.context.currentTime - this.startAt) * this.rate : 0));
  }

  get isPlaying(): boolean { return this.playing && this.currentTimeSeconds < this.durationSeconds; }

  get isEqEnabled(): boolean { return this.eqEnabled; }

  setEqEnabled(enabled: boolean): void {
    if (this.eqEnabled === enabled) return;
    this.eqEnabled = enabled;
    if (this.isPlaying) {
      this.play(this.currentTimeSeconds);
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  getStemMixes(): Array<Pick<DecodedStem, "id" | "volume" | "muted" | "solo" | "sourceVersion">> {
    return this.stems.map(({ id, volume, muted, solo, sourceVersion }) => ({
      id, volume, muted, solo, ...(sourceVersion !== undefined ? { sourceVersion } : {}),
    }));
  }

  getStemWaveforms(bucketCount = 240): StemWaveform[] {
    return this.stems.map((stem) => ({
      id: stem.id,
      peaks: computeBufferPeaks(stem.buffer, bucketCount),
      durationSeconds: stem.buffer.duration,
    }));
  }

  replaceStemsWhilePaused(stems: DecodedStem[]): void {
    if (this.isPlaying) throw new Error("Pause local playback before changing stems.");
    const position = this.currentTimeSeconds;
    this.stopSources();
    this.playing = false;
    this.stems = stems;
    if (this.preSoloMuteSnapshot) {
      const validIds = new Set(stems.map((s) => s.id));
      for (const id of this.preSoloMuteSnapshot.keys()) {
        if (!validIds.has(id)) this.preSoloMuteSnapshot.delete(id);
      }
      if (!stems.some((s) => s.solo)) this.preSoloMuteSnapshot = null;
    }
    this.seek(position);
    this.notify();
  }

  setStems(stems: DecodedStem[]): void {
    this.stop();
    this.stems = stems;
    this.preSoloMuteSnapshot = null;
    this.notify();
  }

  toggleStemMute(id: string): void {
    const stem = this.stems.find((item) => item.id === id);
    if (!stem) throw new Error("Audio stem not found.");
    const nextMuted = !stem.muted;
    stem.muted = nextMuted;
    if (nextMuted && stem.solo) {
      stem.solo = false;
      if (!this.stems.some((item) => item.solo) && this.preSoloMuteSnapshot) {
        for (const item of this.stems) {
          if (item.id !== id) item.muted = this.preSoloMuteSnapshot.get(item.id) ?? false;
        }
        this.preSoloMuteSnapshot = null;
      }
    }
    this.updateGains();
    this.notify();
  }

  toggleStemSolo(id: string): void {
    const target = this.stems.find((item) => item.id === id);
    if (!target) throw new Error("Audio stem not found.");

    if (target.solo) {
      for (const item of this.stems) {
        item.solo = false;
        item.muted = this.preSoloMuteSnapshot?.get(item.id) ?? false;
      }
      this.preSoloMuteSnapshot = null;
    } else {
      if (!this.preSoloMuteSnapshot) {
        this.preSoloMuteSnapshot = new Map(this.stems.map((item) => [item.id, item.muted]));
      }
      for (const item of this.stems) {
        const isTarget = item.id === id;
        item.solo = isTarget;
        item.muted = !isTarget;
      }
    }
    this.updateGains();
    this.notify();
  }

  setStemMix(id: string, mix: Partial<Pick<DecodedStem, "volume" | "muted" | "solo">>): void {
    const stem = this.stems.find((item) => item.id === id);
    if (!stem) throw new Error("Audio stem not found.");
    if (mix.solo !== undefined && mix.solo !== stem.solo) {
      if (mix.volume !== undefined) stem.volume = mix.volume;
      this.toggleStemSolo(id);
      return;
    }
    if (mix.muted !== undefined && mix.muted !== stem.muted) {
      if (mix.volume !== undefined) stem.volume = mix.volume;
      this.toggleStemMute(id);
      return;
    }
    Object.assign(stem, mix);
    this.updateGains();
    this.notify();
  }

  setStemVolumeAtIndex(index: number, volume: number): boolean {
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(volume)) {
      throw new Error("Invalid stem fader value or index.");
    }
    const stem = this.stems[index];
    if (!stem) return false;
    this.setStemMix(stem.id, { volume: Math.max(0, Math.min(1, volume)) });
    return true;
  }

  setMasterVolume(volume: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  private updateGains(): void {
    const anySolo = this.stems.some((stem) => stem.solo);
    for (const stem of this.stems) {
      const gain = this.gains.get(stem.id);
      if (gain) gain.gain.value = stem.muted || (anySolo && !stem.solo) ? 0 : Math.max(0, Math.min(1, stem.volume));
    }
  }

  play(offsetSeconds = this.offset, startAt = this.context.currentTime + 0.03): void {
    if (!this.stems.length) throw new Error("No local audio stems are loaded.");
    if (this.context.state !== "running") throw new Error("The audio context is not running.");
    if (!Number.isFinite(offsetSeconds) || !Number.isFinite(startAt)) throw new Error("Invalid audio playback position.");
    this.stopSources();
    this.offset = Math.max(0, Math.min(this.durationSeconds, offsetSeconds));
    this.startAt = Math.max(this.context.currentTime, startAt);
    this.playing = this.offset < this.durationSeconds;
    if (!this.playing) return;
    try {
      for (const stem of this.stems) {
        if (this.offset >= stem.buffer.duration) continue;
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = stem.buffer;
        source.playbackRate.value = this.rate;
        if (this.eqEnabled) {
          const slot = getStemSlot(stem.role ?? inferStemRole(stem.id));
          const eq = createStemEqChain(this.context, slot);
          source.connect(eq.input);
          eq.output.connect(gain);
          this.filterNodes.push(...eq.nodes);
        } else {
          source.connect(gain);
        }
        gain.connect(this.master);
        this.sources.push(source);
        this.gains.set(stem.id, gain);
        source.start(this.startAt, this.offset);
      }
      this.updateGains();
    } catch (error) {
      this.stopSources();
      this.playing = false;
      throw error;
    }
  }

  pause(): void {
    this.offset = this.currentTimeSeconds;
    this.stopSources();
    this.playing = false;
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) throw new Error("Invalid audio seek position.");
    const next = Math.max(0, Math.min(this.durationSeconds, seconds));
    if (this.isPlaying) this.play(next);
    else this.offset = next;
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid audio playback rate.");
    const position = this.currentTimeSeconds;
    const wasPlaying = this.isPlaying;
    this.rate = rate;
    if (wasPlaying) this.play(position);
    else this.offset = position;
  }

  getFrequencyBands(): number[] {
    if (!this.isPlaying) return [0, 0, 0, 0, 0, 0, 0, 0];
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
    // 8 strips: Sub, Bass, Low-Mid, Mid (4), High-Mid (5), Upper High-Mid (6), Highs (7), Air (8)
    const hzEdges = [40, 110, 250, 550, 1200, 2600, 5000, 9500, 18000];
    const bandGain = [0.88, 0.95, 1.04, 1.16, 1.32, 1.56, 2.15, 3.05];
    const peakWeight = [0.25, 0.25, 0.3, 0.35, 0.42, 0.5, 0.62, 0.72];
    return hzEdges.slice(0, -1).map((lowHz, i) => {
      const highHz = hzEdges[i + 1];
      const start = Math.max(1, Math.floor(lowHz / hzPerBin));
      const end = Math.min(bins.length, Math.max(start + 1, Math.ceil(highHz / hzPerBin)));
      let total = 0;
      let maxBin = 0;
      for (let bin = start; bin < end; bin++) {
        const value = bins[bin];
        total += value;
        if (value > maxBin) maxBin = value;
      }
      const avg = end > start ? total / (end - start) / 255 : 0;
      const peak = maxBin / 255;
      const pw = peakWeight[i] ?? 0.35;
      const blended = (avg * (1 - pw) + peak * pw) * (bandGain[i] ?? 1);
      const gated = Math.max(0, (blended - 0.12) / 0.88);
      return Math.min(1, Math.pow(gated, 1.15));
    });
  }

  dispose(): void {
    this.stop();
    this.master.disconnect();
    this.analyser.disconnect();
  }

  private stopSources(): void {
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    for (const node of this.filterNodes) node.disconnect();
    for (const gain of this.gains.values()) gain.disconnect();
    this.sources = [];
    this.filterNodes = [];
    this.gains.clear();
  }
}
