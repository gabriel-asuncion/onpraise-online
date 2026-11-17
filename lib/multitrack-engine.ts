export interface DecodedStem {
  id: string;
  buffer: AudioBuffer;
  volume: number;
  muted: boolean;
  solo: boolean;
  sourceVersion?: string;
}

export class MultitrackEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private stems: DecodedStem[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private gains = new Map<string, GainNode>();
  private startAt = 0;
  private offset = 0;
  private rate = 1;
  private playing = false;

  constructor(context: AudioContext) {
    this.context = context;
    this.master = context.createGain();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
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

  getStemMixes(): Array<Pick<DecodedStem, "id" | "volume" | "muted" | "solo" | "sourceVersion">> {
    return this.stems.map(({ id, volume, muted, solo, sourceVersion }) => ({
      id, volume, muted, solo, ...(sourceVersion !== undefined ? { sourceVersion } : {}),
    }));
  }

  replaceStemsWhilePaused(stems: DecodedStem[]): void {
    if (this.isPlaying) throw new Error("Pause local playback before changing stems.");
    const position = this.currentTimeSeconds;
    this.setStems(stems);
    this.seek(position);
  }

  setStems(stems: DecodedStem[]): void {
    this.stop();
    this.stems = stems;
  }

  setStemMix(id: string, mix: Partial<Pick<DecodedStem, "volume" | "muted" | "solo">>): void {
    const stem = this.stems.find((item) => item.id === id);
    if (!stem) throw new Error("Audio stem not found.");
    Object.assign(stem, mix);
    this.updateGains();
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
        source.connect(gain);
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
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    const boundaries = [0, 1, 2, 4, 8, 16, 32, 64, bins.length];
    return boundaries.slice(0, -1).map((start, i) => {
      const end = Math.min(bins.length, boundaries[i + 1]);
      let total = 0;
      for (let bin = start; bin < end; bin++) total += bins[bin];
      return end > start ? total / (end - start) / 255 : 0;
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
    for (const gain of this.gains.values()) gain.disconnect();
    this.sources = [];
    this.gains.clear();
  }
}
