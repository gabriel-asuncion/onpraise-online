import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedbackScene } from "../../../../songs/[id]/edit/midiFeedback";
import { createLightShowScene, LIGHT_SHOW_PRESETS, moveLightShowPreset, pickNextRandomPresetIndex, shouldShuffleLightShow } from "./lightShowPresets";

export interface LightShowPlayback {
  isPlaying: boolean;
  beat: number;
  tempo: number;
  quarterBeatsPerMeasure: number;
  unitQuarterBeats: number;
}

export function useLightShow(enabled: boolean, playback: LightShowPlayback, onFrame: (scene: FeedbackScene) => void) {
  const [presetIndex, setPresetIndex] = useState(-1);
  const indexRef = useRef(-1);
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
    const tick = () => {
      const current = playbackRef.current;
      const now = performance.now();
      if (current.beat !== lastBeat || (current.isPlaying && !previousPlaying)) {
        lastBeat = current.beat;
        beatTime = now;
      }
      const beat = current.beat + (current.isPlaying ? (now - beatTime) * (current.tempo || 75) / 60000 : 0);
      const measureLength = current.quarterBeatsPerMeasure || 4;
      const unit = current.unitQuarterBeats || 1;
      const measure = Math.floor(beat / measureLength);
      if (shouldShuffleLightShow(started, previousPlaying, current.isPlaying, lastMeasure, measure, manualRef.current)) {
        shuffle();
        lastMeasure = measure;
      }
      started = true;
      previousPlaying = current.isPlaying;
      const beatInMeasure = Math.floor(((beat % measureLength) + measureLength) % measureLength / unit);
      const phase = ((beat / unit % 1) + 1) % 1;
      frameRef.current(createLightShowScene(LIGHT_SHOW_PRESETS[indexRef.current], step++, phase, beatInMeasure));
    };
    tick();
    const timer = window.setInterval(tick, 35);
    return () => window.clearInterval(timer);
  }, [enabled, shuffle]);

  return { presetName: LIGHT_SHOW_PRESETS[presetIndex]?.name ?? "Light Show", shuffle, selectPreset };
}
