import { useEffect, useRef } from "react";
import { SongRecord, ArrangementSection, CompiledBeatMap, CompiledSectionToken } from "../types/setlist";

export interface HardwareClockConfig {
  isPlayingFlow: boolean;
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
  countdownValueRef: React.MutableRefObject<number | null>;
  setCountdownValue: (val: number | null) => void;
  backdropProgressRef: React.MutableRefObject<HTMLDivElement | null>;
  accentProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  simplifiedProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  hasPlayedCueRef: React.MutableRefObject<boolean>;
  queuedSectionIndexRef: React.MutableRefObject<number | null>;
  queuedTrackIndexRef: React.MutableRefObject<number | null>;
  isDoubleMetronomeEnabledRef: React.MutableRefObject<boolean>;
  lastAudioBeatRef: React.MutableRefObject<number>;
  lastVisualBeatRef: React.MutableRefObject<number>;
  lastBeatRef: React.MutableRefObject<number>;
  lastVisualMeasureLengthRef: React.MutableRefObject<number>;
  setCurrentMeasureLength: (len: number) => void;
  pendingQuantizedJumpRef: React.MutableRefObject<any>;
  getGlobalTime: () => number;
  getYoutubeTime: () => number | null;
  executeJumpNow: (trackIdx: number, secIdx: number, time: number, isInitialStart?: boolean) => void;
  localPresenceUserRef: React.MutableRefObject<any>;
  sendSupabaseBroadcast: (payload: any) => void;
  updateMetronomeUI: (beat: number, isPlaying: boolean, measureLength?: number) => void;
  activeLineIndexRef: React.MutableRefObject<number>;
  setActiveLineIndex: (idx: number) => void;
  handleAdvanceToNextSetlistTrack: () => void;
  sectionStartTimeRef: React.MutableRefObject<number>;
  pauseOffsetMsRef: React.MutableRefObject<number>;
  animationFrameRef: React.MutableRefObject<number | null>;
  playingTrackIndexRef: React.MutableRefObject<number>;
  
  // ✅ Restored the precision Audio Engine links!
  playGuideCue: (name: string) => void;
  getAudioContext: () => AudioContext | null;
  triggerMetronomeSound: (beat: number, time: number) => void;
  audioContextStartTimeRef: React.MutableRefObject<number | null>;
  scheduledClicksRef: React.MutableRefObject<{ source: AudioBufferSourceNode, audioTime: number }[]>;
}

export function useHardwareClock(config: HardwareClockConfig) {
  const workerRef = useRef<Worker | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const killEngine = () => {
      if (workerRef.current) { workerRef.current.postMessage('stop'); workerRef.current.terminate(); workerRef.current = null; }
      if (fallbackTimerRef.current) { clearInterval(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    };

    if (!config.isPlayingFlow || !config.activeSongRef.current || config.sectionsRef.current.length === 0) {
      killEngine(); return;
    }

    if (config.pauseOffsetMsRef.current > 0) config.sectionStartTimeRef.current = performance.now() - config.pauseOffsetMsRef.current;
    else config.sectionStartTimeRef.current = performance.now();
    
    config.lastBeatRef.current = 0; 

    const clockExecutionTick = () => {
      const c = configRef.current; 
      
      if (!c.isPlayingRef.current || !c.activeSongRef.current || c.sectionsRef.current.length === 0) return;
      
      if (c.pendingQuantizedJumpRef.current) {
        const { trackIndex, sectionIndex, jumpTime } = c.pendingQuantizedJumpRef.current;
        if (c.getGlobalTime() >= jumpTime) c.executeJumpNow(trackIndex, sectionIndex, jumpTime);
      }
      
      const isCurrentlyMD = c.localPresenceUserRef.current?.isMD === true;
      const song = c.playingSongRef.current || c.activeSongRef.current; 
      const secs = c.playingSectionsRef.current;
      const idx = c.currentSectionIndexRef.current;
      const currentSection = secs[idx];
      
      if (!currentSection) { c.handleAdvanceToNextSetlistTrack(); return; }

      const beatSpeedMsCurrent = (60 / (song.tempo || 75)) * 1000;
      const timings = song.section_timings?.[currentSection.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1; 
      const headBeats = (timings.head_m || 0) * 4;
      const tailBeats = (timings.tail_m || 0) * 4;
      
      let baseLoopBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);
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
          const base = ((t.measures * 4) + (t.beats || 0)) * lineMult; 
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

      let elapsedMs = 0;
      if (c.isYtBackingTrackStartRef.current) {
        const ytTimeSecs = c.getYoutubeTime();
        if (ytTimeSecs === null) return; 

        const targetAbsoluteBeat = c.beatMapRef.current.sectionStartBeats[idx] || 0;
        const theoreticalSongStartOffsetSecs = targetAbsoluteBeat * (beatSpeedMsCurrent / 1000);
        const ytOffsetSecs = (song.youtube_sync_offset_ms || 0) / 1000;
        
        const sectionElapsedSecs = ytTimeSecs - ytOffsetSecs - theoreticalSongStartOffsetSecs;
        elapsedMs = sectionElapsedSecs * 1000;

        const audioCtx = c.getAudioContext();
        if (c.audioContextStartTimeRef.current !== null && audioCtx && audioCtx.state === "running") {
          const theoreticalSongElapsed = audioCtx.currentTime - c.audioContextStartTimeRef.current;
          const actualSongElapsed = ytTimeSecs - ytOffsetSecs;
          const driftSecs = theoreticalSongElapsed - actualSongElapsed;

          if (Math.abs(driftSecs) > 0.150) {
            c.audioContextStartTimeRef.current = audioCtx.currentTime - actualSongElapsed;
          }
        }
      } else {
        elapsedMs = c.getGlobalTime() - c.mdSectionStartTimeRef.current;
      }
      
      if (elapsedMs < -500) {
        const secondsLeft = Math.ceil(Math.abs(elapsedMs) / 1000);
        if (secondsLeft <= 5 && secondsLeft > 0) {
          if (c.countdownValueRef.current !== secondsLeft) {
            c.countdownValueRef.current = secondsLeft;
            c.setCountdownValue(secondsLeft);
          }
        }
        return; 
      }

      if (elapsedMs >= 0 && c.countdownValueRef.current !== null) { 
        c.countdownValueRef.current = null; c.setCountdownValue(null); 
      }
      
      const visualElapsedMs = Math.max(0, elapsedMs);
      
      const progressRatio = Math.min(1, visualElapsedMs / totalDurationMs);
      if (c.backdropProgressRef.current) c.backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (c.accentProgressBarRef.current) c.accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;
      if (c.simplifiedProgressBarRef.current) c.simplifiedProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      const msRemaining = totalDurationMs - visualElapsedMs;
      const fourBeatsMs = beatSpeedMsCurrent * 4;

      // ✅ Restored Guide Cues
      if (!c.hasPlayedCueRef.current && msRemaining > 0 && msRemaining <= fourBeatsMs) {
        c.hasPlayedCueRef.current = true; 
        const nextSecIndex = (c.queuedSectionIndexRef.current !== null) ? c.queuedSectionIndexRef.current : idx + 1;
        const targetSec = secs[nextSecIndex];
        if (targetSec) c.playGuideCue(targetSec.section_name);
      }

      // ✅ Restored Sample-Accurate Audio Lookahead Loop
      const audioCtx = c.getAudioContext();
      if (c.audioContextStartTimeRef.current !== null && audioCtx && audioCtx.state === "running") {
        const lookaheadSecs = 0.200;
        const beatSpeedSecs = beatSpeedMsCurrent / 1000;
        const currentAudioTime = audioCtx.currentTime;
        
        const audioOffsetSecs = -(c.audioLatencyOffsetMs / 1000); 

        let nextBeatTime = c.audioContextStartTimeRef.current + (c.lastAudioBeatRef.current * beatSpeedSecs);
        
        while (nextBeatTime < currentAudioTime + lookaheadSecs) {
          const absoluteBeatIndex = c.lastAudioBeatRef.current;
          const mapNodes = c.beatMapRef.current.nodes;
          if (c.pendingQuantizedJumpRef.current) {
            const timeUntilBeatSecs = nextBeatTime - currentAudioTime;
            const exactGlobalBeatTime = c.getGlobalTime() + (timeUntilBeatSecs * 1000);
            if (exactGlobalBeatTime >= c.pendingQuantizedJumpRef.current.jumpTime - 10) break; 
          }
          if (absoluteBeatIndex < mapNodes.length) {
            const beatNode = mapNodes[absoluteBeatIndex];
            c.triggerMetronomeSound(beatNode.isDownbeat ? 1 : 2, nextBeatTime + audioOffsetSecs);
            if (config.isDoubleMetronomeEnabledRef.current) {
              c.triggerMetronomeSound(2, nextBeatTime + audioOffsetSecs + (beatSpeedSecs / 2));
            }
          }
          c.lastAudioBeatRef.current++;
          nextBeatTime = c.audioContextStartTimeRef.current + (c.lastAudioBeatRef.current * beatSpeedSecs);
        }
        
        if (isCurrentlyMD && c.lastAudioBeatRef.current > 0 && c.lastAudioBeatRef.current % 16 === 0) {
          if ((window as any)._lastHeartbeatBeat !== c.lastAudioBeatRef.current) {
            (window as any)._lastHeartbeatBeat = c.lastAudioBeatRef.current;
            
            const sectionStartBeat = c.beatMapRef.current.sectionStartBeats[c.currentSectionIndexRef.current] || 0;
            const localBeatCount = c.lastAudioBeatRef.current - sectionStartBeat;
            const exactGlobalBeatTime = c.mdSectionStartTimeRef.current + (localBeatCount * beatSpeedSecs * 1000);
            
            c.sendSupabaseBroadcast({ 
                action: "HEARTBEAT", 
                mdAbsoluteBeat: c.lastAudioBeatRef.current, 
                mdGlobalBeatTime: exactGlobalBeatTime,
                mdSectionIndex: c.currentSectionIndexRef.current 
            });
          }
        }
      }

      const localSectionElapsedBeats = visualElapsedMs / beatSpeedMsCurrent;
      const absoluteVisualBeatFloat = (c.beatMapRef.current.sectionStartBeats[idx] || 0) + localSectionElapsedBeats;
      const absoluteVisualBeatIndex = Math.floor(absoluteVisualBeatFloat);

      if (absoluteVisualBeatIndex < c.beatMapRef.current.nodes.length) {
        const beatNode = c.beatMapRef.current.nodes[absoluteVisualBeatIndex];
        const currentVisualBeatPulse = beatNode.measureBeatIndex;
        const activeMeasureLength = beatNode.measureLength;
        if (activeMeasureLength !== c.lastVisualMeasureLengthRef.current) {
          c.lastVisualMeasureLengthRef.current = activeMeasureLength;
          c.setCurrentMeasureLength(activeMeasureLength);
        }
        if (currentVisualBeatPulse !== c.lastVisualBeatRef.current) {
          c.lastVisualBeatRef.current = currentVisualBeatPulse;
          c.updateMetronomeUI(currentVisualBeatPulse, true, activeMeasureLength); 
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
          c.executeJumpNow(nextTrackIdx, nextSectionIdx, jumpTime);
          if (isCurrentlyMD) {
            c.sendSupabaseBroadcast({ action: "JUMP", trackIndex: nextTrackIdx, sectionIndex: nextSectionIdx, mdSectionStartTime: jumpTime });
          }
        } else if (nextSectionIdx >= secs.length) {
          const jumpTime = c.mdSectionStartTimeRef.current + totalDurationMs;
          c.executeJumpNow(nextTrackIdx, 0, jumpTime);
          if (isCurrentlyMD) {
            c.sendSupabaseBroadcast({ action: "JUMP", trackIndex: nextTrackIdx, sectionIndex: 0, mdSectionStartTime: jumpTime }); 
          }
        } else {
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
        workerRef.current = new Worker(URL.createObjectURL(blob));
        workerRef.current.onmessage = (e) => { if (e.data === 'tick') clockExecutionTick(); };
        workerRef.current.postMessage('start');
      }
    } catch (err) {
      console.warn("Web Worker blocked. Falling back to main-thread interval.");
      if (!fallbackTimerRef.current) fallbackTimerRef.current = setInterval(clockExecutionTick, 25);
    }

    return killEngine;
  }, [config.isPlayingFlow]); 
}