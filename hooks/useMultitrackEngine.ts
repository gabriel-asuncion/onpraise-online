"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MultitrackEngine, type DecodedStem } from "../lib/multitrack-engine";

export interface MultitrackInput {
  id: string;
  blob: Blob;
  sourceVersion?: string;
}

export function useMultitrackEngine(getAudioContext: () => AudioContext | null) {
  const engineRef = useRef<MultitrackEngine | null>(null);
  const loadRevisionRef = useRef(0);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const getEngine = useCallback((): MultitrackEngine => {
    const context = getAudioContext();
    if (!context) throw new Error("The audio context has not been initialized.");
    if (!engineRef.current) engineRef.current = new MultitrackEngine(context);
    return engineRef.current;
  }, [getAudioContext]);

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

  const clear = useCallback(() => {
    cancelLoad();
    engineRef.current?.setStems([]);
    setCurrentTimeSeconds(0);
    setDurationSeconds(0);
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
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return { getEngine, load, loadWhilePaused, cancelLoad, clear, currentTimeSeconds, durationSeconds };
}
