"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext"; 
import GlobalLoader from '../../../components/GlobalLoader';

import { useTimesync } from '../../../hooks/useTimesync';
import { useWakeLock } from "../../setlists/[id]/live/hooks/useWakeLock";
import { useWebAudioEngine } from "../../setlists/[id]/live/hooks/useWebAudioEngine";
import { useLocalPreferences } from "../../setlists/[id]/live/hooks/useLocalPreferences";
import { useYouTubeSync } from "../../setlists/[id]/live/hooks/useYouTubeSync";
import { useHardwareClock } from "../../setlists/[id]/live/hooks/useHardwareClock";

import { LiveHeader } from "../../setlists/[id]/live/components/LiveHeader";
import { SimplifiedStackView } from "../../setlists/[id]/live/components/SimplifiedStackView";
import { StandardSheetView } from "../../setlists/[id]/live/components/StandardSheetView";
import { ScrubberOverlay } from "../../setlists/[id]/live/components/ScrubberOverlay";
import { SettingsModal } from "../../setlists/[id]/live/components/SettingsModal";
import { TransposerModal } from "../../setlists/[id]/live/components/TransposerModal";
import { ZenMovableFAB } from "../../setlists/[id]/live/components/ZenMovableFAB";

import { CompiledSectionToken, CompiledBeatMap, BeatNode, ArrangementSection, SongRecord, ParsedLineToken, ParsedWordToken } from "../../setlists/[id]/live/types/setlist";
import { CHROMATIC_SCALE, transposeBracketContent, normalizeKeyNote } from "../../setlists/[id]/live/utils/music-math";
import { normalizeSectionNameToAudioFile } from "../../setlists/[id]/live/utils/setlist-helpers"; 

const { initAudioContext } = useWebAudioEngine();

const supabase = createClient();

export default function SoloPracticeRoomPage() {
  const router = useRouter();
  const params = useParams();
  const songId = params?.id as string;

  const { getGlobalTime } = useTimesync();
  const { activeRole } = useEngine(); 
  useWakeLock();
  
  const { initAudioContext, fetchAndDecodeAudio, playZeroLatencyAudio, playGuideCue, getAudioContext } = useWebAudioEngine();
  
  const {
    lyricsFontSize, setLyricsFontSize, showChords, setShowChords, chordFormat, setChordFormat,
    isSimplifiedMode, setIsSimplifiedMode, lineSpacing, setLineSpacing,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isMetronomeSoundEnabledRef,
    isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled, isDoubleMetronomeEnabledRef,
    localClickVolume, setLocalClickVolume, localClickVolumeRef,
    youtubeVolume, setYoutubeVolume, youtubeVolumeRef,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled
  } = useLocalPreferences();

  const [loading, setLoading] = useState(true);
  const [activeSong, setActiveSong] = useState<SongRecord | null>(null);
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const [activeDisplayKey, setActiveDisplayKey] = useState<string>("C");
  
  const activeSongRef = useRef<SongRecord | null>(null);
  const sectionsRef = useRef<ArrangementSection[]>([]);

  const localPresenceUser = { id: "solo_local", isMD: true, name: "You" };
  const localPresenceUserRef = useRef<any>(localPresenceUser);

  const [audioLatencyOffsetMs, setAudioLatencyOffsetMs] = useState<number>(0);
  const [metronomeSoundType, setMetronomeSoundType] = useState<"blip" | "bell" | "block" | "glass">("blip");
  const metronomeSoundTypeRef = useRef(metronomeSoundType);
  useEffect(() => { metronomeSoundTypeRef.current = metronomeSoundType; }, [metronomeSoundType]);
  
  const [isTestingSync, setIsTestingSync] = useState<boolean>(false);
  const [testVisualBeat, setTestVisualBeat] = useState<number>(1);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownValueRef = useRef<number | null>(null);

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
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [showSyncBack, setShowSyncBack] = useState<boolean>(false);

  const currentTrackIndex = 0;
  const currentTrackIndexRef = useRef(0);
  const [playingTrackIndex, setPlayingTrackIndex] = useState<number>(0);
  const [queuedSectionIndex, setQueuedSectionIndex] = useState<number | null>(null);

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
  const playClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingQuantizedJumpRef = useRef<{ trackIndex: number; sectionIndex: number; jumpTime: number } | null>(null);
  const isYtBackingTrackStartRef = useRef<boolean>(false);
  const activeLineIndexRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const pauseOffsetMsRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextStartTimeRef = useRef<number | null>(null);
  const astTreeRef = useRef<CompiledSectionToken[]>([]);
  const mdSectionStartTimeRef = useRef<number | null>(null);
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
        
        if (song.default_structure && Array.isArray(song.default_structure) && song.default_structure.length > 0) {
           parsedSections = song.default_structure.map((ds: any) => {
              const matchedText = song.song_sections?.find((ss: any) => ss.section_name === ds.section_name);
              return { ...ds, content: ds.content || matchedText?.content || "" };
           });
        } else if (song.song_sections && song.song_sections.length > 0) {
           parsedSections = song.song_sections.map((ss: any) => ({
              id: ss.id, section_name: ss.section_name, content: ss.content
           }));
        }

        setSections(parsedSections);
        sectionsRef.current = parsedSections;

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

  const updateMetronomeUI = (activeBeat: number, isPlaying: boolean, measureLength: number = 4) => {
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

  function executeStartSequence(useCountdown: boolean, forcedStartTimestamp?: number, isYtSource: boolean = false) {
    isYtBackingTrackStartRef.current = isYtSource; 
    playingTrackIndexRef.current = 0;
    setPlayingTrackIndex(0);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;
    isPlayingRef.current = true;
    setIsPlayingFlow(true);

    const delayMs = useCountdown ? 3150 : 150; 
    const startTimestamp = forcedStartTimestamp ?? (getGlobalTime() + delayMs);
    mdSectionStartTimeRef.current = startTimestamp;

    executeJumpNow(0, currentSectionIndexRef.current, startTimestamp, true);
  }

  const {
    youtubeVideoId, isYtBuffering, setIsYtBuffering,
    ytPlayerRef, isYtPlayerReadyRef, ytSyncPendingRef, isYtBufferingRef
  } = useYouTubeSync({
    activeSong, activeSongRef, beatMapRef, currentSectionIndexRef,
    getGlobalTime, youtubeVolumeRef, isYoutubeSyncEnabled
  });

  useHardwareClock({
    isPlayingFlow, isPlayingRef, activeSongRef, playingSongRef, sectionsRef, playingSectionsRef,
    currentSectionIndexRef, setCurrentSectionIndex, beatMapRef, astTreeRef, mdSectionStartTimeRef,
    audioLatencyOffsetMs, isYtBackingTrackStartRef, countdownValueRef, setCountdownValue,
    backdropProgressRef, accentProgressBarRef, simplifiedProgressBarRef, hasPlayedCueRef, playGuideCue,
    queuedSectionIndexRef, queuedTrackIndexRef, audioContextStartTimeRef, getAudioContext,
    isDoubleMetronomeEnabledRef, lastAudioBeatRef, lastVisualBeatRef, lastBeatRef, lastVisualMeasureLengthRef, setCurrentMeasureLength,
    pendingQuantizedJumpRef, getGlobalTime, 
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

  function executeJumpNow(targetTrackIdx: number, targetSectionIdx: number, jumpTime: number, isInitialStart: boolean = false) {
    playingTrackIndexRef.current = 0;
    setPlayingTrackIndex(0);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;

    if (jumpTime) {
      mdSectionStartTimeRef.current = jumpTime;
      initAudioContext(); 
      const audioCtx = getAudioContext();
      if (audioCtx) {
        const timeUntilJumpMs = jumpTime - getGlobalTime();
        const absoluteHardwareTimeAtJump = audioCtx.currentTime + (timeUntilJumpMs / 1000);
        const targetAbsoluteBeat = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0;
        const beatSpeedSecs = 60 / (activeSongRef.current?.tempo || 75);
        const theoreticalSongStartOffset = targetAbsoluteBeat * beatSpeedSecs;
        
        const ytOffsetSecs = (activeSongRef.current?.youtube_sync_offset_ms || 0) / 1000;
        const ytSeekTargetSecs = targetSectionIdx === 0 ? 0 : (ytOffsetSecs + theoreticalSongStartOffset);

        if (isYtBackingTrackStartRef.current) {
          audioContextStartTimeRef.current = absoluteHardwareTimeAtJump + ytOffsetSecs - ytSeekTargetSecs;
        } else {
          audioContextStartTimeRef.current = absoluteHardwareTimeAtJump - theoreticalSongStartOffset;
        }

        if (isYtBackingTrackStartRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          try { 
            ytPlayerRef.current.seekTo(ytSeekTargetSecs, true); 
            ytPlayerRef.current.pauseVideo();
            
            const timeUntilPlayMs = Math.max(0, jumpTime - getGlobalTime());
            setTimeout(() => {
              if (isPlayingRef.current) ytPlayerRef.current.playVideo();
            }, timeUntilPlayMs);
          } catch(e) {}
        }
        
      }
    }
    currentSectionIndexRef.current = targetSectionIdx; setCurrentSectionIndex(targetSectionIdx);
    lastAudioBeatRef.current = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0; 
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
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
    currentSectionIndexRef.current = 0; lastBeatRef.current = 0; activeLineIndexRef.current = 0;
    setCurrentSectionIndex(0); updateMetronomeUI(1, false); setActiveLineIndex(0);
    setQueuedSectionIndex(null);
    setShowSyncBack(false);
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (simplifiedProgressBarRef.current) simplifiedProgressBarRef.current.style.transform = "scaleX(0)";
  }

  function handleToggleFlowPlaybackState() {
    initAudioContext();
    if (isPlayingFlow) {
      if (playClickTimeoutRef.current) { clearTimeout(playClickTimeoutRef.current); playClickTimeoutRef.current = null; }
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
      handleResetFlowTrigger();
    } else {
      if (sections.length === 0 || !activeSong) return;
      if (playClickTimeoutRef.current) {
        clearTimeout(playClickTimeoutRef.current); playClickTimeoutRef.current = null;
        if (isYoutubeSyncEnabled && youtubeVideoId) executeStartSequence(true, undefined, true); 
        else executeStartSequence(true); 
      } else {
        playClickTimeoutRef.current = setTimeout(() => {
          playClickTimeoutRef.current = null;
          if (isYoutubeSyncEnabled && youtubeVideoId) executeStartSequence(true, undefined, true); 
          else executeStartSequence(false);
        }, 250);
      }
    }
  }

  function handleResetFlowTrigger() {
    executeLocalResetSequence();
  }

  function handleSectionInteractiveSelection(index: number) {
    if (!isPlayingFlow) {
      const jumpTime = getGlobalTime() + 150; executeJumpNow(0, index, jumpTime);
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null;
      setQueuedSectionIndex(index); pendingQuantizedJumpRef.current = null;
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        let jumpTime = getGlobalTime() + 150;
        if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
          const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000; 
          jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
          pendingQuantizedJumpRef.current = { trackIndex: 0, sectionIndex: index, jumpTime };
          const audioCtx = getAudioContext();
          setQueuedSectionIndex(index);
          if (sectionsRef.current[index]) playGuideCue(sectionsRef.current[index].section_name);
          hasPlayedCueRef.current = true; 
        } else { executeJumpNow(0, index, jumpTime); }
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
    const map: BeatNode[] = []; const sectionStartBeats: number[] = []; let currentAbsoluteBeat = 0;
    if (!activeSong || sections.length === 0) return { totalBeats: 0, nodes: [], sectionStartBeats: [] };

    sections.forEach((section, sIdx) => {
      sectionStartBeats.push(currentAbsoluteBeat);
      const timings = activeSong.section_timings?.[section.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1;
      const headBeats = (timings.head_m || 0) * 4;
      const tailBeats = (timings.tail_m || 0) * 4;
      
      const totalCoreBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);
      let baseLoopBeats = totalCoreBeats / sectionMultiplier;
      
      const parsedLinesCount = memoizedSongAstTree[sIdx]?.lines.length || 1;
      let hasLineOverrides = false; 
      const lineBeatsMap: number[] = [];
      
      if (timings.line_timings && Object.keys(timings.line_timings).length > 0) {
        let sumBaseLoopBeats = 0;
        for (let i = 0; i < parsedLinesCount; i++) {
          const t = timings.line_timings[String(i)] || { measures: 0, beats: 0 };
          const lineMult = (t.repeats || 0) + 1; 
          const lineBeats = ((t.measures * 4) + (t.beats || 0)) * lineMult;
          lineBeatsMap.push(lineBeats); 
          sumBaseLoopBeats += lineBeats;
        }
        if (sumBaseLoopBeats > 0) { hasLineOverrides = true; baseLoopBeats = sumBaseLoopBeats; }
      }

      const stampBeats = (totalBeatsToStamp: number) => {
          let remaining = totalBeatsToStamp;
          while (remaining > 0) { 
            const mLen = remaining >= 4 ? 4 : remaining; 
            for (let b = 1; b <= mLen; b++) { map.push({ absoluteBeatIndex: currentAbsoluteBeat, measureBeatIndex: b, measureLength: mLen, sectionIndex: sIdx, isDownbeat: b === 1 }); currentAbsoluteBeat++; }
            remaining -= mLen; 
          }
      };

      stampBeats(headBeats);
      for (let r = 0; r < sectionMultiplier; r++) { 
        if (hasLineOverrides) { lineBeatsMap.forEach(b => stampBeats(b)); } 
        else { stampBeats(baseLoopBeats); } 
      }
      stampBeats(tailBeats);
    });

    return { totalBeats: currentAbsoluteBeat, nodes: map, sectionStartBeats };
  }, [activeSong, sections, memoizedSongAstTree]);

  useEffect(() => {
    beatMapRef.current = beatMap;
    astTreeRef.current = memoizedSongAstTree;
  }, [beatMap, memoizedSongAstTree]);

  const getSectionDurationString = (sectionName: string, sectionIdx?: number) => {
    const timings = activeSong?.section_timings?.[sectionName] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
    const sectionMultiplier = (timings.repeats || 0) + 1;
    let totalCoreBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);

    if (sectionIdx !== undefined && timings.line_timings && memoizedSongAstTree[sectionIdx]) {
        let calcBaseLoop = 0;
        for (let i = 0; i < memoizedSongAstTree[sectionIdx].lines.length; i++) { 
           const t = timings.line_timings[String(i)] || { measures: 0, beats: 0 };
           const lineMult = (t.repeats || 0) + 1; 
           calcBaseLoop += ((t.measures * 4) + (t.beats || 0)) * lineMult;
        }
        if (calcBaseLoop > 0) totalCoreBeats = calcBaseLoop * sectionMultiplier;
    }
    
    let totalBeats = totalCoreBeats + ((timings.head_m || 0) * 4) + ((timings.tail_m || 0) * 4);
    if (totalBeats <= 0) totalBeats = 16; 
    
    const totalSeconds = Math.round((totalBeats * (60000 / (activeSong?.tempo || 75))) / 1000);
    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  if (loading) return <GlobalLoader message="LOADING SONG..." />;

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
              : sectionsRef.current[currentSectionIndex + 1]?.section_name || "END"
          }
          handleSyncBack={() => setShowSyncBack(false)}
          showSyncBack={showSyncBack} 
          scrollContainerRef={trackScrollRefs.current[0]}
        />
      )}

      {/* ✅ EXACT MATCH: Restored the flex-row container that wraps the SheetView and Scrubber[cite: 5] */}
      <div className="flex-1 flex flex-row w-full h-full relative" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
        <div className="w-full h-full shrink-0 relative flex flex-col">
          {isSimplifiedMode ? (
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
              memoizedSongAstTree={memoizedSongAstTree} isPlayingFlow={isPlayingFlow} playingTrackIndex={0}
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
        showChords={showChords} setShowChords={setShowChords} chordFormat={chordFormat} setChordFormat={setChordFormat} isSimplifiedMode={isSimplifiedMode} setIsSimplifiedMode={setIsSimplifiedMode}
        isZenMode={isZenMode} setIsZenMode={setIsZenMode} metronomeSoundType={metronomeSoundType} setMetronomeSoundType={setMetronomeSoundType}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing} lyricsFontSize={lyricsFontSize} setLyricsFontSize={setLyricsFontSize}
        isMetronomeSoundEnabled={isMetronomeSoundEnabled} setIsMetronomeSoundEnabled={setIsMetronomeSoundEnabled} isDoubleMetronomeEnabled={isDoubleMetronomeEnabled} setIsDoubleMetronomeEnabled={setIsDoubleMetronomeEnabled}
        localClickVolume={localClickVolume} setLocalClickVolume={setLocalClickVolume} audioLatencyOffsetMs={audioLatencyOffsetMs} setAudioLatencyOffsetMs={setAudioLatencyOffsetMs}
        isTestingSync={isTestingSync} setIsTestingSync={setIsTestingSync} testVisualBeat={testVisualBeat} activeSong={activeSong}
        isYoutubeSyncEnabled={isYoutubeSyncEnabled} setIsYoutubeSyncEnabled={setIsYoutubeSyncEnabled} youtubeVolume={youtubeVolume} setYoutubeVolume={setYoutubeVolume}
        canEditSong={["admin", "moderator", "musician"].includes(activeRole)} 
        isRecording={false}
        setIsRecordModalOpen={() => {}} 
        isPlayingFlow={isPlayingFlow} router={router as any} handleOpenTransposerModal={() => setIsTransposerOpen(true)} setIsStructureModalOpen={() => {}}
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

      {countdownValue !== null && (
        <div className="fixed inset-0 z-[400000] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-100 select-none touch-none">
          <span className="text-blue-500 font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse">Pre-Warming Sync Engine</span>
          <span className="text-[150px] md:text-[250px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">{countdownValue}</span>
        </div>
      )}
      <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-50"><div id="yt-live-player-container"></div></div>
      {isYtBuffering && (
        <div className="fixed inset-0 z-[400000] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-100 select-none touch-none">
          <span className="text-red-500 font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse">Buffering Backing Track</span>
          <span className="text-[100px] md:text-[150px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">∞</span>
        </div>
      )}
    </div>
  );
}