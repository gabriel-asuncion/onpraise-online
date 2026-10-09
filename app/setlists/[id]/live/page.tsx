"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext"; 
import GlobalLoader from '../../../../components/GlobalLoader';
import { useTimesync } from '../../../../hooks/useTimesync';

import { CompiledSectionToken, CompiledBeatMap, BeatNode, ArrangementSection, SongRecord, ParsedLineToken, ParsedWordToken } from "./types/setlist";
import { CHROMATIC_SCALE, transposeBracketContent, normalizeKeyNote } from "./utils/music-math";
import { normalizeSectionNameToAudioFile } from "./utils/setlist-helpers"; 

import { useWakeLock } from "./hooks/useWakeLock";
import { useWebAudioEngine } from "./hooks/useWebAudioEngine";
import { useLocalPreferences } from "./hooks/useLocalPreferences";
import { useSetlistData } from "./hooks/useSetlistData";
import { useLivePresence } from "./hooks/useLivePresence";
import { useYouTubeSync } from "./hooks/useYouTubeSync";
import { useHardwareClock } from "./hooks/useHardwareClock";

import { LiveHeader } from "./components/LiveHeader";
import { SimplifiedStackView } from "./components/SimplifiedStackView";
import { StandardSheetView } from "./components/StandardSheetView";
import { ScrubberOverlay } from "./components/ScrubberOverlay";
import { SettingsModal } from "./components/SettingsModal";
import { StructureEditorModal } from "./components/StructureEditorModal";
import { AddBlockModal } from "./components/AddBlockModal";
import { TransposerModal } from "./components/TransposerModal";
import { MdLockModal } from "./components/MdLockModal";
import { ZenMovableFAB } from "./components/ZenMovableFAB";
import { RecordRehearsalModal } from "./components/RecordRehearsalModal"; // ✅ Add this
import { UserLobby } from "./components/UserLobby"; // ✅ Add this import

// ✅ SURGICAL ADDITION: Timeline Segment Models & Color Engine
interface SongSegment {
  label: string;
  start: number;
  end: number;
  duration: number;
  color: string;
  sectionIndex: number; // Added to easily map back to the active sections array
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

const supabase = createClient();

export default function SetlistPerformanceRoomPage() {
  const router = useRouter();
  const params = useParams();
  const setlistId = params?.id as string;

  const { simulatedUserId, simulatedRole, activeRole } = useEngine(); // ✅ Added activeRole
  const { isSynced, getGlobalTime } = useTimesync();
  

  // ✅ SURGICAL FIX: Calculates if the current user hierarchy can edit the song
  const canEditSong = ["admin", "moderator", "musician"].includes(activeRole);

  useWakeLock();
  
  // ✅ SURGICAL FIX: Bring back fetchAndDecodeAudio
  const { initAudioContext, playZeroLatencyAudio, playGuideCue, getAudioContext, fetchAndDecodeAudio, cancelFutureAudio } = useWebAudioEngine();

  const {
    lyricsFontSize, setLyricsFontSize, showChords, setShowChords, chordFormat, setChordFormat,
    isSimplifiedMode, setIsSimplifiedMode, lineSpacing, setLineSpacing,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isMetronomeSoundEnabledRef,
    isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled, isDoubleMetronomeEnabledRef,
    localClickVolume, setLocalClickVolume, localClickVolumeRef,
    youtubeVolume, setYoutubeVolume, youtubeVolumeRef,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled
  } = useLocalPreferences();

  const {
    loading, loadingStatus, setlistName, tracksList, setTracksList, tracksListRef,
    currentTrackIndex, setCurrentTrackIndex, currentTrackIndexRef,
    activeSong, setActiveSong, activeSongRef,
    sections, setSections, sectionsRef,
    activeDisplayKey, setActiveDisplayKey,
    mountTargetSetlistTrackIndex
  } = useSetlistData(setlistId, supabase);

  // ============================================================================
  // ✅ SURGICAL FIX: RESTORED AUDIO PRELOADERS
  // The audio engine needs these files in memory to actually make sound!
  // ============================================================================

  useEffect(() => {
    if (typeof window === "undefined" || tracksList.length === 0) return;
    
    // 1. Preload Guide Cues
    const uniqueFiles = new Set<string>();
    tracksList.forEach(track => {
      const structure = track.custom_structure || [];
      structure.forEach(section => {
        const fileName = normalizeSectionNameToAudioFile(section.section_name);
        if (fileName) uniqueFiles.add(fileName);
      });
    });
    uniqueFiles.forEach(fileName => fetchAndDecodeAudio(`/sound_files/${fileName}.wav`, fileName));

    // 2. ✅ SURGICAL FIX: Explicitly Preload the Metronome Sounds!
    const metronomeTypes = ["blip", "bell", "block", "glass"];
    metronomeTypes.forEach(type => {
      fetchAndDecodeAudio(`/sound_files/metronome_${type}_1.wav`, `metronome_${type}_1`);
      fetchAndDecodeAudio(`/sound_files/metronome_${type}_2.wav`, `metronome_${type}_2`);
    });
  }, [tracksList, fetchAndDecodeAudio]);
  // ============================================================================

  const {
    onlineUsers, setOnlineUsers, localPresenceUser, setLocalPresenceUser, localPresenceUserRef,
    isAdmin, isChannelSubscribedRef, realtimeChannelRef, handleToggleMusicDirectorMode
  } = useLivePresence(supabase, simulatedUserId, simulatedRole);

  const [audioLatencyOffsetMs, setAudioLatencyOffsetMs] = useState<number>(0);
  const [metronomeSoundType, setMetronomeSoundType] = useState<"blip" | "bell" | "block" | "glass">("blip");
  const metronomeSoundTypeRef = useRef(metronomeSoundType);
  useEffect(() => { metronomeSoundTypeRef.current = metronomeSoundType; }, [metronomeSoundType]);
  const [currentDriftMs, setCurrentDriftMs] = useState<number | null>(null);
  const [isTestingSync, setIsTestingSync] = useState<boolean>(false);
  const [testVisualBeat, setTestVisualBeat] = useState<number>(1);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownValueRef = useRef<number | null>(null);

  // ✅ SURGICAL ADDITION: Pause state tracking
  const [isPaused, setIsPaused] = useState(false);
  const [recordingAccumulatedMs, setRecordingAccumulatedMs] = useState(0);
  
  // ✅ Keeps paused state synced for the logger
  const isPausedRef = useRef(false);


  const latestMdBroadcastRef = useRef<{ mdId: string | null, timestamp: number }>({ mdId: null, timestamp: 0 });

  const [currentMeasureLength, setCurrentMeasureLength] = useState<number>(4);
  const lastVisualMeasureLengthRef = useRef<number>(4);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); 
  const [isMdLockModalOpen, setIsMdLockModalOpen] = useState<boolean>(false);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState<boolean>(false);

  // ✅ SURGICAL ADDITION: Chapters & Looping Engine State
  const [isChaptersModalOpen, setIsChaptersModalOpen] = useState(false);
  const [isUserLobbyOpen, setIsUserLobbyOpen] = useState(false); 
  
  // ✅ SURGICAL ADDITION: Chat Engine & MD Tracking State
  const [lobbyMessages, setLobbyMessages] = useState<any[]>([]);
  const prevMdRef = useRef<string | null>(null);
  
  // ✅ SURGICAL ADDITION: MD Request State
  const [mdRequest, setMdRequest] = useState<any | null>(null);
  
  // ✅ SURGICAL FIX: Missing State Variables
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const isUserLobbyOpenRef = useRef(isUserLobbyOpen);
  
  useEffect(() => {
    isUserLobbyOpenRef.current = isUserLobbyOpen;
    if (isUserLobbyOpen) setUnreadMessageCount(0); // Clear on open
  }, [isUserLobbyOpen]);

  // ✅ SURGICAL FIX: Initialize empty! Synced history timestamps will now trigger the badge.
  const [lastReadTimes, setLastReadTimes] = useState<Record<string, number>>({});
  
  const totalUnreadCount = useMemo(() => {
    let count = 0;
    lobbyMessages.forEach(msg => {
      if (msg.senderId === localPresenceUser?.id) return;
      if (msg.targetUserId === localPresenceUser?.id) {
        const lastRead = lastReadTimes[msg.senderId] || 0;
        if (msg.timestamp > lastRead) count++;
      } else if (!msg.targetUserId) {
        const lastRead = lastReadTimes['global'] || 0;
        if (msg.timestamp > lastRead) count++;
      }
    });
    return count;
  }, [lobbyMessages, lastReadTimes, localPresenceUser]);

  const lobbyMessagesRef = useRef(lobbyMessages);
  useEffect(() => { lobbyMessagesRef.current = lobbyMessages; }, [lobbyMessages]);

  // ✅ SURGICAL ADDITION: Ping Engine State & UI Cooldown
  const [pingAlert, setPingAlert] = useState<{ senderName: string, isWhisper: boolean, text: string } | null>(null);
  const [pingCooldown, setPingCooldown] = useState<number>(0);

  useEffect(() => {
    if (pingCooldown > 0) {
      const timer = setTimeout(() => setPingCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [pingCooldown]);

  // ✅ SURGICAL ADDITION: Smart Available Sections Fetcher
  const [availableSongSections, setAvailableSongSections] = useState<string[]>([]);

  // Ephemeral Chat Sender
  const sendChatMessage = (text: string, targetUserId?: string) => {
    if (!localPresenceUserRef.current) return;
    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: localPresenceUserRef.current.id,
      senderName: localPresenceUserRef.current.name || "User",
      text,
      targetUserId,
      timestamp: Date.now(),
      seenBy: [] // ✅ Initialize empty read receipt array
    };
    setLobbyMessages(prev => [...prev, msg].slice(-100)); // Keep last 100
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_chat", payload: msg });
    }
  };

  // ✅ SURGICAL ADDITION: Network Read Receipt Broadcaster
  const sendReadReceipt = (messageId: string) => {
    if (!realtimeChannelRef.current || !localPresenceUserRef.current) return;
    realtimeChannelRef.current.send({
      type: "broadcast",
      event: "lobby_chat_seen",
      payload: {
        messageId,
        reader: {
          id: localPresenceUserRef.current.id,
          avatar: localPresenceUserRef.current.avatar,
          initials: localPresenceUserRef.current.initials,
          name: localPresenceUserRef.current.name
        }
      }
    });
  };

  // ✅ SURGICAL FIX: Ephemeral Ping Sender now carries the message payload!
  const sendPingMessage = (text: string, targetUserId?: string) => {
    if (pingCooldown > 0) return;
    setPingCooldown(60); // Start 60-second cooldown
    
    if (realtimeChannelRef.current && localPresenceUserRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_ping",
        payload: {
          senderName: localPresenceUserRef.current.name || "User",
          targetUserId: targetUserId || null,
          text
        }
      });
      // Mirror it as a local chat message so the sender sees it in their timeline
      sendChatMessage(`🔔 Ping: ${text}`, targetUserId);
    }
  };



  // =========================================================================
  // ✅ SURGICAL FIX: UNIFIED PHYSICS-BASED DRAG ENGINE (Mouse + Touch)
  // =========================================================================
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [swipeTransition, setSwipeTransition] = useState(false);
  
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isSwipingRef = useRef(false);
  const swipeLockRef = useRef(false); // ✅ SURGICAL ADDITION: Prevent double-swiping

  // Safely extracts X and Y coordinates whether the user is touching or clicking
  const getClientPos = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
  };

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (swipeLockRef.current) return; // ✅ Block interactions if actively snapping
    const { x, y } = getClientPos(e);
    dragStartX.current = x;
    dragStartY.current = y;
    isDraggingRef.current = true;
    isSwipingRef.current = false;
    setSwipeTransition(false); 
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDraggingRef.current || dragStartX.current === null || dragStartY.current === null || swipeLockRef.current) return;
    
    if (isSettingsModalOpen || isStructureModalOpen || isTransposerOpen || isRecordModalOpen) return;

    const { x, y } = getClientPos(e);
    const deltaX = x - dragStartX.current;
    const deltaY = y - dragStartY.current;

    if (!isSwipingRef.current) {
      if (Math.abs(deltaX) > 15 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isSwipingRef.current = true;
      }
    }

    if (isSwipingRef.current) {
      let resistanceDelta = deltaX;
      const isFirstSong = currentTrackIndexRef.current === 0;
      const isLastSong = currentTrackIndexRef.current === tracksListRef.current.length - 1;
      
      if ((isFirstSong && deltaX > 0) || (isLastSong && deltaX < 0)) {
        resistanceDelta = deltaX * 0.25; 
      }
      setSwipeOffsetX(resistanceDelta);
    }
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setSwipeTransition(true); 

    if (isSwipingRef.current) {
      const deltaX = swipeOffsetX;
      const threshold = 75; 
      const currentIndex = currentTrackIndexRef.current;
      
      let didSwipe = false;
      if (deltaX > threshold && currentIndex > 0) {
        handleUserSelectTrackBadge(currentIndex - 1);
        didSwipe = true;
      } else if (deltaX < -threshold && currentIndex < tracksListRef.current.length - 1) {
        handleUserSelectTrackBadge(currentIndex + 1);
        didSwipe = true;
      }

      // ✅ SURGICAL FIX: Apply a 350ms lock to guarantee the CSS animation finishes cleanly
      if (didSwipe) {
        swipeLockRef.current = true;
        setTimeout(() => { swipeLockRef.current = false; }, 350);
      }
    }
    
    setSwipeOffsetX(0); // ✅ Guarantee offset reset
    isSwipingRef.current = false;
    dragStartX.current = null;
    dragStartY.current = null;
  };
  
  useEffect(() => {
    if (!activeSong?.id) {
      setAvailableSongSections([]);
      return;
    }
    const fetchAvailableSections = async () => {
      try {
        // ✅ SURGICAL FIX: Wrapped in try/catch to prevent aggressive Chrome Extensions
        // from throwing unhandled network exceptions and crashing the React sync thread!
        const { data, error } = await supabase
          .from("song_sections")
          .select("section_name")
          .eq("song_id", activeSong.id);
          
        if (!error && data) {
          // Extract names and remove any potential duplicates
          const uniqueNames = Array.from(new Set(data.map(s => s.section_name)));
          setAvailableSongSections(uniqueNames);
        }
      } catch (err) {
        console.warn("Supabase fetch intercepted or failed:", err);
      }
    };
    fetchAvailableSections();
  }, [activeSong?.id]);

  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingStructure, setIsSavingStructure] = useState(false);
const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  // ✅ SURGICAL ADDITION: Telemetry States
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [rehearsalHistory, setRehearsalHistory] = useState<any[]>([]);
  const isRecordingRef = useRef(false);
  const rehearsalHistoryRef = useRef<any[]>([]);
  const jumpReasonRef = useRef<"Auto Play" | "Quick Play" | "Queued">("Auto Play");

  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const zenOverlayRef = useRef<HTMLDivElement | null>(null);

  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [showSyncBack, setShowSyncBack] = useState<boolean>(false);

  const [playingTrackIndex, setPlayingTrackIndex] = useState<number>(0);
  const [queuedTrackIndex, setQueuedTrackIndex] = useState<number | null>(null);
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
  const lastBeatRef = useRef<number>(1);
  const animationFrameRef = useRef<number | null>(null);
  // const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const audioContextStartTimeRef = useRef<number | null>(null);
  const astTreeRef = useRef<CompiledSectionToken[]>([]);
  const mdSectionStartTimeRef = useRef<number | null>(null);

  const backdropProgressRef = useRef<HTMLDivElement | null>(null);
  const accentProgressBarRef = useRef<HTMLDivElement | null>(null);
  // const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const simplifiedProgressBarRef = useRef<HTMLDivElement | null>(null);

  // ✅ SURGICAL FIX: Independent memory arrays for every song in the carousel!
  const trackScrollRefs = useRef<React.MutableRefObject<HTMLDivElement | null>[]>([]);
  if (trackScrollRefs.current.length !== tracksList.length) {
    trackScrollRefs.current = tracksList.map((_, i) => trackScrollRefs.current[i] || { current: null });
  }

  const trackSectionRefs = useRef<React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>[]>([]);
  if (trackSectionRefs.current.length !== tracksList.length) {
    trackSectionRefs.current = tracksList.map((_, i) => trackSectionRefs.current[i] || { current: {} });
  }
  
  const metronomeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
 
  

  useEffect(() => { playingTrackIndexRef.current = playingTrackIndex; }, [playingTrackIndex]);
  useEffect(() => { queuedTrackIndexRef.current = queuedTrackIndex; }, [queuedTrackIndex]);
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
    // ✅ SURGICAL FIX: Removed `isPlayingFlow` so non-MDs jump to the section even when playback is paused!
    if (!showSyncBack) {
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
    const testVisualRef = { current: 1 };
    
    if (isTestingSync) {
      const startTime = performance.now();
      const tick = (timestamp: number) => {
        const elapsed = timestamp - startTime;
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
  }, [isTestingSync, audioLatencyOffsetMs]);

  useEffect(() => { if (!isSettingsModalOpen) setIsTestingSync(false); }, [isSettingsModalOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: isPlayingFlow }));
    return () => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: false })); };
  }, [isPlayingFlow]);

  // ✅ Keeps refs perfectly synced for the tracker hook
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { rehearsalHistoryRef.current = rehearsalHistory; }, [rehearsalHistory]);

  // ✅ SURGICAL ADDITION: Dedicated Postgres Listener for Telemetry
  useEffect(() => {
    if (!setlistId) return;
    
    const fetchTelemetry = async () => {
       const { data, error } = await supabase
        .from('setlists')
        .select('is_recording, is_paused, recording_accumulated_ms, recording_start_time, rehearsal_history')
        .eq('id', setlistId)
        .single();
       
       if (error) {
         console.error("🚨 Telemetry Fetch Error:", error.message);
         return;
       }

       if (data) {
          setIsRecording(data.is_recording || false);
          setIsPaused(data.is_paused || false);
          // ✅ SURGICAL FIX: Force int8 to be a Number so the timer math doesn't glitch
          setRecordingAccumulatedMs(Number(data.recording_accumulated_ms) || 0);
          setRecordingStartTime(data.recording_start_time);
          setRehearsalHistory(data.rehearsal_history || []);
       }
    }
    fetchTelemetry();

    const telemetryChannel = supabase.channel(`telemetry_${setlistId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'setlists', filter: `id=eq.${setlistId}` }, (payload) => {
        setIsRecording(payload.new.is_recording || false);
        setIsPaused(payload.new.is_paused || false);
        // ✅ SURGICAL FIX: Force int8 to be a Number
        setRecordingAccumulatedMs(Number(payload.new.recording_accumulated_ms) || 0);
        setRecordingStartTime(payload.new.recording_start_time);
        setRehearsalHistory(payload.new.rehearsal_history || []);
      }).subscribe();

    return () => { supabase.removeChannel(telemetryChannel); }
  }, [setlistId]);

  const updateMetronomeUI = (activeBeat: number, isPlaying: boolean, measureLength: number = 4) => {
    // 1. Standard UI Metronome
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

    // 2. ZEN MODE: Peripheral Soft Gradient Overlay
    if (isZenMode && zenOverlayRef.current && isPlaying) {
      const isDownbeat = activeBeat === 1; 
      // ✅ Use distinct hex colors for a softer overlay aesthetic
      const flashColor = isDownbeat ? 'rgba(250, 186, 55, 0.45)' : 'rgba(37, 99, 235, 0.25)'; 
      
      const overlay = zenOverlayRef.current;
      
      // ✅ Cancel active transitions to snap instantly to the solid color
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
      // ✅ Use a massive, feathered inset shadow to create a soft vignette gradient on top of the UI
      overlay.style.boxShadow = `inset 0 0 120px 20px ${flashColor}, inset 0 0 30px 10px ${flashColor}`;
      
      // Force the browser to reflow so the instant change registers
      void overlay.offsetWidth; 
      
      // ✅ Gradually fade the opacity out completely over 600ms
      overlay.style.transition = 'opacity 0.6s ease-out';
      overlay.style.opacity = '0';
    }
  };

  const beatMapRef = useRef<CompiledBeatMap>({ totalBeats: 0, nodes: [], sectionStartBeats: [] });

  // ✅ SURGICAL ADDITION: Track YT setting for late-joiner sync
  const isYoutubeSyncEnabledRef = useRef(isYoutubeSyncEnabled);
  useEffect(() => { isYoutubeSyncEnabledRef.current = isYoutubeSyncEnabled; }, [isYoutubeSyncEnabled]);

  // ✅ Core Supabase Transmitter
  const sendSupabaseBroadcast = (payload: any) => {
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload
      });
    }
  };

  // ✅ SURGICAL ADDITION: Synchronized YouTube Toggle wrapper
  const handleSetYoutubeSync = (val: boolean) => {
    setIsYoutubeSyncEnabled(val);
    if (localPresenceUserRef.current?.isMD) {
      sendSupabaseBroadcast({ action: "SYNC_YT_SETTING", value: val });
    }
  };

  // ✅ Core Receiver
  const handleSyncCommand = (payload: any) => {
    if (payload.action === "START") {
      const targetTrackIdx = payload.trackIndex !== undefined ? payload.trackIndex : currentTrackIndexRef.current;
      isPlayingRef.current = true; setIsPlayingFlow(true);
      isYtBackingTrackStartRef.current = payload.isYtSource || false;
      executeJumpNow(targetTrackIdx, payload.sectionIndex, payload.mdSectionStartTime, true);
    }
    else if (payload.action === "STOP") { executeLocalResetSequence(); } 
    else if (payload.action === "JUMP") {
      const jumpTime = payload.mdSectionStartTime || getGlobalTime();
      const timeUntilJump = jumpTime - getGlobalTime();
      if (isPlayingRef.current && timeUntilJump > 50) {
        pendingQuantizedJumpRef.current = { trackIndex: payload.trackIndex ?? currentTrackIndexRef.current, sectionIndex: payload.sectionIndex, jumpTime };
        setQueuedTrackIndex(payload.trackIndex ?? currentTrackIndexRef.current);
        setQueuedSectionIndex(payload.sectionIndex);
      } else {
        executeJumpNow(payload.trackIndex ?? currentTrackIndexRef.current, payload.sectionIndex, jumpTime);
      }
    }
    else if (payload.action === "TRACK_CHANGE") { mountTargetSetlistTrackIndex(payload.trackIndex); }
    else if (payload.action === "QUEUE") { setQueuedTrackIndex(payload.trackIndex); setQueuedSectionIndex(payload.sectionIndex); }
    else if (payload.action === "HEARTBEAT" && !localPresenceUserRef.current?.isMD) {
      if (mdSectionStartTimeRef.current !== null && isPlayingRef.current) {
        const { mdAbsoluteBeat, mdGlobalBeatTime, mdSectionIndex } = payload;
        if (mdSectionIndex === currentSectionIndexRef.current) {
          const beatSpeedMs = (60 / (activeSongRef.current?.tempo || 75)) * 1000;
          const sectionStartAbsoluteBeat = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0;
          const localBeatCount = mdAbsoluteBeat - sectionStartAbsoluteBeat;
          const mdImpliedStartMs = mdGlobalBeatTime - (localBeatCount * beatSpeedMs);
          const driftMs = mdSectionStartTimeRef.current - mdImpliedStartMs;
          if (Math.abs(driftMs) > 15) {
            mdSectionStartTimeRef.current = mdImpliedStartMs;
          }
        }
      }
    }
   else if (payload.action === "MD_TAKEOVER") {
      latestMdBroadcastRef.current = { mdId: payload.newMdId, timestamp: Date.now() };
      setOnlineUsers(prev => prev.map(u => ({ ...u, isMD: u.id === payload.newMdId })));

      if (localPresenceUserRef.current?.isMD && localPresenceUserRef.current.id !== payload.newMdId) {
        const downgradedPayload = { ...localPresenceUserRef.current, isMD: false, updatedAt: Date.now() };
        setLocalPresenceUser(downgradedPayload);
        localPresenceUserRef.current = downgradedPayload;
        if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(downgradedPayload);
        executeLocalResetSequence();
      } else if (localPresenceUserRef.current?.id === payload.newMdId && !localPresenceUserRef.current?.isMD) {
        // ✅ SURGICAL FIX: Explicitly upgrade the requester when the transfer is accepted!
        const upgradedPayload = { ...localPresenceUserRef.current, isMD: true, updatedAt: Date.now() };
        setLocalPresenceUser(upgradedPayload);
        localPresenceUserRef.current = upgradedPayload;
        if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(upgradedPayload);
      }
    }
    else if (payload.action === "MD_RELEASE") {
      latestMdBroadcastRef.current = { mdId: null, timestamp: Date.now() };
      setOnlineUsers(prev => prev.map(u => u.id === payload.releasedMdId ? { ...u, isMD: false } : u));
      executeLocalResetSequence(); 
    }
    // ✅ SURGICAL ADDITION: MD Transfer Request Listeners
    else if (payload.action === "MD_REQUEST") {
      if (localPresenceUserRef.current?.isMD) setMdRequest(payload.requester);
    }
    else if (payload.action === "MD_REQUEST_REJECTED") {
      if (localPresenceUserRef.current?.id === payload.requesterId) alert("The current Music Director declined your request.");
    }
    // ✅ SURGICAL ADDITION: Receive YouTube Setting Sync from MD
    else if (payload.action === "SYNC_YT_SETTING") {
      if (!localPresenceUserRef.current?.isMD) {
        setIsYoutubeSyncEnabled(payload.value);
      }
    }
    // ✅ SURGICAL FIX: Decentralized Chat History Auto-Sync
    else if (payload.action === "CHAT_SYNC_REQUEST") {
      // Allow ANYONE in the room with history to answer. This prevents failure if MD drops or desyncs!
      if (lobbyMessagesRef.current.length > 0) {
        const globalHistory = lobbyMessagesRef.current.filter(m => !m.targetUserId);
        sendSupabaseBroadcast({ action: "CHAT_SYNC_RESPONSE", requesterId: payload.requesterId, history: globalHistory });
      }
      // ✅ SURGICAL ADDITION: MD automatically syncs their YouTube setting to the late-joiner!
      if (localPresenceUserRef.current?.isMD) {
        sendSupabaseBroadcast({ action: "SYNC_YT_SETTING", value: isYoutubeSyncEnabledRef.current });
      }
    }
    else if (payload.action === "CHAT_SYNC_RESPONSE") {
      if (payload.requesterId === localPresenceUserRef.current?.id) {
        setLobbyMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          // ✅ Map incoming sync data to safely include seenBy arrays
          const newMsgs = payload.history
            .filter((m: any) => !existingIds.has(m.id))
            .map((m: any) => ({ ...m, seenBy: m.seenBy || [] }));
            
          if (newMsgs.length === 0) return prev; 
          return [...prev, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
        });
      }
    }
  };

  // ✅ SURGICAL ADDITION: MD Transfer Request Senders
  const handleRequestMusicDirector = () => {
    const currentMd = onlineUsers.find(u => u.isMD);
    if (currentMd) {
      sendSupabaseBroadcast({ action: "MD_REQUEST", requester: localPresenceUserRef.current });
      alert("Transfer request sent to " + currentMd.name);
    } else {
      handleToggleMusicDirectorMode();
    }
  };

  const handleAcceptMdRequest = (requesterId: string) => {
    const downgraded = { ...localPresenceUserRef.current, isMD: false, updatedAt: Date.now() };
    setLocalPresenceUser(downgraded);
    localPresenceUserRef.current = downgraded;
    if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(downgraded);
    executeLocalResetSequence();
    
    // ✅ SURGICAL FIX: Delay the broadcast slightly to ensure Supabase presence updates cleanly for all clients!
    setTimeout(() => {
      sendSupabaseBroadcast({ action: "MD_TAKEOVER", newMdId: requesterId });
    }, 150);
    setMdRequest(null);
  };

  function executeStartSequence(useCountdown: boolean, forcedStartTimestamp?: number, isYtSource: boolean = false) {
    isYtBackingTrackStartRef.current = isYtSource; 
    playingTrackIndexRef.current = currentTrackIndexRef.current;
    setPlayingTrackIndex(currentTrackIndexRef.current);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;
    isPlayingRef.current = true;
    setIsPlayingFlow(true);

    // ✅ SURGICAL FIX: Deterministic 5-Second Buffer
    // Completely neutralizes network latency by scheduling execution in the future
    const delayMs = 5000; 
    const startTimestamp = forcedStartTimestamp ?? (getGlobalTime() + delayMs);
    mdSectionStartTimeRef.current = startTimestamp;

    executeJumpNow(currentTrackIndexRef.current, currentSectionIndexRef.current, startTimestamp, true);

    sendSupabaseBroadcast({ 
      action: "START", 
      trackIndex: currentTrackIndexRef.current, 
      sectionIndex: currentSectionIndexRef.current, 
      mdSectionStartTime: startTimestamp, 
      isYtSource: isYtSource 
    });
  }

  const {
    youtubeVideoId, isYtBuffering, setIsYtBuffering,
    ytPlayerRef, isYtPlayerReadyRef, ytSyncPendingRef, isYtBufferingRef
  } = useYouTubeSync({
    activeSong, 
    activeSongRef, 
    beatMapRef, 
    currentSectionIndexRef,
    getGlobalTime, 
    youtubeVolumeRef, 
    isYoutubeSyncEnabled
  });

  useHardwareClock({
    isPlayingFlow, isPlayingRef, activeSongRef, playingSongRef, sectionsRef, playingSectionsRef,
    currentSectionIndexRef, setCurrentSectionIndex, beatMapRef, astTreeRef, mdSectionStartTimeRef,
    audioLatencyOffsetMs, isYtBackingTrackStartRef, countdownValueRef, setCountdownValue,
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
    sendSupabaseBroadcast, // (Note: In the solo page, this is `sendSupabaseBroadcast: () => {},`)
    updateMetronomeUI, activeLineIndexRef, setActiveLineIndex, 
    handleAdvanceToNextSetlistTrack: () => { handleResetFlowTrigger(); }, // (Note: In page_2.tsx this is just `handleAdvanceToNextSetlistTrack,`)
    sectionStartTimeRef, pauseOffsetMsRef, animationFrameRef, playingTrackIndexRef
  });

  // ✅ SURGICAL FIX: Restored Flawless Supabase Implementation
  useEffect(() => {
    if (!setlistId || !localPresenceUser?.connectionId) return; 
    isChannelSubscribedRef.current = false;
    
    const lobbyChannel = supabase.channel(`setlist_lobby_${setlistId}`, {
      config: { 
        // ✅ SURGICAL FIX: Prevent the server from echoing your own commands back to you!
        broadcast: { ack: false, self: false }, 
        presence: { key: localPresenceUser.connectionId } 
      }
    });

    lobbyChannel
      .on("presence", { event: "sync" }, () => {
        const presenceState = lobbyChannel.presenceState();
        let flatUsers = Object.values(presenceState).flat() as any[];

        // 🛡️ THE HIGHLANDER RULE & ANTI-BOUNCE SHIELD
        // 1. Sort by most recent update so the newest claimant wins any MD collision
        flatUsers.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        // ✅ SURGICAL FIX: Explicitly typed as 'any' to satisfy strict TypeScript rules
        let mdClaimant: any = null;
        flatUsers = flatUsers.map(u => {
            if (u.isMD && !mdClaimant) {
                mdClaimant = u;
                return u;
            } else if (u.isMD) {
                return { ...u, isMD: false }; // Force strip MD from older claimants
            }
            return u;
        });

        // 2. Apply explicit manual override if a takeover happened in the last 3 seconds
        const override = latestMdBroadcastRef.current;
        if (Date.now() - override.timestamp < 3000) {
           flatUsers = flatUsers.map(u => ({ ...u, isMD: override.mdId === u.id }));
           mdClaimant = flatUsers.find(u => u.isMD) || null;
        }

        // ✅ SURGICAL FIX: MD Disconnect Detector & Auto-Assign
        const currentMdId = mdClaimant ? mdClaimant.id : null;
        if (prevMdRef.current && !currentMdId) {
            // MD disconnected or relinquished without a successor!
            executeLocalResetSequence(); // Instantly stop playback globally
            
            // Auto-assign the next senior connection (alphabetical by ID as deterministic tie-breaker)
            if (flatUsers.length > 0) {
                const nextMD = [...flatUsers].sort((a, b) => a.id.localeCompare(b.id))[0];
                if (nextMD.id === localPresenceUserRef.current?.id) {
                    const upgraded = { ...localPresenceUserRef.current, isMD: true, updatedAt: Date.now() };
                    setLocalPresenceUser(upgraded);
                    localPresenceUserRef.current = upgraded;
                    if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(upgraded);
                    sendSupabaseBroadcast({ action: "MD_TAKEOVER", newMdId: upgraded.id });
                }
            }
        }
        prevMdRef.current = currentMdId;

        // ✅ SURGICAL FIX: Strict mapping removes ghost users when they drop the connection!
        const liveUserIds = new Set(Object.values(presenceState).flat().map((u: any) => u.id));
        setOnlineUsers(flatUsers.filter(u => liveUserIds.has(u.id)));

        // 3. If I locally think I'm MD, but the Highlander rule says someone else is, I must yield!
        if (localPresenceUserRef.current?.isMD && mdClaimant && mdClaimant.id !== localPresenceUserRef.current.id) {
            const downgradedPayload = { ...localPresenceUserRef.current, isMD: false, updatedAt: Date.now() };
            setLocalPresenceUser(downgradedPayload);
            localPresenceUserRef.current = downgradedPayload;
            if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(downgradedPayload);
            executeLocalResetSequence();
        }

        // 4. Ensure late-joiners get the start command if I'm currently playing
        if (isPlayingRef.current && localPresenceUserRef.current?.isMD && (!mdClaimant || mdClaimant.id === localPresenceUserRef.current.id)) {
          sendSupabaseBroadcast({ 
            action: "START", 
            trackIndex: currentTrackIndexRef.current, 
            sectionIndex: currentSectionIndexRef.current, 
            mdSectionStartTime: mdSectionStartTimeRef.current || Date.now(), 
            isYtSource: isYtBackingTrackStartRef.current 
          });
        }
      })
      .on("broadcast", { event: "lobby_sync" }, ({ payload }) => {
        handleSyncCommand(payload);
      })
      // ✅ SURGICAL ADDITION: Listen for ephemeral chat messages
      .on("broadcast", { event: "lobby_chat" }, ({ payload }) => {
        setLobbyMessages(prev => [...prev, { ...payload, seenBy: payload.seenBy || [] }].slice(-100));
        if (!isUserLobbyOpenRef.current) setUnreadMessageCount(prev => prev + 1);
      })
      // ✅ SURGICAL ADDITION: Listen for network read receipts
      .on("broadcast", { event: "lobby_chat_seen" }, ({ payload }) => {
        setLobbyMessages(prev => prev.map(msg => {
          // Remove this user's avatar from ALL older messages instantly
          const filteredSeenBy = (msg.seenBy || []).filter((u: any) => u.id !== payload.reader.id);
          
          // Pin their avatar to the specific message they just saw!
          if (msg.id === payload.messageId) {
            return { ...msg, seenBy: [...filteredSeenBy, payload.reader] };
          }
          return { ...msg, seenBy: filteredSeenBy };
        }));
      })
      // ✅ SURGICAL ADDITION: Listen for pings
      .on("broadcast", { event: "lobby_ping" }, ({ payload }) => {
        if (!payload.targetUserId || payload.targetUserId === localPresenceUserRef.current?.id) {
          // ✅ Passed the text payload into the alert state
          setPingAlert({ senderName: payload.senderName, isWhisper: !!payload.targetUserId, text: payload.text });
          // ✅ SURGICAL FIX: Removed setTimeout. The modal is now persistent until dismissed manually.
          
          // Force wake audio context to play a native notification beep if possible
          try {
             const ctx = getAudioContext();
             if (ctx && ctx.state === "running") {
               const osc = ctx.createOscillator();
               const gain = ctx.createGain();
               osc.connect(gain); gain.connect(ctx.destination);
               osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
               gain.gain.setValueAtTime(0.1, ctx.currentTime);
               gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
               osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
             }
          } catch(e) {}
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { 
          isChannelSubscribedRef.current = true; 
          lobbyChannel.track(localPresenceUserRef.current); 
          // ✅ SURGICAL FIX: Request global chat history automatically when joining
          // Increased buffer to 1200ms to guarantee WebSockets are fully established and tracking
          setTimeout(() => {
            if (realtimeChannelRef.current && localPresenceUserRef.current) {
               realtimeChannelRef.current.send({
                 type: "broadcast",
                 event: "lobby_sync",
                 payload: { action: "CHAT_SYNC_REQUEST", requesterId: localPresenceUserRef.current.id }
               });
            }
          }, 1200);
        }
      });

    realtimeChannelRef.current = lobbyChannel;
    return () => { if (lobbyChannel) supabase.removeChannel(lobbyChannel); };
  }, [setlistId, localPresenceUser?.connectionId]);

  function executeJumpNow(targetTrackIdx: number, targetSectionIdx: number, jumpTime: number, isInitialStart: boolean = false) {
    if (cancelFutureAudio) cancelFutureAudio(); // ✅ SURGICAL FIX: Kill all future ghost beats instantly
    
    if (targetTrackIdx !== undefined && targetTrackIdx !== playingTrackIndexRef.current) mountTargetSetlistTrackIndex(targetTrackIdx);
    
    playingTrackIndexRef.current = targetTrackIdx !== undefined ? targetTrackIdx : currentTrackIndexRef.current;
    setPlayingTrackIndex(playingTrackIndexRef.current);
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
        console.log(`🕒 [Clock Sync] Ctx State: ${audioCtx?.state} | StartTimeRef: ${audioContextStartTimeRef.current}`);
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
    
    if (localPresenceUserRef.current?.isMD && isRecordingRef.current && playingSectionsRef.current.length > 0) {
      const track = tracksListRef.current[targetTrackIdx];
      const section = playingSectionsRef.current[targetSectionIdx];
      if (track && section) {
          const newItem = {
              timestamp: Date.now(),
              title: track.songs?.title || "Unknown Song",
              label: `[${jumpReasonRef.current}] - ${section.section_name}`
          };
          const newHistory = [newItem, ...rehearsalHistoryRef.current].slice(0, 100);
          setRehearsalHistory(newHistory); 
          supabase.from('setlists').update({ rehearsal_history: newHistory }).eq('id', setlistId).then();
      }
    }
    jumpReasonRef.current = "Auto Play";

    currentSectionIndexRef.current = targetSectionIdx; setCurrentSectionIndex(targetSectionIdx);
    lastAudioBeatRef.current = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0; 
    lastBeatRef.current = 0; lastVisualBeatRef.current = 0;
    setQueuedTrackIndex(null); setQueuedSectionIndex(null); pendingQuantizedJumpRef.current = null;
    hasPlayedCueRef.current = false; 
    
    setShowSyncBack(false);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (isPlayingRef.current) {
      const apparentLatency = getGlobalTime() - jumpTime;
      sectionStartTimeRef.current = Math.abs(apparentLatency) < 2000 ? performance.now() - apparentLatency : performance.now();
    }
  }

  function executeLocalResetSequence() {
    if (cancelFutureAudio) cancelFutureAudio(); // ✅ SURGICAL FIX: Kill all future ghost beats instantly
    isPlayingRef.current = false; setIsPlayingFlow(false); hasPlayedCueRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
    currentSectionIndexRef.current = 0; lastBeatRef.current = 0; activeLineIndexRef.current = 0;
    setCurrentSectionIndex(0); updateMetronomeUI(1, false); setActiveLineIndex(0);
    setQueuedTrackIndex(null); setQueuedSectionIndex(null); setCurrentDriftMs(null);
    setShowSyncBack(false);
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (simplifiedProgressBarRef.current) simplifiedProgressBarRef.current.style.transform = "scaleX(0)";
  }

  function handleUserSelectTrackBadge(trackIdx: number) {
    mountTargetSetlistTrackIndex(trackIdx);
    if (!isPlayingFlow && localPresenceUser?.isMD) {
      sendSupabaseBroadcast({ action: "TRACK_CHANGE", trackIndex: trackIdx });
    }
  }

  function handleAdvanceToNextSetlistTrack() {
    jumpReasonRef.current = "Auto Play"; // ✅ Tag for the tracker
    const nextTrackIndex = playingTrackIndexRef.current + 1;
    if (nextTrackIndex < tracksListRef.current.length) {
      mountTargetSetlistTrackIndex(nextTrackIndex);
      
      setTimeout(() => { 
        isPlayingRef.current = true; 
        setIsPlayingFlow(true); 
        
        if (localPresenceUserRef.current?.isMD) {
          const jumpTime = getGlobalTime();
          mdSectionStartTimeRef.current = jumpTime;
          executeJumpNow(nextTrackIndex, 0, jumpTime, true);
          sendSupabaseBroadcast({ action: "START", trackIndex: nextTrackIndex, sectionIndex: 0, mdSectionStartTime: jumpTime, isYtSource: false });
        }
      }, 120);
    } else {
      handleResetFlowTrigger();
    }
  }

  function handleToggleFlowPlaybackState() {
    if (!localPresenceUser?.isMD) { setIsMdLockModalOpen(true); return; }
    if (isPlayingFlow) {
      if (playClickTimeoutRef.current) { clearTimeout(playClickTimeoutRef.current); playClickTimeoutRef.current = null; }
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
      handleResetFlowTrigger();
    } else {
      if (sections.length === 0 || !activeSong) return;

      if (playClickTimeoutRef.current) {
        clearTimeout(playClickTimeoutRef.current); playClickTimeoutRef.current = null;
        executeStartSequence(true, undefined, isYoutubeSyncEnabled && !!youtubeVideoId); 
      } else {
        playClickTimeoutRef.current = setTimeout(() => {
          playClickTimeoutRef.current = null;
          executeStartSequence(true, undefined, isYoutubeSyncEnabled && !!youtubeVideoId);
        }, 250);
      }
    }
  }

  function handleResetFlowTrigger() {
    executeLocalResetSequence();
    if (localPresenceUser?.isMD) sendSupabaseBroadcast({ action: "STOP" });
  }

  function handleSectionInteractiveSelection(index: number) {
    if (!localPresenceUser?.isMD && (onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id) !== undefined)) return; 
    
    jumpReasonRef.current = isPlayingFlow ? "Queued" : "Quick Play"; 

    if (!isPlayingFlow) {
      const jumpTime = getGlobalTime() + 150; executeJumpNow(currentTrackIndex, index, jumpTime);
      sendSupabaseBroadcast({ action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: index, mdSectionStartTime: jumpTime });
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null;
      setQueuedTrackIndex(currentTrackIndex); setQueuedSectionIndex(index); pendingQuantizedJumpRef.current = null;
      sendSupabaseBroadcast({ action: "QUEUE", trackIndex: currentTrackIndex, sectionIndex: index });
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        let jumpTime = getGlobalTime() + 150;
        if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
          const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000; 
          jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
          pendingQuantizedJumpRef.current = { trackIndex: currentTrackIndex, sectionIndex: index, jumpTime };
          setQueuedTrackIndex(currentTrackIndex); setQueuedSectionIndex(index);
        } else { executeJumpNow(currentTrackIndex, index, jumpTime); }
        sendSupabaseBroadcast({ action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: index, mdSectionStartTime: jumpTime });
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

  useEffect(() => { astTreeRef.current = memoizedSongAstTree; }, [memoizedSongAstTree]);

  // ✅ SURGICAL ADDITION: Math Engine for the Chapters Modal
  const songSegments = useMemo(() => {
    const segments: SongSegment[] = [];
    if (!activeSong || sections.length === 0) return segments;
    
    const offsetSec = (activeSong.youtube_sync_offset_ms || 0) / 1000;
    const tempo = activeSong.tempo || 120;
    const secPerBeat = 60 / tempo;
    
    let currentStartTime = offsetSec;
    
    sections.forEach((sec, idx) => {
      let rawTimings = activeSong?.section_timings?.[sec.section_name];
      if (typeof rawTimings === 'string') { try { rawTimings = JSON.parse(rawTimings); } catch(e){} }
      const timings = rawTimings || {};
      
      const beatsPerMeasure = 4; // Standardized for live
      const sectionMultiplier = (Number(timings.repeats) || 0) + 1;
      const basePassBeats = ((Number(timings.measures) || 4) * beatsPerMeasure) + (Number(timings.beats) || 0);
      const totalCoreBeats = basePassBeats * sectionMultiplier;
      const headBeats = (Number(timings.head_m) || 0) * beatsPerMeasure;
      const tailBeats = (Number(timings.tail_m) || 0) * beatsPerMeasure;
      
      let totalBeats = totalCoreBeats + headBeats + tailBeats;
      if (totalBeats <= 0) totalBeats = 16; 
      
      const durationSec = totalBeats * secPerBeat;
      segments.push({ 
        label: sec.section_name, 
        start: currentStartTime, 
        end: currentStartTime + durationSec, 
        duration: durationSec, 
        color: getSectionColor(sec.section_name),
        sectionIndex: idx
      });
      currentStartTime += durationSec;
    });
    
    return segments;
  }, [activeSong, sections]);
  // =========================================================================
  // ✅ SURGICAL ADDITION: PHASE 1 - THE MASTER SETLIST PARSING ENGINE
  // =========================================================================
  const memoizedSetlistAst = useMemo(() => {
    if (!tracksList || tracksList.length === 0) return [];
    
    return tracksList.map((track, trackIndex) => {
      const song = track.songs;
      if (!song) return { trackIndex, trackId: track.id, title: "Unknown", displayKey: "C", ast: [] };

      // 1. Calculate the specific key transposition for THIS specific track
      const displayKey = track.custom_key || song.original_key || "C";
      const originalKey = song.original_key || "C";
      const isMinor = originalKey.endsWith("m");
      
      const oldIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(isMinor ? originalKey.slice(0, -1) : originalKey));
      const newIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(isMinor ? displayKey.slice(0, -1) : displayKey));
      let delta = 0;
      if (oldIdx !== -1 && newIdx !== -1) delta = (newIdx - oldIdx + 12) % 12;

      const trackSections = track.custom_structure || [];

      // 2. Parse every section in this track
      const ast = trackSections.map((section): CompiledSectionToken => {
        const rawText = section.content || "";
        if (!rawText.trim()) return { id: section.id, section_name: section.section_name, lines: [] };
        
        const linesArray = rawText.split("\n").map((line): ParsedLineToken => {
          let commentText = "";
          const cleanLineText = line.replace(/\{([^\}]+)\}/g, (_, p1) => { commentText = p1.trim(); return ""; });
          const wordsMatch = cleanLineText.match(/(?:\[[^\]]+\]|\S)+/g) || [];
          
          const wordsTokens = wordsMatch.map((chunk): ParsedWordToken => {
            const chordRegex = /\[([^\]]+)\]/g; 
            const chordsList: string[] = []; 
            let match;
            while ((match = chordRegex.exec(chunk)) !== null) {
              chordsList.push(delta !== 0 ? transposeBracketContent(match[1], delta) : match[1]);
            }
            return { chords: chordsList, word: chunk.replace(/\[[^\]]+\]/g, "") };
          });
          return { words: wordsTokens, comment: commentText };
        });
        return { id: section.id, section_name: section.section_name, lines: linesArray };
      });

      // 3. Return the fully compiled song packet
      return { 
        trackIndex, 
        trackId: track.id, 
        title: song.title, 
        originalKey: song.original_key,
        displayKey, 
        tempo: song.tempo,
        ast 
      };
    });
  }, [tracksList]);

  beatMapRef.current = useMemo(() => {
    const map: BeatNode[] = []; const sectionStartBeats: number[] = []; let currentAbsoluteBeat = 0;
    if (!activeSong || sections.length === 0) return { totalBeats: 0, nodes: [], sectionStartBeats: [] };

    sections.forEach((section, sIdx) => {
      sectionStartBeats.push(currentAbsoluteBeat);
      
      let rawTimings = activeSong?.section_timings?.[section.section_name];
      if (typeof rawTimings === 'string') { try { rawTimings = JSON.parse(rawTimings); } catch(e){} }
      const timings = rawTimings || {};

      const sectionMultiplier = (Number(timings.repeats) || 0) + 1;
      const headBeats = (Number(timings.head_m) || 0) * 4;
      const tailBeats = (Number(timings.tail_m) || 0) * 4;
      
      // ✅ THE ABSOLUTE TRUTH: The master settings dictate the exact loop length
      const baseLoopBeats = ((Number(timings.measures) || 4) * 4) + (Number(timings.beats) || 0);
      
      const parsedLinesCount = memoizedSongAstTree[sIdx]?.lines.length || 1;
      let hasLineOverrides = false; 
      const lineBeatsMap: number[] = [];
      
      let lineTimingsObj = timings.line_timings;
      if (typeof lineTimingsObj === 'string') { try { lineTimingsObj = JSON.parse(lineTimingsObj); } catch(e){} }

      if (lineTimingsObj && Object.keys(lineTimingsObj).length > 0) {
        hasLineOverrides = true;
        for (let i = 0; i < parsedLinesCount; i++) {
          const t = lineTimingsObj[String(i)];
          if (t) {
            const lineMult = (Number(t.repeats) || 0) + 1; 
            const lineBeats = ((Number(t.measures) * 4) + (Number(t.beats) || 0)) * lineMult;
            lineBeatsMap.push(lineBeats); 
          } else {
            lineBeatsMap.push(0); // Safe fallback for Ghost Data
          }
        }
      }

      const stampBeats = (totalBeatsToStamp: number) => {
          let remaining = totalBeatsToStamp;
          while (remaining > 0) { 
            const mLen = remaining >= 4 ? 4 : remaining; 
            for (let b = 1; b <= mLen; b++) { 
              map.push({ absoluteBeatIndex: currentAbsoluteBeat, measureBeatIndex: b, measureLength: mLen, sectionIndex: sIdx, isDownbeat: b === 1 }); 
              currentAbsoluteBeat++; 
            }
            remaining -= mLen; 
          }
      };

      stampBeats(headBeats);
      for (let r = 0; r < sectionMultiplier; r++) { 
        let beatsStamped = 0;
        if (hasLineOverrides) { 
           lineBeatsMap.forEach(b => {
              if (b > 0) { stampBeats(b); beatsStamped += b; }
           }); 
        } 
        
        // ✅ SURGICAL FIX: The Auto-Padder!
        // If the line timings are broken or missing, automatically pad the remaining beats 
        // to match the Master M setting. This guarantees the clock NEVER shrinks and crashes!
        const missingBeats = baseLoopBeats - beatsStamped;
        if (missingBeats > 0) {
           stampBeats(missingBeats);
        }
      }
      stampBeats(tailBeats);
    });

    return { totalBeats: currentAbsoluteBeat, nodes: map, sectionStartBeats };
  }, [activeSong, sections, memoizedSongAstTree]);
  useEffect(() => { astTreeRef.current = memoizedSongAstTree; }, [memoizedSongAstTree]);

  const displayedOnlineUsers = useMemo(() => {
    const usersMap = new Map();
    onlineUsers.forEach((user) => { if (user.id) usersMap.set(user.id, user); });
    if (localPresenceUser) usersMap.set(localPresenceUser.id, localPresenceUser);
    return Array.from(usersMap.values());
  }, [onlineUsers, localPresenceUser]);

  const getSectionDurationString = (sectionName: string, sectionIdx?: number) => {
    let rawTimings = activeSong?.section_timings?.[sectionName];
    if (typeof rawTimings === 'string') { try { rawTimings = JSON.parse(rawTimings); } catch(e){} }
    const timings = rawTimings || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
    
    // ✅ Strictly enforce the Master Repeat & Measure settings
    const sectionMultiplier = (Number(timings.repeats) || 0) + 1; 
    const basePassBeats = ((Number(timings.measures) || 4) * 4) + (Number(timings.beats) || 0);
    
    const totalCoreBeats = basePassBeats * sectionMultiplier;
    const headBeats = (Number(timings.head_m) || 0) * 4;
    const tailBeats = (Number(timings.tail_m) || 0) * 4;
    
    let totalBeats = totalCoreBeats + headBeats + tailBeats;
    if (totalBeats <= 0) totalBeats = 16; 
    
    const tempo = Number(activeSong?.tempo) || 75;
    const totalSeconds = Math.round((totalBeats * (60000 / tempo)) / 1000);
    
    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  if (loading) return <GlobalLoader message="LOADING SETLIST..." />;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      
      {/* ========================================================================= */}
      {/* ✅ HEADER: Outside the swipe canvas so it remains perfectly fixed */}
      {/* ========================================================================= */}
      {!isZenMode && (
        <LiveHeader 
          activeSong={activeSong} activeDisplayKey={activeDisplayKey} currentDriftMs={currentDriftMs}
          localPresenceUser={localPresenceUser} isPlayingFlow={isPlayingFlow} currentBeat={currentBeat}
          currentMeasureLength={currentMeasureLength} metronomeRefs={metronomeRefs} setIsSettingsModalOpen={setIsSettingsModalOpen}
          handleToggleFlowPlaybackState={handleToggleFlowPlaybackState} displayedOnlineUsers={displayedOnlineUsers}
          tracksList={tracksList} currentTrackIndex={currentTrackIndex} handleUserSelectTrackBadge={handleUserSelectTrackBadge}
          backdropProgressRef={backdropProgressRef} accentProgressBarRef={accentProgressBarRef}
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
          scrollContainerRef={trackScrollRefs.current[currentTrackIndex]} 
          setIsUserLobbyOpen={setIsUserLobbyOpen} 
          unreadMessageCount={totalUnreadCount} 
          setIsChaptersModalOpen={setIsChaptersModalOpen} // ✅ Add prop to trigger modal
        />
      )}

      {/* ========================================================================= */}
      {/* ✅ HORIZONTAL CAROUSEL CANVAS */}
      {/* ========================================================================= */}
      <div 
        className="flex-1 flex flex-row w-full h-full relative"
        style={{ 
          transform: `translateX(calc(${-currentTrackIndex * 100}% + ${swipeOffsetX}px))`, 
          transition: swipeTransition ? 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y' 
        }}
        // ✅ Native Mouse Events
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        // ✅ Native Touch Events (Guaranteed to work on iOS/Android)
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onTouchCancel={handleDragEnd}
      >
        {memoizedSetlistAst.map((trackAst, idx) => {
          const isActive = idx === currentTrackIndex;
          
          const localScrollRef = trackScrollRefs.current[idx];
          const localSectionRefs = trackSectionRefs.current[idx];

          return (
            // 2. ✅ SURGICAL FIX: Added `flex flex-col` so the inner scroll container knows how to shrink!
            <div key={trackAst.trackId} className="w-full h-full shrink-0 relative flex flex-col">
              
              {isSimplifiedMode ? (
                <SimplifiedStackView
                  setlistAst={memoizedSetlistAst}
                  memoizedSongAstTree={isActive ? memoizedSongAstTree : trackAst.ast} 
                  currentSectionIndex={isActive ? currentSectionIndex : 0} 
                  queuedSectionIndex={isActive ? queuedSectionIndex : null}
                  queuedTrackIndex={isActive ? queuedTrackIndex : null} 
                  currentTrackIndex={idx} 
                  activeLineIndex={isActive ? activeLineIndex : 0}
                  chordFormat={chordFormat} 
                  activeDisplayKey={isActive ? activeDisplayKey : trackAst.displayKey} 
                  getSectionDurationString={getSectionDurationString}
                  simplifiedProgressBarRef={isActive ? simplifiedProgressBarRef : { current: null }} 
                  upcomingTrackItem={tracksList[idx + 1] || null}
                  handleSectionInteractiveSelection={handleSectionInteractiveSelection}
                  handleUserSelectTrackBadge={handleUserSelectTrackBadge}
                  showChords={showChords} lyricsFontSize={lyricsFontSize} lineSpacing={lineSpacing}
                />
             ) : (
                <StandardSheetView 
                  memoizedSongAstTree={isActive ? memoizedSongAstTree : trackAst.ast} 
                  isPlayingFlow={isActive ? isPlayingFlow : false} 
                  playingTrackIndex={playingTrackIndex}
                  currentTrackIndex={idx} 
                  currentSectionIndex={isActive ? currentSectionIndex : 0} 
                  queuedTrackIndex={isActive ? queuedTrackIndex : null}
                  queuedSectionIndex={isActive ? queuedSectionIndex : null} 
                  getSectionDurationString={getSectionDurationString} 
                  handleSectionInteractiveSelection={handleSectionInteractiveSelection}
                  activeLineIndex={isActive ? activeLineIndex : 0} 
                  showChords={showChords} lyricsFontSize={lyricsFontSize}
                  lineSpacing={lineSpacing} chordFormat={chordFormat} 
                  activeDisplayKey={isActive ? activeDisplayKey : trackAst.displayKey} 
                  upcomingTrackItem={tracksList[idx + 1] || null}
                  handleUserSelectTrackBadge={handleUserSelectTrackBadge} 
                  isAutoScrollingRef={isActive ? isAutoScrollingRef : { current: false }} 
                  setShowSyncBack={isActive ? setShowSyncBack : () => {}} 
                  // ✅ Feed the independent refs in
                  sectionRefs={localSectionRefs} 
                  scrollContainerRef={localScrollRef}
                />
              )}

              {/* The Scrubber slides in and out attached to the active song */}
              {isActive && !isZenMode && (
                <ScrubberOverlay 
                  sections={sections} currentSectionIndex={currentSectionIndex} queuedTrackIndex={queuedTrackIndex} currentTrackIndex={currentTrackIndex}
                  queuedSectionIndex={queuedSectionIndex} isPlayingFlow={isPlayingFlow} isAutoScrollingRef={isAutoScrollingRef} setShowSyncBack={setShowSyncBack}
                  isSimplifiedMode={isSimplifiedMode} tracksList={tracksList} handleUserSelectTrackBadge={handleUserSelectTrackBadge}
                  // ✅ Feed the independent refs in
                  sectionRefs={localSectionRefs} 
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* ✅ OVERLAYS & MODALS: Locked rigidly to the viewport */}
      {/* ========================================================================= */}
      {isZenMode && (
         <>
           <div 
             ref={zenOverlayRef} 
             className="fixed inset-0 pointer-events-none z-[400000] opacity-0"
           />
           <ZenMovableFAB 
             isMD={localPresenceUser?.isMD} 
             isPlayingFlow={isPlayingFlow} 
             onTogglePlay={handleToggleFlowPlaybackState} 
             onOpenSettings={() => setIsSettingsModalOpen(true)}
             onExitZen={() => setIsZenMode(false)}
           />
         </>
      )}

      <SettingsModal
        isSettingsModalOpen={isSettingsModalOpen} setIsSettingsModalOpen={setIsSettingsModalOpen} localPresenceUser={localPresenceUser} onlineUsers={onlineUsers} handleToggleMusicDirectorMode={handleToggleMusicDirectorMode}
        showChords={showChords} setShowChords={setShowChords} chordFormat={chordFormat} setChordFormat={setChordFormat} isSimplifiedMode={isSimplifiedMode} setIsSimplifiedMode={setIsSimplifiedMode}
        isZenMode={isZenMode} setIsZenMode={setIsZenMode}
        metronomeSoundType={metronomeSoundType} 
        setMetronomeSoundType={setMetronomeSoundType}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing} lyricsFontSize={lyricsFontSize} setLyricsFontSize={setLyricsFontSize}
        isMetronomeSoundEnabled={isMetronomeSoundEnabled} setIsMetronomeSoundEnabled={setIsMetronomeSoundEnabled} isDoubleMetronomeEnabled={isDoubleMetronomeEnabled} setIsDoubleMetronomeEnabled={setIsDoubleMetronomeEnabled}
        localClickVolume={localClickVolume} setLocalClickVolume={setLocalClickVolume} audioLatencyOffsetMs={audioLatencyOffsetMs} setAudioLatencyOffsetMs={setAudioLatencyOffsetMs}
        isTestingSync={isTestingSync} setIsTestingSync={setIsTestingSync} testVisualBeat={testVisualBeat} activeSong={activeSong}
        isYoutubeSyncEnabled={isYoutubeSyncEnabled} 
        setIsYoutubeSyncEnabled={handleSetYoutubeSync} // ✅ Pass the syncing wrapper
        youtubeVolume={youtubeVolume} setYoutubeVolume={setYoutubeVolume}
        canEditSong={canEditSong}
        isRecording={isRecording} setIsRecordModalOpen={setIsRecordModalOpen} 
        recordingStartTime={recordingStartTime}
        isPaused={isPaused} recordingAccumulatedMs={recordingAccumulatedMs} 
        isPlayingFlow={isPlayingFlow} router={router} handleOpenTransposerModal={() => setIsTransposerOpen(true)} setIsStructureModalOpen={setIsStructureModalOpen}
      />

      <StructureEditorModal 
        isStructureModalOpen={isStructureModalOpen} setIsStructureModalOpen={setIsStructureModalOpen} isSavingStructure={isSavingStructure} sections={sections}
        draggedSectionIndex={draggedSectionIndex} setDraggedSectionIndex={setDraggedSectionIndex} dragOverIndex={dragOverIndex} setDragOverIndex={setDragOverIndex}
        handleModalSectionDrop={(idx) => {
          if (draggedSectionIndex === null || draggedSectionIndex === idx || !activeSong) return;
          const workingBlocks = [...sections]; workingBlocks.splice(idx, 0, workingBlocks.splice(draggedSectionIndex, 1)[0]);
          setSections(workingBlocks); setDragOverIndex(null); setDraggedSectionIndex(null);
          setIsSavingStructure(true); supabase.from("setlist_songs").update({ custom_structure: workingBlocks as any }).eq("id", tracksList[currentTrackIndex]?.id).then(() => { setTracksList(prev => prev.map((t, i) => i === currentTrackIndex ? { ...t, custom_structure: workingBlocks } : t)); setIsSavingStructure(false); handleResetFlowTrigger(); });
        }}
        handleModalSectionRemoveItem={(idx) => {
          if (!activeSong || sections.length <= 1) return;
          const workingBlocks = sections.filter((_, i) => i !== idx); setSections(workingBlocks);
          setIsSavingStructure(true); supabase.from("setlist_songs").update({ custom_structure: workingBlocks as any }).eq("id", tracksList[currentTrackIndex]?.id).then(() => { setTracksList(prev => prev.map((t, i) => i === currentTrackIndex ? { ...t, custom_structure: workingBlocks } : t)); setIsSavingStructure(false); handleResetFlowTrigger(); });
        }}
        setIsAddBlockModalOpen={setIsAddBlockModalOpen}
      />

      <AddBlockModal 
        isAddBlockModalOpen={isAddBlockModalOpen} 
        setIsAddBlockModalOpen={setIsAddBlockModalOpen} 
        availableSectionNames={availableSongSections}
        handleModalAppendNewSectionItem={async (name) => {
          if (!activeSong) return;
          let sectionContent = sections.find(s => s.section_name === name)?.content;
          if (!sectionContent || sectionContent.trim() === "") { const { data } = await supabase.from("song_sections").select("content").eq("song_id", activeSong.id).eq("section_name", name).maybeSingle(); if (data?.content) sectionContent = data.content; }
          const workingBlocks = [...sections, { id: `local-${Date.now()}`, section_name: name, content: sectionContent || " " }];
          setSections(workingBlocks); setIsSavingStructure(true); supabase.from("setlist_songs").update({ custom_structure: workingBlocks as any }).eq("id", tracksList[currentTrackIndex]?.id).then(() => { setTracksList(prev => prev.map((t, i) => i === currentTrackIndex ? { ...t, custom_structure: workingBlocks } : t)); setIsSavingStructure(false); handleResetFlowTrigger(); });
        }}
      />

      <TransposerModal 
        isTransposerOpen={isTransposerOpen} setIsTransposerOpen={setIsTransposerOpen} activeSong={activeSong}
        modalRoot={modalRoot} setModalRoot={setModalRoot} modalAccidental={modalAccidental as ""|"#"|"b"} setModalAccidental={setModalAccidental}
        handleCommitTranspositionSave={async (e) => {
          e.preventDefault(); 
          if (!activeSong) return;
          
          const formatted = `${modalRoot}${modalAccidental}${activeSong.original_key.endsWith("m") ? "m" : ""}`;
          
          // 1. Instantly update the local React State
          setActiveDisplayKey(formatted); 
          setIsTransposerOpen(false);
          setTracksList(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, custom_key: formatted } : t)); 
          handleResetFlowTrigger();
          
          // 2. ✅ SURGICAL FIX: Find the junction row using match()
          // activeSong.id is the UUID from the `songs` table.
          if (activeSong.id && setlistId) {
            
            // Note: If a user adds the exact same song twice to the same setlist block,
            // this will transpose BOTH of them. This is usually the desired behavior.
            const { error } = await supabase
              .from("setlist_songs")
              .update({ custom_key: formatted })
              .match({ 
                setlist_id: setlistId, 
                song_id: activeSong.id 
              });
              
            if (error) {
              console.error("Failed to save transposition:", error.message);
              alert("Could not save the key change permanently to the database.");
            }
          }
        }}
      />

      <RecordRehearsalModal 
        isRecordModalOpen={isRecordModalOpen} setIsRecordModalOpen={setIsRecordModalOpen} isMD={localPresenceUser?.isMD} isRecording={isRecording}
        isPaused={isPaused} recordingStartTime={recordingStartTime} recordingAccumulatedMs={recordingAccumulatedMs} history={rehearsalHistory}
        onStartRecording={async () => {
          if (!localPresenceUser?.isMD) return;
          const now = Date.now(); setIsRecording(true); setIsPaused(false); setRecordingStartTime(now);
          const isFreshStart = !isPaused && recordingAccumulatedMs === 0;
          let updatedHistory = rehearsalHistoryRef.current;
          if (isFreshStart) { updatedHistory = [{ timestamp: now, title: "🎙️ New Recording Session", label: "Session Initiated" }, ...rehearsalHistoryRef.current].slice(0, 100);
          } else { updatedHistory = [{ timestamp: now, title: "▶️ Session Resumed", label: "Timer continued" }, ...rehearsalHistoryRef.current].slice(0, 100); }
          setRehearsalHistory(updatedHistory);
          await supabase.from('setlists').update({ is_recording: true, is_paused: false, recording_start_time: now, rehearsal_history: updatedHistory, ...(isFreshStart ? { recording_accumulated_ms: 0 } : {}) }).eq('id', setlistId).then();
        }}
        onPauseRecording={async () => {
          if (!localPresenceUser?.isMD || !recordingStartTime) return;
          const now = Date.now(); const newAccumulated = recordingAccumulatedMs + (now - recordingStartTime);
          setIsPaused(true); setRecordingAccumulatedMs(newAccumulated);
          const updatedHistory = [{ timestamp: now, title: "⏸️ Session Paused", label: "Timer halted" }, ...rehearsalHistoryRef.current].slice(0, 100);
          setRehearsalHistory(updatedHistory);
          await supabase.from('setlists').update({ is_paused: true, recording_accumulated_ms: newAccumulated, rehearsal_history: updatedHistory }).eq('id', setlistId).then();
        }}
        onStopRecording={async () => {
          if (!localPresenceUser?.isMD) return;
          const now = Date.now(); setIsRecording(false); setIsPaused(false); setRecordingAccumulatedMs(0);
          const updatedHistory = [{ timestamp: now, title: "⏹️ Session Ended", label: "Recording finalized" }, ...rehearsalHistoryRef.current].slice(0, 100);
          setRehearsalHistory(updatedHistory);
          await supabase.from('setlists').update({ is_recording: false, is_paused: false, recording_start_time: null, recording_accumulated_ms: 0, rehearsal_history: updatedHistory }).eq('id', setlistId).then();
        }}
      />

      <MdLockModal 
        isMdLockModalOpen={isMdLockModalOpen} setIsMdLockModalOpen={setIsMdLockModalOpen} 
        activeMDConnection={onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id)} 
        handleToggleMusicDirectorMode={handleToggleMusicDirectorMode} 
        handleRequestMusicDirector={handleRequestMusicDirector} // ✅ Pass the request func
      />

      {/* ✅ SURGICAL ADDITION: MD Transfer Prompt for the current MD */}
      {mdRequest && (
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[400000] flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-[1rem] p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mt-2 mb-2 shadow-inner">
                <span className="material-symbols-outlined text-[32px]">swap_horiz</span>
              </div>
              <h3 className="text-xl font-black text-zinc-900 tracking-tight">MD Transfer Request</h3>
              <p className="text-sm font-bold text-zinc-500"><strong>{mdRequest.name}</strong> wants to take over as Music Director.</p>
              <div className="flex gap-3 pt-4">
                 <button onClick={() => { sendSupabaseBroadcast({ action: "MD_REQUEST_REJECTED", requesterId: mdRequest.id }); setMdRequest(null); }} className="flex-1 py-3.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-black text-xs uppercase tracking-widest transition-colors cursor-pointer">Decline</button>
                 <button onClick={() => handleAcceptMdRequest(mdRequest.id)} className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest shadow-md transition-colors cursor-pointer">Transfer</button>
              </div>
           </div>
         </div>
      )}

      {/* ✅ SURGICAL FIX: Persistent Ping Alert Modal (Blue Signature Theme) */}
      {pingAlert && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-[400000] flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <div className="bg-white rounded-[1rem] p-6 md:p-8 max-w-sm w-full text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-100 relative border-t-4 border-blue-600">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mt-1 mb-2 shadow-inner border border-blue-100">
              <span className="material-symbols-outlined text-[28px] animate-bounce">notifications_active</span>
            </div>
            
            <div className="space-y-1">
              <h3 className="text-[18px] font-black text-zinc-900 tracking-tight">Team Alert</h3>
              <p className="text-xs font-bold text-zinc-500">
                <strong>{pingAlert.senderName}</strong> pinged {pingAlert.isWhisper ? "you privately" : "the team"}.
              </p>
            </div>

            {/* ✅ SURGICAL FIX: Prominent Message Display Block (Solid Blue) */}
            <div className="bg-blue-600 border border-blue-500 rounded-2xl p-4 shadow-sm text-left">
              <p className="text-[14px] font-bold text-white leading-snug break-words">
                {pingAlert.text}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button 
                type="button" 
                onClick={() => setPingAlert(null)} 
                className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-widest rounded-xl text-center shadow-md cursor-pointer transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ SURGICAL ADDITION: In-Video Chapters Modal for the Live Page */}
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
                  const isQueued = queuedSectionIndex === seg.sectionIndex; // ✅ Track Queue State
                  const isMD = localPresenceUser?.isMD;
                  
                  return (
                    <div 
                      key={`chap-${idx}`}
                      className={`group flex items-center justify-between p-3 rounded-xl transition-colors border ${isActive ? 'bg-primary/10 border-primary/30' : isQueued ? 'bg-purple-500/10 border-purple-500/30' : 'bg-surface-container border-transparent hover:bg-surface-container-high'}`}
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                           <span className={`font-bold text-[14px] truncate ${isActive ? 'text-primary' : isQueued ? 'text-purple-400' : 'text-on-surface'}`}>{seg.label}</span>
                           {isQueued && <span className="text-[8px] font-black bg-[#9333ea] text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm border border-[#7e22ce]">⚡ QUEUED</span>}
                        </div>
                        <span className="font-mono text-[11px] text-on-surface-variant tracking-widest mt-0.5">{formatTime(seg.start)}</span>
                      </div>
  
                      {isMD && !isActive ? (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* ✅ SURGICAL ADDITION: Explicit Queue Button */}
                          {!isQueued && (
                            <button 
                              onClick={(e) => {
                                  e.stopPropagation(); // ✅ Prevents modal closure
                                  setQueuedTrackIndex(currentTrackIndex); 
                                  setQueuedSectionIndex(seg.sectionIndex); 
                                  pendingQuantizedJumpRef.current = null;
                                  sendSupabaseBroadcast({ action: "QUEUE", trackIndex: currentTrackIndex, sectionIndex: seg.sectionIndex });
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-highest text-on-surface-variant hover:text-white hover:bg-[#9333ea] transition-colors border border-outline-variant/30"
                              title="Queue Next"
                            >
                              <span className="material-symbols-outlined text-[16px]">queue_music</span>
                            </button>
                          )}

                          {/* ✅ SURGICAL ADDITION: Explicit Play Now Button */}
                          <button 
                            onClick={(e) => {
                                e.stopPropagation(); // ✅ Prevents modal closure
                                jumpReasonRef.current = isPlayingFlow ? "Queued" : "Quick Play"; 
                                if (!isPlayingFlow) {
                                  const jumpTime = getGlobalTime() + 150; 
                                  executeJumpNow(currentTrackIndex, seg.sectionIndex, jumpTime);
                                  sendSupabaseBroadcast({ action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: seg.sectionIndex, mdSectionStartTime: jumpTime });
                                } else {
                                  let jumpTime = getGlobalTime() + 150;
                                  if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
                                    const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000; 
                                    jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
                                    pendingQuantizedJumpRef.current = { trackIndex: currentTrackIndex, sectionIndex: seg.sectionIndex, jumpTime };
                                    setQueuedTrackIndex(currentTrackIndex); setQueuedSectionIndex(seg.sectionIndex);
                                  } else { executeJumpNow(currentTrackIndex, seg.sectionIndex, jumpTime); }
                                  sendSupabaseBroadcast({ action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: seg.sectionIndex, mdSectionStartTime: jumpTime });
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

      <UserLobby 
        isOpen={isUserLobbyOpen}
        onClose={() => setIsUserLobbyOpen(false)} 
        onlineUsers={onlineUsers} 
        localPresenceUser={localPresenceUser} 
        lobbyMessages={lobbyMessages}
        sendChatMessage={sendChatMessage}
        sendPingMessage={sendPingMessage}
        sendReadReceipt={sendReadReceipt} // ✅ Pass read receipt trigger
        pingCooldown={pingCooldown} 
        lastReadTimes={lastReadTimes} 
        setLastReadTimes={setLastReadTimes}
      />

      <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-50"><div id="yt-live-player-container"></div></div>
      
      {(countdownValue !== null || isYtBuffering) && (
        <div className="fixed inset-0 z-[400000] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-100 select-none touch-none">
          {countdownValue !== null ? (
            <>
              <span className={`font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse ${isYtBuffering ? 'text-amber-500' : 'text-blue-500'}`}>
                {isYtBuffering ? "Buffering & Syncing Engine" : "Pre-Warming Sync Engine"}
              </span>
              <span className="text-[150px] md:text-[250px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">
                {countdownValue}
              </span>
            </>
          ) : (
            <>
              <span className="text-red-500 font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse">
                Buffering Backing Track
              </span>
              <span className="text-[100px] md:text-[150px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">
                ∞
              </span>
            </>
          )}
        </div>
      )}

    </div>
  );
}