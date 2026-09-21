"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { createClient } from "../../../utils/supabase/client";
import { useWebAudioEngine } from "../../setlists/[id]/live/hooks/useWebAudioEngine";

// ============================================================================
// AUDIO ASSETS & CONSTANTS
// ============================================================================
const MASTER_NORMAL_CUES = [
  { id: "Intro", label: "Intro", file: "Intro.wav", color: "text-emerald-400" },
  { id: "Verse 1", label: "Verse 1", file: "Verse 1.wav", color: "text-sky-400" },
  { id: "Verse 2", label: "Verse 2", file: "Verse 2.wav", color: "text-sky-400" },
  { id: "Verse 3", label: "Verse 3", file: "Verse 3.wav", color: "text-sky-400" },
  { id: "Verse 4", label: "Verse 4", file: "Verse 4.wav", color: "text-sky-400" },
  { id: "Pre Chorus", label: "Pre Chorus", file: "Pre Chorus.wav", color: "text-orange-400" },
  { id: "Chorus", label: "Chorus", file: "Chorus.wav", color: "text-orange-500" },
  { id: "Refrain", label: "Refrain", file: "Refrain.wav", color: "text-amber-400" },
  { id: "Bridge", label: "Bridge", file: "Bridge.wav", color: "text-primary" },
  { id: "Instrumental", label: "Instrumental", file: "Instrumental.wav", color: "text-emerald-500" },
  { id: "Interlude", label: "Interlude", file: "Interlude.wav", color: "text-teal-400" },
  { id: "Turnaround", label: "Turnaround", file: "Turnaround.wav", color: "text-lime-400" },
  { id: "Tag", label: "Tag", file: "tag.wav", color: "text-secondary" },
  { id: "Outro", label: "Outro", file: "Outro.wav", color: "text-purple-400" },
  { id: "Ending", label: "Ending", file: "Ending.wav", color: "text-rose-400" },
  { id: "Ad Lib", label: "Ad Lib", file: "Ad Lib.wav", color: "text-pink-400" },
  { id: "Vamp", label: "Vamp", file: "Vamp.wav", color: "text-indigo-400" },
  { id: "Breakdown", label: "Breakdown", file: "Breakdown.wav", color: "text-cyan-400" },
  { id: "Build", label: "Build", file: "Build.wav", color: "text-blue-400" },
  { id: "Solo", label: "Solo", file: "Solo.wav", color: "text-yellow-400" },
  { id: "Acapella", label: "Acapella", file: "Acapella.wav", color: "text-zinc-400" },
  { id: "Post Chorus", label: "Post Chorus", file: "Post Chorus.wav", color: "text-orange-300" },
];

const MASTER_DYNAMIC_CUES = [
  { id: "D_All In", label: "All In", file: "D_All In.wav", color: "text-red-500" },
  { id: "D_Bass", label: "Bass", file: "D_Bass.wav", color: "text-red-500" },
  { id: "D_Big Ending", label: "Big Ending", file: "D_Big Ending.wav", color: "text-red-500" },
  { id: "D_Break", label: "Break", file: "D_Break.wav", color: "text-red-500" },
  { id: "D_Build", label: "Build", file: "D_Build.wav", color: "text-red-500" },
  { id: "D_Drums In", label: "Drums In", file: "D_Drums In.wav", color: "text-red-500" },
  { id: "D_Drums", label: "Drums", file: "D_Drums.wav", color: "text-red-500" },
  { id: "D_Hits", label: "Hits", file: "D_Hits.wav", color: "text-red-500" },
  { id: "D_Hold", label: "Hold", file: "D_Hold.wav", color: "text-red-500" },
  { id: "D_Key Change Down", label: "Key Down", file: "D_Key Change Down.wav", color: "text-red-500" },
  { id: "D_Key Change Up", label: "Key Up", file: "D_Key Change Up.wav", color: "text-red-500" },
  { id: "D_Keys", label: "Keys", file: "D_Keys.wav", color: "text-red-500" },
  { id: "D_Last Time", label: "Last Time", file: "D_Last Time.wav", color: "text-red-500" },
  { id: "D_Slowly Build", label: "Slow Build", file: "D_Slowly Build.wav", color: "text-red-500" },
  { id: "D_Softly", label: "Softly", file: "D_Softly.wav", color: "text-red-500" },
  { id: "D_Swell", label: "Swell", file: "D_Swell.wav", color: "text-red-500" },
  { id: "D_Worship Freely", label: "Worship Free", file: "D_Worship Freely.wav", color: "text-red-500" },
];

const ALL_CUES = [...MASTER_NORMAL_CUES, ...MASTER_DYNAMIC_CUES];
const COUNT_CUES = ["count_1", "count_2", "count_3", "count_4"];

const DEFAULT_PAGE_1 = ["Intro", "Verse 1", "Verse 2", "Pre Chorus", "Chorus", "Bridge", "Instrumental", "Tag", "Outro"];
const DEFAULT_PAGE_2 = ["D_All In", "D_Bass", "D_Big Ending", "D_Break", "D_Build", "D_Drums In", "D_Drums", "D_Hits", "D_Hold"];

interface MDTrackSequenceItem {
  id: string;
  cueId: string;
  measures: number;
  beats: number;
  repeats: number;
  head_m: number;
  tail_m: number;
}

interface MDTrack {
  id: string;
  title: string;
  bpm: number;
  sequence: MDTrackSequenceItem[];
}

export default function MDLiveStudioPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.id as string;
  
  const supabase = createClient();
  const { initAudioContext, fetchAndDecodeAudio, playZeroLatencyAudio, getAudioContext } = useWebAudioEngine();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [projectTitle, setProjectTitle] = useState("Loading...");
  const [tracks, setTracks] = useState<MDTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Manual Pad Engine States
  const [activePadPage, setActivePadPage] = useState<1 | 2>(1);
  const [page1Pads, setPage1Pads] = useState<string[]>(DEFAULT_PAGE_1);
  const [page2Pads, setPage2Pads] = useState<string[]>(DEFAULT_PAGE_2);
  const [hotSwapTarget, setHotSwapTarget] = useState<{ id: string, page: 1 | 2 } | null>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [visualBeat, setVisualBeat] = useState(1);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [sectionBeats, setSectionBeats] = useState({ current: 0, total: 0 });
  
  // Mixer & Settings States
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [clickVolume, setClickVolume] = useState(1.0);
  const [guideVolume, setGuideVolume] = useState(1.0);
  const [clickSound, setClickSound] = useState<"blip" | "bell" | "block" | "glass">("blip");
  const [isHolding, setIsHolding] = useState(false);
  
  // Interaction States
  const [idleArmedGuideId, setIdleArmedGuideId] = useState<string | null>(null);
  const [queuedGuideId, setQueuedGuideId] = useState<string | null>(null);
  const [dynamicFlashId, setDynamicFlashId] = useState<string | null>(null);

  // Physics-Based Drag Engine States (Mouse + Touch)
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [swipeTransition, setSwipeTransition] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isSwipingRef = useRef(false);

  const getClientPos = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
  };

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    const { x, y } = getClientPos(e);
    dragStartX.current = x; dragStartY.current = y;
    isDraggingRef.current = true; isSwipingRef.current = false;
    setSwipeTransition(false);
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDraggingRef.current || dragStartX.current === null || dragStartY.current === null) return;
    const { x, y } = getClientPos(e);
    const deltaX = x - dragStartX.current; const deltaY = y - dragStartY.current;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) cancelLongPress();

    if (!isSwipingRef.current && Math.abs(deltaX) > 15 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwipingRef.current = true;
    }

    if (isSwipingRef.current) {
      let resistanceDelta = deltaX;
      if ((activePadPage === 1 && deltaX > 0) || (activePadPage === 2 && deltaX < 0)) resistanceDelta = deltaX * 0.25;
      setSwipeOffsetX(resistanceDelta);
    }
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false; setSwipeTransition(true);

    if (isSwipingRef.current) {
      if (swipeOffsetX > 50 && activePadPage === 2) setActivePadPage(1);
      else if (swipeOffsetX < -50 && activePadPage === 1) setActivePadPage(2);
      setSwipeOffsetX(0); 
    }
    isSwipingRef.current = false; dragStartX.current = null; dragStartY.current = null;
  };

  // Sequence Tracker States
  const [activeSequenceIndex, setActiveSequenceIndex] = useState(0);
  const [queuedSequenceIndex, setQueuedSequenceIndex] = useState<number | null>(null);
  const [idleArmedSequenceIndex, setIdleArmedSequenceIndex] = useState<number | null>(null);

  // Smart Long-Press Engine
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasJustLongPressedRef = useRef(false);

  const startLongPress = (cueId: string, page: 1 | 2) => {
    hasJustLongPressedRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      hasJustLongPressedRef.current = true;
      setHotSwapTarget({ id: cueId, page });
      if (typeof window !== "undefined" && window.navigator && typeof window.navigator.vibrate === "function") window.navigator.vibrate(50);
    }, 400);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  };

  // Engine Refs
  const isPlayingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentBeatInSequenceRef = useRef(0); 
  const schedulerTimerRef = useRef<number | null>(null);
  const activeGuideForCountInRef = useRef<string | null>(null);
  const queuedGuideIdRef = useRef<string | null>(null);
  const shortCountInActiveRef = useRef(false);
  
  const clickVolumeRef = useRef(1.0);
  const guideVolumeRef = useRef(1.0);
  const clickSoundRef = useRef<"blip" | "bell" | "block" | "glass">("blip");
  const isHoldingRef = useRef(false);

  // Sequence Engine Refs
  const targetStartBeatRef = useRef(1);
  const isCountingInRef = useRef(false);
  const activeSequenceIndexRef = useRef(0);
  const queuedSequenceIndexRef = useRef<number | null>(null);
  const sequenceTriggersRef = useRef<Record<number, {cueId: string, seqIdx: number}>>({});
  const sequenceBoundsRef = useRef<{startIndex: number, endIndex: number, seqIdx: number, cueId: string}[]>([]);

  const activeTrack = tracks.find(t => t.id === activeTrackId) || tracks[0];

  // Track Wizard States
  const [trackWizardStep, setTrackWizardStep] = useState<"none" | "choice" | "custom" | "database" | "import_prompt">("none");
  const [customTrackTitle, setCustomTrackTitle] = useState("");
  const [customTrackBpm, setCustomTrackBpm] = useState("120");
  const [pendingDbSong, setPendingDbSong] = useState<any>(null);
  
  // Database Search States
  const [dbSearchQuery, setDbSearchQuery] = useState("");
  const [dbSearchResults, setDbSearchResults] = useState<any[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  // Tap Tempo States
  const [isTapBpmModalOpen, setIsTapBpmModalOpen] = useState(false);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  // ============================================================================
  // DATABASE SYNC ENGINE (Fetch & Auto-Save)
  // ============================================================================
  useEffect(() => {
    if (!projectId) return;
    const fetchProject = async () => {
      const { data, error } = await supabase.from('md_live_projects').select('*').eq('id', projectId).single();
      if (!error && data) {
        setProjectTitle(data.title);
        
        // Accept the empty array without creating a fallback track
        setTracks(data.tracks_data || []);
        if (data.tracks_data && data.tracks_data.length > 0) {
          setActiveTrackId(data.tracks_data[0].id);
        } else {
          setActiveTrackId("");
        }

        // ✅ SURGICAL FIX: Hydrate the drum pads with the saved database layout
        if (data.pad_layout_1 && data.pad_layout_1.length > 0) setPage1Pads(data.pad_layout_1);
        if (data.pad_layout_2 && data.pad_layout_2.length > 0) setPage2Pads(data.pad_layout_2);
      }
    };
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    // ✅ SURGICAL FIX: Removed tracks.length === 0 check so you can save pad changes on empty projects
    if (!mounted || !projectId) return; 
    
    setIsSaving(true);
    const saveTimer = setTimeout(async () => {
      await supabase.from('md_live_projects').update({ 
        tracks_data: tracks, 
        title: projectTitle,
        pad_layout_1: page1Pads,  // ✅ Push Page 1 pads
        pad_layout_2: page2Pads   // ✅ Push Page 2 pads
      }).eq('id', projectId);
      setIsSaving(false);
    }, 1500);
    
    // ✅ Watch for pad layout changes alongside tracks and title
    return () => clearTimeout(saveTimer);
  }, [tracks, projectTitle, page1Pads, page2Pads, projectId, mounted]);

  const handleUpdateProjectTitle = (newTitle: string) => {
    setProjectTitle(newTitle);
  };

  // ============================================================================
  // AUDIO PRELOADING & SYNCS
  // ============================================================================
  useEffect(() => { clickVolumeRef.current = clickVolume; }, [clickVolume]);
  useEffect(() => { guideVolumeRef.current = guideVolume; }, [guideVolume]);
  useEffect(() => { clickSoundRef.current = clickSound; }, [clickSound]);
  useEffect(() => { isHoldingRef.current = isHolding; }, [isHolding]);
  useEffect(() => { queuedGuideIdRef.current = queuedGuideId; }, [queuedGuideId]);
  useEffect(() => { queuedSequenceIndexRef.current = queuedSequenceIndex; }, [queuedSequenceIndex]);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    if (typeof window !== "undefined") {
      MASTER_NORMAL_CUES.forEach(cue => fetchAndDecodeAudio(`/sound_files/${cue.file}`, cue.id));
      MASTER_DYNAMIC_CUES.forEach(cue => fetchAndDecodeAudio(`/sound_files/${cue.file}`, cue.id));
      COUNT_CUES.forEach(count => fetchAndDecodeAudio(`/sound_files/${count}.wav`, count));
      ["blip", "bell", "block", "glass"].forEach(sound => {
        fetchAndDecodeAudio(`/sound_files/metronome_${sound}_1.wav`, `metronome_${sound}_1`);
        fetchAndDecodeAudio(`/sound_files/metronome_${sound}_2.wav`, `metronome_${sound}_2`);
      });
    }

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: isPlaying }));
    return () => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: false })); };
  }, [isPlaying]);

  // ✅ SURGICAL FIX: Stop engine and suspend audio when leaving the page
  useEffect(() => {
    return () => {
      if (schedulerTimerRef.current !== null) {
        clearTimeout(schedulerTimerRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.suspend();
      }
    };
  }, []);

  // Recalculate Automated Sequence Timeline
  useEffect(() => {
    if (!activeTrack) return;
    const triggers: Record<number, {cueId: string, seqIdx: number}> = {};
    const bounds: {startIndex: number, endIndex: number, seqIdx: number, cueId: string}[] = [];
    let currentAbsoluteBeat = 1; 

    activeTrack.sequence.forEach((seq, idx) => {
       const m = Number(seq.measures) || 0;
       const b = Number(seq.beats) || 0;
       const r = Number(seq.repeats) || 0;
       const h = Number(seq.head_m) || 0;
       const t = Number(seq.tail_m) || 0;

       if (idx > 0) {
           const triggerBeat = currentAbsoluteBeat - 4; 
           if (triggerBeat > 0) triggers[triggerBeat] = { cueId: seq.cueId, seqIdx: idx };
       }
       
       const itemLengthBeats = ((m * 4) + b) * (r + 1) + (h * 4) + (t * 4);
       bounds.push({ startIndex: currentAbsoluteBeat, endIndex: currentAbsoluteBeat + itemLengthBeats - 1, seqIdx: idx, cueId: seq.cueId });
       currentAbsoluteBeat += itemLengthBeats;
    });
    
    sequenceTriggersRef.current = triggers;
    sequenceBoundsRef.current = bounds;
  }, [activeTrack]);

  useEffect(() => {
    if (tapTimestamps.length > 0) {
      const idleTimer = setTimeout(() => setTapTimestamps([]), 3000);
      return () => clearTimeout(idleTimer);
    }
  }, [tapTimestamps]);

  useEffect(() => {
    if (!dbSearchQuery.trim()) { setDbSearchResults([]); return; }
    const fetchResults = async () => {
      setIsSearchingDb(true);
      try {
        const { data, error } = await supabase.from('songs')
          .select('*, song_sections(section_name)')
          .ilike('title', `%${dbSearchQuery}%`)
          .limit(15);
        if (!error && data) setDbSearchResults(data);
      } catch(err) { console.error(err); }
      setIsSearchingDb(false);
    };
    const debounceTimer = setTimeout(fetchResults, 300);
    return () => clearTimeout(debounceTimer);
  }, [dbSearchQuery]);

  // ============================================================================
  // AUDIO SCHEDULING ENGINE
  // ============================================================================
  const scheduleNote = (beatNumber: number, time: number) => {
    let effectiveBeat = beatNumber;
    let relativeBeat = ((effectiveBeat - 1) % 4 + 4) % 4 + 1; 
    
    if (activeTrack?.sequence.length > 0) {
        const bound = sequenceBoundsRef.current.find(b => effectiveBeat >= b.startIndex && effectiveBeat <= b.endIndex);
        if (bound) {
            relativeBeat = ((effectiveBeat - bound.startIndex) % 4) + 1;
        }
    }
    
    const isDownbeat = relativeBeat === 1;

    setTimeout(() => {
      if (isPlayingRef.current) {
        setVisualBeat(relativeBeat);
        if (activeTrack?.sequence.length > 0) {
          const bound = sequenceBoundsRef.current.find(b => effectiveBeat >= b.startIndex && effectiveBeat <= b.endIndex);
          if (bound) {
            setSectionBeats({ current: effectiveBeat - bound.startIndex + 1, total: bound.endIndex - bound.startIndex + 1 });
          }
        }
      }
    }, Math.max(0, (time - (audioContextRef.current?.currentTime || 0)) * 1000));

    // 1. SEQUENCE JUMP QUEUE
    if (effectiveBeat > 0 && isDownbeat && queuedSequenceIndexRef.current !== null) {
        const newStartBeat = sequenceBoundsRef.current[queuedSequenceIndexRef.current]?.startIndex;
        const newCueId = sequenceBoundsRef.current[queuedSequenceIndexRef.current]?.cueId;
        if (newStartBeat) {
            effectiveBeat = newStartBeat;
            currentBeatInSequenceRef.current = newStartBeat; 
            if (newCueId) {
                playZeroLatencyAudio(newCueId, guideVolumeRef.current, time);
                setTimeout(() => { setDynamicFlashId(newCueId); setTimeout(() => setDynamicFlashId(null), 150); }, Math.max(0, (time - (audioContextRef.current?.currentTime || 0)) * 1000));
                shortCountInActiveRef.current = true;
            }
        }
        queuedSequenceIndexRef.current = null;
        setTimeout(() => setQueuedSequenceIndex(null), 0);
    }

    // 2. MANUAL JUMP QUEUE
    if (effectiveBeat > 0 && isDownbeat && queuedGuideIdRef.current) {
      playZeroLatencyAudio(queuedGuideIdRef.current, guideVolumeRef.current, time); 
      shortCountInActiveRef.current = true;
      queuedGuideIdRef.current = null;
      setTimeout(() => setQueuedGuideId(null), 0);
    } 

    // 3. TRACK ACTIVE SEQUENCE BLOCK
    if (effectiveBeat > 0 && isDownbeat && activeTrack?.sequence.length > 0) {
        const matchingBound = sequenceBoundsRef.current.find(b => effectiveBeat >= b.startIndex && effectiveBeat <= b.endIndex);
        if (matchingBound && matchingBound.seqIdx !== activeSequenceIndexRef.current) {
            activeSequenceIndexRef.current = matchingBound.seqIdx;
            setTimeout(() => setActiveSequenceIndex(matchingBound.seqIdx), 0);
        }
    }

    // 4. AUTO SEQUENCE TRIGGER (With Hold/Count-in suppression)
    if (effectiveBeat > 0 && sequenceTriggersRef.current[effectiveBeat]) {
      const isBeforeTargetDuringCountIn = isCountingInRef.current && effectiveBeat < targetStartBeatRef.current;
      if (!isBeforeTargetDuringCountIn && !isHoldingRef.current) {
        const t = sequenceTriggersRef.current[effectiveBeat];
        playZeroLatencyAudio(t.cueId, guideVolumeRef.current, time); 
        setTimeout(() => { setDynamicFlashId(t.cueId); setTimeout(() => setDynamicFlashId(null), 150); }, Math.max(0, (time - (audioContextRef.current?.currentTime || 0)) * 1000));
      }
    }

    // 5. CLICK
    const currentClick = clickSoundRef.current;
    playZeroLatencyAudio(isDownbeat ? `metronome_${currentClick}_1` : `metronome_${currentClick}_2`, clickVolumeRef.current, time);

    // 6. TARGETED COUNT-IN SEQUENCE
    if (isCountingInRef.current && effectiveBeat < targetStartBeatRef.current) {
      const countInOffset = effectiveBeat - targetStartBeatRef.current + 1; 
      if (countInOffset === -7 && activeGuideForCountInRef.current) playZeroLatencyAudio(activeGuideForCountInRef.current, guideVolumeRef.current, time);
      else if (countInOffset === -5) playZeroLatencyAudio("count_2", guideVolumeRef.current, time);
      else if (countInOffset === -3) playZeroLatencyAudio("count_1", guideVolumeRef.current, time);
      else if (countInOffset === -2) playZeroLatencyAudio("count_2", guideVolumeRef.current, time);
      else if (countInOffset === -1) playZeroLatencyAudio("count_3", guideVolumeRef.current, time);
      else if (countInOffset === 0) playZeroLatencyAudio("count_4", guideVolumeRef.current, time);
    }

    // 7. IN-PLAY SHORT COUNT-IN
    if (shortCountInActiveRef.current) {
      if (relativeBeat === 2) playZeroLatencyAudio("count_2", guideVolumeRef.current, time);
      else if (relativeBeat === 3) playZeroLatencyAudio("count_3", guideVolumeRef.current, time);
      else if (relativeBeat === 4) {
        playZeroLatencyAudio("count_4", guideVolumeRef.current, time);
        shortCountInActiveRef.current = false;
      }
    }
  };

  const scheduler = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !activeTrack) return;

    const scheduleAheadTime = 0.1; 
    const secondsPerBeat = 60.0 / activeTrack.bpm;

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      if (activeTrack.sequence.length > 0 && isHoldingRef.current) {
          const currentBound = sequenceBoundsRef.current[activeSequenceIndexRef.current];
          if (currentBound && currentBeatInSequenceRef.current > currentBound.endIndex) {
              currentBeatInSequenceRef.current = currentBound.startIndex; 
          }
      }
      scheduleNote(currentBeatInSequenceRef.current, nextNoteTimeRef.current);
      nextNoteTimeRef.current += secondsPerBeat;
      currentBeatInSequenceRef.current++;

      if (isCountingInRef.current && currentBeatInSequenceRef.current === targetStartBeatRef.current) {
        isCountingInRef.current = false;
        setTimeout(() => setIsCountingIn(false), Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000));
      }
    }
    schedulerTimerRef.current = window.setTimeout(scheduler, 25.0);
  }, [activeTrack?.bpm]);

  // ============================================================================
  // PLAYBACK & INTERACTION CONTROLS
  // ============================================================================
  const stopEngine = () => {
    isPlayingRef.current = false; setIsPlaying(false); setIsCountingIn(false); isCountingInRef.current = false;
    shortCountInActiveRef.current = false; setIsHolding(false); isHoldingRef.current = false;
    setQueuedGuideId(null); queuedGuideIdRef.current = null; setQueuedSequenceIndex(null); queuedSequenceIndexRef.current = null;
    setSectionBeats({ current: 0, total: 0 });
    if (schedulerTimerRef.current !== null) { clearTimeout(schedulerTimerRef.current); schedulerTimerRef.current = null; }
    setVisualBeat(1);
  };

  const startEngine = (withCountIn: boolean = false, overrideGuideId: string | null = null, overrideStartSeqIdx: number = 0) => {
    if (!activeTrack) return;
    initAudioContext();
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    audioContextRef.current = ctx;
    if (isPlayingRef.current) stopEngine();
    
    isPlayingRef.current = true; setIsPlaying(true);
    nextNoteTimeRef.current = ctx.currentTime + 0.05; 
    let startBeat = 1; let countInGuide = overrideGuideId;

    if (activeTrack.sequence.length > 0) {
        startBeat = sequenceBoundsRef.current[overrideStartSeqIdx]?.startIndex || 1;
        if (!overrideGuideId) countInGuide = activeTrack.sequence[overrideStartSeqIdx]?.cueId || "Intro";
        setActiveSequenceIndex(overrideStartSeqIdx); activeSequenceIndexRef.current = overrideStartSeqIdx;
    }

    targetStartBeatRef.current = startBeat;

    if (withCountIn) {
      setIsCountingIn(true); isCountingInRef.current = true;
      currentBeatInSequenceRef.current = startBeat - 8; activeGuideForCountInRef.current = countInGuide;
    } else {
      setIsCountingIn(false); isCountingInRef.current = false; currentBeatInSequenceRef.current = startBeat; 
      if (countInGuide) {
          playZeroLatencyAudio(countInGuide, guideVolumeRef.current);
          setTimeout(() => { setDynamicFlashId(countInGuide); setTimeout(() => setDynamicFlashId(null), 150); }, 0);
      }
    }
    scheduler();
  };

  const handleManualPadClick = (guideId: string, page: 1 | 2) => {
    initAudioContext();
    if (!isPlaying) { setIdleArmedGuideId(guideId); } 
    else {
      if (page === 2) {
        playZeroLatencyAudio(guideId, guideVolumeRef.current);
        setDynamicFlashId(guideId); setTimeout(() => setDynamicFlashId(null), 150);
      } else {
        playZeroLatencyAudio(guideId, guideVolumeRef.current);
        setQueuedGuideId(guideId); setIsHolding(false); 
      }
    }
  };

  const handleSequencePadClick = (seqIdx: number) => {
    initAudioContext();
    if (!isPlaying) { setIdleArmedSequenceIndex(seqIdx); } 
    else { setQueuedSequenceIndex(seqIdx); setIsHolding(false); }
  };

  const togglePlayback = () => {
    if (isPlaying) stopEngine();
    else if (idleArmedSequenceIndex !== null) { startEngine(true, null, idleArmedSequenceIndex); setIdleArmedSequenceIndex(null); }
    else if (idleArmedGuideId) { startEngine(true, idleArmedGuideId); setIdleArmedGuideId(null); } 
    else startEngine(true); 
  };

  const executeHotSwap = (newCueId: string) => {
    if (!hotSwapTarget) return;
    const { id: oldId, page } = hotSwapTarget;
    const isPage1 = page === 1;
    const currentPads = isPage1 ? [...page1Pads] : [...page2Pads];
    const existingIndex = currentPads.indexOf(newCueId);
    const targetIndex = currentPads.indexOf(oldId);
    if (existingIndex !== -1) { currentPads[existingIndex] = oldId; currentPads[targetIndex] = newCueId; } else { currentPads[targetIndex] = newCueId; }
    if (isPage1) setPage1Pads(currentPads); else setPage2Pads(currentPads);
    setHotSwapTarget(null);
  };

  // ============================================================================
  // TRACK WIZARD & MANAGER
  // ============================================================================
  const handleConfirmImport = (useTimings: boolean) => {
    const newId = `trk-${Date.now()}`;
    let newSeq: MDTrackSequenceItem[] = [];

    if (useTimings) {
      try {
        let structureArray: any[] = [];
        if (pendingDbSong.default_structure) {
          const rawStructure = typeof pendingDbSong.default_structure === 'string' ? JSON.parse(pendingDbSong.default_structure) : pendingDbSong.default_structure;
          structureArray = Array.isArray(rawStructure) ? rawStructure : [];
        } else if (pendingDbSong.song_sections && Array.isArray(pendingDbSong.song_sections)) {
          structureArray = pendingDbSong.song_sections;
        }

        if (structureArray.length > 0) {
          const rawTimings = typeof pendingDbSong.section_timings === 'string' ? JSON.parse(pendingDbSong.section_timings) : (pendingDbSong.section_timings || {});

          newSeq = structureArray.map((ds: any, i: number) => {
            const secName = typeof ds === 'string' ? ds : (ds.section_name || "Intro");
            const timings = rawTimings[secName] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
            const matchedCue = ALL_CUES.find(c => c.label.toLowerCase() === secName.toLowerCase() || c.id.toLowerCase() === secName.toLowerCase());
            let cueId = "Intro";
            if (matchedCue) cueId = matchedCue.id;
            else if (secName.toLowerCase().includes("verse")) cueId = "Verse 1";
            else if (secName.toLowerCase().includes("chorus")) cueId = "Chorus";
            else if (secName.toLowerCase().includes("inst")) cueId = "Instrumental";
            else if (secName.toLowerCase().includes("bridge")) cueId = "Bridge";

            const m = timings.measures !== undefined ? Number(timings.measures) : 4;
            const b = timings.beats !== undefined ? Number(timings.beats) : 0;
            const r = timings.repeats !== undefined ? Number(timings.repeats) : 0;
            const hm = timings.head_m !== undefined ? Number(timings.head_m) : 0;
            const tm = timings.tail_m !== undefined ? Number(timings.tail_m) : 0;

            return { id: `seq-${Date.now()}-${i}`, cueId: cueId, measures: isNaN(m) ? 4 : m, beats: isNaN(b) ? 0 : b, repeats: isNaN(r) ? 0 : r, head_m: isNaN(hm) ? 0 : hm, tail_m: isNaN(tm) ? 0 : tm };
          });
        }
      } catch (err) {}
    }

    setTracks([...tracks, { id: newId, title: pendingDbSong.title, bpm: pendingDbSong.tempo || 120, sequence: newSeq }]);
    setActiveTrackId(newId); setTrackWizardStep("none"); setPendingDbSong(null);
  };

  const confirmAddCustomTrack = () => {
    const newId = `trk-${Date.now()}`;
    setTracks([...tracks, { id: newId, title: customTrackTitle || "Untitled Track", bpm: parseInt(customTrackBpm) || 120, sequence: [] }]);
    setActiveTrackId(newId); setTrackWizardStep("none"); setCustomTrackTitle(""); setCustomTrackBpm("120");
  };

  const updateActiveTrack = (field: keyof MDTrack, value: any) => {
    setTracks(tracks.map(t => t.id === activeTrackId ? { ...t, [field]: value } : t));
    if (field === 'bpm' && isPlaying && audioContextRef.current && activeTrack) {
      const oldSecs = 60.0 / activeTrack.bpm;
      const newSecs = 60.0 / value;
      const timeSinceLast = audioContextRef.current.currentTime - (nextNoteTimeRef.current - oldSecs);
      nextNoteTimeRef.current = audioContextRef.current.currentTime + (newSecs * (1 - (timeSinceLast / oldSecs)));
    }
  };

  const deleteTrack = (id: string) => {
    if (tracks.length <= 1) return;
    const newTracks = tracks.filter(t => t.id !== id);
    setTracks(newTracks);
    if (activeTrackId === id) setActiveTrackId(newTracks[0].id);
  };

  const addSequenceItem = (trackId: string) => {
    setTracks(tracks.map(t => t.id === trackId ? { ...t, sequence: [...t.sequence, { id: `seq-${Date.now()}`, cueId: "Intro", measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 }] } : t));
  };

  const updateSequenceItem = (trackId: string, seqIdx: number, field: string, value: any) => {
    setTracks(tracks.map(t => {
      if (t.id !== trackId) return t;
      const newSeq = [...t.sequence];
      newSeq[seqIdx] = { ...newSeq[seqIdx], [field]: value };
      return { ...t, sequence: newSeq };
    }));
  };

  const removeSequenceItem = (trackId: string, seqIdx: number) => {
    setTracks(tracks.map(t => {
      if (t.id !== trackId) return t;
      const newSeq = [...t.sequence];
      newSeq.splice(seqIdx, 1);
      return { ...t, sequence: newSeq };
    }));
  };

  const moveSequenceItem = (trackId: string, seqIdx: number, dir: -1 | 1) => {
    setTracks(tracks.map(t => {
      if (t.id !== trackId) return t;
      const s = [...t.sequence];
      if (dir === -1 && seqIdx > 0) [s[seqIdx-1], s[seqIdx]] = [s[seqIdx], s[seqIdx-1]];
      if (dir === 1 && seqIdx < s.length - 1) [s[seqIdx+1], s[seqIdx]] = [s[seqIdx], s[seqIdx+1]];
      return { ...t, sequence: s };
    }));
  };

  const duplicateSequenceItem = (trackId: string, seqIdx: number, dir: -1 | 1) => {
    setTracks(tracks.map(t => {
      if (t.id !== trackId) return t;
      const s = [...t.sequence];
      const copy = { ...s[seqIdx], id: `seq-${Date.now()}-${Math.random()}` };
      s.splice(dir === -1 ? seqIdx : seqIdx + 1, 0, copy);
      return { ...t, sequence: s };
    }));
  };

  const getSequencePadLabels = (sequence: MDTrackSequenceItem[]) => {
    const counts: Record<string, number> = {};
    const seen: Record<string, number> = {};
    sequence.forEach(s => { counts[s.cueId] = (counts[s.cueId] || 0) + 1; });
    return sequence.map((s) => {
       if (counts[s.cueId] > 1) {
          seen[s.cueId] = (seen[s.cueId] || 0) + 1;
          return { ...s, displayLabel: `[${seen[s.cueId]}]\n${ALL_CUES.find(c=>c.id===s.cueId)?.label || s.cueId}` };
       }
       return { ...s, displayLabel: ALL_CUES.find(c=>c.id===s.cueId)?.label || s.cueId };
    });
  };

  const currentCuesList = activePadPage === 1 ? page1Pads : page2Pads;
  const currentMasterDictionary = activePadPage === 1 ? MASTER_NORMAL_CUES : MASTER_DYNAMIC_CUES;
  const sequencedPads = useMemo(() => activeTrack ? getSequencePadLabels(activeTrack.sequence) : [], [activeTrack]);

  // ============================================================================
  // EXPANDED TRACK MANAGER PORTAL & LIVE HEADER
  // ============================================================================
  const PlayIcon = () => <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current ml-1"><path d="M8 5v14l11-7z" /></svg>;
  const PauseIcon = () => <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;

  const renderCollapsedPlayer = () => (
    <div 
      onClick={() => setIsExpanded(true)}
      className="w-full h-[68px] bg-[#16161a] rounded-t-2xl shadow-[0_-4px_25px_rgba(0,0,0,0.6)] flex items-center justify-between px-4 cursor-pointer relative overflow-hidden transition-transform active:scale-[0.99]"
    >
      <div className="absolute top-0 left-0 w-full h-[2px] bg-white/5">
        <div className="h-full bg-blue-500 transition-all duration-100 ease-linear" style={{ width: `${(visualBeat / 4) * 100}%` }} />
      </div>

      <div className="flex items-center gap-3 min-w-0 flex-1 mt-0.5">
        <div className="w-11 h-11 rounded-lg bg-[#24242c] flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
          <span className="material-symbols-outlined text-zinc-400 text-[24px]">graphic_eq</span>
        </div>
        <div className="flex flex-col min-w-0 pr-2 pb-0.5">
          <h2 className="font-extrabold text-[15px] text-white truncate tracking-tight leading-tight">{activeTrack?.title || "Loading..."}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] font-semibold text-zinc-400 truncate tnum">{activeTrack?.bpm || "--"} BPM</span>
            {isCountingIn && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse ml-1"></span>}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-1 shrink-0 z-10">
        {isPlaying && activeTrack?.sequence.length > 0 && (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsHolding(!isHolding); }}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer ${isHolding ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-400 hover:text-white'}`}
            title="Hold Section"
          >
            <span className="material-symbols-outlined text-[20px]">{isHolding ? 'lock' : 'lock_open'}</span>
          </button>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsMixerOpen(true); }}
          className="w-10 h-10 flex items-center justify-center rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">tune</span>
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); togglePlayback(); }}
          className="w-12 h-12 flex items-center justify-center rounded-full shrink-0 transition-all active:scale-90 text-white cursor-pointer"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </div>
  );

  const renderExpandedPlayer = () => (
    <div className="fixed inset-0 z-[200000] bg-[#08080a] text-zinc-100 flex flex-col items-center pt-3 pb-8 px-4 font-sans animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
      <header className="relative flex items-center justify-between h-14 w-full max-w-md px-1 mb-2 shrink-0">
        <button onClick={() => setIsExpanded(false)} className="w-10 h-10 rounded-full bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition active:scale-95 cursor-pointer">
          <svg className="w-5 h-5 stroke-current" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-xs font-bold tracking-widest text-zinc-300 uppercase">Track Manager</h1>
          {isSaving && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex flex-col gap-4 w-full max-w-md flex-1 overflow-y-auto custom-scrollbar pb-24">
        {tracks.map((track, idx) => {
          const isSelected = activeTrackId === track.id;
          
          if (!isSelected) {
             return (
               <section key={track.id} onClick={() => { if (!isPlaying) setActiveTrackId(track.id); }} className="w-full rounded-2xl bg-[#16161a] border border-white/5 px-5 py-4 flex flex-col gap-1.5 transition active:opacity-90 cursor-pointer shadow-lg shadow-black/40">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-zinc-800/90 text-zinc-400 border border-white/5">Track {String(idx + 1).padStart(2, '0')}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-zinc-800/80 text-zinc-400 border border-white/5 font-mono">{track.bpm} BPM</span>
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">{track.title}</h2>
               </section>
             );
          }

          return (
            <section key={track.id} className="w-full rounded-2xl bg-[#16161a] border-2 border-[rgba(37,99,235,0.35)] p-4 sm:p-5 flex flex-col gap-5 shadow-2xl shadow-blue-950/20 relative">
              <div className="flex items-start justify-between w-full">
                <div className="flex flex-col gap-1">
                  <span className="inline-flex self-start items-center px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-[#1c1c22] text-blue-400 border border-blue-500/30">Track {String(idx + 1).padStart(2, '0')}</span>
                  <input 
                    type="text" 
                    value={track.title}
                    onChange={(e) => updateActiveTrack('title', e.target.value)}
                    className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none mt-1 bg-transparent border-b border-dashed border-white/20 focus:border-blue-500 outline-none w-full"
                  />
                </div>

                <div className="bg-[#0d0d10] rounded-xl border border-white/10 p-1 flex items-center justify-between shadow-inner h-12 w-32 shrink-0">
                  <button onClick={() => updateActiveTrack('bpm', Math.max(40, track.bpm - 1))} className="w-8 h-full rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" x2="19" y1="12" y2="12"></line></svg>
                  </button>
                  <div className="flex flex-col items-center justify-center w-10">
                    <span className="text-lg font-black tracking-tight text-white font-mono leading-none">{track.bpm}</span>
                    <span className="text-[8px] font-bold tracking-widest text-zinc-400 uppercase mt-0.5">BPM</span>
                  </div>
                  <button onClick={() => updateActiveTrack('bpm', Math.min(300, track.bpm + 1))} className="w-8 h-full rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"></line><line x1="5" x2="19" y1="12" y2="12"></line></svg>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-zinc-400 stroke-current" fill="none" strokeWidth="2" viewBox="0 0 24 24"><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="12" r="3"></circle><line x1="9" x2="15" y1="12" y2="12"></line></svg>
                    <span className="text-xs font-bold tracking-wider text-zinc-300 uppercase">Automated Sequence</span>
                  </div>
                  <button onClick={() => addSequenceItem(track.id)} className="px-3 py-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[11px] font-bold uppercase tracking-wider transition active:scale-95 cursor-pointer">
                    + Add Cue
                  </button>
                </div>
                
                <div className="flex flex-col gap-2.5 mt-1">
                  {track.sequence.map((seq, sIdx) => {
                    const isCurrentlyPlaying = isPlaying && activeSequenceIndex === sIdx;
                    return (
                      <div key={seq.id} className={`group relative flex items-center bg-[#0d0d10]/90 rounded-xl border ${isCurrentlyPlaying ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-white/5 hover:border-white/10'} transition overflow-hidden p-1.5`}>
                        {isCurrentlyPlaying && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 z-10"></div>}
                        <div className={`flex items-center gap-2 w-full overflow-x-auto custom-scrollbar pb-1 ${isCurrentlyPlaying ? 'pl-2' : ''}`}>
                          <select value={seq.cueId} onChange={(e) => updateSequenceItem(track.id, sIdx, 'cueId', e.target.value)} className="px-2 py-1.5 rounded-lg bg-zinc-800/80 border border-white/5 text-[11px] font-semibold text-zinc-200 outline-none appearance-none min-w-[85px] cursor-pointer shrink-0">
                            {ALL_CUES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1.5 font-mono text-xs shrink-0 px-1">
                            <span className="text-[10px] font-bold text-zinc-400">M</span><input type="number" value={seq.measures} onChange={e=>updateSequenceItem(track.id, sIdx, 'measures', +e.target.value)} className="w-7 py-1 bg-black/60 rounded border border-white/5 text-white font-bold text-center outline-none"/>
                            <span className="text-[10px] font-bold text-zinc-400">B</span><input type="number" value={seq.beats} onChange={e=>updateSequenceItem(track.id, sIdx, 'beats', +e.target.value)} className="w-7 py-1 bg-black/60 rounded border border-white/5 text-white font-bold text-center outline-none"/>
                            <span className="text-[10px] font-bold text-zinc-400">R</span><input type="number" value={seq.repeats} onChange={e=>updateSequenceItem(track.id, sIdx, 'repeats', +e.target.value)} className="w-7 py-1 bg-black/60 rounded border border-white/5 text-white font-bold text-center outline-none"/>
                            <span className="text-[10px] font-bold text-zinc-400">H</span><input type="number" value={seq.head_m} onChange={e=>updateSequenceItem(track.id, sIdx, 'head_m', +e.target.value)} className="w-7 py-1 bg-black/60 rounded border border-white/5 text-white font-bold text-center outline-none"/>
                            <span className="text-[10px] font-bold text-zinc-400">T</span><input type="number" value={seq.tail_m} onChange={e=>updateSequenceItem(track.id, sIdx, 'tail_m', +e.target.value)} className="w-7 py-1 bg-black/60 rounded border border-white/5 text-white font-bold text-center outline-none"/>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 border-l border-white/10 pl-2 ml-1">
                            <button onClick={() => moveSequenceItem(track.id, sIdx, -1)} disabled={sIdx === 0} className="w-7 h-7 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30 flex items-center justify-center cursor-pointer"><span className="material-symbols-outlined text-[16px]">arrow_upward</span></button>
                            <button onClick={() => moveSequenceItem(track.id, sIdx, 1)} disabled={sIdx === track.sequence.length - 1} className="w-7 h-7 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 disabled:opacity-30 flex items-center justify-center cursor-pointer"><span className="material-symbols-outlined text-[16px]">arrow_downward</span></button>
                            <div className="w-px h-4 bg-white/10 mx-0.5"></div>
                            <button onClick={() => duplicateSequenceItem(track.id, sIdx, -1)} className="w-7 h-7 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center cursor-pointer"><span className="material-symbols-outlined text-[16px]">library_add_check</span></button>
                            <button onClick={() => duplicateSequenceItem(track.id, sIdx, 1)} className="w-7 h-7 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center cursor-pointer"><span className="material-symbols-outlined text-[16px]">content_copy</span></button>
                            <div className="w-px h-4 bg-white/10 mx-0.5"></div>
                            <button onClick={() => removeSequenceItem(track.id, sIdx)} className="w-7 h-7 rounded bg-red-500/10 text-red-400 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-colors">
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {track.sequence.length === 0 && <span className="text-[11px] text-zinc-500 font-semibold italic bg-[#0d0d10] p-3 rounded-xl border border-dashed border-white/10 text-center">No automated cues. Play manually via drum pads.</span>}
                </div>
              </div>

              <div className="w-full pt-3 pb-1 flex justify-center">
                <button onClick={() => deleteTrack(track.id)} disabled={tracks.length === 1} className="flex items-center gap-2 text-[#ef4444] hover:text-red-400 active:scale-95 transition font-bold text-xs tracking-wider uppercase py-2 px-4 rounded-lg hover:bg-red-500/10 disabled:opacity-30 cursor-pointer">
                  <svg className="w-4 h-4 stroke-current" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
                  <span>Delete Track</span>
                </button>
              </div>
            </section>
          );
        })}
      </main>

      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md h-16 bg-[#16161a]/95 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center px-3.5 shadow-2xl z-50">
        <button onClick={() => setTrackWizardStep("choice")} disabled={isPlaying} className="flex items-center gap-2 text-zinc-200 hover:text-white font-semibold text-sm px-4 py-2 rounded-full hover:bg-white/5 active:scale-95 transition cursor-pointer disabled:opacity-50">
          <svg className="w-4 h-4 stroke-current" fill="none" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"></line><line x1="5" x2="19" y1="12" y2="12"></line></svg>
          <span>Add Next Track</span>
        </button>
      </nav>
    </div>
  );

  if (!mounted) return null;

  return (
    <div className="bg-[#0e0e11] text-[#f3f4f6] font-sans antialiased min-h-[100dvh] w-full flex flex-col items-center select-none pb-24 overflow-hidden">
      
      <main className="relative w-full max-w-md flex flex-col h-full overflow-y-auto custom-scrollbar">
        <header className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <button onClick={() => router.push("/md-live")} className="w-11 h-11 rounded-full bg-[#1c1c22] border border-[#2a2a35]/60 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-[#24242c] active:scale-95 transition-all shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.07),_0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer">
              <svg className="w-5 h-5 stroke-[2.4]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
            </button>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black tracking-tight text-white leading-tight truncate max-w-[150px]">{projectTitle}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-block w-2 h-2 rounded-full ${isCountingIn ? 'bg-amber-400 animate-ping' : queuedGuideId || queuedSequenceIndex !== null ? 'bg-cyan-400' : isPlaying ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-zinc-500'}`}></span>
                <span className={`text-[11px] font-bold tracking-widest uppercase ${isCountingIn ? 'text-amber-400' : queuedGuideId || queuedSequenceIndex !== null ? 'text-cyan-400' : isPlaying ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {isCountingIn ? 'Counting In' : queuedGuideId || queuedSequenceIndex !== null ? 'Queued' : isPlaying ? 'Live' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsExpanded(true)} className="flex items-center gap-2 px-4 py-2 h-10 bg-gradient-to-r from-blue-950/80 to-blue-900/90 border border-blue-500/50 rounded-full text-blue-400 hover:text-blue-300 shadow-[0_0_20px_-3px_rgba(37,99,235,0.45)] transition-all active:scale-95 cursor-pointer">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" viewBox="0 0 24 24"><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="m15.5 8.5-7 7"></path></svg>
              <span className="text-xs font-extrabold tracking-wider uppercase hidden sm:block">Sequence</span>
            </button>
          </div>
        </header>

        {activeTrack?.sequence.length > 0 && (
          <section className="px-5 mt-2 flex flex-col items-center">
            <div className="w-auto px-6 py-2.5 bg-[#1c1c22]/90 border border-blue-500/30 rounded-full flex items-center gap-2.5 shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.07),_0_4px_12px_rgba(0,0,0,0.5)] backdrop-blur-md">
              <span className="text-xs font-black tracking-widest text-zinc-400 uppercase">Current:</span>
              <span className="text-sm font-black tracking-wider text-blue-400 uppercase drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]">{activeTrack.sequence[activeSequenceIndex]?.cueId || "---"}</span>
            </div>
            {activeTrack.sequence[activeSequenceIndex + 1] && (
              <div className="flex items-center gap-2 mt-2.5 text-zinc-400 tracking-wider">
                <svg className="w-4 h-4 text-zinc-500 stroke-[2.5]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Next: <span className="text-zinc-200 font-extrabold">{activeTrack.sequence[activeSequenceIndex + 1].cueId}</span></p>
              </div>
            )}
          </section>
        )}

        <section className="px-5 mt-4 mb-8">
          <div className="w-full max-w-[340px] flex flex-col gap-4 mx-auto">
            <div className="w-full h-5 bg-[#1c1c22] rounded-full border border-[#2a2a35] flex overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
              {[1, 2, 3, 4].map(beat => {
                const isActive = isPlaying && visualBeat === beat;
                return (
                  <div key={beat} className="flex-1 h-full border-r border-[#0e0e11] last:border-0 relative">
                    <div className={`absolute inset-0 bg-blue-500 shadow-[0_0_16px_#3b82f6] transition-opacity duration-75 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                );
              })}
            </div>
            {activeTrack?.sequence.length > 0 && sectionBeats.total > 0 && (
              <div className="w-full flex flex-col gap-1.5 animate-in fade-in">
                <div className="flex justify-between items-center text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1">
                     Section Progress
                     {isHolding && <span className="text-amber-500 animate-pulse">(HOLD)</span>}
                  </span>
                </div>
                <div className="w-full h-2 bg-[#1c1c22] rounded-full overflow-hidden border border-[#2a2a35]">
                  <div className="h-full transition-all duration-200 ease-linear bg-emerald-500 shadow-[0_0_12px_#10b981]" style={{ width: `${(sectionBeats.current / sectionBeats.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        <main className="px-5 pb-8 overflow-x-hidden">
          <div className="flex items-center justify-between pb-3 px-0.5 border-b border-[#2a2a35]/40 text-[11px] font-extrabold tracking-wider uppercase">
            <span className="text-zinc-400">
              {activePadPage === 1 ? (activeTrack?.sequence.length > 0 ? "Timeline Sequence" : "Normal Cues") : "Dynamic Cues"}
            </span>
            <div className="flex items-center gap-1.5 bg-[#18181A] rounded-lg p-1 border border-zinc-800">
              <button onClick={() => setActivePadPage(1)} className={`px-4 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer ${activePadPage === 1 ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>1</button>
              <button onClick={() => setActivePadPage(2)} className={`px-4 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer ${activePadPage === 2 ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>2</button>
            </div>
          </div>

          <div 
            className="flex items-start w-full mt-3.5"
            style={{ 
              transform: `translateX(calc(${activePadPage === 1 ? '0%' : '-100%'} + ${swipeOffsetX}px))`, 
              transition: swipeTransition ? 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
              touchAction: 'pan-y' 
            }}
            onMouseDown={handleDragStart} onMouseMove={handleDragMove} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd}
            onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} onTouchCancel={handleDragEnd}
          >
            {/* PAGE 1 */}
            <div className="w-full shrink-0 px-1">
              <div className="grid grid-cols-3 gap-2.5">
                {activeTrack?.sequence.length > 0 ? sequencedPads.map((seq, idx) => {
                  const isPlayingThis = isPlaying && activeSequenceIndex === idx;
                  const isQueued = isPlaying && queuedSequenceIndex === idx;
                  const isArmedIdle = !isPlaying && idleArmedSequenceIndex === idx;
                  return (
                    <button 
                      key={seq.id} 
                      onClick={() => { if (!isSwipingRef.current) handleSequencePadClick(idx); }} 
                      className={`group relative aspect-square rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.07),_0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer outline-none select-none ${isPlayingThis ? 'bg-[#1c1c22] border-2 border-emerald-500/90 text-white shadow-[0_0_16px_-2px_rgba(16,185,129,0.35)] scale-[1.02]' : (isArmedIdle || isQueued) ? 'bg-[#1c1c22] border border-emerald-500/50 text-zinc-200 hover:border-emerald-400' : 'bg-[#1c1c22] border border-[#2a2a35]/80 text-zinc-200 hover:border-zinc-500 hover:bg-[#24242c]'}`}
                    >
                      {isPlayingThis && <span className="absolute -top-1 px-1.5 py-[1px] bg-emerald-500 text-[9px] font-black uppercase tracking-tighter text-black rounded-sm shadow-sm">Live</span>}
                      {(isArmedIdle || isQueued) && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-2.5 right-2.5"></div>}
                      <span className="text-xs font-extrabold tracking-wide leading-tight whitespace-pre-wrap">{seq.displayLabel}</span>
                    </button>
                  );
                }) : page1Pads.map((cueId) => {
                  const cue = MASTER_NORMAL_CUES.find(c => c.id === cueId) || MASTER_NORMAL_CUES[0];
                  const isArmedIdle = !isPlaying && idleArmedGuideId === cue.id;
                  const isQueued = isPlaying && queuedGuideId === cue.id;
                  return (
                    <button 
                      key={cue.id} 
                      onMouseDown={() => startLongPress(cue.id, 1)} onTouchStart={() => startLongPress(cue.id, 1)}
                      onMouseUp={cancelLongPress} onTouchEnd={cancelLongPress} onMouseLeave={cancelLongPress} onTouchCancel={cancelLongPress}
                      onClick={() => { cancelLongPress(); if (!isSwipingRef.current && !hasJustLongPressedRef.current) handleManualPadClick(cue.id, 1); }} 
                      className={`group relative aspect-square rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.07),_0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer outline-none select-none ${isQueued || isArmedIdle ? 'bg-[#1c1c22] border border-emerald-500/50 text-zinc-200' : 'bg-[#1c1c22] border border-[#2a2a35]/80 text-zinc-200'}`}
                    >
                      {(isArmedIdle || isQueued) && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-2.5 right-2.5"></div>}
                      <span className="text-xs font-extrabold tracking-wide leading-tight whitespace-pre-wrap">{cue.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PAGE 2 */}
            <div className="w-full shrink-0 px-1">
              <div className="grid grid-cols-3 gap-2.5">
                {page2Pads.map((cueId) => {
                  const cue = MASTER_DYNAMIC_CUES.find(c => c.id === cueId) || MASTER_DYNAMIC_CUES[0];
                  const isDynamicFlashing = dynamicFlashId === cue.id;
                  return (
                    <button 
                      key={cue.id} 
                      onMouseDown={() => startLongPress(cue.id, 2)} onTouchStart={() => startLongPress(cue.id, 2)}
                      onMouseUp={cancelLongPress} onTouchEnd={cancelLongPress} onMouseLeave={cancelLongPress} onTouchCancel={cancelLongPress}
                      onClick={() => { cancelLongPress(); if (!isSwipingRef.current && !hasJustLongPressedRef.current) handleManualPadClick(cue.id, 2); }} 
                      className={`group relative aspect-square rounded-2xl p-2.5 flex flex-col items-center justify-center text-center transition-all shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.07),_0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer outline-none select-none ${isDynamicFlashing ? 'bg-[#1c1c22] border-2 border-emerald-500/90 text-white scale-[1.02]' : 'bg-[#1c1c22] border border-[#2a2a35]/80 text-zinc-200'}`}
                    >
                      {isDynamicFlashing && <span className="absolute -top-1 px-1.5 py-[1px] bg-emerald-500 text-[9px] font-black uppercase tracking-tighter text-black rounded-sm shadow-sm">Live</span>}
                      <span className="text-xs font-extrabold tracking-wide leading-tight whitespace-pre-wrap">{cue.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </main>

      {/* PORTALS & MODALS */}
      {mounted && (() => {
        if (isMobile) {
          const portalSlot = document.getElementById("media-player-portal-slot");
          return (
            <>
              {portalSlot && !isExpanded ? createPortal(renderCollapsedPlayer(), portalSlot) : null}
              {isExpanded ? renderExpandedPlayer() : null}
            </>
          );
        }
        return (
          <>
            {!isExpanded && <div className="fixed bottom-0 left-0 right-0 z-[150000]">{renderCollapsedPlayer()}</div>}
            {isExpanded && renderExpandedPlayer()}
          </>
        );
      })()}

      {/* Hot Swap Modal */}
      {hotSwapTarget !== null && (
        <div className="fixed inset-0 z-[350000] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#1c1c22] rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-full sm:zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex flex-col p-4 border-b border-[#2a2a35] bg-[#141418] shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex flex-col ml-2">
                  <h3 className="font-extrabold text-white tracking-tight">Hot Swap Pad</h3>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Replacing: {currentMasterDictionary.find(c => c.id === hotSwapTarget.id)?.label}</p>
                </div>
                <button onClick={() => setHotSwapTarget(null)} className="w-10 h-10 rounded-full bg-[#1c1c22] border border-[#2a2a35] flex items-center justify-center text-zinc-400 transition-colors cursor-pointer shadow-sm">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {currentMasterDictionary.map(cue => {
                  const isCurrentlyMapped = currentCuesList.includes(cue.id);
                  const isTarget = cue.id === hotSwapTarget.id;
                  return (
                    <button
                      key={`hs-${cue.id}`}
                      onClick={() => executeHotSwap(cue.id)}
                      disabled={isTarget}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                        isTarget 
                          ? "bg-blue-600/10 border-blue-500 opacity-50 cursor-not-allowed" 
                          : isCurrentlyMapped 
                            ? "bg-[#24242c] border-secondary/50 hover:bg-[#2a2a35]" 
                            : "bg-[#16161a] border-white/5 hover:border-white/20"
                      }`}
                    >
                      <span className={`font-black text-[12px] uppercase tracking-widest mb-1 ${cue.color}`}>{cue.label}</span>
                      {isCurrentlyMapped && !isTarget && <span className="text-[8px] font-black uppercase text-secondary tracking-widest bg-secondary-container/20 px-2 py-0.5 rounded">Swap Places</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Track Wizard Modal */}
      {trackWizardStep !== "none" && (
        <div className="fixed inset-0 z-[300000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1c1c22] rounded-3xl border border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            
            <div className="flex items-center justify-between p-4 border-b border-[#2a2a35] bg-[#141418]">
              <h3 className="font-extrabold text-white tracking-tight ml-2">Add New Track</h3>
              <button onClick={() => { setTrackWizardStep("none"); setPendingDbSong(null); }} className="w-8 h-8 rounded-full bg-[#1c1c22] border border-[#2a2a35] flex items-center justify-center text-zinc-400 transition-colors cursor-pointer">✕</button>
            </div>

            <div className="p-6">
              {trackWizardStep === "choice" && (
                <div className="space-y-3">
                  <button onClick={() => setTrackWizardStep("database")} className="w-full p-4 rounded-2xl bg-[#16161a] border border-white/5 hover:border-blue-500/50 text-left flex items-center gap-4 transition-all group cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">library_music</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[15px] text-white">Use Our Song</span>
                      <span className="text-[11px] text-zinc-400 font-semibold">Fetch title, BPM, and Sequence</span>
                    </div>
                  </button>
                  <button onClick={() => setTrackWizardStep("custom")} className="w-full p-4 rounded-2xl bg-[#16161a] border border-white/5 hover:border-emerald-500/50 text-left flex items-center gap-4 transition-all group cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">tune</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[15px] text-white">Custom Track</span>
                      <span className="text-[11px] text-zinc-400 font-semibold">Manually enter a name and tap tempo</span>
                    </div>
                  </button>
                </div>
              )}

              {trackWizardStep === "custom" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Track Title</label>
                    <input type="text" value={customTrackTitle} onChange={e => setCustomTrackTitle(e.target.value)} placeholder="e.g. Spontaneous Worship" className="w-full bg-[#16161a] border border-white/10 rounded-xl p-3 text-sm font-bold outline-none focus:border-blue-500 text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">BPM / Tempo</label>
                    <div className="flex gap-2">
                      <input type="number" value={customTrackBpm} onChange={e => setCustomTrackBpm(e.target.value)} className="w-24 bg-[#16161a] border border-white/10 rounded-xl p-3 text-center text-lg font-black outline-none focus:border-blue-500 tnum text-white" />
                      <button onClick={(e) => { e.preventDefault(); setTapTimestamps([]); setIsTapBpmModalOpen(true); }} className="flex-1 bg-[#24242c] hover:bg-[#2a2a35] border border-white/10 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer text-white">Tap Tempo</button>
                    </div>
                  </div>
                  <button onClick={() => confirmAddCustomTrack()} disabled={!customTrackBpm} className="w-full py-3.5 mt-2 bg-blue-600 text-white rounded-xl font-black text-[13px] shadow-md hover:bg-blue-500 disabled:opacity-50 transition-colors cursor-pointer">Add Custom Track</button>
                </div>
              )}

              {trackWizardStep === "database" && (
                <div className="space-y-4">
                  <div className="relative flex items-center z-20">
                    <span className="material-symbols-outlined absolute left-3 text-zinc-500 text-[20px]">search</span>
                    <input type="text" value={dbSearchQuery} onChange={e => setDbSearchQuery(e.target.value)} placeholder="Search repertoire..." className="w-full bg-[#16161a] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm font-bold outline-none focus:border-blue-500 transition-colors text-white" />
                  </div>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pt-1 border-t border-[#2a2a35] mt-4">
                    {dbSearchResults.length > 0 ? dbSearchResults.map(song => (
                      <div 
                        key={song.id} 
                        onClick={() => { setPendingDbSong(song); setTrackWizardStep("import_prompt"); }}
                        className="p-3 bg-[#16161a] border border-white/5 hover:border-blue-500 rounded-xl cursor-pointer transition-colors group"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-[14px] text-white truncate group-hover:text-blue-400 transition-colors">{song.title}</span>
                          <span className="text-[10px] font-black text-zinc-400 bg-[#24242c] px-2 py-0.5 rounded-md tnum">{song.tempo || 120} BPM</span>
                        </div>
                        <span className="text-[11px] text-zinc-500 font-semibold truncate block">{song.artist || "Unknown Artist"}</span>
                      </div>
                    )) : (
                      dbSearchQuery && !isSearchingDb && <div className="text-center py-8 text-[11px] font-bold text-zinc-500 uppercase tracking-widest">No matching songs found</div>
                    )}
                  </div>
                </div>
              )}

              {trackWizardStep === "import_prompt" && pendingDbSong && (
                 <div className="space-y-5 text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-blue-600/20 flex items-center justify-center text-blue-500 mb-2">
                       <span className="material-symbols-outlined text-[32px]">linear_scale</span>
                    </div>
                    <div className="flex flex-col">
                       <span className="font-extrabold text-[18px] text-white">{pendingDbSong.title}</span>
                       <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{pendingDbSong.tempo || 120} BPM</span>
                    </div>
                    <p className="text-[13px] font-medium text-zinc-300">Would you like to import the song's Section Timings to build an Automated Sequence timeline?</p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                       <button onClick={() => handleConfirmImport(false)} className="py-3 rounded-xl bg-[#16161a] border border-white/10 hover:border-white/20 text-[12px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors cursor-pointer">No, Manual Only</button>
                       <button onClick={() => handleConfirmImport(true)} className="py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-[12px] font-black uppercase tracking-widest text-white shadow-md transition-colors cursor-pointer">Yes, Auto-Build</button>
                    </div>
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tap Tempo Modal */}
      {isTapBpmModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[350000] flex items-center justify-center p-4 select-none">
          <div className="bg-[#1c1c22] border border-white/10 rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-6 text-center animate-in zoom-in-95">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-white tracking-tight">Tap Tempo</h3>
              <p className="text-[11px] font-bold text-zinc-400">Tap the button to the beat to calculate BPM.</p>
            </div>
            <div onClick={() => setTapTimestamps([])} className="bg-[#16161a] border border-white/10 rounded-xl p-4 shadow-inner h-28 w-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-[#24242c] transition-colors relative group">
              {tapTimestamps.length === 0 ? (
                <span className="text-zinc-500 text-sm font-bold italic">Start tapping...</span>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-4 w-full">
                  {Array.from({ length: Math.ceil(Math.min(tapTimestamps.length, 48) / 4) }).map((_, groupIdx) => {
                    const totalTaps = Math.min(tapTimestamps.length, 48);
                    const starsInGroup = Math.min(4, totalTaps - groupIdx * 4);
                    let tapSizeClass = "text-4xl";
                    if (totalTaps > 36) tapSizeClass = "text-xl";
                    else if (totalTaps > 24) tapSizeClass = "text-2xl";
                    else if (totalTaps > 12) tapSizeClass = "text-3xl";
                    return (
                      <div key={groupIdx} className="flex gap-1.5 flex-nowrap shrink-0">
                        {Array.from({ length: starsInGroup }).map((_, starIdx) => <span key={starIdx} className={`text-blue-500 font-black leading-none ${tapSizeClass}`}>*</span>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="text-5xl font-black text-white tracking-tighter tnum">{customTrackBpm || "--"} <span className="text-sm font-bold text-zinc-400 tracking-normal">BPM</span></div>
            <button 
              type="button" 
              onClick={(e) => { 
                e.preventDefault(); 
                const now = Date.now(); 
                setTapTimestamps(prev => { 
                  if (prev.length > 0 && now - prev[prev.length - 1] > 2500) return [now]; 
                  const newTaps = [...prev, now]; 
                  if (newTaps.length >= 2) { 
                    const intervals = []; 
                    for (let i = 1; i < newTaps.length; i++) intervals.push(newTaps[i] - newTaps[i - 1]); 
                    const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length; 
                    setCustomTrackBpm(Math.round(60000 / averageInterval).toString()); 
                  } 
                  return newTaps; 
                }); 
              }} 
              className="w-full h-32 bg-blue-600 hover:bg-blue-500 text-white font-black text-3xl rounded-[2rem] shadow-[0_10px_40px_rgba(37,99,235,0.4)] flex items-center justify-center cursor-pointer active:scale-[0.97] transition-transform"
            >
              TAP
            </button>
            <button type="button" onClick={() => setIsTapBpmModalOpen(false)} className="w-full py-3.5 bg-[#24242c] hover:bg-[#2a2a35] text-white font-black text-[11px] uppercase tracking-widest rounded-xl cursor-pointer border border-white/10 transition-colors">Confirm & Close</button>
          </div>
        </div>
      )}

      {/* Mixer Modal */}
      {isMixerOpen && (
        <div className="fixed inset-0 z-[350000] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#1c1c22] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-6 animate-in slide-in-from-bottom-full sm:zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">tune</span> Audio Mixer
              </h3>
              <button onClick={() => setIsMixerOpen(false)} className="w-8 h-8 rounded-full bg-[#24242c] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>
            
            <div className="space-y-6 py-2">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Click Volume</label>
                  <span className="text-[11px] font-bold text-white font-mono">{Math.round(clickVolume * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" 
                  value={clickVolume} onChange={e => setClickVolume(parseFloat(e.target.value))} 
                  className="w-full accent-blue-500"
                />
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Guide Volume</label>
                  <span className="text-[11px] font-bold text-white font-mono">{Math.round(guideVolume * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" 
                  value={guideVolume} onChange={e => setGuideVolume(parseFloat(e.target.value))} 
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
                <label className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Click Sound</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["blip", "bell", "block", "glass"] as const).map(sound => (
                    <button
                      key={sound}
                      onClick={() => {
                        setClickSound(sound);
                        playZeroLatencyAudio(`metronome_${sound}_1`, clickVolume);
                      }}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
                        clickSound === sound 
                          ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                          : 'bg-[#24242c] border-white/5 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1.5 transition-colors ${clickSound === sound ? 'bg-blue-900/40 ring-2 ring-blue-500' : 'bg-[#1c1c22] ring-2 ring-[#2a2a35]'}`}>
                        <div className={`w-3 h-3 rounded-full ${clickSound === sound ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' : 'bg-[#2a2a35]'}`}></div>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest">{sound}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
            
            <button onClick={() => setIsMixerOpen(false)} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-[12px] uppercase tracking-widest rounded-xl cursor-pointer transition-colors">Done</button>
          </div>
        </div>
      )}

    </div>
  );
}