"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom"; // ✅ SURGICAL FIX: Added missing import
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useWebAudioEngine } from "../setlists/[id]/live/hooks/useWebAudioEngine";

// ============================================================================
// AUDIO ASSETS & CONSTANTS (Mapped exactly to provided file names)
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

const COUNT_CUES = ["count_1", "count_2", "count_3", "count_4"];

// ✅ SURGICAL FIX: Trimmed to exactly 9 items for the 3x3 grid
const DEFAULT_PAGE_1 = ["Intro", "Verse 1", "Verse 2", "Pre Chorus", "Chorus", "Bridge", "Instrumental", "Tag", "Outro"];
const DEFAULT_PAGE_2 = ["D_All In", "D_Bass", "D_Big Ending", "D_Break", "D_Build", "D_Drums In", "D_Drums", "D_Hits", "D_Hold"];

interface MDTrack {
  id: string;
  title: string;
  bpm: number;
}

export default function MDLivePage() {
  const router = useRouter();
  const supabase = createClient();
  const { initAudioContext, fetchAndDecodeAudio, playZeroLatencyAudio, getAudioContext } = useWebAudioEngine();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // ✅ Added mobile tracking
  const [tracks, setTracks] = useState<MDTrack[]>([{ id: "trk-1", title: "Track 1", bpm: 120 }]);
  const [activeTrackId, setActiveTrackId] = useState<string>("trk-1");
  const [isExpanded, setIsExpanded] = useState(false);

  // Pad Engine States
  const [activePadPage, setActivePadPage] = useState<1 | 2>(1);
  const [page1Pads, setPage1Pads] = useState<string[]>(DEFAULT_PAGE_1);
  const [page2Pads, setPage2Pads] = useState<string[]>(DEFAULT_PAGE_2);
  const [hotSwapTarget, setHotSwapTarget] = useState<{ id: string, page: 1 | 2 } | null>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [visualBeat, setVisualBeat] = useState(1);
  const [isCountingIn, setIsCountingIn] = useState(false);

  // ✅ SURGICAL FIX: Tell the global layout to hide the bottom nav when playing
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: isPlaying }));
    }
    // Safety cleanup: Ensure the nav comes back if the user exits the page while playing
    return () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: false }));
      }
    };
  }, [isPlaying]);
  
  // Interaction States
  const [idleArmedGuideId, setIdleArmedGuideId] = useState<string | null>(null);
  const [queuedGuideId, setQueuedGuideId] = useState<string | null>(null);
  const [dynamicFlashId, setDynamicFlashId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Engine Refs
  const isPlayingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentBeatInSequenceRef = useRef(0); 
  const schedulerTimerRef = useRef<number | null>(null);
  const activeGuideForCountInRef = useRef<string | null>(null);
  const queuedGuideIdRef = useRef<string | null>(null);

  const activeTrack = tracks.find(t => t.id === activeTrackId) || tracks[0];

  // Track Wizard States
  const [trackWizardStep, setTrackWizardStep] = useState<"none" | "choice" | "custom" | "database">("none");
  const [customTrackTitle, setCustomTrackTitle] = useState("");
  const [customTrackBpm, setCustomTrackBpm] = useState("120");
  
  // Database Search States
  const [dbSearchQuery, setDbSearchQuery] = useState("");
  const [dbSearchResults, setDbSearchResults] = useState<any[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);

  // Tap Tempo States
  const [isTapBpmModalOpen, setIsTapBpmModalOpen] = useState(false);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  // ============================================================================
  // AUDIO PRELOADING & INITIALIZATION
  // ============================================================================
  useEffect(() => {
    setMounted(true);
    
    // ✅ Track mobile viewport to properly portal the player above the bottom nav
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    if (typeof window !== "undefined") {
      MASTER_NORMAL_CUES.forEach(cue => fetchAndDecodeAudio(`/sound_files/${cue.file}`, cue.id));
      MASTER_DYNAMIC_CUES.forEach(cue => fetchAndDecodeAudio(`/sound_files/${cue.file}`, cue.id));
      COUNT_CUES.forEach(count => fetchAndDecodeAudio(`/sound_files/${count}.wav`, count));
      fetchAndDecodeAudio(`/sound_files/metronome_blip_1.wav`, `metronome_blip_1`);
      fetchAndDecodeAudio(`/sound_files/metronome_blip_2.wav`, `metronome_blip_2`);
    }

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { queuedGuideIdRef.current = queuedGuideId; }, [queuedGuideId]);

  useEffect(() => {
    if (tapTimestamps.length > 0) {
      const idleTimer = setTimeout(() => setTapTimestamps([]), 3000);
      return () => clearTimeout(idleTimer);
    }
  }, [tapTimestamps]);

  // Database Debounced Auto-Search
  useEffect(() => {
    if (!dbSearchQuery.trim()) { setDbSearchResults([]); return; }
    const fetchResults = async () => {
      setIsSearchingDb(true);
      try {
        const { data, error } = await supabase.from('songs')
          .select('id, title, artist, tempo')
          .ilike('title', `%${dbSearchQuery}%`)
          .limit(10);
        if (!error && data) setDbSearchResults(data);
      } catch(err) { console.error(err); }
      setIsSearchingDb(false);
    };
    const debounceTimer = setTimeout(fetchResults, 300);
    return () => clearTimeout(debounceTimer);
  }, [dbSearchQuery, supabase]);

  // ============================================================================
  // AUDIO SCHEDULING ENGINE (Lookahead Queueing)
  // ============================================================================
  const scheduleNote = (beatNumber: number, time: number) => {
    const relativeBeat = ((beatNumber - 1) % 4 + 4) % 4 + 1; 
    const isDownbeat = relativeBeat === 1;

    // UI Updates
    setTimeout(() => {
      if (isPlayingRef.current) setVisualBeat(relativeBeat);
    }, Math.max(0, (time - (audioContextRef.current?.currentTime || 0)) * 1000));

    // NORMAL QUEUE ENGINE: Wait for downbeat to drop the guide
    if (beatNumber > 0 && isDownbeat && queuedGuideIdRef.current) {
      playZeroLatencyAudio(queuedGuideIdRef.current, 1.0, time);
      queuedGuideIdRef.current = null;
      setTimeout(() => setQueuedGuideId(null), 0);
    }

    // Play Metronome
    playZeroLatencyAudio(isDownbeat ? 'metronome_blip_1' : 'metronome_blip_2', 1.0, time);

    // Play Count-In Sequence: [Guide] - [2] - [1][2][3][4]
    if (beatNumber <= 0) {
      if (beatNumber === -7 && activeGuideForCountInRef.current) {
        playZeroLatencyAudio(activeGuideForCountInRef.current, 1.0, time);
      } else if (beatNumber === -5) {
        playZeroLatencyAudio("count_2", 1.0, time);
      } else if (beatNumber === -3) {
        playZeroLatencyAudio("count_1", 1.0, time);
      } else if (beatNumber === -2) {
        playZeroLatencyAudio("count_2", 1.0, time);
      } else if (beatNumber === -1) {
        playZeroLatencyAudio("count_3", 1.0, time);
      } else if (beatNumber === 0) {
        playZeroLatencyAudio("count_4", 1.0, time);
      }
    }
  };

  const scheduler = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const scheduleAheadTime = 0.1; 
    const secondsPerBeat = 60.0 / activeTrack.bpm;

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      scheduleNote(currentBeatInSequenceRef.current, nextNoteTimeRef.current);
      nextNoteTimeRef.current += secondsPerBeat;
      currentBeatInSequenceRef.current++;

      if (currentBeatInSequenceRef.current === 1) {
        setTimeout(() => setIsCountingIn(false), Math.max(0, (nextNoteTimeRef.current - ctx.currentTime) * 1000));
      }
    }

    schedulerTimerRef.current = window.setTimeout(scheduler, 25.0);
  }, [activeTrack.bpm]);

  // ============================================================================
  // PLAYBACK & INTERACTION CONTROLS
  // ============================================================================
  const stopEngine = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsCountingIn(false);
    setQueuedGuideId(null);
    queuedGuideIdRef.current = null;
    if (schedulerTimerRef.current !== null) {
      clearTimeout(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    setVisualBeat(1);
  };

  const startEngine = (withCountIn: boolean = false, guideId: string | null = null) => {
    initAudioContext();
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === 'suspended') ctx.resume();
    audioContextRef.current = ctx;

    if (isPlayingRef.current) stopEngine();

    isPlayingRef.current = true;
    setIsPlaying(true);
    nextNoteTimeRef.current = ctx.currentTime + 0.05; 

    if (withCountIn) {
      setIsCountingIn(true);
      currentBeatInSequenceRef.current = -7; 
      activeGuideForCountInRef.current = guideId;
    } else {
      setIsCountingIn(false);
      currentBeatInSequenceRef.current = 1; 
    }

    scheduler();
  };

  const handlePadClick = (guideId: string, page: 1 | 2) => {
    initAudioContext();

    if (!isPlaying) {
      // IDLE MODE: Arm it, do not start engine yet
      setIdleArmedGuideId(guideId);
    } else {
      // PLAYING MODE:
      if (page === 2) {
        // DYNAMIC CUE: Play zero latency instantly, do not queue
        playZeroLatencyAudio(guideId, 1.0);
        setDynamicFlashId(guideId);
        setTimeout(() => setDynamicFlashId(null), 150);
      } else {
        // NORMAL CUE: Queue for the next downbeat
        setQueuedGuideId(guideId);
      }
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopEngine();
    } else {
      if (idleArmedGuideId) {
        startEngine(true, idleArmedGuideId);
        setIdleArmedGuideId(null); // Clear arming once started
      } else {
        startEngine(false);
      }
    }
  };

  const executeHotSwap = (newCueId: string) => {
    if (!hotSwapTarget) return;
    
    const { id: oldId, page } = hotSwapTarget;
    const isPage1 = page === 1;
    const currentPads = isPage1 ? [...page1Pads] : [...page2Pads];
    
    const existingIndex = currentPads.indexOf(newCueId);
    const targetIndex = currentPads.indexOf(oldId);

    if (existingIndex !== -1) {
      // Swap positions
      currentPads[existingIndex] = oldId;
      currentPads[targetIndex] = newCueId;
    } else {
      // Replace
      currentPads[targetIndex] = newCueId;
    }

    if (isPage1) setPage1Pads(currentPads);
    else setPage2Pads(currentPads);
    
    setHotSwapTarget(null);
  };

  // ============================================================================
  // TRACK WIZARD
  // ============================================================================
  const confirmAddTrack = (title: string, bpm: number) => {
    const newId = `trk-${Date.now()}`;
    setTracks([...tracks, { id: newId, title, bpm: bpm || 120 }]);
    setActiveTrackId(newId);
    setTrackWizardStep("none");
    setCustomTrackTitle("");
    setCustomTrackBpm("120");
    setDbSearchQuery("");
    setDbSearchResults([]);
  };

  const updateActiveTrack = (field: keyof MDTrack, value: any) => {
    setTracks(tracks.map(t => t.id === activeTrackId ? { ...t, [field]: value } : t));
    
    if (field === 'bpm' && isPlaying && audioContextRef.current) {
      const oldSecondsPerBeat = 60.0 / activeTrack.bpm;
      const newSecondsPerBeat = 60.0 / value;
      const timeSinceLastBeat = audioContextRef.current.currentTime - (nextNoteTimeRef.current - oldSecondsPerBeat);
      const ratio = timeSinceLastBeat / oldSecondsPerBeat;
      nextNoteTimeRef.current = audioContextRef.current.currentTime + (newSecondsPerBeat * (1 - ratio));
    }
  };

  // ============================================================================
  // UI COMPONENTS (LiveHeader Engine)
  // ============================================================================
  const PlayIcon = () => <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white ml-1"><path d="M8 5v14l11-7z" /></svg>;
  const PauseIcon = () => <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;

  const renderCollapsedPlayer = () => (
    <div 
      onClick={() => setIsExpanded(true)}
      // ✅ SURGICAL FIX: Removed fixed/bottom-0 classes so it can be portaled flawlessly!
      className="w-full h-[64px] bg-[#18181A] rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.4)] transition-transform active:scale-[0.99] border-t border-outline-variant/10 flex items-center justify-between px-4 cursor-pointer relative overflow-hidden"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0 border border-outline-variant/30 shadow-inner">
          <span className="material-symbols-outlined text-outline-variant text-[20px]">graphic_eq</span>
        </div>
        
        <div className="flex flex-col min-w-0 pr-2 pb-0.5">
          <h2 className="font-extrabold text-[14px] text-white truncate tracking-tight leading-tight">
            {activeTrack.title}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] font-semibold text-zinc-400 truncate tnum">{activeTrack.bpm} BPM</span>
            {isCountingIn && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse ml-1"></span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); togglePlayback(); }}
          className={`w-12 h-12 flex items-center justify-center rounded-full shrink-0 transition-all active:scale-90 shadow-md ${isPlaying ? "bg-zinc-800 text-white border border-zinc-700" : "bg-primary text-on-primary shadow-[0_0_20px_rgba(37,99,235,0.4)]"}`}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-surface-container-highest">
        <div className="h-full bg-primary transition-all duration-100 ease-linear" style={{ width: `${(visualBeat / 4) * 100}%` }} />
      </div>
    </div>
  );

  const renderExpandedPlayer = () => (
    <div className={`fixed inset-0 z-[200000] bg-surface flex flex-col p-6 animate-in slide-in-from-bottom-full duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]`}>
      <div className="flex items-center justify-between w-full shrink-0 mb-6 pt-safe mt-4">
        <button onClick={() => setIsExpanded(false)} className="w-10 h-10 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-bright transition-colors shadow-sm active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-[24px] text-on-surface">keyboard_arrow_down</span>
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">MD Live Tracker</span>
        <div className="w-10"></div> 
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-4">
        {tracks.map((track, idx) => {
          const isSelected = activeTrackId === track.id;
          return (
            <div 
              key={track.id}
              onClick={() => { if (!isPlaying) setActiveTrackId(track.id); }}
              className={`p-4 rounded-2xl border text-left flex flex-col gap-1.5 transition-all outline-none cursor-pointer ${
                isSelected 
                  ? "border-primary bg-surface-container-high shadow-md relative overflow-hidden" 
                  : "border-outline-variant/30 bg-surface-container-low hover:border-outline-variant/50 shadow-sm"
              }`}
            >
              {isSelected && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-l-full opacity-60" />}
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center justify-center px-2 py-0.5 rounded-full bg-surface-container-highest text-[9px] font-black text-on-surface-variant shadow-inner uppercase tracking-widest">
                  Track {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="text-[10px] font-black bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded-full tracking-widest uppercase shadow-inner tnum">
                  {track.bpm} BPM
                </span>
              </div>
              <span className={`font-extrabold text-[18px] tracking-tight ${isSelected ? "text-on-surface" : "text-on-surface-variant"}`}>
                {track.title}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto shrink-0 pt-4 pb-safe space-y-4">
        <button 
          onClick={() => setTrackWizardStep("choice")}
          disabled={isPlaying}
          className="w-full py-4 rounded-2xl border border-dashed border-outline-variant/40 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-bold text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">add</span> Add Next Track
        </button>
      </div>
    </div>
  );

  if (!mounted) return null;

  const currentCuesList = activePadPage === 1 ? page1Pads : page2Pads;
  const currentMasterDictionary = activePadPage === 1 ? MASTER_NORMAL_CUES : MASTER_DYNAMIC_CUES;

  return (
    // ✅ SURGICAL FIX: Swapped h-[100dvh] for h-full to allow the layout's global bottom nav to render!
    <div className="bg-[#09090b] text-zinc-100 font-sans flex flex-col h-full w-full overflow-hidden select-none" onContextMenu={e => e.preventDefault()}>
      
      {/* ========================================= */}
      {/* MAIN STAGE                                */}
      {/* ========================================= */}
      <main className="flex-1 flex flex-col relative w-full pt-safe">
        
        {/* Top Header Row */}
        <header className="h-16 px-4 md:px-6 flex items-center justify-between shrink-0 bg-transparent">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition-colors shadow-sm cursor-pointer">
              <span className="material-symbols-outlined text-zinc-400">arrow_back</span>
            </button>
            <div className="flex flex-col">
              <span className="font-extrabold text-[18px] text-white truncate max-w-[150px] md:max-w-xs">{activeTrack.title}</span>
              <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isCountingIn ? "text-amber-500" : queuedGuideId ? "text-cyan-400" : "text-zinc-500"}`}>
                {isCountingIn ? "Counting In" : queuedGuideId ? `Queued: ${queuedGuideId}` : "Ready"}
                {isCountingIn && <span className="w-1 h-1 rounded-full bg-amber-500 animate-ping"></span>}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest text-zinc-500 mr-2">BPM Locked</span>
            <div className="flex items-center bg-[#18181A] border border-zinc-800 rounded-xl overflow-hidden h-10 shadow-inner">
              <button onClick={() => updateActiveTrack('bpm', Math.max(40, activeTrack.bpm - 1))} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <input 
                type="number" 
                value={activeTrack.bpm} 
                onChange={(e) => updateActiveTrack('bpm', parseInt(e.target.value) || 120)}
                className="w-14 bg-transparent text-center font-black text-[15px] text-white outline-none tnum"
              />
              <button onClick={() => updateActiveTrack('bpm', Math.min(300, activeTrack.bpm + 1))} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
          </div>
        </header>

        {/* Workspace Canvas */}
        <div className="flex-1 flex flex-col items-center justify-start pt-6 px-4 md:px-12 overflow-y-auto pb-[100px] custom-scrollbar">
          
          {/* Visual Metronome */}
          <div className="flex items-center gap-3 mb-8 md:mb-12">
            {[1, 2, 3, 4].map(beat => (
              <div 
                key={beat}
                className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl border-2 flex items-center justify-center font-black text-xl transition-all duration-75 shadow-lg ${
                  isPlaying && visualBeat === beat 
                    ? beat === 1 
                      ? "bg-amber-500 border-amber-400 text-white scale-110 shadow-[0_0_30px_rgba(245,158,11,0.5)]" 
                      : "bg-primary border-primary/50 text-white scale-105 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                    : "bg-[#18181A] border-zinc-800 text-zinc-600 scale-100"
                }`}
              >
                {beat}
              </div>
            ))}
          </div>

          {/* Drum Pad Grid */}
          <div className="w-full max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  {activePadPage === 1 ? "Normal Queue Cues" : "Dynamic Fire Cues"}
                </span>
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mt-0.5">Hold pad to Hot Swap</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#18181A] rounded-lg p-1 border border-zinc-800">
                <button onClick={() => setActivePadPage(1)} className={`px-4 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer ${activePadPage === 1 ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>1</button>
                <button onClick={() => setActivePadPage(2)} className={`px-4 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer ${activePadPage === 2 ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>2</button>
              </div>
            </div>

            {/* ✅ SURGICAL FIX: Removed md:grid-cols-4 to lock it to a 3x3 grid */}
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              {currentCuesList.map((cueId) => {
                const cue = currentMasterDictionary.find(c => c.id === cueId) || currentMasterDictionary[0];
                const isArmedIdle = !isPlaying && idleArmedGuideId === cue.id;
                const isQueued = isPlaying && queuedGuideId === cue.id;
                const isDynamicFlashing = dynamicFlashId === cue.id;

                return (
                  <button
                    key={cue.id}
                    onPointerDown={(e) => { 
                      e.preventDefault(); 
                      e.currentTarget.setPointerCapture(e.pointerId);
                      longPressTimerRef.current = setTimeout(() => {
                        longPressTimerRef.current = null;
                        setHotSwapTarget({ id: cue.id, page: activePadPage });
                        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) navigator.vibrate(50); // Haptic pop
                      }, 500);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                        handlePadClick(cue.id, activePadPage);
                      }
                    }}
                    onPointerLeave={(e) => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    className={`aspect-[5/4] sm:aspect-square rounded-2xl flex flex-col items-center justify-center p-2 sm:p-3 transition-all duration-75 border-b-[4px] shadow-lg relative overflow-hidden group outline-none select-none ${
                      isDynamicFlashing
                        ? 'bg-zinc-800 border-zinc-900 translate-y-[4px] shadow-none scale-[0.97]' 
                        : (isArmedIdle || isQueued)
                          ? 'bg-zinc-800 border-cyan-500 ring-2 ring-cyan-500/50 scale-[1.02]'
                          : 'bg-[#18181A] border-zinc-900 hover:bg-[#202022] hover:border-zinc-950 active:translate-y-[4px] active:border-zinc-950 active:shadow-none'
                    }`}
                  >
                    <div className={`absolute top-0 left-0 w-full h-1 opacity-20 ${cue.color.replace('text-', 'bg-')}`}></div>
                    
                    {(isDynamicFlashing || isArmedIdle || isQueued) && (
                      <div className={`absolute inset-0 opacity-10 ${cue.color.replace('text-', 'bg-')}`}></div>
                    )}

                    <span className={`font-black text-[11px] md:text-[13px] uppercase tracking-widest text-center leading-tight transition-colors z-10 ${isDynamicFlashing || isArmedIdle || isQueued ? cue.color : 'text-zinc-400 group-hover:text-white'}`}>
                      {cue.label}
                    </span>
                    
                    {isQueued && <span className="absolute bottom-1 sm:bottom-2 text-[8px] font-black text-cyan-400 uppercase tracking-widest animate-pulse hidden sm:block">Queued</span>}
                    {isArmedIdle && <span className="absolute bottom-1 sm:bottom-2 text-[8px] font-black text-amber-500 uppercase tracking-widest animate-pulse hidden sm:block">Armed</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* ========================================= */}
      {/* PORTALS & MODALS                          */}
      {/* ========================================= */}
      {/* ✅ SURGICAL FIX: Safely portal the docked player just like the Dashboard does */}
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
            {!isExpanded && (
               <div className="fixed bottom-0 left-0 right-0 z-[150000]">
                 {renderCollapsedPlayer()}
               </div>
            )}
            {isExpanded && renderExpandedPlayer()}
          </>
        );
      })()}

      {/* Hot Swap Modal */}
      {hotSwapTarget !== null && (
        <div className="fixed inset-0 z-[350000] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl border border-outline-variant/30 shadow-2xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom-full sm:zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex flex-col p-4 border-b border-outline-variant/30 bg-surface-container-high shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex flex-col ml-2">
                  <h3 className="font-extrabold text-on-surface tracking-tight">Hot Swap Pad</h3>
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Replacing: {currentMasterDictionary.find(c => c.id === hotSwapTarget.id)?.label}</p>
                </div>
                <button onClick={() => setHotSwapTarget(null)} className="w-10 h-10 rounded-full hover:bg-surface-bright flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer shadow-sm">✕</button>
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
                          ? "bg-primary/20 border-primary opacity-50 cursor-not-allowed" 
                          : isCurrentlyMapped 
                            ? "bg-surface-container-high border-secondary/50 hover:bg-surface-bright" 
                            : "bg-surface-container-lowest border-outline-variant/30 hover:border-primary/50"
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
          <div className="bg-surface-container rounded-3xl border border-outline-variant/30 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 bg-surface-container-high">
              <h3 className="font-extrabold text-on-surface tracking-tight ml-2">Add New Track</h3>
              <button onClick={() => setTrackWizardStep("none")} className="w-8 h-8 rounded-full hover:bg-surface-bright flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer">✕</button>
            </div>

            <div className="p-6">
              {trackWizardStep === "choice" && (
                <div className="space-y-3">
                  <button onClick={() => setTrackWizardStep("database")} className="w-full p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 hover:border-primary/50 text-left flex items-center gap-4 transition-all group cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">library_music</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[15px] text-on-surface">Use Our Song</span>
                      <span className="text-[11px] text-on-surface-variant font-semibold">Fetch title and BPM from your database</span>
                    </div>
                  </button>
                  <button onClick={() => setTrackWizardStep("custom")} className="w-full p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 hover:border-secondary/50 text-left flex items-center gap-4 transition-all group cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-secondary-container/20 text-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[24px]">tune</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[15px] text-on-surface">Custom Track</span>
                      <span className="text-[11px] text-on-surface-variant font-semibold">Manually enter a name and tap tempo</span>
                    </div>
                  </button>
                </div>
              )}

              {trackWizardStep === "custom" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5 block">Track Title</label>
                    <input 
                      type="text" 
                      value={customTrackTitle} 
                      onChange={e => setCustomTrackTitle(e.target.value)} 
                      placeholder="e.g. Spontaneous Worship" 
                      className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 text-sm font-bold outline-none focus:border-primary" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5 block">BPM / Tempo</label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        value={customTrackBpm} 
                        onChange={e => setCustomTrackBpm(e.target.value)} 
                        className="w-24 bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 text-center text-lg font-black outline-none focus:border-primary tnum" 
                      />
                      <button 
                        onClick={(e) => { 
                          e.preventDefault(); 
                          setTapTimestamps([]); 
                          setIsTapBpmModalOpen(true); 
                        }} 
                        className="flex-1 bg-surface-container-high hover:bg-surface-bright border border-outline-variant/30 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                      >
                        Tap Tempo
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={() => confirmAddTrack(customTrackTitle || "Untitled Track", parseInt(customTrackBpm) || 120)}
                    disabled={!customTrackBpm}
                    className="w-full py-3.5 mt-2 bg-primary text-on-primary rounded-xl font-black text-[13px] shadow-md hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Add Custom Track
                  </button>
                </div>
              )}

              {trackWizardStep === "database" && (
                <div className="space-y-4">
                  <div className="relative flex items-center z-20">
                    <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
                    <input 
                      type="text" 
                      value={dbSearchQuery} 
                      onChange={e => setDbSearchQuery(e.target.value)} 
                      placeholder="Search repertoire..." 
                      className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl pl-10 pr-4 py-3 text-sm font-bold outline-none focus:border-primary transition-colors" 
                    />
                    {isSearchingDb && (
                      <div className="absolute right-4">
                        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block"></span>
                      </div>
                    )}
                  </div>

                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pt-1 border-t border-outline-variant/20 mt-4">
                    {dbSearchResults.length > 0 ? dbSearchResults.map(song => (
                      <div 
                        key={song.id} 
                        onClick={() => confirmAddTrack(song.title, song.tempo || 120)}
                        className="p-3 bg-surface-container-lowest border border-outline-variant/30 hover:border-primary rounded-xl cursor-pointer transition-colors group"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-[14px] text-on-surface truncate group-hover:text-primary transition-colors">{song.title}</span>
                          <span className="text-[10px] font-black text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-md tnum">{song.tempo || 120} BPM</span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant font-semibold truncate block">{song.artist || "Unknown Artist"}</span>
                      </div>
                    )) : (
                      dbSearchQuery && !isSearchingDb && (
                        <div className="text-center py-8 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                          No matching songs found
                        </div>
                      )
                    )}
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
          <div className="bg-surface-container border border-outline-variant/30 rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-6 text-center animate-in zoom-in-95">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-on-surface tracking-tight">Tap Tempo</h3>
              <p className="text-[11px] font-bold text-on-surface-variant">Tap the button to the beat to calculate BPM.</p>
            </div>
            <div onClick={() => setTapTimestamps([])} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 shadow-inner h-28 w-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-surface-container-high transition-colors relative group">
              {tapTimestamps.length === 0 ? (
                <span className="text-on-surface-variant text-sm font-bold italic">Start tapping...</span>
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
                        {Array.from({ length: starsInGroup }).map((_, starIdx) => <span key={starIdx} className={`text-primary font-black leading-none ${tapSizeClass}`}>*</span>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="text-5xl font-black text-on-surface tracking-tighter tnum">{customTrackBpm || "--"} <span className="text-sm font-bold text-on-surface-variant tracking-normal">BPM</span></div>
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
              className="w-full h-32 bg-primary hover:bg-primary/90 text-on-primary font-black text-3xl rounded-[2rem] shadow-[0_10px_40px_rgba(37,99,235,0.4)] flex items-center justify-center cursor-pointer active:scale-[0.97] transition-transform"
            >
              TAP
            </button>
            <button type="button" onClick={() => setIsTapBpmModalOpen(false)} className="w-full py-3.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-black text-[11px] uppercase tracking-widest rounded-xl cursor-pointer border border-outline-variant/30 transition-colors">Confirm & Close</button>
          </div>
        </div>
      )}

    </div>
  );
}