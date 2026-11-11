"use client";

import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext"; 
import PageSkeleton from '../../../components/PageSkeleton';

import { useTimesync } from '../../../hooks/useTimesync';
import { useWakeLock } from "../../setlists/[id]/live/hooks/useWakeLock";
import { useWebAudioEngine } from "../../setlists/[id]/live/hooks/useWebAudioEngine";
import { useLocalPreferences } from "../../setlists/[id]/live/hooks/useLocalPreferences";
import { useYouTubeSync } from "../../setlists/[id]/live/hooks/useYouTubeSync";
import { useHardwareClock } from "../../setlists/[id]/live/hooks/useHardwareClock";
import { useKeyboardMidiControls } from "../../setlists/[id]/live/hooks/useKeyboardMidiControls";

import { LiveHeader } from "../../setlists/[id]/live/components/LiveHeader";
import { SimplifiedStackView } from "../../setlists/[id]/live/components/SimplifiedStackView";
import { StandardSheetView } from "../../setlists/[id]/live/components/StandardSheetView";
import { TracksView } from "../../setlists/[id]/live/components/TracksView";
import { ScrubberOverlay } from "../../setlists/[id]/live/components/ScrubberOverlay";
import { SettingsModal } from "../../setlists/[id]/live/components/SettingsModal";
import { TransposerModal } from "../../setlists/[id]/live/components/TransposerModal";
import { ZenMovableFAB } from "../../setlists/[id]/live/components/ZenMovableFAB";

import { CompiledSectionToken, CompiledBeatMap, ArrangementSection, SongRecord, ParsedLineToken, ParsedWordToken } from "../../setlists/[id]/live/types/setlist";
import {
  compileTimelineBeatMap,
  getNextTimelineBeat,
  getTimelineLineStartBeat,
  getTimelineMeasureBeat,
  getTimelineMeter,
  getYoutubeTimeForTimeline
} from "../../setlists/[id]/live/utils/timeline";
import { CHROMATIC_SCALE, transposeBracketContent, normalizeKeyNote } from "../../setlists/[id]/live/utils/music-math";
import { normalizeSectionNameToAudioFile } from "../../setlists/[id]/live/utils/setlist-helpers"; 

// ✅ SURGICAL ADDITION: Timeline Segment Models & Color Engine
interface SongSegment {
  label: string;
  start: number;
  end: number;
  duration: number;
  color: string;
  sectionIndex: number;
}

function getSectionColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes('chorus')) return 'bg-orange-500';
  if (l.includes('verse')) return 'bg-sky-500';
  if (l.includes('bridge')) return 'bg-primary';
  if (l.includes('intro') || l.includes('inst') || l.includes('inter')) return 'bg-emerald-500';
  if (l.includes('outro')) return 'bg-purple-500';
  if (l.includes('tag') || l.includes('pre')) return 'bg-secondary';
  return 'bg-zinc-500';
}

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const { initAudioContext } = useWebAudioEngine();

const supabase = createClient();

export default function SoloPracticeRoomPage() {
  const router = useRouter();
  const params = useParams();
  const songId = params?.id as string;

  const { getGlobalTime } = useTimesync();
  const { activeRole } = useEngine(); 
  useWakeLock();
  
  const { initAudioContext, fetchAndDecodeAudio, playZeroLatencyAudio, playGuideCue, getAudioContext, setAudioPanRight, setGuideCueVolume } = useWebAudioEngine();
  
  const {
    lyricsFontSize, setLyricsFontSize, showChords, setShowChords, chordFormat, setChordFormat,
    isSimplifiedMode, setIsSimplifiedMode, isTracksMode, setIsTracksMode, lineSpacing, setLineSpacing,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isMetronomeSoundEnabledRef,
    isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled, isDoubleMetronomeEnabledRef,
    localClickVolume, setLocalClickVolume, localClickVolumeRef,
    guideVolume, setGuideVolume, guideVolumeRef,
    youtubeVolume, setYoutubeVolume, youtubeVolumeRef,
    mixerMutes, setMixerMutes, mixerSolos, setMixerSolos,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled,
    isClickGuideHardPannedRight, setIsClickGuideHardPannedRight
  } = useLocalPreferences();

  useEffect(() => {
    setAudioPanRight(isClickGuideHardPannedRight);
  }, [isClickGuideHardPannedRight, setAudioPanRight]);

  useEffect(() => {
    setGuideCueVolume(guideVolumeRef.current);
  }, [guideVolume, mixerMutes, mixerSolos, guideVolumeRef, setGuideCueVolume]);

  const [loading, setLoading] = useState(true);
  const [activeSong, setActiveSong] = useState<SongRecord | null>(null);
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const [timelineDurationsBySectionId, setTimelineDurationsBySectionId] = useState<Record<string, number>>({});
  const [activeDisplayKey, setActiveDisplayKey] = useState<string>("C");
  
  const activeSongRef = useRef<SongRecord | null>(null);
  const sectionsRef = useRef<ArrangementSection[]>([]);

  const localPresenceUser = { id: "solo_local", isMD: true, name: "You" };
  const localPresenceUserRef = useRef<any>(localPresenceUser);

  const [audioLatencyOffsetMs, setAudioLatencyOffsetMs] = useState<number>(0);
  const [metronomeSoundType, setMetronomeSoundType] = useState<"blip" | "bell" | "block" | "glass">("blip");
  const metronomeSoundTypeRef = useRef(metronomeSoundType);
  useEffect(() => { metronomeSoundTypeRef.current = metronomeSoundType; }, [metronomeSoundType]);

  // ✅ SURGICAL FIX: Force window scroll to top on mount to reset the Global Bottom Nav state!
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      // Dispatch a manual upward scroll event to force the nav bar to un-hide itself
      window.dispatchEvent(new CustomEvent("onpraise-scroll", { detail: false }));
    }
  }, []);

  useEffect(() => {
    if (isMetronomeSoundEnabledRef) {
      isMetronomeSoundEnabledRef.current = isMetronomeSoundEnabled;
    }
  }, [isMetronomeSoundEnabled, isMetronomeSoundEnabledRef]);

  useEffect(() => {
    if (localClickVolumeRef) {
      localClickVolumeRef.current = localClickVolume;
    }
  }, [localClickVolume, localClickVolumeRef]);
  
  const [isTestingSync, setIsTestingSync] = useState<boolean>(false);
  const [testVisualBeat, setTestVisualBeat] = useState<number>(1);

  const [currentMeasureLength, setCurrentMeasureLength] = useState<number>(4);
  const lastVisualMeasureLengthRef = useRef<number>(4);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); 
  const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const zenOverlayRef = useRef<HTMLDivElement | null>(null);

  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [tracksPlayheadBeat, setTracksPlayheadBeat] = useState(0);
  const [explicitScrubBeat, setExplicitScrubBeat] = useState<number | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [showSyncBack, setShowSyncBack] = useState<boolean>(false);

  const currentTrackIndex = 0;
  const currentTrackIndexRef = useRef(0);
  const [playingTrackIndex, setPlayingTrackIndex] = useState<number>(0);
  const [queuedSectionIndex, setQueuedSectionIndex] = useState<number | null>(null);
  const [chapterDragIndex, setChapterDragIndex] = useState<number | null>(null);
  const [chapterDropIndex, setChapterDropIndex] = useState<number | null>(null);
  const chapterDragRef = useRef<{ pointerId: number; fromIndex: number; toIndex: number; startY: number; active: boolean } | null>(null);

  const lastAudioBeatRef = useRef<number>(1);
  const lastVisualBeatRef = useRef<number>(1);
  const hasPlayedCueRef = useRef<boolean>(false);
  const isAutoScrollingRef = useRef<boolean>(false);
  const playingTrackIndexRef = useRef<number>(0);
  const playingSongRef = useRef<SongRecord | null>(null);
  const playingSectionsRef = useRef<ArrangementSection[]>([]);
  const queuedTrackIndexRef = useRef<number | null>(null);
  const queuedSectionIndexRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingQuantizedJumpRef = useRef<{ trackIndex: number; sectionIndex: number; jumpTime: number } | null>(null);
  const isYtBackingTrackStartRef = useRef<boolean>(false);
  const activeLineIndexRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const pauseOffsetMsRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextStartTimeRef = useRef<number | null>(null);
  const audioContextResumePromiseRef = useRef<Promise<void> | null>(null);
  const astTreeRef = useRef<CompiledSectionToken[]>([]);
  const mdSectionStartTimeRef = useRef<number | null>(null);
  const youtubeStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingYoutubeSyncRef = useRef<{
    sectionIndex: number;
    sectionStartTime: number;
    mode: "start" | "explicit-jump";
  } | null>(null);
  const pendingYoutubeStartRef = useRef<{
    sectionIndex: number;
    exactBeat: number | null;
    commandInFlight: boolean;
    commandIssued: boolean;
  } | null>(null);
  const youtubePlaybackStartedHandlerRef = useRef<(currentTimeSeconds: number) => void>(() => {});
  const youtubePlaybackErrorHandlerRef = useRef<() => void>(() => {});
  const beginYoutubeBackedStartRef = useRef<() => void>(() => {});
  const lastBeatRef = useRef<number>(1);

  const backdropProgressRef = useRef<HTMLDivElement | null>(null);
  const accentProgressBarRef = useRef<HTMLDivElement | null>(null);
  const simplifiedProgressBarRef = useRef<HTMLDivElement | null>(null);
  
  
  // ✅ EXACT MATCH: Uses the exact array structure as the Live Page to guarantee the internal refs attach properly[cite: 5]
  const mockedSoloTrackList = useMemo(() => activeSong ? [{ id: "solo", songs: activeSong, custom_key: activeDisplayKey, custom_structure: sections }] : [], [activeSong, activeDisplayKey, sections]);
  
  const trackScrollRefs = useRef<React.MutableRefObject<HTMLDivElement | null>[]>([]);
  if (trackScrollRefs.current.length !== mockedSoloTrackList.length) {
    trackScrollRefs.current = mockedSoloTrackList.map((_, i) => trackScrollRefs.current[i] || { current: null });
  }

  const trackSectionRefs = useRef<React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>[]>([]);
  if (trackSectionRefs.current.length !== mockedSoloTrackList.length) {
    trackSectionRefs.current = mockedSoloTrackList.map((_, i) => trackSectionRefs.current[i] || { current: {} });
  }
  
  const metronomeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  useEffect(() => {
    async function fetchSoloSong() {
      const { data: song, error } = await supabase
        .from('songs')
        .select('*, song_sections(*)')
        .eq('id', songId)
        .single();
        
      if (song) {
        setActiveSong(song);
        setActiveDisplayKey(song.original_key);
        activeSongRef.current = song;

        let parsedSections: any[] = [];
        let timelineMetadata: unknown = song.section_timings?.["__timeline"];
        if (typeof timelineMetadata === "string") {
          try {
            timelineMetadata = JSON.parse(timelineMetadata);
          } catch {
            timelineMetadata = null;
          }
        }
        const savedDurations = timelineMetadata && typeof timelineMetadata === "object"
          ? (timelineMetadata as Record<string, unknown>).durationBeats
          : null;
        
        if (Array.isArray(savedDurations) && song.song_sections?.length === savedDurations.length) {
           const timelineSections = song.song_sections as Array<{
             id: string;
             section_name: string;
             content: string | null;
             sequence_order?: number;
           }>;
           parsedSections = [...timelineSections]
             .sort((left, right) => (Number(left.sequence_order) || 0) - (Number(right.sequence_order) || 0))
             .map((section) => ({
               id: section.id,
               section_name: section.section_name,
               content: section.content || "",
             }));
        } else if (song.default_structure && Array.isArray(song.default_structure) && song.default_structure.length > 0) {
           parsedSections = song.default_structure.map((ds: any, index: number) => {
              const matchedText = song.song_sections?.find((ss: any) => ss.section_name === ds.section_name);
              return { ...ds, id: ds.id || matchedText?.id || `default-${index}`, content: ds.content || matchedText?.content || "" };
           });
        } else if (song.song_sections && song.song_sections.length > 0) {
           parsedSections = song.song_sections.map((ss: any) => ({
              id: ss.id, section_name: ss.section_name, content: ss.content
           }));
        }

        setSections(parsedSections);
        sectionsRef.current = parsedSections;
        setTimelineDurationsBySectionId(
          Object.fromEntries(
            parsedSections.flatMap((section, index) => {
              const duration = Array.isArray(savedDurations) ? Number(savedDurations[index]) : NaN;
              return Number.isFinite(duration) && duration > 0 ? [[section.id, duration]] : [];
            }),
          ),
        );

        const uniqueFiles = new Set<string>();
        parsedSections.forEach((section: any) => {
          const fileName = normalizeSectionNameToAudioFile(section.section_name);
          if (fileName) uniqueFiles.add(fileName);
        });
        uniqueFiles.forEach(fileName => fetchAndDecodeAudio(`/sound_files/${fileName}.wav`, fileName));

        if (song.youtube_url && song.youtube_url.trim() !== "") {
          setIsYoutubeSyncEnabled(true);
        }
        
        setLoading(false);
      } else {
        router.push("/songs");
      }
    }
    fetchSoloSong();
  }, [songId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sounds = ["blip", "bell", "block", "glass"];
      sounds.forEach(snd => {
        fetchAndDecodeAudio(`/sound_files/metronome_${snd}_1.wav`, `metronome_${snd}_1`);
        fetchAndDecodeAudio(`/sound_files/metronome_${snd}_2.wav`, `metronome_${snd}_2`);
      });
    }
  }, []);

  useEffect(() => { queuedSectionIndexRef.current = queuedSectionIndex; }, [queuedSectionIndex]);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => {
        if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
        if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
        if (simplifiedProgressBarRef.current) simplifiedProgressBarRef.current.style.transform = "scaleX(0)";
      }, 100);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    if (isPlayingFlow && !showSyncBack) {
      const activeLineId = `line-${currentSectionIndex}-${activeLineIndex}`;
      const activeContainer = trackScrollRefs.current[currentTrackIndex]?.current;
      const targetLine = activeContainer?.querySelector(`#${activeLineId}`) || document.getElementById(activeLineId);
      
      if (targetLine) {
        if ((window as any)._autoScrollTimeout) clearTimeout((window as any)._autoScrollTimeout);
        isAutoScrollingRef.current = true;
        targetLine.scrollIntoView({ behavior: "smooth", block: "center" });
        (window as any)._autoScrollTimeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 550); 
      }
    }
  }, [activeLineIndex, currentSectionIndex, isPlayingFlow, showSyncBack, currentTrackIndex]);

  useEffect(() => {
    let reqId: number;
    const testAudioRef = { current: 1 };
    const testVisualRef = { current: 1 };
    
    if (isTestingSync) {
      initAudioContext();
      const startTime = performance.now();
      const tick = (timestamp: number) => {
        const elapsed = timestamp - startTime;
        const audioBeat = Math.floor(elapsed / 500) % 4 + 1; 
        if (audioBeat !== testAudioRef.current) {
           testAudioRef.current = audioBeat;
          
        }
        const visElapsed = elapsed - audioLatencyOffsetMs;
        const visBeat = Math.floor(Math.max(0, visElapsed) / 500) % 4 + 1;
        if (visBeat !== testVisualRef.current) {
           testVisualRef.current = visBeat;
           setTestVisualBeat(visBeat);
        }
        reqId = requestAnimationFrame(tick);
      };
      reqId = requestAnimationFrame(tick);
    } else {
       setTestVisualBeat(1);
    }
    return () => { if (reqId) cancelAnimationFrame(reqId); };
  }, [isTestingSync, audioLatencyOffsetMs, isMetronomeSoundEnabled]);

  useEffect(() => { if (!isSettingsModalOpen) setIsTestingSync(false); }, [isSettingsModalOpen]);

  const updateMetronomeUI = (activeBeat: number, isPlaying: boolean, measureLength: number = 4, absoluteBeat?: number) => {
    if (isTracksMode && absoluteBeat !== undefined) setTracksPlayheadBeat(absoluteBeat);
    metronomeRefs.current.forEach((el, index) => {
      if (!el) return;
      const beatNum = index + 1;
      if (beatNum > measureLength) { el.style.display = 'none'; return; } 
      else { el.style.display = 'flex'; }
      el.className = "w-6 h-6 items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none";
      if (isPlaying && activeBeat === beatNum) {
        if (beatNum === measureLength) el.classList.add("bg-[#faba37]", "text-white", "border-[#e0a22b]");
        else el.classList.add("bg-blue-600", "text-white", "border-blue-500");
      } else {
        el.classList.add("bg-white", "text-zinc-200", "border-zinc-100");
      }
    });

    if (isZenMode && zenOverlayRef.current && isPlaying) {
      const isDownbeat = activeBeat === 1; 
      const flashColor = isDownbeat ? 'rgba(250, 186, 55, 0.45)' : 'rgba(37, 99, 235, 0.25)'; 
      const overlay = zenOverlayRef.current;
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
      overlay.style.boxShadow = `inset 0 0 120px 20px ${flashColor}, inset 0 0 30px 10px ${flashColor}`;
      void overlay.offsetWidth; 
      overlay.style.transition = 'opacity 0.6s ease-out';
      overlay.style.opacity = '0';
    }
  };


  const beatMapRef = useRef<CompiledBeatMap>({ totalBeats: 0, nodes: [], sectionStartBeats: [] });

  function executeStartSequence(isYtSource: boolean = false) {
    if (isPlayingRef.current || pendingYoutubeStartRef.current) return;
    const audioReady = resumeAudioContextForPlayback();
    isYtBackingTrackStartRef.current = isYtSource; 
    playingTrackIndexRef.current = 0;
    setPlayingTrackIndex(0);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;
    const sectionIndex = currentSectionIndexRef.current;
    const exactBeat = explicitScrubBeat;
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[sectionIndex] || 0;
    const beatDurationMs = 60000 / (activeSongRef.current?.tempo || 75);
    setExplicitScrubBeat(null);

    if (isYtSource) {
      pendingYoutubeStartRef.current = {
        sectionIndex,
        exactBeat,
        commandInFlight: false,
        commandIssued: false
      };
      void audioReady.then(() => beginYoutubeBackedStart()).catch((error) => {
        console.error("Could not resume audio before starting playback.", error);
        pendingYoutubeStartRef.current = null;
        if (!isPlayingRef.current) isYtBackingTrackStartRef.current = false;
        ytPlayerRef.current?.pauseVideo?.();
      });
      beginYoutubeBackedStart();
      return;
    }

    void audioReady.then(() => {
      const currentGlobalTime = getGlobalTime();
      const currentStartTimestamp = exactBeat === null
        ? currentGlobalTime
        : currentGlobalTime - (exactBeat - sectionStartBeat) * beatDurationMs;
      completeSoloStart(sectionIndex, currentStartTimestamp, false, exactBeat);
    }).catch((error) => {
      console.error("Could not resume audio before starting playback.", error);
    });
  }

  function resumeAudioContextForPlayback() {
    initAudioContext();
    const audioContext = getAudioContext();
    if (!audioContext) {
      return Promise.reject(new Error("Web Audio is unavailable."));
    }

    const resumePromise = audioContext.state === "running"
      ? Promise.resolve()
      : audioContext.resume();
    const readyPromise = resumePromise.then(() => {
      if (audioContext.state !== "running") {
        throw new Error(`AudioContext did not enter the running state (state: ${audioContext.state}).`);
      }
    });
    audioContextResumePromiseRef.current = readyPromise;
    return readyPromise;
  }

  function completeSoloStart(
    sectionIndex: number,
    startTimestamp: number,
    isYtSource: boolean,
    exactStartBeat?: number | null,
    audioAnchor?: { audioTime: number; absoluteBeat: number }
  ) {
    pendingYoutubeStartRef.current = null;
    setExplicitScrubBeat(null);
    isYtBackingTrackStartRef.current = isYtSource;
    playingTrackIndexRef.current = 0;
    setPlayingTrackIndex(0);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;
    mdSectionStartTimeRef.current = startTimestamp;
    isPlayingRef.current = true;
    setIsPlayingFlow(true);
    executeJumpNow(
      0,
      sectionIndex,
      startTimestamp,
      true,
      isYtSource && !audioAnchor ? "start" : undefined,
      exactStartBeat,
      audioAnchor
    );
  }

  function fallbackToAudioOnlyStart(pendingStart: { sectionIndex: number; exactBeat: number | null }) {
    void (audioContextResumePromiseRef.current ?? resumeAudioContextForPlayback()).then(() => {
      if (pendingYoutubeStartRef.current !== pendingStart) return;
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[pendingStart.sectionIndex] || 0;
      const beatDurationMs = 60000 / (activeSongRef.current?.tempo || 75);
      const currentGlobalTime = getGlobalTime();
      const startTimestamp = pendingStart.exactBeat === null
        ? currentGlobalTime
        : currentGlobalTime - (pendingStart.exactBeat - sectionStartBeat) * beatDurationMs;
      completeSoloStart(pendingStart.sectionIndex, startTimestamp, false, pendingStart.exactBeat);
    }).catch((error) => {
      console.error("Could not start the audio-only playback fallback.", error);
      pendingYoutubeStartRef.current = null;
      isYtBackingTrackStartRef.current = false;
    });
  }

  async function beginYoutubeBackedStart() {
    if (!pendingYoutubeStartRef.current || !isYtPlayerReadyRef.current) return;
    const pendingStart = pendingYoutubeStartRef.current;
    if (pendingStart.commandInFlight || pendingStart.commandIssued) return;
    pendingStart.commandInFlight = true;
    try {
      await (audioContextResumePromiseRef.current ?? resumeAudioContextForPlayback());
    } catch (error) {
      pendingStart.commandInFlight = false;
      console.error("Could not resume audio before YouTube playback.", error);
      pendingYoutubeStartRef.current = null;
      if (!isPlayingRef.current) isYtBackingTrackStartRef.current = false;
      return;
    }

    if (pendingYoutubeStartRef.current !== pendingStart) return;
    const audioContext = getAudioContext();
    if (!audioContext || audioContext.state !== "running") {
      pendingStart.commandInFlight = false;
      console.error("AudioContext is not running before YouTube playback starts.");
      pendingYoutubeStartRef.current = null;
      if (!isPlayingRef.current) isYtBackingTrackStartRef.current = false;
      return;
    }

    const player = ytPlayerRef.current;
    if (!player || typeof player.seekTo !== "function" || typeof player.playVideo !== "function") {
      pendingStart.commandInFlight = false;
      return;
    }
    try {
      const { sectionIndex, exactBeat } = pendingStart;
      const song = activeSongRef.current;
      const offsetMs = song?.youtube_sync_offset_ms || 0;
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[sectionIndex] || 0;
      const expectedYoutubeTime = exactBeat !== null
        ? getYoutubeTimeForTimeline(exactBeat, 0, song?.tempo || 75, offsetMs)
        : sectionIndex === 0
          ? 0
          : getYoutubeTimeForTimeline(sectionStartBeat, 0, song?.tempo || 75, offsetMs);
      player.seekTo(expectedYoutubeTime, true);
      pendingStart.commandIssued = true;
      player.playVideo();
      if (player.getPlayerState?.() === 1) {
        handleYoutubePlaybackStarted(player.getCurrentTime?.() ?? expectedYoutubeTime);
      }
    } catch (error) {
      pendingStart.commandInFlight = false;
      console.warn("Could not start the optional YouTube player.", error);
      fallbackToAudioOnlyStart(pendingStart);
    } finally {
      pendingStart.commandInFlight = false;
    }
  }

  function handleYoutubePlaybackStarted(currentTimeSeconds: number) {
    const pendingStart = pendingYoutubeStartRef.current;
    if (!pendingStart || !Number.isFinite(currentTimeSeconds)) return;
    try {
      const audioContext = getAudioContext();
      if (!audioContext || audioContext.state !== "running") {
        throw new Error("AudioContext is not running when YouTube playback begins.");
      }
      if (pendingYoutubeStartRef.current !== pendingStart) return;

      const song = activeSongRef.current;
      if (!song) throw new Error("The active song is unavailable.");
      const actualYoutubeTime = currentTimeSeconds;
      const audioTime = audioContext.currentTime;
      const globalTime = getGlobalTime();
      const offsetMs = song.youtube_sync_offset_ms || 0;
      const beatDurationMs = 60000 / (song.tempo || 75);
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[pendingStart.sectionIndex] || 0;
      const absoluteBeat = ((actualYoutubeTime * 1000) - offsetMs) / beatDurationMs;
      const sectionElapsedMs = (absoluteBeat - sectionStartBeat) * beatDurationMs;
      const startTimestamp = globalTime - sectionElapsedMs;
      const audioAnchor = { audioTime, absoluteBeat };
      const meter = getTimelineMeter(song.section_timings);
      const beatPosition = getTimelineMeasureBeat(absoluteBeat, meter);
      const clickKey = `metronome_${metronomeSoundTypeRef.current}_${beatPosition.beatIndex === 1 ? 1 : 2}`;

      pendingYoutubeStartRef.current = null;
      completeSoloStart(pendingStart.sectionIndex, startTimestamp, true, pendingStart.exactBeat, audioAnchor);
      if (isPlayingRef.current && isYtBackingTrackStartRef.current && localClickVolumeRef.current > 0) {
        playZeroLatencyAudio(
          clickKey,
          localClickVolumeRef.current,
          audioAnchor.audioTime - (audioLatencyOffsetMs / 1000)
        );
      }
    } catch (error) {
      console.error("Could not anchor the metronome to YouTube playback.", error);
      fallbackToAudioOnlyStart(pendingStart);
    }
  }

  function handleYoutubePlaybackError() {
    const pendingStart = pendingYoutubeStartRef.current;
    if (pendingStart) {
      fallbackToAudioOnlyStart(pendingStart);
    }
  }

  const {
    youtubeVideoId, isYtPlayerReady,
    ytPlayerRef, isYtPlayerReadyRef, isYtBufferingRef
  } = useYouTubeSync({
    activeSong, youtubeVolumeRef, isYoutubeSyncEnabled,
    onPlaybackStarted: (currentTimeSeconds) => youtubePlaybackStartedHandlerRef.current(currentTimeSeconds),
    onPlaybackError: () => youtubePlaybackErrorHandlerRef.current()
  });
  useEffect(() => {
    youtubePlaybackStartedHandlerRef.current = handleYoutubePlaybackStarted;
    youtubePlaybackErrorHandlerRef.current = handleYoutubePlaybackError;
    beginYoutubeBackedStartRef.current = beginYoutubeBackedStart;
  });

  const syncYoutubeToTimeline = useCallback((
    sectionIndex: number,
    sectionStartTime: number,
    mode: "start" | "explicit-jump"
  ) => {
    if (youtubeStartTimeoutRef.current) {
      clearTimeout(youtubeStartTimeoutRef.current);
      youtubeStartTimeoutRef.current = null;
    }

    if (!isYtBackingTrackStartRef.current) {
      pendingYoutubeSyncRef.current = null;
      return;
    }
    pendingYoutubeSyncRef.current = { sectionIndex, sectionStartTime, mode };

    const song = activeSongRef.current;
    const player = ytPlayerRef.current;
    if (!song || !player || !isYtPlayerReadyRef.current || typeof player.seekTo !== "function") return;

    const now = getGlobalTime();
    const elapsedTimelineMs = now - sectionStartTime;
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[sectionIndex] || 0;
    const beatDurationMs = 60000 / (song.tempo || 75);
    const theoreticalYoutubeTimeMs =
      sectionStartBeat * beatDurationMs +
      elapsedTimelineMs +
      (song.youtube_sync_offset_ms || 0);
    const expectedYoutubeTime = Math.max(0, theoreticalYoutubeTimeMs / 1000);

    try {
      player.seekTo(expectedYoutubeTime, true);
      pendingYoutubeSyncRef.current = null;

      const ensurePlaying = () => {
        if (isPlayingRef.current && player.getPlayerState?.() !== 1) {
          player.playVideo?.();
        }
      };

      if (mode === "start" && theoreticalYoutubeTimeMs < 0) {
        player.pauseVideo?.();
        youtubeStartTimeoutRef.current = setTimeout(() => {
          youtubeStartTimeoutRef.current = null;
          if (isPlayingRef.current && isYtBackingTrackStartRef.current) {
            player.playVideo?.();
          }
        }, Math.abs(theoreticalYoutubeTimeMs));
      } else {
        ensurePlaying();
      }
    } catch (error) {
      console.warn("Could not synchronize the optional YouTube player.", error);
    }
  }, [getGlobalTime]);

  useEffect(() => {
    if (isYtPlayerReady && pendingYoutubeStartRef.current) {
      beginYoutubeBackedStartRef.current();
    }
    const pendingSync = pendingYoutubeSyncRef.current;
    if (isYtPlayerReady && pendingSync && isYtBackingTrackStartRef.current) {
      syncYoutubeToTimeline(
        pendingSync.sectionIndex,
        pendingSync.sectionStartTime,
        pendingSync.mode
      );
    }
  }, [isYtPlayerReady, syncYoutubeToTimeline]);

  useHardwareClock({
    isPlayingFlow, isPlayingRef, activeSongRef, playingSongRef, sectionsRef, playingSectionsRef,
    currentSectionIndexRef, setCurrentSectionIndex, beatMapRef, astTreeRef, mdSectionStartTimeRef,
    audioLatencyOffsetMs, isYtBackingTrackStartRef,
    backdropProgressRef, accentProgressBarRef, simplifiedProgressBarRef, hasPlayedCueRef,
    queuedSectionIndexRef, queuedTrackIndexRef,
    isDoubleMetronomeEnabledRef, lastAudioBeatRef, lastVisualBeatRef, lastBeatRef, lastVisualMeasureLengthRef, setCurrentMeasureLength,
    pendingQuantizedJumpRef, getGlobalTime, 
    playGuideCue, getAudioContext, audioContextStartTimeRef,

    // 👇 ADD THIS EXACT BLOCK 👇
    triggerMetronomeSound: (beatPulse, time) => {
      // ✅ FIX: Trust the Stage Mixer volume fader instead of the strict boolean toggle
      if (localClickVolumeRef.current <= 0) return;
      
      const soundKey = `metronome_${metronomeSoundTypeRef.current}_${beatPulse}`;
      playZeroLatencyAudio(soundKey, localClickVolumeRef.current, time);
    },
    // 👆 ---------------------- 👆

    getYoutubeTime: () => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function' && !isYtBufferingRef.current) {
        return ytPlayerRef.current.getCurrentTime();
      }
      return null;
    },
    executeJumpNow, localPresenceUserRef, 
    sendSupabaseBroadcast: () => {}, 
    updateMetronomeUI, activeLineIndexRef, setActiveLineIndex, 
    handleAdvanceToNextSetlistTrack: () => { handleResetFlowTrigger(); },
    sectionStartTimeRef, pauseOffsetMsRef, animationFrameRef, playingTrackIndexRef
  });

  function executeJumpNow(
    targetTrackIdx: number,
    targetSectionIdx: number,
    jumpTime: number,
    isInitialStart: boolean = false,
    youtubeSyncMode?: "start" | "explicit-jump",
    exactStartBeat?: number | null,
    audioAnchor?: { audioTime: number; absoluteBeat: number }
  ) {
    playingTrackIndexRef.current = 0;
    setPlayingTrackIndex(0);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;

    if (jumpTime) {
      mdSectionStartTimeRef.current = jumpTime;
      initAudioContext(); 
      const audioCtx = getAudioContext();
      if (audioCtx) {
        const beatSpeedSecs = 60 / (activeSongRef.current?.tempo || 75);
        if (audioAnchor) {
          audioContextStartTimeRef.current =
            audioAnchor.audioTime + (audioLatencyOffsetMs / 1000) - (audioAnchor.absoluteBeat * beatSpeedSecs);
        } else {
          const timeUntilJumpMs = jumpTime - getGlobalTime();
          const absoluteHardwareTimeAtJump = audioCtx.currentTime + (timeUntilJumpMs / 1000);
          const targetAbsoluteBeat = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0;
          audioContextStartTimeRef.current = absoluteHardwareTimeAtJump - (targetAbsoluteBeat * beatSpeedSecs);
        }
      }
      if (youtubeSyncMode) {
        syncYoutubeToTimeline(targetSectionIdx, jumpTime, youtubeSyncMode);
      }
    }
    currentSectionIndexRef.current = targetSectionIdx; setCurrentSectionIndex(targetSectionIdx);
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0;
    const beatDurationMs = 60000 / (activeSongRef.current?.tempo || 75);
    const exactBeat = exactStartBeat ?? sectionStartBeat;
    lastAudioBeatRef.current = audioAnchor
      ? getNextTimelineBeat(audioAnchor.absoluteBeat, getTimelineMeter(activeSongRef.current?.section_timings))
      : Math.max(sectionStartBeat, exactBeat);
    setTracksPlayheadBeat(isPlayingRef.current
      ? sectionStartBeat + (getGlobalTime() - jumpTime) / beatDurationMs
      : exactBeat);
    lastBeatRef.current = 0; lastVisualBeatRef.current = 0;
    setQueuedSectionIndex(null); pendingQuantizedJumpRef.current = null;
    
    setShowSyncBack(false);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (isPlayingRef.current) {
      const apparentLatency = getGlobalTime() - jumpTime;
      sectionStartTimeRef.current = Math.abs(apparentLatency) < 2000 ? performance.now() - apparentLatency : performance.now();
    }
  }

  function executeLocalResetSequence() {
    isPlayingRef.current = false; setIsPlayingFlow(false); hasPlayedCueRef.current = false;
    pendingYoutubeStartRef.current = null;
    if (youtubeStartTimeoutRef.current) {
      clearTimeout(youtubeStartTimeoutRef.current);
      youtubeStartTimeoutRef.current = null;
    }
    pendingYoutubeSyncRef.current = null;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
    currentSectionIndexRef.current = 0; lastBeatRef.current = 0; activeLineIndexRef.current = 0;
    setExplicitScrubBeat(null);
    setTracksPlayheadBeat(0);
    setCurrentSectionIndex(0); updateMetronomeUI(1, false); setActiveLineIndex(0);
    setQueuedSectionIndex(null);
    setShowSyncBack(false);
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (simplifiedProgressBarRef.current) simplifiedProgressBarRef.current.style.transform = "scaleX(0)";
  }

  function handleToggleFlowPlaybackState() {
    initAudioContext();
    if (pendingYoutubeStartRef.current) {
      pendingYoutubeStartRef.current = null;
      isYtBackingTrackStartRef.current = false;
      ytPlayerRef.current?.pauseVideo?.();
      return;
    }
    if (isPlayingFlow) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
      handleResetFlowTrigger();
    } else {
      if (sections.length === 0 || !activeSong) return;
      executeStartSequence(isYoutubeSyncEnabled && !!youtubeVideoId);
    }
  }

  function handleResetFlowTrigger() {
    executeLocalResetSequence();
  }

  function resolvePlayableSectionIndex(index: number) {
    const currentSections = sectionsRef.current;
    for (let candidate = Math.max(0, index); candidate < currentSections.length; candidate += 1) {
      if (!currentSections[candidate].section_name.toLowerCase().startsWith("spacer")) return candidate;
    }
    return -1;
  }

  function handleSectionInteractiveSelection(index: number, _trackIndex?: number, exactBeat?: number) {
    const playableIndex = resolvePlayableSectionIndex(index);
    if (playableIndex < 0) return;
    if (!isPlayingFlow) {
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[playableIndex] || 0;
      const beatDurationMs = 60000 / (activeSongRef.current?.tempo || 75);
      const jumpTime = getGlobalTime() + 150 -
        (exactBeat === undefined ? 0 : (exactBeat - sectionStartBeat) * beatDurationMs);
      setExplicitScrubBeat(exactBeat ?? null);
      executeJumpNow(0, playableIndex, jumpTime, false, "explicit-jump", exactBeat);
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null;
      setQueuedSectionIndex(playableIndex); pendingQuantizedJumpRef.current = null;
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        let jumpTime = getGlobalTime() + 150;
        if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
          const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000; 
          jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
          pendingQuantizedJumpRef.current = { trackIndex: 0, sectionIndex: playableIndex, jumpTime };
          const audioCtx = getAudioContext();
          setQueuedSectionIndex(playableIndex);
          if (sectionsRef.current[playableIndex]) playGuideCue(sectionsRef.current[playableIndex].section_name);
          hasPlayedCueRef.current = true; 
        } else { executeJumpNow(0, playableIndex, jumpTime, false, "explicit-jump"); }
      }, 250);
    }
  }

  const runtimeSemitoneDelta = useMemo(() => {
    if (!activeSong || !activeDisplayKey) return 0;
    const isMinorSong = activeSong.original_key.endsWith("m");
    const oldIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(isMinorSong ? activeSong.original_key.slice(0, -1) : activeSong.original_key));
    const newIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(isMinorSong ? activeDisplayKey.slice(0, -1) : activeDisplayKey));
    if (oldIdx === -1 || newIdx === -1) return 0;
    return (newIdx - oldIdx + 12) % 12;
  }, [activeSong, activeDisplayKey]);

  const memoizedSongAstTree = useMemo(() => {
    return sections.map((section): CompiledSectionToken => {
      const rawText = section.content || "";
      if (!rawText.trim()) return { id: section.id, section_name: section.section_name, lines: [] };
      const linesArray = rawText.split("\n").map((line): ParsedLineToken => {
        let commentText = "";
        const cleanLineText = line.replace(/\{([^\}]+)\}/g, (_, p1) => { commentText = p1.trim(); return ""; });
        const wordsMatch = cleanLineText.match(/(?:\[[^\]]+\]|\S)+/g) || [];
        const wordsTokens = wordsMatch.map((chunk): ParsedWordToken => {
          const chordRegex = /\[([^\]]+)\]/g; const chordsList: string[] = []; let match;
          while ((match = chordRegex.exec(chunk)) !== null) chordsList.push(runtimeSemitoneDelta !== 0 ? transposeBracketContent(match[1], runtimeSemitoneDelta) : match[1]);
          return { chords: chordsList, word: chunk.replace(/\[[^\]]+\]/g, "") };
        });
        return { words: wordsTokens, comment: commentText };
      });
      return { id: section.id, section_name: section.section_name, lines: linesArray };
    });
  }, [sections, runtimeSemitoneDelta]);

  const beatMap = useMemo(() => {
    if (!activeSong || sections.length === 0) return { totalBeats: 0, nodes: [], sectionStartBeats: [] };
    return compileTimelineBeatMap(
      sections,
      activeSong.section_timings,
      memoizedSongAstTree.map((section) => section.lines.length),
      activeSong.default_structure,
      timelineDurationsBySectionId
    );
  }, [activeSong, sections, memoizedSongAstTree, timelineDurationsBySectionId]);
  const timelineSectionDurations = useMemo(
    () => sections.map((_, index) => Math.max(0.125, (beatMap.sectionStartBeats[index + 1] ?? beatMap.totalBeats) - (beatMap.sectionStartBeats[index] ?? 0))),
    [beatMap, sections],
  );

  useEffect(() => {
    beatMapRef.current = beatMap;
    astTreeRef.current = memoizedSongAstTree;
  }, [beatMap, memoizedSongAstTree]);

  // ✅ SURGICAL ADDITION: Chapters Modal State & Math Engine
  const [isChaptersModalOpen, setIsChaptersModalOpen] = useState(false);
  const reorderChapterSections = (fromIndex: number, toIndex: number) => {
    const currentSections = sectionsRef.current;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= currentSections.length || toIndex >= currentSections.length) return;

    const currentSectionId = currentSections[currentSectionIndexRef.current]?.id;
    const queuedSectionId = queuedSectionIndexRef.current === null
      ? null
      : currentSections[queuedSectionIndexRef.current]?.id;
    const pendingSectionId = pendingQuantizedJumpRef.current
      ? currentSections[pendingQuantizedJumpRef.current.sectionIndex]?.id
      : null;
    const nextSections = [...currentSections];
    const [movedSection] = nextSections.splice(fromIndex, 1);
    nextSections.splice(toIndex, 0, movedSection);

    sectionsRef.current = nextSections;
    playingSectionsRef.current = nextSections;
    setSections(nextSections);

    const nextCurrentIndex = currentSectionId
      ? nextSections.findIndex((section) => section.id === currentSectionId)
      : Math.min(currentSectionIndexRef.current, nextSections.length - 1);
    currentSectionIndexRef.current = Math.max(0, nextCurrentIndex);
    setCurrentSectionIndex(currentSectionIndexRef.current);

    if (queuedSectionIndexRef.current !== null) {
      const nextQueuedIndex = queuedSectionId
        ? nextSections.findIndex((section) => section.id === queuedSectionId)
        : -1;
      queuedSectionIndexRef.current = nextQueuedIndex >= 0 ? nextQueuedIndex : null;
      setQueuedSectionIndex(queuedSectionIndexRef.current);
    }
    if (pendingSectionId && pendingQuantizedJumpRef.current) {
      const nextPendingIndex = nextSections.findIndex((section) => section.id === pendingSectionId);
      if (nextPendingIndex >= 0) pendingQuantizedJumpRef.current.sectionIndex = nextPendingIndex;
    }
  };

  const handleChapterDragStart = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    chapterDragRef.current = {
      pointerId: event.pointerId,
      fromIndex: index,
      toIndex: index,
      startY: event.clientY,
      active: false,
    };
  };

  const handleChapterDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = chapterDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.abs(event.clientY - drag.startY) < 6) return;

    event.preventDefault();
    drag.active = true;
    setChapterDragIndex(drag.fromIndex);
    const hoveredChapter = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-chapter-index]");
    const nextIndex = Number(hoveredChapter?.dataset.chapterIndex);
    if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < sectionsRef.current.length) {
      drag.toIndex = nextIndex;
      setChapterDropIndex(nextIndex);
    }
  };

  const handleChapterDragEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = chapterDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active) reorderChapterSections(drag.fromIndex, drag.toIndex);
    chapterDragRef.current = null;
    setChapterDragIndex(null);
    setChapterDropIndex(null);
  };

  const songSegments = useMemo(() => {
    if (!activeSong || sections.length === 0) return [];

    const offsetSec = (activeSong.youtube_sync_offset_ms || 0) / 1000;
    const tempo = activeSong.tempo || 120;
    const secPerBeat = 60 / tempo;
    return sections.flatMap((section, index) => {
      if (section.section_name.toLowerCase().startsWith("spacer")) return [];
      const startBeat = beatMap.sectionStartBeats[index] ?? 0;
      const endBeat = beatMap.sectionStartBeats[index + 1] ?? beatMap.totalBeats;
      const start = offsetSec + startBeat * secPerBeat;
      const duration = Math.max(0, endBeat - startBeat) * secPerBeat;
      return [{
        label: section.section_name,
        start,
        end: start + duration,
        duration,
        color: getSectionColor(section.section_name),
        sectionIndex: index,
      }];
    });
  }, [activeSong, sections, beatMap]);

  const getSectionDurationString = (sectionName: string, sectionIdx?: number) => {
    const index = sectionIdx ?? sections.findIndex((section) => section.section_name === sectionName);
    if (index < 0 || !activeSong) return "0:00";
    const startBeat = beatMap.sectionStartBeats[index] ?? 0;
    const endBeat = beatMap.sectionStartBeats[index + 1] ?? beatMap.totalBeats;
    const durationSeconds = Math.max(0, endBeat - startBeat) * 60 / (activeSong.tempo || 75);
    if (sectionName.toLowerCase().startsWith("spacer") && durationSeconds < 1) {
      return `${durationSeconds.toFixed(2)}s`;
    }
    const totalSeconds = Math.round(durationSeconds);
    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  function navigateSoloSection(direction: -1 | 1) {
    let targetIndex = currentSectionIndexRef.current + direction;
    while (
      targetIndex >= 0 &&
      targetIndex < sectionsRef.current.length &&
      sectionsRef.current[targetIndex].section_name.toLowerCase().startsWith("spacer")
    ) targetIndex += direction;
    if (targetIndex >= 0 && targetIndex < sectionsRef.current.length) {
      handleSectionInteractiveSelection(targetIndex);
      if (!isPlayingRef.current) {
        activeLineIndexRef.current = 0;
        setActiveLineIndex(0);
      }
    }
  }

  function navigateSoloLine(direction: -1 | 1) {
    if (!activeSongRef.current || sectionsRef.current.length === 0) return;
    let targetSectionIndex = currentSectionIndexRef.current;
    let targetLineIndex = activeLineIndexRef.current + direction;
    while (targetSectionIndex >= 0 && targetSectionIndex < sectionsRef.current.length) {
      const section = sectionsRef.current[targetSectionIndex];
      const lineCount = memoizedSongAstTree[targetSectionIndex]?.lines.length ?? 0;
      if (!section.section_name.toLowerCase().startsWith("spacer") && lineCount > 0) {
        if (targetLineIndex >= 0 && targetLineIndex < lineCount) break;
        targetSectionIndex += direction;
        if (targetSectionIndex < 0 || targetSectionIndex >= sectionsRef.current.length) return;
        const nextLineCount = memoizedSongAstTree[targetSectionIndex]?.lines.length ?? 0;
        targetLineIndex = direction > 0 ? 0 : nextLineCount - 1;
      } else {
        targetSectionIndex += direction;
        if (targetSectionIndex < 0 || targetSectionIndex >= sectionsRef.current.length) return;
        const nextLineCount = memoizedSongAstTree[targetSectionIndex]?.lines.length ?? 0;
        targetLineIndex = direction > 0 ? 0 : nextLineCount - 1;
      }
    }
    if (targetSectionIndex < 0 || targetSectionIndex >= sectionsRef.current.length) return;

    const sectionStartBeat = beatMapRef.current.sectionStartBeats[targetSectionIndex] || 0;
    const beatInSection = getTimelineLineStartBeat(
      activeSongRef.current.section_timings,
      sectionsRef.current[targetSectionIndex].section_name,
      memoizedSongAstTree[targetSectionIndex]?.lines.length ?? 1,
      targetLineIndex
    );
    const targetAbsoluteBeat = sectionStartBeat + beatInSection;
    const beatDurationMs = 60000 / (activeSongRef.current.tempo || 75);
    const jumpTime = getGlobalTime() - (targetAbsoluteBeat - sectionStartBeat) * beatDurationMs;

    setExplicitScrubBeat(targetAbsoluteBeat);
    executeJumpNow(0, targetSectionIndex, jumpTime, false, "explicit-jump", targetAbsoluteBeat);
    activeLineIndexRef.current = targetLineIndex;
    setActiveLineIndex(targetLineIndex);
  }

  function cycleSoloView() {
    const modes = ["sheet", "tracks"] as const;
    const current = isTracksMode ? "tracks" : "sheet";
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    setIsZenMode(false);
    setIsTracksMode(next === "tracks");
    setIsSimplifiedMode(false);
  }

  const keyboardMidiControls = useKeyboardMidiControls(supabase, {
    playStop: handleToggleFlowPlaybackState,
    previousSection: () => navigateSoloSection(-1),
    nextSection: () => navigateSoloSection(1),
    previousLine: () => navigateSoloLine(-1),
    nextLine: () => navigateSoloLine(1),
    viewMode: cycleSoloView,
    chordNotation: () => setShowChords(!showChords),
    chordFormat: () => setChordFormat(chordFormat === "Key" ? "Numbers" : "Key"),
    lineSpacing: () => setLineSpacing(lineSpacing === 16 ? 24 : lineSpacing === 24 ? 32 : 16),
    lyricsSize: () => setLyricsFontSize(lyricsFontSize === 14 ? 16 : lyricsFontSize === 16 ? 20 : lyricsFontSize === 20 ? 24 : 14),
    youtubeSync: () => setIsYoutubeSyncEnabled(!isYoutubeSyncEnabled),
    clickMute: () => setMixerMutes((current) => ({ ...current, click: !current.click })),
    clickSolo: () => setMixerSolos((current) => ({ ...current, click: !current.click })),
    guideMute: () => setMixerMutes((current) => ({ ...current, guide: !current.guide })),
    guideSolo: () => setMixerSolos((current) => ({ ...current, guide: !current.guide })),
    youtubeMute: () => setMixerMutes((current) => ({ ...current, yt: !current.yt })),
    youtubeSolo: () => setMixerSolos((current) => ({ ...current, yt: !current.yt })),
    clickVolume: (value) => { if (typeof value === "number") setLocalClickVolume(value); },
    guideVolume: (value) => { if (typeof value === "number") setGuideVolume(value); },
    youtubeVolume: (value) => { if (typeof value === "number") setYoutubeVolume(value); },
  });

  if (loading) return <PageSkeleton message="LOADING SONG..." variant="live" />;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      
      {/* ✅ EXACT MATCH: Passed props identically to page_4 to ensure internal UI/Scroll hooks function[cite: 5] */}
      {!isZenMode && (
        <LiveHeader 
          activeSong={activeSong} activeDisplayKey={activeDisplayKey} currentDriftMs={null}
          localPresenceUser={localPresenceUser} isPlayingFlow={isPlayingFlow} currentBeat={currentBeat}
          currentMeasureLength={currentMeasureLength} metronomeRefs={metronomeRefs} setIsSettingsModalOpen={setIsSettingsModalOpen}
          handleToggleFlowPlaybackState={handleToggleFlowPlaybackState} displayedOnlineUsers={[]}
          tracksList={mockedSoloTrackList as any} currentTrackIndex={0} handleUserSelectTrackBadge={() => {}}
          backdropProgressRef={backdropProgressRef} accentProgressBarRef={accentProgressBarRef}
          isSoloMode={true} 
          isSimplifiedMode={isSimplifiedMode}
          localClickVolume={localClickVolume}
          wakeUpAudioEngine={initAudioContext}
          metronomeSoundType={metronomeSoundType}
          activeSectionName={sectionsRef.current[currentSectionIndex]?.section_name || "---"}
          nextSectionName={
            (queuedSectionIndexRef.current !== null && queuedTrackIndexRef.current !== null)
              ? "QUEUED"
              : (resolvePlayableSectionIndex(currentSectionIndex + 1) >= 0
                ? sectionsRef.current[resolvePlayableSectionIndex(currentSectionIndex + 1)]?.section_name
                : "END")
          }
          handleSyncBack={() => setShowSyncBack(false)}
          showSyncBack={showSyncBack} 
          scrollContainerRef={trackScrollRefs.current[0]}
          setIsChaptersModalOpen={setIsChaptersModalOpen} // ✅ Add prop to trigger modal
        />
      )}

      {/* ✅ EXACT MATCH: Restored the flex-row container that wraps the SheetView and Scrubber[cite: 5] */}
      <div className="flex-1 flex flex-row w-full h-full relative" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
        <div className="w-full h-full shrink-0 relative flex flex-col">
          {isTracksMode ? (
            <TracksView
              activeSong={activeSong}
              sections={sections}
              songAst={memoizedSongAstTree}
              sectionStarts={beatMap.sectionStartBeats}
              sectionDurations={timelineSectionDurations}
              totalBeats={beatMap.totalBeats}
              activeSectionIndex={currentSectionIndex}
              queuedSectionIndex={queuedSectionIndex}
              activeLineIndex={activeLineIndex}
              playheadBeat={isPlayingFlow
                ? tracksPlayheadBeat
                : explicitScrubBeat ?? beatMap.sectionStartBeats[currentSectionIndex] ?? 0}
              isPlaying={isPlayingFlow}
              tempo={activeSong?.tempo ?? 75}
              quarterBeatsPerMeasure={getTimelineMeter(activeSong?.section_timings).quarterBeatsPerMeasure}
              showChords={showChords}
              lyricsFontSize={lyricsFontSize}
              lineSpacing={lineSpacing}
              chordFormat={chordFormat}
              activeDisplayKey={activeDisplayKey}
              handleSectionInteractiveSelection={handleSectionInteractiveSelection}
              isMD={true}
            />
          ) : isSimplifiedMode ? (
              <SimplifiedStackView 
                memoizedSongAstTree={memoizedSongAstTree} 
                currentSectionIndex={currentSectionIndex}
                queuedSectionIndex={queuedSectionIndex}
                queuedTrackIndex={null} 
                currentTrackIndex={0} 
                activeLineIndex={activeLineIndex}
                chordFormat={chordFormat} 
                activeDisplayKey={activeDisplayKey} 
                getSectionDurationString={getSectionDurationString}
                simplifiedProgressBarRef={simplifiedProgressBarRef}
                upcomingTrackItem={null}
                showChords={showChords}
                lyricsFontSize={lyricsFontSize}
                lineSpacing={lineSpacing}
                handleSectionInteractiveSelection={handleSectionInteractiveSelection}
                handleUserSelectTrackBadge={() => {}}
              />
          ) : (
            <StandardSheetView 
              memoizedSongAstTree={memoizedSongAstTree} isPlayingFlow={isPlayingFlow} isInteractive={true} playingTrackIndex={0}
              currentTrackIndex={0} currentSectionIndex={currentSectionIndex} queuedTrackIndex={null}
              queuedSectionIndex={queuedSectionIndex} getSectionDurationString={getSectionDurationString} handleSectionInteractiveSelection={handleSectionInteractiveSelection}
              sectionRefs={trackSectionRefs.current[0]} activeLineIndex={activeLineIndex} showChords={showChords} lyricsFontSize={lyricsFontSize}
              lineSpacing={lineSpacing} chordFormat={chordFormat} activeDisplayKey={activeDisplayKey} upcomingTrackItem={null}
              handleUserSelectTrackBadge={() => {}} scrollContainerRef={trackScrollRefs.current[0]}
              isAutoScrollingRef={isAutoScrollingRef} setShowSyncBack={setShowSyncBack} 
            />
          )}

          {/* ✅ EXACT MATCH: ScrubberOverlay now sits side-by-side inside the scroll wrapper[cite: 5] */}
          {!isZenMode && (
            <ScrubberOverlay 
              sections={sections} currentSectionIndex={currentSectionIndex} queuedTrackIndex={null} currentTrackIndex={0}
              queuedSectionIndex={queuedSectionIndex} isPlayingFlow={isPlayingFlow} sectionRefs={trackSectionRefs.current[0]} isAutoScrollingRef={isAutoScrollingRef} setShowSyncBack={setShowSyncBack}
              isSimplifiedMode={isSimplifiedMode} tracksList={mockedSoloTrackList as any} handleUserSelectTrackBadge={() => {}}
            />
          )}
        </div>
      </div>

      {isZenMode && (
         <>
           <div ref={zenOverlayRef} className="fixed inset-0 pointer-events-none z-[400000] opacity-0" />
           <ZenMovableFAB 
             isMD={localPresenceUser?.isMD} isPlayingFlow={isPlayingFlow} 
             onTogglePlay={handleToggleFlowPlaybackState} onOpenSettings={() => setIsSettingsModalOpen(true)} onExitZen={() => setIsZenMode(false)}
           />
         </>
      )}

      <SettingsModal
        isSettingsModalOpen={isSettingsModalOpen} setIsSettingsModalOpen={setIsSettingsModalOpen} localPresenceUser={localPresenceUser} onlineUsers={[]} handleToggleMusicDirectorMode={() => {}}
        showChords={showChords} setShowChords={setShowChords} chordFormat={chordFormat} setChordFormat={setChordFormat} isSimplifiedMode={isSimplifiedMode} setIsSimplifiedMode={setIsSimplifiedMode} isTracksMode={isTracksMode} setIsTracksMode={setIsTracksMode}
        isZenMode={isZenMode} setIsZenMode={setIsZenMode} metronomeSoundType={metronomeSoundType} setMetronomeSoundType={setMetronomeSoundType}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing} lyricsFontSize={lyricsFontSize} setLyricsFontSize={setLyricsFontSize}
        isMetronomeSoundEnabled={isMetronomeSoundEnabled} setIsMetronomeSoundEnabled={setIsMetronomeSoundEnabled} isDoubleMetronomeEnabled={isDoubleMetronomeEnabled} setIsDoubleMetronomeEnabled={setIsDoubleMetronomeEnabled}
        localClickVolume={localClickVolume} setLocalClickVolume={setLocalClickVolume}
        guideVolume={guideVolume} setGuideVolume={setGuideVolume}
        mixerMutes={mixerMutes} setMixerMutes={setMixerMutes}
        mixerSolos={mixerSolos} setMixerSolos={setMixerSolos}
        audioLatencyOffsetMs={audioLatencyOffsetMs} setAudioLatencyOffsetMs={setAudioLatencyOffsetMs}
        isTestingSync={isTestingSync} setIsTestingSync={setIsTestingSync} testVisualBeat={testVisualBeat} activeSong={activeSong}
        isYoutubeSyncEnabled={isYoutubeSyncEnabled} setIsYoutubeSyncEnabled={setIsYoutubeSyncEnabled} youtubeVolume={youtubeVolume} setYoutubeVolume={setYoutubeVolume}
        isClickGuideHardPannedRight={isClickGuideHardPannedRight} setIsClickGuideHardPannedRight={setIsClickGuideHardPannedRight}
        canEditSong={["admin", "moderator", "musician"].includes(activeRole)} 
        isRecording={false}
        setIsRecordModalOpen={() => {}} 
        isPlayingFlow={isPlayingFlow} router={router as any} handleOpenTransposerModal={() => setIsTransposerOpen(true)} setIsStructureModalOpen={() => {}}
        midiSetup={{
          preferences: keyboardMidiControls.preferences,
          profileDocument: keyboardMidiControls.profileDocument,
          activeProfileId: keyboardMidiControls.activeProfileId,
          devices: keyboardMidiControls.devices,
          isLoading: keyboardMidiControls.isLoading,
          isSaving: keyboardMidiControls.isSaving,
          isMidiSupported: keyboardMidiControls.isMidiSupported,
          preferenceError: keyboardMidiControls.preferenceError,
          midiError: keyboardMidiControls.midiError,
          learningAction: keyboardMidiControls.learningAction,
          unavailableActions: ["previousSong", "nextSong", "mdTakeover"],
          onScan: () => { void keyboardMidiControls.scanMidiDevices(); },
          onPairDevice: keyboardMidiControls.pairDevice,
          onLearn: keyboardMidiControls.learnMidiAction,
          onClearMapping: keyboardMidiControls.clearMidiMapping,
          onClearAll: keyboardMidiControls.clearAllMidiMappings,
          onCancelLearn: keyboardMidiControls.cancelMidiLearn,
          onSelectProfile: keyboardMidiControls.selectMidiProfile,
          onCreateProfile: keyboardMidiControls.createMidiProfile,
          onRenameProfile: keyboardMidiControls.renameMidiProfile,
          onDeleteProfile: keyboardMidiControls.deleteMidiProfile,
          setSetupOpen: keyboardMidiControls.setSetupOpen,
        }}
      />

      <TransposerModal 
        isTransposerOpen={isTransposerOpen} setIsTransposerOpen={setIsTransposerOpen} activeSong={activeSong}
        modalRoot={modalRoot} setModalRoot={setModalRoot} modalAccidental={modalAccidental as ""|"#"|"b"} setModalAccidental={setModalAccidental}
        handleCommitTranspositionSave={(e) => {
          e.preventDefault(); if (!activeSong) return;
          const formatted = `${modalRoot}${modalAccidental}${activeSong.original_key.endsWith("m") ? "m" : ""}`;
          setActiveDisplayKey(formatted); setIsTransposerOpen(false);
          handleResetFlowTrigger();
        }}
      />

      {/* ✅ SURGICAL ADDITION: In-Video Chapters Modal for Solo Page */}
      {isChaptersModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300000] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-150">
          <div className="bg-surface-container rounded-t-3xl md:rounded-[2rem] shadow-2xl border-t border-x md:border border-outline-variant/30 w-full max-w-md flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-full md:zoom-in-95 duration-300">
            
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">format_list_bulleted</span>
                <h3 className="font-black text-[16px] text-on-surface">Song Chapters</h3>
              </div>
              <button 
                onClick={() => setIsChaptersModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant flex items-center justify-center transition-colors border border-outline-variant/30"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-1.5 pb-safe">
              {songSegments.length === 0 ? (
                <div className="p-8 text-center text-outline font-body-compact italic">No chapters available for this arrangement.</div>
              ) : (
                songSegments.map((seg, idx) => {
                  const isActive = currentSectionIndex === seg.sectionIndex;
                  const isQueued = queuedSectionIndex === seg.sectionIndex; 
                  
                  return (
                    <div 
                      key={`chap-${seg.sectionIndex}`}
                      data-chapter-index={seg.sectionIndex}
                      className={`group flex items-center justify-between p-3 rounded-xl transition-colors border ${chapterDropIndex === seg.sectionIndex && chapterDragIndex !== seg.sectionIndex ? "border-primary/60 bg-primary/10" : isActive ? 'bg-primary/10 border-primary/30' : isQueued ? 'bg-purple-500/10 border-purple-500/30' : 'bg-surface-container border-transparent hover:bg-surface-container-high'} ${chapterDragIndex === seg.sectionIndex ? "opacity-50" : ""}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Drag to rearrange ${seg.label}`}
                          title="Drag to rearrange"
                          onPointerDown={(event) => handleChapterDragStart(event, seg.sectionIndex)}
                          onPointerMove={handleChapterDragMove}
                          onPointerUp={handleChapterDragEnd}
                          onPointerCancel={handleChapterDragEnd}
                          onKeyDown={(event) => {
                            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                            event.preventDefault();
                            const visibleIndex = songSegments.findIndex((chapter) => chapter.sectionIndex === seg.sectionIndex);
                            const nextChapter = songSegments[visibleIndex + (event.key === "ArrowUp" ? -1 : 1)];
                            if (nextChapter) reorderChapterSections(seg.sectionIndex, nextChapter.sectionIndex);
                          }}
                          className="flex h-8 w-6 shrink-0 touch-none items-center justify-center rounded-md text-on-surface-variant/70 hover:bg-surface-container-high hover:text-on-surface"
                        >
                          <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                        </button>
                        <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-[14px] truncate ${isActive ? 'text-primary' : isQueued ? 'text-purple-400' : 'text-on-surface'}`}>{seg.label}</span>
                          {isQueued && <span className="text-[8px] font-black bg-[#9333ea] text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm border border-[#7e22ce]">⚡ QUEUED</span>}
                        </div>
                        <span className="font-mono text-[11px] text-on-surface-variant tracking-widest mt-0.5">{formatTime(seg.start)}</span>
                        </div>
                      </div>
  
                      {!isActive ? (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Queue Button */}
                          {!isQueued && (
                            <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  setQueuedSectionIndex(seg.sectionIndex); 
                                  pendingQuantizedJumpRef.current = null;
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-highest text-on-surface-variant hover:text-white hover:bg-[#9333ea] transition-colors border border-outline-variant/30"
                              title="Queue Next"
                            >
                              <span className="material-symbols-outlined text-[16px]">queue_music</span>
                            </button>
                          )}

                          {/* Play Now Button */}
                          <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                const playableIndex = resolvePlayableSectionIndex(seg.sectionIndex);
                                if (playableIndex < 0) return;
                                if (!isPlayingFlow) {
                                  const jumpTime = getGlobalTime() + 150; 
                                  executeJumpNow(0, playableIndex, jumpTime, false, "explicit-jump");
                                } else {
                                  let jumpTime = getGlobalTime() + 150;
                                  if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
                                    const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000; 
                                    jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
                                    pendingQuantizedJumpRef.current = { trackIndex: 0, sectionIndex: playableIndex, jumpTime };
                                    setQueuedSectionIndex(playableIndex);
                                    if (sectionsRef.current[playableIndex]) playGuideCue(sectionsRef.current[playableIndex].section_name);
                                    hasPlayedCueRef.current = true;
                                  } else { executeJumpNow(0, playableIndex, jumpTime, false, "explicit-jump"); }
                                }
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-primary-container text-primary hover:text-white hover:bg-primary transition-colors border border-primary/20"
                            title="Play Now"
                          >
                            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          </button>
                        </div>
                      ) : (
                         isActive && <span className="material-symbols-outlined text-[16px] text-primary mr-2 animate-pulse">equalizer</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-50"><div id="yt-live-player-container"></div></div>
    </div>
  );
}