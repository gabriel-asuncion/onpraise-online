import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedbackScene } from "../../../../songs/[id]/edit/midiFeedback";
import { createFrequencyScene, createLightShowScene, LIGHT_SHOW_PRESETS, moveLightShowPreset, pickNextRandomPresetIndex, shouldShuffleLightShow, type AudioIntensityFrame } from "./lightShowPresets";

export interface LightShowPlayback {
  isPlaying: boolean;
  beat: number;
  tempo: number;
  quarterBeatsPerMeasure: number;
  unitQuarterBeats: number;
  getFrequencyBands?: () => number[] | null;
}

export function useLightShow(enabled: boolean, playback: LightShowPlayback, onFrame: (scene: FeedbackScene) => void) {
  const [presetIndex, setPresetIndex] = useState(-1);
  const [isStemVisualizerActive, setIsStemVisualizerActive] = useState(false);
  const indexRef = useRef(-1);
  const stemVisualizerRef = useRef(false);
  const playbackRef = useRef(playback);
  const frameRef = useRef(onFrame);
  const manualRef = useRef(false);

  useEffect(() => {
    playbackRef.current = playback;
    frameRef.current = onFrame;
  }, [playback, onFrame]);

  const shuffle = useCallback(() => {
    manualRef.current = false;
    const next = pickNextRandomPresetIndex(indexRef.current, LIGHT_SHOW_PRESETS.length);
    indexRef.current = next;
    setPresetIndex(next);
  }, []);
  const selectPreset = useCallback((delta: number) => {
    if (!Number.isFinite(delta) || !delta) return null;
    const next = moveLightShowPreset(indexRef.current, delta, LIGHT_SHOW_PRESETS.length);
    manualRef.current = true;
    indexRef.current = next;
    setPresetIndex(next);
    return LIGHT_SHOW_PRESETS[next].name;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let step = 0;
    let previousPlaying = false;
    let started = false;
    let lastMeasure: number | null = null;
    let lastBeat = playbackRef.current.beat;
    let beatTime = performance.now();
    let lastFrameTime = performance.now();
    let lastPresetStepTime = performance.now();
    let rafId = 0;
    const smoothedLevels = new Array<number>(8).fill(0);
    const peakLevels = new Array<number>(8).fill(0);
    const peakHoldFrames = new Array<number>(8).fill(0);

    const buildAudioFrame = (bands: readonly number[], dtSeconds: number): AudioIntensityFrame => {
      let sum = 0;
      const decayFactor = Math.pow(0.0004, Math.min(0.1, Math.max(0.004, dtSeconds)));
      for (let col = 0; col < 8; col++) {
        const target = Math.max(0, Math.min(1, Number.isFinite(bands[col]) ? bands[col] : 0));
        const decayed = smoothedLevels[col] * decayFactor;
        const nextLevel = target >= decayed ? target : (decayed < 0.02 ? 0 : decayed);
        smoothedLevels[col] = nextLevel;
        sum += nextLevel;

        if (nextLevel >= peakLevels[col]) {
          peakLevels[col] = nextLevel;
          peakHoldFrames[col] = 6;
        } else if (peakHoldFrames[col] > 0) {
          peakHoldFrames[col] -= 1;
        } else {
          peakLevels[col] = Math.max(nextLevel, peakLevels[col] - dtSeconds * 4.5);
        }
      }
      const bass = (smoothedLevels[0] + smoothedLevels[1] + smoothedLevels[2]) / 3;
      const highs = (smoothedLevels[5] + smoothedLevels[6] + smoothedLevels[7]) / 3;
      return {
        levels: smoothedLevels,
        peaks: peakLevels,
        energy: Math.min(1, (sum / 8) * 1.25),
        bass,
        highs,
      };
    };

    const tick = () => {
      const current = playbackRef.current;
      const now = performance.now();
      const dtSeconds = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      if (current.beat !== lastBeat || (current.isPlaying && !previousPlaying)) {
        lastBeat = current.beat;
        beatTime = now;
      }
      const beat = current.beat + (current.isPlaying ? (now - beatTime) * (current.tempo || 75) / 60000 : 0);
      const measureLength = current.quarterBeatsPerMeasure || 4;
      const unit = current.unitQuarterBeats || 1;
      const measure = Math.floor(beat / measureLength);
      const bands = current.getFrequencyBands?.() ?? null;
      const useStemVisualizer = Boolean(bands);
      if (useStemVisualizer !== stemVisualizerRef.current) {
        stemVisualizerRef.current = useStemVisualizer;
        setIsStemVisualizerActive(useStemVisualizer);
      }
      if (!useStemVisualizer && shouldShuffleLightShow(started, previousPlaying, current.isPlaying, lastMeasure, measure, manualRef.current)) {
        shuffle();
        lastMeasure = measure;
      }
      started = true;
      previousPlaying = current.isPlaying;
      const beatInMeasure = Math.floor(((beat % measureLength) + measureLength) % measureLength / unit);
      const phase = ((beat / unit % 1) + 1) % 1;
      const audioFrame = bands ? buildAudioFrame(bands, dtSeconds) : null;
      if (useStemVisualizer && audioFrame) {
        frameRef.current(createFrequencyScene(audioFrame.levels));
      } else {
        if (now - lastPresetStepTime >= 35) {
          step++;
          lastPresetStepTime = now;
        }
        const activePreset = LIGHT_SHOW_PRESETS[indexRef.current] ?? LIGHT_SHOW_PRESETS[0];
        frameRef.current(createLightShowScene(activePreset, step, phase, beatInMeasure, audioFrame));
      }
    };

    const loop = () => {
      tick();
      rafId = window.requestAnimationFrame(loop);
    };
    rafId = window.requestAnimationFrame(loop);
    const backgroundFallback = window.setInterval(tick, 50);

    return () => {
      stemVisualizerRef.current = false;
      setIsStemVisualizerActive(false);
      window.cancelAnimationFrame(rafId);
      window.clearInterval(backgroundFallback);
    };
  }, [enabled, shuffle]);

  return {
    presetName: isStemVisualizerActive ? "8-Band Stem Visualizer" : (LIGHT_SHOW_PRESETS[presetIndex]?.name ?? "Light Show"),
    shuffle,
    selectPreset,
  };
}
