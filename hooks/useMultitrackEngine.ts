"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MultitrackEngine, type DecodedStem, type StemWaveform } from "../lib/multitrack-engine";
import type { StemRole } from "../lib/offline-audio";

export interface MultitrackInput {
  id: string;
  blob: Blob;
  role?: StemRole;
  sourceVersion?: string;
}

export function useMultitrackEngine(getAudioContext: () => AudioContext | null) {
  const engineRef = useRef<MultitrackEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const loadRevisionRef = useRef(0);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [eqEnabled, setEqEnabledState] = useState(true);
  const [mixes, setMixes] = useState<ReturnType<MultitrackEngine["getStemMixes"]>>([]);
  const [waveforms, setWaveforms] = useState<StemWaveform[]>([]);

  const syncEngineState = useCallback((engine: MultitrackEngine) => {
    setMixes(engine.getStemMixes());
    setWaveforms(engine.getStemWaveforms());
    setDurationSeconds(engine.durationSeconds);
    setEqEnabledState(engine.isEqEnabled);
  }, []);

  const getEngine = useCallback((): MultitrackEngine => {
    const context = getAudioContext();
    if (!context) throw new Error("The audio context has not been initialized.");
    if (!engineRef.current) {
      const engine = new MultitrackEngine(context);
      engineRef.current = engine;
      unsubscribeRef.current = engine.subscribe(() => syncEngineState(engine));
    }
    return engineRef.current;
  }, [getAudioContext, syncEngineState]);

  const load = useCallback(async (inputs: MultitrackInput[]) => {
    const revision = ++loadRevisionRef.current;
    const context = getAudioContext();
    if (!context) throw new Error("The audio context has not been initialized.");
    const decoded: DecodedStem[] = await Promise.all(inputs.map(async (input) => ({
      id: input.id,
      buffer: await context.decodeAudioData(await input.blob.arrayBuffer()),
      volume: 1,
      muted: false,
      solo: false,
      role: input.role,
      sourceVersion: input.sourceVersion,
    })));
    if (revision !== loadRevisionRef.current) return false;
    const engine = getEngine();
    engine.setStems(decoded);
    setCurrentTimeSeconds(0);
    setDurationSeconds(engine.durationSeconds);
    return true;
  }, [getAudioContext, getEngine]);

  const cancelLoad = useCallback(() => {
    loadRevisionRef.current += 1;
  }, []);

  const loadWhilePaused = useCallback(async (inputs: MultitrackInput[], signal?: AbortSignal) => {
    const revision = ++loadRevisionRef.current;
    const engine = getEngine();
    if (engine.isPlaying) throw new Error("Pause local playback before changing stems.");
    const context = getAudioContext();
    if (!context) throw new Error("The audio context has not been initialized.");
    const decoded: DecodedStem[] = await Promise.all(inputs.map(async (input) => {
      return {
        id: input.id,
        buffer: await context.decodeAudioData(await input.blob.arrayBuffer()),
        volume: 1,
        muted: false,
        solo: false,
        role: input.role,
        sourceVersion: input.sourceVersion,
      };
    }));
    if (signal?.aborted || revision !== loadRevisionRef.current) return false;
    const previous = new Map(engine.getStemMixes().map((mix) => [mix.id, mix]));
    for (const stem of decoded) {
      const mix = previous.get(stem.id);
      if (mix) Object.assign(stem, { volume: mix.volume, muted: mix.muted, solo: mix.solo });
    }
    engine.replaceStemsWhilePaused(decoded);
    setCurrentTimeSeconds(engine.currentTimeSeconds);
    setDurationSeconds(engine.durationSeconds);
    return true;
  }, [getAudioContext, getEngine]);

  const toggleStemMute = useCallback((id: string) => {
    getEngine().toggleStemMute(id);
  }, [getEngine]);

  const toggleStemSolo = useCallback((id: string) => {
    getEngine().toggleStemSolo(id);
  }, [getEngine]);

  const setEqEnabled = useCallback((enabled: boolean) => {
    getEngine().setEqEnabled(enabled);
  }, [getEngine]);

  const clear = useCallback(() => {
    cancelLoad();
    engineRef.current?.setStems([]);
    setCurrentTimeSeconds(0);
    setDurationSeconds(0);
    setMixes([]);
    setWaveforms([]);
  }, [cancelLoad]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (engineRef.current) setCurrentTimeSeconds(engineRef.current.currentTimeSeconds);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      loadRevisionRef.current += 1;
      cancelAnimationFrame(frame);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return {
    getEngine,
    load,
    loadWhilePaused,
    cancelLoad,
    clear,
    toggleStemMute,
    toggleStemSolo,
    eqEnabled,
    setEqEnabled,
    mixes,
    waveforms,
    currentTimeSeconds,
    durationSeconds,
  };
}
