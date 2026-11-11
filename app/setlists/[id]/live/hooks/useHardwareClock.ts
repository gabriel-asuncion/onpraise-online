import { useEffect, useRef } from "react";
import { SongRecord, ArrangementSection, CompiledBeatMap, CompiledSectionToken } from "../types/setlist";
import { getMetronomePulse, getMetronomeStep, type MetronomePattern, type MetronomeSpeed } from "../../../../../lib/metronome";
import {
  getTimelineDurationBeats,
  getTimelineMeasureBeat,
  getTimelineMeter,
  getYoutubeTimeForTimeline
} from "../utils/timeline";

export interface HardwareClockConfig {
  isPlayingFlow: boolean;
  playbackSessionId?: number;
  isPlayingRef: React.MutableRefObject<boolean>;
  activeSongRef: React.MutableRefObject<SongRecord | null>;
  playingSongRef: React.MutableRefObject<SongRecord | null>;
  sectionsRef: React.MutableRefObject<ArrangementSection[]>;
  playingSectionsRef: React.MutableRefObject<ArrangementSection[]>;
  currentSectionIndexRef: React.MutableRefObject<number>;
  setCurrentSectionIndex: (idx: number) => void;
  beatMapRef: React.MutableRefObject<CompiledBeatMap>;
  astTreeRef: React.MutableRefObject<CompiledSectionToken[]>;
  mdSectionStartTimeRef: React.MutableRefObject<number | null>;
  audioLatencyOffsetMs: number;
  isYtBackingTrackStartRef: React.MutableRefObject<boolean>;
  backdropProgressRef: React.MutableRefObject<HTMLDivElement | null>;
  accentProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  simplifiedProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  hasPlayedCueRef: React.MutableRefObject<boolean>;
  queuedSectionIndexRef: React.MutableRefObject<number | null>;
  queuedTrackIndexRef: React.MutableRefObject<number | null>;
  isYtBufferingRef?: React.MutableRefObject<boolean>;
  isDoubleMetronomeEnabledRef: React.MutableRefObject<boolean>;
  metronomeSpeedRef?: React.MutableRefObject<MetronomeSpeed>;
  metronomePatternRef?: React.MutableRefObject<MetronomePattern>;
  onMidiBeat?: (beat: number | null) => void;
  lastAudioBeatRef: React.MutableRefObject<number>;
  lastVisualBeatRef: React.MutableRefObject<number>;
  lastBeatRef: React.MutableRefObject<number>;
  lastVisualMeasureLengthRef: React.MutableRefObject<number>;
  setCurrentMeasureLength: (len: number) => void;
  pendingQuantizedJumpRef: React.MutableRefObject<any>;
  getGlobalTime: () => number;
  getYoutubeTime?: () => number | null;
  seekYoutubeTo?: (seconds: number) => void;
  executeJumpNow: (
    trackIdx: number,
    secIdx: number,
    time: number,
    isInitialStart?: boolean,
    youtubeSyncMode?: "explicit-jump"
  ) => void;
  localPresenceUserRef: React.MutableRefObject<any>;
  sendSupabaseBroadcast: (payload: any) => void;
  updateMetronomeUI: (beat: number, isPlaying: boolean, measureLength?: number, absoluteBeat?: number) => void;
  activeLineIndexRef: React.MutableRefObject<number>;
  setActiveLineIndex: (idx: number) => void;
  handleAdvanceToNextSetlistTrack: () => void;
  sectionStartTimeRef: React.MutableRefObject<number>;
  pauseOffsetMsRef: React.MutableRefObject<number>;
  animationFrameRef: React.MutableRefObject<number | null>;
  playingTrackIndexRef: React.MutableRefObject<number>;

  playGuideCue?: (name: string) => void;
  getAudioContext?: () => AudioContext | null;
  triggerMetronomeSound?: (beat: number, time: number) => void;
  audioContextStartTimeRef?: React.MutableRefObject<number | null>;
  scheduledClicksRef?: React.MutableRefObject<{ source: AudioBufferSourceNode, audioTime: number }[]>;
  pendingAudioClockCorrectionRef?: React.MutableRefObject<{
    correctionMs: number;
    applyAtAudioTime: number | null;
  } | null>;
}

export function useHardwareClock(config: HardwareClockConfig) {
  const workerRef = useRef<Worker | null>(null);
  const workerUrlRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let isActive = true;
    const killEngine = () => {
      isActive = false;
      const worker = workerRef.current;
      const workerUrl = workerUrlRef.current;
      if (worker) {
        try {
          worker.postMessage('stop');
        } catch (error) {
          console.warn("Playback worker stop message failed; terminating it directly.", error);
        }
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
      if (workerUrl && workerUrlRef.current === workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrlRef.current = null;
      }
      if (fallbackTimerRef.current) { clearInterval(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    };

    if (!config.isPlayingFlow || !config.activeSongRef.current || config.sectionsRef.current.length === 0) {
      killEngine(); return;
    }

    if (config.pauseOffsetMsRef.current > 0) config.sectionStartTimeRef.current = performance.now() - config.pauseOffsetMsRef.current;
    else config.sectionStartTimeRef.current = performance.now();

    config.lastBeatRef.current = 0;
    let previousClickStep: number | null = null;
    let lastHeartbeatTime = 0;
    let lastYoutubeResyncTime = 0;
    const clockExecutionTick = () => {
      if (!isActive) return;
      const c = configRef.current;

      if (!c.isPlayingRef.current || !c.activeSongRef.current || c.sectionsRef.current.length === 0) return;

      if (c.pendingQuantizedJumpRef.current) {
        const { trackIndex, sectionIndex, jumpTime } = c.pendingQuantizedJumpRef.current;
        if (c.getGlobalTime() >= jumpTime) {
          c.executeJumpNow(trackIndex, sectionIndex, jumpTime, false, "explicit-jump");
        }
      }

      const isCurrentlyMD = c.localPresenceUserRef.current?.isMD === true;
      const song = c.playingSongRef.current || c.activeSongRef.current;
      const meter = getTimelineMeter(song.section_timings);
      const secs = c.playingSectionsRef.current;
      const idx = c.currentSectionIndexRef.current;
      const currentSection = secs[idx];

      if (!currentSection) { c.handleAdvanceToNextSetlistTrack(); return; }

      const beatSpeedMsCurrent = (60 / (song.tempo || 75)) * 1000;
      const isSpacer = currentSection.section_name.toLowerCase().startsWith("spacer");
      const spacerDurationBeats = isSpacer
        ? getTimelineDurationBeats(song.section_timings, idx, currentSection.id, song.default_structure) ?? 0.5
        : 0;
      const timings = isSpacer
        ? { measures: 0, beats: spacerDurationBeats, repeats: 0, head_m: 0, tail_m: 0 }
        : song.section_timings?.[currentSection.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1;
      const headBeats = (timings.head_m || 0) * meter.quarterBeatsPerMeasure;
      const tailBeats = (timings.tail_m || 0) * meter.quarterBeatsPerMeasure;

      let baseLoopBeats = ((timings.measures || 0) * meter.quarterBeatsPerMeasure) + (timings.beats || 0);
      let totalCoreBeats = baseLoopBeats * sectionMultiplier;

      let lineTimingsObj = timings.line_timings;
      if (typeof lineTimingsObj === 'string') {
        try { lineTimingsObj = JSON.parse(lineTimingsObj); } catch(e){}
      }

      const currentAstNode = c.astTreeRef.current[idx];
      const parsedLinesCount = currentAstNode?.lines?.length || 1;

      let calculatedBaseLoopBeats = 0;
      const lineBeatsArray: number[] = [];

      if (lineTimingsObj && Object.keys(lineTimingsObj).length > 0) {
        for (let i = 0; i < parsedLinesCount; i++) {
          const t = lineTimingsObj[String(i)] || { measures: 0, beats: 0 };
          const lineMult = (t.repeats || 0) + 1;
          const base = (((Number(t.measures) || 0) * meter.quarterBeatsPerMeasure) + (Number(t.beats) || 0)) * lineMult;
          lineBeatsArray.push(base);
          calculatedBaseLoopBeats += base;
        }
        if (calculatedBaseLoopBeats > 0) {
          baseLoopBeats = calculatedBaseLoopBeats;
          totalCoreBeats = baseLoopBeats * sectionMultiplier;
        }
      }

      let totalBeats = totalCoreBeats + headBeats + tailBeats;
      const totalDurationMs = totalBeats * beatSpeedMsCurrent;

      if (!c.mdSectionStartTimeRef.current || isNaN(c.mdSectionStartTimeRef.current)) return;

      const globalNow = c.getGlobalTime();
      const sectionStartBeat = c.beatMapRef.current.sectionStartBeats[idx] || 0;
      if (isCurrentlyMD && globalNow - lastHeartbeatTime >= 1000) {
        lastHeartbeatTime = globalNow;
        const elapsedBeats = Math.floor(
          (globalNow - c.mdSectionStartTimeRef.current) / beatSpeedMsCurrent
        );
        c.sendSupabaseBroadcast({
          action: "HEARTBEAT",
          trackIndex: c.playingTrackIndexRef.current,
          sectionIndex: idx,
          mdSectionStartTime: c.mdSectionStartTimeRef.current,
          mdAbsoluteBeat: sectionStartBeat + elapsedBeats,
          mdGlobalBeatTime: c.mdSectionStartTimeRef.current + elapsedBeats * beatSpeedMsCurrent,
          isYtSource: c.isYtBackingTrackStartRef.current,
        });
      }

      let elapsedMs = 0;
      elapsedMs = globalNow - c.mdSectionStartTimeRef.current;

      if (c.isYtBackingTrackStartRef.current && !c.isYtBufferingRef?.current) {
        const ytTimeSecs = c.getYoutubeTime?.() ?? null;
        if (ytTimeSecs !== null && c.seekYoutubeTo && globalNow - lastYoutubeResyncTime >= 2000) {
          const expectedYoutubeTime = getYoutubeTimeForTimeline(
            sectionStartBeat,
            elapsedMs,
            song.tempo,
            song.youtube_sync_offset_ms || 0
          );
          if (Math.abs(ytTimeSecs - expectedYoutubeTime) > 0.75) {
            c.seekYoutubeTo(Math.max(0, expectedYoutubeTime));
            lastYoutubeResyncTime = globalNow;
          }
        }
      }

      const visualElapsedMs = Math.max(0, elapsedMs);

      const progressRatio = Math.min(1, visualElapsedMs / totalDurationMs);
      if (c.backdropProgressRef.current) c.backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (c.accentProgressBarRef.current) c.accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;
      if (c.simplifiedProgressBarRef.current) c.simplifiedProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      const msRemaining = totalDurationMs - visualElapsedMs;
      const measureDurationMs = beatSpeedMsCurrent * meter.quarterBeatsPerMeasure;

      if (elapsedMs >= 0 && !c.hasPlayedCueRef.current && msRemaining > 0 && msRemaining <= measureDurationMs) {
        c.hasPlayedCueRef.current = true;
        const nextSecIndex = (c.queuedSectionIndexRef.current !== null) ? c.queuedSectionIndexRef.current : idx + 1;
        const targetSec = secs[nextSecIndex];
        if (targetSec && c.playGuideCue) c.playGuideCue(targetSec.section_name);
      }

      const audioCtx = c.getAudioContext ? c.getAudioContext() : null;
      const clickSpeed = c.metronomeSpeedRef?.current ?? (c.isDoubleMetronomeEnabledRef.current ? "double" : "default");
      if (c.audioContextStartTimeRef && c.audioContextStartTimeRef.current !== null && audioCtx && audioCtx.state === "running") {
        const lookaheadSecs = 0.200;
        const beatSpeedSecs = beatSpeedMsCurrent / 1000;
        const beatUnitQuarter = meter.unitQuarterBeats * getMetronomeStep(clickSpeed);
        const currentAudioTime = audioCtx.currentTime;

        const audioOffsetSecs = -(c.audioLatencyOffsetMs / 1000);

        // ✅ SURGICAL FIX: Use Math.floor to ensure we catch the exact beat boundary (0-indexed timeline)
        // instead of aggressively rounding up to the next beat.
        c.lastAudioBeatRef.current = (previousClickStep !== null && previousClickStep !== beatUnitQuarter
          ? Math.ceil((c.lastAudioBeatRef.current - 0.000001) / beatUnitQuarter)
          : Math.floor((c.lastAudioBeatRef.current + 0.000001) / beatUnitQuarter)) * beatUnitQuarter;
        previousClickStep = beatUnitQuarter;

        let pendingAudioCorrection = c.pendingAudioClockCorrectionRef?.current ?? null;
        if (pendingAudioCorrection && pendingAudioCorrection.applyAtAudioTime === null) {
          pendingAudioCorrection.applyAtAudioTime =
            c.audioContextStartTimeRef.current + (c.lastAudioBeatRef.current * beatSpeedSecs);
        }
        let nextBeatTime = c.audioContextStartTimeRef.current + (c.lastAudioBeatRef.current * beatSpeedSecs);

        while (nextBeatTime < currentAudioTime + lookaheadSecs) {
          if (
            pendingAudioCorrection?.applyAtAudioTime !== null &&
            pendingAudioCorrection?.applyAtAudioTime !== undefined &&
            nextBeatTime > pendingAudioCorrection.applyAtAudioTime + 0.000001
          ) {
            break;
          }

          // If the scheduled beat is accidentally in the past (due to pausing/seeking latency),
          // skip it to prevent a stacked machine-gun burst of clicks.
          if (nextBeatTime + audioOffsetSecs >= currentAudioTime) {
            const absoluteBeatIndex = c.lastAudioBeatRef.current;

            if (c.pendingQuantizedJumpRef.current) {
              const timeUntilBeatSecs = nextBeatTime - currentAudioTime;
              const exactGlobalBeatTime = c.getGlobalTime() + (timeUntilBeatSecs * 1000);
              if (exactGlobalBeatTime >= c.pendingQuantizedJumpRef.current.jumpTime - 10) break;
            }

            // ✅ SURGICAL FIX: Infinite Audio Metronome Extension
            const clickIndex = Math.round(absoluteBeatIndex / beatUnitQuarter);
            const pulse = getMetronomePulse(clickIndex, clickSpeed, c.metronomePatternRef?.current ?? "default", meter.numerator);
            if (c.triggerMetronomeSound && pulse !== null) c.triggerMetronomeSound(pulse, nextBeatTime + audioOffsetSecs);
          }

          const isCorrectionBoundary =
            pendingAudioCorrection?.applyAtAudioTime !== null &&
            pendingAudioCorrection?.applyAtAudioTime !== undefined &&
            Math.abs(nextBeatTime - pendingAudioCorrection.applyAtAudioTime) < 0.000001;
          c.lastAudioBeatRef.current += beatUnitQuarter;
          if (isCorrectionBoundary && c.audioContextStartTimeRef) {
            c.audioContextStartTimeRef.current += pendingAudioCorrection!.correctionMs / 1000;
            if (c.pendingAudioClockCorrectionRef) {
              c.pendingAudioClockCorrectionRef.current = null;
            }
            pendingAudioCorrection = null;
          }
          nextBeatTime = c.audioContextStartTimeRef.current + (c.lastAudioBeatRef.current * beatSpeedSecs);
        }

      }

      if (elapsedMs >= 0) {
        const localSectionElapsedBeats = elapsedMs / beatSpeedMsCurrent;
        const absoluteVisualBeatFloat = (c.beatMapRef.current.sectionStartBeats[idx] || 0) + localSectionElapsedBeats;
        const midiClickIndex = Math.floor(absoluteVisualBeatFloat / (meter.unitQuarterBeats * getMetronomeStep(clickSpeed)));
        c.onMidiBeat?.(((midiClickIndex % 4) + 4) % 4);
        const { beatIndex: currentVisualBeatPulse, measureLength: activeMeasureLength } =
          getTimelineMeasureBeat(absoluteVisualBeatFloat, meter);

        if (activeMeasureLength !== c.lastVisualMeasureLengthRef.current) {
          c.lastVisualMeasureLengthRef.current = activeMeasureLength;
          c.setCurrentMeasureLength(activeMeasureLength);
        }
        if (currentVisualBeatPulse !== c.lastVisualBeatRef.current) {
          c.lastVisualBeatRef.current = currentVisualBeatPulse;
          c.updateMetronomeUI(currentVisualBeatPulse, true, activeMeasureLength, absoluteVisualBeatFloat);
        }
      }

      const safeDuration = Math.max(1, totalDurationMs);
      const cappedElapsedMs = Math.max(0, Math.min(elapsedMs, safeDuration - 1));
      const sectionAbsoluteBeat = Math.floor(cappedElapsedMs / beatSpeedMsCurrent);
      const coreAbsoluteBeat = Math.max(0, sectionAbsoluteBeat - headBeats);
      const cappedCoreBeat = Math.min(coreAbsoluteBeat, Math.max(0, totalCoreBeats - 1));
      const safeBaseLoopBeats = Math.max(1, baseLoopBeats);

      let targetLineIdx = 0;
      if (calculatedBaseLoopBeats > 0 && lineBeatsArray.length > 0) {
        const beatWithinCurrentLoop = cappedCoreBeat % safeBaseLoopBeats;
        let beatAccumulator = 0;
        for (let i = 0; i < parsedLinesCount; i++) {
          beatAccumulator += lineBeatsArray[i] || 0;
          if (beatWithinCurrentLoop < beatAccumulator) { targetLineIdx = i; break; }
          targetLineIdx = i;
        }
      } else {
        const safeLinesCount = Math.max(1, parsedLinesCount);
        const beatsPerLine = safeBaseLoopBeats / safeLinesCount;
        const beatWithinCurrentLoop = cappedCoreBeat % safeBaseLoopBeats;

        targetLineIdx = Math.floor(beatWithinCurrentLoop / beatsPerLine);
        if (targetLineIdx >= safeLinesCount) targetLineIdx = safeLinesCount - 1;
      }

      if (c.activeLineIndexRef.current !== targetLineIdx) {
        c.activeLineIndexRef.current = targetLineIdx;
        c.setActiveLineIndex(targetLineIdx);
      }

      if (elapsedMs >= totalDurationMs) {
        const harmsActiveQueue = c.queuedSectionIndexRef.current !== null && c.queuedTrackIndexRef.current !== null;
        let nextTrackIdx = c.playingTrackIndexRef.current;
        let nextSectionIdx = idx + 1;

        if (harmsActiveQueue) {
          nextTrackIdx = c.queuedTrackIndexRef.current as number;
          nextSectionIdx = c.queuedSectionIndexRef.current as number;
          const jumpTime = c.mdSectionStartTimeRef.current + totalDurationMs;
          c.executeJumpNow(nextTrackIdx, nextSectionIdx, jumpTime, false, "explicit-jump");
          if (isCurrentlyMD) {
            c.sendSupabaseBroadcast({ action: "JUMP", trackIndex: nextTrackIdx, sectionIndex: nextSectionIdx, mdSectionStartTime: jumpTime });
          }
        } else if (nextSectionIdx < secs.length) {
          // Progress to the next valid section
          c.currentSectionIndexRef.current = nextSectionIdx;
          c.setCurrentSectionIndex(nextSectionIdx);
          c.hasPlayedCueRef.current = false;
          c.mdSectionStartTimeRef.current = c.mdSectionStartTimeRef.current + totalDurationMs;
        }
      }
    };

    try {
      if (!workerRef.current) {
        const workerCode = `
          let timerID = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              timerID = setInterval(() => postMessage('tick'), 25);
            } else if (e.data === 'stop') {
              clearInterval(timerID);
              timerID = null;
            }
          };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        workerUrlRef.current = workerUrl;
        const worker = new Worker(workerUrl);
        workerRef.current = worker;
        worker.onmessage = (e) => {
          if (isActive && e.data === 'tick') clockExecutionTick();
        };
        worker.postMessage('start');
      }
    } catch (err) {
      const worker = workerRef.current;
      if (worker) {
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
      if (workerUrlRef.current) {
        URL.revokeObjectURL(workerUrlRef.current);
        workerUrlRef.current = null;
      }
      console.warn("Web Worker blocked. Falling back to main-thread interval.");
      if (!fallbackTimerRef.current) fallbackTimerRef.current = setInterval(clockExecutionTick, 25);
    }

    return killEngine;
  }, [config.isPlayingFlow, config.playbackSessionId]);
}