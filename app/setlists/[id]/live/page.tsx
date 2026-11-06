"use client";

import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext";
import PageSkeleton from '../../../../components/PageSkeleton';
import { useTimesync } from '../../../../hooks/useTimesync';

import { CompiledSectionToken, CompiledBeatMap, ArrangementSection, SongRecord, ParsedLineToken, ParsedWordToken } from "./types/setlist";
import { CHROMATIC_SCALE, transposeBracketContent, normalizeKeyNote } from "./utils/music-math";
import { normalizeSectionNameToAudioFile } from "./utils/setlist-helpers";
import {
  compileTimelineBeatMap,
  getNextTimelineBeat,
  getTimelineDurationBeats,
  getTimelineMeter,
  getYoutubeTimeForTimeline
} from "./utils/timeline";

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
import { TracksView } from "./components/TracksView";
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

interface PlaybackStatePayload {
  action?: string;
  setlistId?: string;
  authoritySessionId?: string;
  authorityUserId?: string;
  authorityConnectionId?: string;
  revision?: number;
  targetConnectionId?: string;
  trackIndex?: number;
  sectionIndex?: number;
  queuedTrackIndex?: number | null;
  queuedSectionIndex?: number | null;
  isPlaying?: boolean;
  mdSectionStartTime?: number | null;
  mdAbsoluteBeat?: number;
  mdGlobalBeatTime?: number;
  isYtSource?: boolean;
  is_recording?: boolean;
  is_paused?: boolean;
  recording_start_time?: number | null;
  recording_accumulated_ms?: number;
  rehearsal_history?: RehearsalHistoryItem[];
}

interface PlaybackAuthority {
  userId: string;
  connectionId: string;
  sessionId: string;
}

const VERSIONED_PLAYBACK_ACTIONS = new Set([
  "START",
  "STOP",
  "JUMP",
  "TRACK_CHANGE",
  "QUEUE",
  "HEARTBEAT",
  "PLAYBACK_STATE",
  "TELEMETRY_SYNC"
]);

interface RehearsalHistoryItem {
  timestamp: number;
  title: string;
  label: string;
}

interface PlaybackTelemetrySession {
  setlistId: string;
  sessionNumber: number;
  startedAt: number;
  ownsRecording: boolean;
}

interface TelemetryUpdate {
  is_recording?: boolean;
  is_paused?: boolean;
  recording_start_time?: number | null;
  recording_accumulated_ms?: number;
  rehearsal_history?: RehearsalHistoryItem[];
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

  const { simulatedUserId, simulatedRole, activeRole, userTeamId } = useEngine(); // ✅ Added activeRole
  const { isSynced, getGlobalTime } = useTimesync();
  const isSyncedRef = useRef(isSynced);
  isSyncedRef.current = isSynced;


  // ✅ SURGICAL FIX: Calculates if the current user hierarchy can edit the song
  const canEditSong = ["admin", "moderator", "musician"].includes(activeRole);

  useWakeLock();

  // ✅ SURGICAL FIX: Bring back fetchAndDecodeAudio
  const { initAudioContext, playZeroLatencyAudio, playGuideCue, getAudioContext, fetchAndDecodeAudio, cancelFutureAudio, setAudioPanRight } = useWebAudioEngine();

  const {
    lyricsFontSize, setLyricsFontSize, showChords, setShowChords, chordFormat, setChordFormat,
    isSimplifiedMode, setIsSimplifiedMode, isTracksMode, setIsTracksMode, lineSpacing, setLineSpacing,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isMetronomeSoundEnabledRef,
    isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled, isDoubleMetronomeEnabledRef,
    localClickVolume, setLocalClickVolume, localClickVolumeRef,
    youtubeVolume, setYoutubeVolume, youtubeVolumeRef,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled,
    isClickGuideHardPannedRight, setIsClickGuideHardPannedRight
  } = useLocalPreferences();

  useEffect(() => {
    setAudioPanRight(isClickGuideHardPannedRight);
  }, [isClickGuideHardPannedRight, setAudioPanRight]);

  const {
    loading, loadState, loadingStatus, retryLoad, setlistName, setlistEventName, setlistTeamId, setlistTrackTitles, tracksList, setTracksList, tracksListRef,
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
  const [playbackClockNotice, setPlaybackClockNotice] = useState<string | null>(null);

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

  const [explicitScrubBeat, setExplicitScrubBeat] = useState<number | null>(null);

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
      timestamp: getGlobalTime(),
      seenBy: [] // ✅ Initialize empty read receipt array
    };
    setLobbyMessages(prev => [...prev, msg].slice(-100)); // Keep last 100
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_chat", payload: msg });
    }
  };

  // ✅ SURGICAL ADDITION: Network Read Receipt Broadcaster
  const sendReadReceipt = useCallback((messageId: string) => {
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
  }, []);

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
  // ✅ NATIVE SCROLL SNAPPING ENGINE (Replaces Custom Physics)
  // =========================================================================
  const carouselRef = useRef<HTMLDivElement>(null);
  // Browsing the carousel does not select a playback track. Only explicit controls
  // or an authoritative playback command may change currentTrackIndex.
  useEffect(() => {
    if (carouselRef.current) {
      // ✅ SURGICAL FIX: Ensure the carousel perfectly snaps without fighting the active click logic
      const targetLeft = currentTrackIndex * carouselRef.current.clientWidth;
      if (Math.abs(carouselRef.current.scrollLeft - targetLeft) > 10) {
        carouselRef.current.scrollTo({ left: targetLeft, behavior: "smooth" });
      }
    }
  }, [currentTrackIndex]);

  useEffect(() => {
    if (!activeSong?.id) {
      setAvailableSongSections([]);
      return;
    }
    let isCurrentRequest = true;
    setAvailableSongSections([]);
    const fetchAvailableSections = async () => {
      try {
        // ✅ SURGICAL FIX: Wrapped in try/catch to prevent aggressive Chrome Extensions
        // from throwing unhandled network exceptions and crashing the React sync thread!
        const { data, error } = await supabase
          .from("song_sections")
          .select("section_name")
          .eq("song_id", activeSong.id);

        if (isCurrentRequest && !error && data) {
          const uniqueNames = Array.from(new Set(data.map((section) => section.section_name)));
          setAvailableSongSections(uniqueNames);
        }
      } catch (err) {
        if (isCurrentRequest) console.warn("Could not load available song sections:", err);
      }
    };
    void fetchAvailableSections();
    return () => { isCurrentRequest = false; };
  }, [activeSong?.id]);

  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingStructure, setIsSavingStructure] = useState(false);
  const [structureSaveError, setStructureSaveError] = useState<string | null>(null);
  const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  // ✅ SURGICAL ADDITION: Telemetry States
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [rehearsalHistory, setRehearsalHistory] = useState<RehearsalHistoryItem[]>([]);
  const [telemetrySaveError, setTelemetrySaveError] = useState<string | null>(null);
  const isRecordingRef = useRef(false);
  const rehearsalHistoryRef = useRef<RehearsalHistoryItem[]>([]);
  const playbackTelemetrySessionRef = useRef<PlaybackTelemetrySession | null>(null);
  const stopPlaybackTelemetryRef = useRef<() => Promise<void>>(async () => {});
  const telemetryUpdateRevisionRef = useRef(0);
  const jumpReasonRef = useRef<"Auto Play" | "Quick Play" | "Queued">("Auto Play");

  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const zenOverlayRef = useRef<HTMLDivElement | null>(null);

  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [tracksPlayheadBeat, setTracksPlayheadBeat] = useState(0);
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
  const pendingQuantizedJumpRef = useRef<{ trackIndex: number; sectionIndex: number; jumpTime: number } | null>(null);
  const isYtBackingTrackStartRef = useRef<boolean>(false);
  const activeLineIndexRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const playbackSyncRevisionRef = useRef(0);
  const playbackAuthorityRef = useRef<PlaybackAuthority | null>(null);
  const acceptedPlaybackRevisionRef = useRef<{
    authorityConnectionId: string;
    authoritySessionId: string;
    revision: number;
  } | null>(null);
  const outgoingPlaybackSessionRef = useRef<{
    authorityConnectionId: string;
    authoritySessionId: string;
    revision: number;
  } | null>(null);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const pauseOffsetMsRef = useRef<number>(0);
  const lastBeatRef = useRef<number>(1);
  const animationFrameRef = useRef<number | null>(null);
  const pendingPlaybackStateRef = useRef<PlaybackStatePayload | null>(null);
  const handleSyncCommandRef = useRef<(payload: PlaybackStatePayload, validatedReplay?: boolean) => void>(() => {});
  const playbackStateRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const audioContextStartTimeRef = useRef<number | null>(null);
  const astTreeRef = useRef<CompiledSectionToken[]>([]);
  const mdSectionStartTimeRef = useRef<number | null>(null);
  const youtubeStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingYoutubeSyncRef = useRef<{
    sectionIndex: number;
    sectionStartTime: number;
    mode: "start" | "explicit-jump" | "snapshot";
  } | null>(null);
  const pendingYoutubeStartRef = useRef<{
    trackIndex: number;
    sectionIndex: number;
    exactBeat?: number | null;
  } | null>(null);
  const youtubePlaybackStartedHandlerRef = useRef<(currentTimeSeconds: number) => void>(() => {});
  const youtubePlaybackErrorHandlerRef = useRef<() => void>(() => {});
  const beginYoutubeBackedStartRef = useRef<() => void>(() => {});

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

  const wasPlayingFlowRef = useRef(isPlayingFlow);
  useEffect(() => {
    const justStopped = wasPlayingFlowRef.current && !isPlayingFlow;
    wasPlayingFlowRef.current = isPlayingFlow;
    if (justStopped) return;

    // ✅ SURGICAL FIX: Removed `isPlayingFlow` so non-MDs jump to the section even when playback is paused!
    if (!showSyncBack) {
      const activeLineId = `line-${currentSectionIndex}-${activeLineIndex}`;

      const activeContainer = trackScrollRefs.current[currentTrackIndex]?.current;
      const targetLine = activeContainer?.querySelector(`#${activeLineId}`) || document.getElementById(activeLineId);

      if (targetLine) {
        isAutoScrollingRef.current = true;
        targetLine.scrollIntoView({ behavior: "smooth", block: "center" });
        const timeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 550);
        return () => clearTimeout(timeout);
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

  const telemetryWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  function formatTelemetryDuration(durationMs: number) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return hours === "00" ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
  }

  async function persistTelemetryUpdate(update: TelemetryUpdate, targetSetlistId = setlistId) {
    if (!targetSetlistId) {
      setTelemetrySaveError("Telemetry could not be saved because the setlist is unavailable.");
      return;
    }

    if (targetSetlistId === setlistId && hasCurrentPlaybackAuthority()) {
      sendSupabaseBroadcast({ action: "TELEMETRY_SYNC", ...update });
    }

    const write = telemetryWriteQueueRef.current.catch(() => undefined).then(async () => {
      const { error } = await supabase.from("setlists").update(update).eq("id", targetSetlistId);
      if (error) throw error;
    });
    telemetryWriteQueueRef.current = write;

    try {
      await write;
      setTelemetrySaveError(null);
    } catch (error) {
      const details = error && typeof error === "object"
        ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
        : null;
      console.error("Failed to save rehearsal telemetry:", {
        message: details?.message ?? (error instanceof Error ? error.message : String(error)),
        code: details?.code,
        details: details?.details,
        hint: details?.hint
      });
      setTelemetrySaveError("Lobby telemetry is synced, but rehearsal history could not be saved for later sessions.");
    }
  }

  function applyTelemetryUpdate(update: TelemetryUpdate) {
    telemetryUpdateRevisionRef.current += 1;
    if (typeof update.is_recording === "boolean") {
      setIsRecording(update.is_recording);
      isRecordingRef.current = update.is_recording;
    }
    if (typeof update.is_paused === "boolean") {
      setIsPaused(update.is_paused);
      isPausedRef.current = update.is_paused;
    }
    if ("recording_start_time" in update) setRecordingStartTime(update.recording_start_time ?? null);
    if (typeof update.recording_accumulated_ms === "number" && Number.isFinite(update.recording_accumulated_ms)) {
      setRecordingAccumulatedMs(update.recording_accumulated_ms);
    }
    if (Array.isArray(update.rehearsal_history)) {
      rehearsalHistoryRef.current = update.rehearsal_history;
      setRehearsalHistory(update.rehearsal_history);
    }
  }

  function updateRehearsalHistory(history: RehearsalHistoryItem[]) {
    const cappedHistory = history.slice(0, 100);
    rehearsalHistoryRef.current = cappedHistory;
    setRehearsalHistory(cappedHistory);
    return cappedHistory;
  }

  async function startPlaybackTelemetry() {
    if (!localPresenceUserRef.current?.isMD || playbackTelemetrySessionRef.current) return;

    const startedAt = getGlobalTime();
    const ownsRecording = !isRecordingRef.current;
    const sessionNumber = rehearsalHistoryRef.current.reduce((largest, item) => {
      const match = /^Session #(\d+)$/.exec(item.title);
      return match ? Math.max(largest, Number(match[1])) : largest;
    }, 0) + 1;
    const sessionHistory = updateRehearsalHistory([
      { timestamp: startedAt, title: `Session #${sessionNumber}`, label: "Playback started" },
      ...rehearsalHistoryRef.current,
    ]);

    playbackTelemetrySessionRef.current = { setlistId, sessionNumber, startedAt, ownsRecording };
    if (ownsRecording) {
      isRecordingRef.current = true;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingAccumulatedMs(0);
      setRecordingStartTime(startedAt);
    }

    await persistTelemetryUpdate({
      rehearsal_history: sessionHistory,
      ...(ownsRecording
        ? {
            is_recording: true,
            is_paused: false,
            recording_start_time: startedAt,
            recording_accumulated_ms: 0,
          }
        : {}),
    });
  }

  async function stopPlaybackTelemetry() {
    const session = playbackTelemetrySessionRef.current;
    if (!session) return;

    playbackTelemetrySessionRef.current = null;
    const stoppedAt = getGlobalTime();
    const sessionHistory = updateRehearsalHistory([
      {
        timestamp: stoppedAt,
        title: `Session #${session.sessionNumber}`,
        label: `Playback stopped · ${formatTelemetryDuration(stoppedAt - session.startedAt)}`,
      },
      ...rehearsalHistoryRef.current,
    ]);
    const update: TelemetryUpdate = { rehearsal_history: sessionHistory };

    if (session.ownsRecording) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setRecordingStartTime(null);
      setRecordingAccumulatedMs(0);
      update.is_recording = false;
      update.is_paused = false;
      update.recording_start_time = null;
      update.recording_accumulated_ms = 0;
    }

    await persistTelemetryUpdate(update, session.setlistId);
  }

  stopPlaybackTelemetryRef.current = stopPlaybackTelemetry;

  // ✅ SURGICAL ADDITION: Dedicated Postgres Listener for Telemetry
  useEffect(() => {
    if (!setlistId) return;
    let isCurrent = true;

    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setRecordingAccumulatedMs(0);
    setRecordingStartTime(null);
    setRehearsalHistory([]);
    rehearsalHistoryRef.current = [];
    setTelemetrySaveError(null);

    const fetchTelemetry = async () => {
       const requestRevision = telemetryUpdateRevisionRef.current;
       const { data, error } = await supabase
        .from('setlists')
        .select('is_recording, is_paused, recording_accumulated_ms, recording_start_time, rehearsal_history')
        .eq('id', setlistId)
        .single();

       if (!isCurrent) return;
       if (requestRevision !== telemetryUpdateRevisionRef.current) return;
       if (error) {
         console.error("🚨 Telemetry Fetch Error:", error.message);
         return;
       }

       if (data) {
          applyTelemetryUpdate({
            is_recording: data.is_recording || false,
            is_paused: data.is_paused || false,
            recording_accumulated_ms: Number(data.recording_accumulated_ms) || 0,
            recording_start_time: data.recording_start_time,
            rehearsal_history: data.rehearsal_history || []
          });
       }
    }
    const telemetryChannel = supabase.channel(`telemetry_${setlistId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'setlists', filter: `id=eq.${setlistId}` }, (payload) => {
        applyTelemetryUpdate({
          is_recording: payload.new.is_recording || false,
          is_paused: payload.new.is_paused || false,
          recording_accumulated_ms: Number(payload.new.recording_accumulated_ms) || 0,
          recording_start_time: payload.new.recording_start_time,
          rehearsal_history: payload.new.rehearsal_history || []
        });
      }).subscribe((status) => {
        if (status === "SUBSCRIBED") void fetchTelemetry();
      });

    return () => {
      isCurrent = false;
      if (playbackTelemetrySessionRef.current?.setlistId === setlistId) void stopPlaybackTelemetryRef.current();
      void supabase.removeChannel(telemetryChannel);
    };
  }, [setlistId]);

  const updateMetronomeUI = (activeBeat: number, isPlaying: boolean, measureLength: number = 4, absoluteBeat?: number) => {
    // ✅ SURGICAL FIX: Directly calculate negative sub-beats to perfectly glide through pre-rolls without snapping to 0
    if (isTracksMode) {
      if (isPlaying && mdSectionStartTimeRef.current && activeSongRef.current) {
        const beatDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 1000;
        const elapsedMs = getGlobalTime() - mdSectionStartTimeRef.current;
        const sectionStartBeat = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0;
        setTracksPlayheadBeat(sectionStartBeat + (elapsedMs / beatDurationMs));
      } else if (absoluteBeat !== undefined) {
        setTracksPlayheadBeat(absoluteBeat);
      }
    }

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

  const updatePlaybackAuthority = (authority: PlaybackAuthority | null) => {
    const current = playbackAuthorityRef.current;
    if (
      current?.userId === authority?.userId &&
      current?.connectionId === authority?.connectionId &&
      current?.sessionId === authority?.sessionId
    ) return;

    playbackAuthorityRef.current = authority;
    acceptedPlaybackRevisionRef.current = null;
    pendingPlaybackStateRef.current = null;
  };

  const hasCurrentPlaybackAuthority = () => {
    const user = localPresenceUserRef.current;
    const authority = playbackAuthorityRef.current;
    return Boolean(
      user?.isMD &&
      authority &&
      authority.userId === user.id &&
      authority.connectionId === user.connectionId &&
      authority.sessionId === user.authoritySessionId
    );
  };

  const handleTogglePlaybackAuthority = () => {
    const wasMd = localPresenceUserRef.current?.isMD === true;
    handleToggleMusicDirectorMode();
    const currentUser = localPresenceUserRef.current;
    if (currentUser?.isMD === wasMd) return;

    updatePlaybackAuthority(
      currentUser?.isMD && currentUser.id && currentUser.connectionId && currentUser.authoritySessionId
        ? {
            userId: currentUser.id,
            connectionId: currentUser.connectionId,
            sessionId: currentUser.authoritySessionId
          }
        : null
    );
  };

  const validatePlaybackPayload = (payload: PlaybackStatePayload) => {
    if (!VERSIONED_PLAYBACK_ACTIONS.has(payload.action || "")) return true;

    if (
      payload.action === "PLAYBACK_STATE" &&
      payload.targetConnectionId !== localPresenceUserRef.current?.connectionId
    ) return false;

    const authority = playbackAuthorityRef.current;
    if (
      authority === null ||
      payload.setlistId !== setlistId ||
      payload.authorityUserId !== authority.userId ||
      payload.authorityConnectionId !== authority.connectionId ||
      payload.authoritySessionId !== authority.sessionId ||
      !Number.isSafeInteger(payload.revision) ||
      (payload.revision as number) < 1
    ) {
      return false;
    }

    const accepted = acceptedPlaybackRevisionRef.current;
    if (accepted) {
      if (
        accepted.authorityConnectionId !== authority.connectionId ||
        accepted.authoritySessionId !== payload.authoritySessionId ||
        (payload.revision as number) <= accepted.revision
      ) return false;
    }

    acceptedPlaybackRevisionRef.current = {
      authorityConnectionId: authority.connectionId,
      authoritySessionId: payload.authoritySessionId,
      revision: payload.revision as number
    };
    return true;
  };

  // ✅ Core Supabase Transmitter
  const sendSupabaseBroadcast = (payload: any) => {
    if (realtimeChannelRef.current) {
      let outgoingPayload = payload;
      if (VERSIONED_PLAYBACK_ACTIONS.has(payload.action)) {
        const localUser = localPresenceUserRef.current;
        if (!hasCurrentPlaybackAuthority()) {
          console.warn(`Ignoring ${payload.action} from a client without current MD authority.`);
          return;
        }

        if (!localUser?.connectionId || !localUser.id || !localUser.authoritySessionId) return;
        let session = outgoingPlaybackSessionRef.current;
        if (
          !session ||
          session.authorityConnectionId !== localUser.connectionId ||
          session.authoritySessionId !== localUser.authoritySessionId
        ) {
          session = {
            authorityConnectionId: localUser.connectionId,
            authoritySessionId: localUser.authoritySessionId,
            revision: 0
          };
          outgoingPlaybackSessionRef.current = session;
        }

        session.revision += 1;
        outgoingPayload = {
          ...payload,
          setlistId,
          authoritySessionId: session.authoritySessionId,
          authorityUserId: localUser.id,
          authorityConnectionId: localUser.connectionId,
          revision: session.revision
        };
      }

      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: outgoingPayload
      });
    }
  };

  // YouTube telemetry is a local setting for the current Music Director only.
  const handleSetYoutubeSync = (val: boolean) => {
    if (!localPresenceUserRef.current?.isMD) return;
    setIsYoutubeSyncEnabled(val);
  };

  const clearPlaybackStateRetry = () => {
    if (playbackStateRetryRef.current) {
      clearInterval(playbackStateRetryRef.current);
      playbackStateRetryRef.current = null;
    }
  };

  const applySharedPlaybackState = (
    payload: PlaybackStatePayload,
    youtubeSyncMode?: "snapshot"
  ) => {
    const trackIndex = payload.trackIndex;
    const sectionIndex = payload.sectionIndex;
    const startTime = payload.mdSectionStartTime;
    if (
      typeof trackIndex !== "number" ||
      !Number.isInteger(trackIndex) ||
      trackIndex < 0 ||
      typeof sectionIndex !== "number" ||
      !Number.isInteger(sectionIndex) ||
      sectionIndex < 0 ||
      typeof startTime !== "number" ||
      !Number.isFinite(startTime) ||
      !tracksListRef.current[trackIndex]
    ) {
      console.error("Ignoring invalid live playback state:", payload);
      return;
    }

    clearPlaybackStateRetry();
    const isTrackMismatch = playingTrackIndexRef.current !== trackIndex;
    const isSectionMismatch = currentSectionIndexRef.current !== sectionIndex;
    const isPlaybackMismatch = !isPlayingRef.current;
    const isSourceMismatch = isYtBackingTrackStartRef.current !== (payload.isYtSource === true);

    if (isTrackMismatch || isSectionMismatch || isPlaybackMismatch || isSourceMismatch) {
      const revision = ++playbackSyncRevisionRef.current;
      const mountedSections = mountTargetSetlistTrackIndex(trackIndex);
      if (!mountedSections || sectionIndex >= mountedSections.length) {
        console.error("Ignoring playback state with a section outside the target track:", payload);
        return;
      }

      currentSectionIndexRef.current = sectionIndex;
      setCurrentSectionIndex(sectionIndex);
      playingTrackIndexRef.current = trackIndex;
      setPlayingTrackIndex(trackIndex);
      isYtBackingTrackStartRef.current = payload.isYtSource === true;
      mdSectionStartTimeRef.current = startTime;
      isPlayingRef.current = true;
      setIsPlayingFlow(true);

      const synchronizeAfterTrackMount = () => {
        if (revision !== playbackSyncRevisionRef.current) return;
        executeJumpNow(trackIndex, sectionIndex, startTime, true, youtubeSyncMode);
        const sectionStartBeat = beatMapRef.current.sectionStartBeats[sectionIndex] || 0;
        const beatDurationMs = (60 / (activeSongRef.current?.tempo || 75)) * 1000;
        const now = getGlobalTime();
        const elapsedMs = now - startTime;
        if (elapsedMs > 0) {
          const currentAbsoluteBeat = sectionStartBeat + elapsedMs / beatDurationMs;
          lastAudioBeatRef.current = getNextTimelineBeat(
            currentAbsoluteBeat,
            getTimelineMeter(activeSongRef.current?.section_timings)
          );
        } else {
          lastAudioBeatRef.current = sectionStartBeat;
        }
      };

      if (isTrackMismatch) {
        requestAnimationFrame(() => requestAnimationFrame(synchronizeAfterTrackMount));
      } else {
        synchronizeAfterTrackMount();
      }
      return;
    }

    const localStartTime = mdSectionStartTimeRef.current;
    if (localStartTime === null) return;
    const now = getGlobalTime();
    const beatDurationMs = 60000 / (tracksListRef.current[trackIndex]?.songs?.tempo || 75);
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[sectionIndex] || 0;
    let driftBeats: number | null = null;

    if (
      typeof payload.mdAbsoluteBeat === "number" &&
      Number.isFinite(payload.mdAbsoluteBeat) &&
      typeof payload.mdGlobalBeatTime === "number" &&
      Number.isFinite(payload.mdGlobalBeatTime)
    ) {
      const localAbsoluteBeat = sectionStartBeat + (now - localStartTime) / beatDurationMs;
      const mdAbsoluteBeatNow = payload.mdAbsoluteBeat + (now - payload.mdGlobalBeatTime) / beatDurationMs;
      driftBeats = localAbsoluteBeat - mdAbsoluteBeatNow;
      if (Math.abs(driftBeats) < 0.08) return;
    }

    const requestedCorrectionMs = driftBeats === null
      ? startTime - localStartTime
      : driftBeats * beatDurationMs * 0.35;
    if (Math.abs(requestedCorrectionMs) < 20) return;

    const maxCorrectionMs = Math.min(100, beatDurationMs * 0.2);
    const correctionMs = Math.max(-maxCorrectionMs, Math.min(maxCorrectionMs, requestedCorrectionMs));
    mdSectionStartTimeRef.current = localStartTime + correctionMs;
    if (audioContextStartTimeRef.current !== null) {
      audioContextStartTimeRef.current += correctionMs / 1000;
    }
  };

  const applyPlaybackState = (payload: PlaybackStatePayload) => {
    if (payload.targetConnectionId !== localPresenceUserRef.current?.connectionId) return;
    clearPlaybackStateRetry();
    if (!isSyncedRef.current) {
      pendingPlaybackStateRef.current = payload;
      return;
    }

    if (payload.isPlaying) {
      applySharedPlaybackState(payload, "snapshot");
      setQueuedTrackIndex(payload.queuedTrackIndex ?? null);
      setQueuedSectionIndex(payload.queuedSectionIndex ?? null);
      return;
    }

    const trackIndex = payload.trackIndex;
    const sectionIndex = payload.sectionIndex;
    if (
      typeof trackIndex !== "number" ||
      typeof sectionIndex !== "number" ||
      !tracksListRef.current[trackIndex]
    ) return;
    playbackSyncRevisionRef.current++;
    executeLocalResetSequence();
    mountTargetSetlistTrackIndex(trackIndex);
    currentSectionIndexRef.current = sectionIndex;
    setCurrentSectionIndex(sectionIndex);
    playingTrackIndexRef.current = trackIndex;
    setPlayingTrackIndex(trackIndex);
    setQueuedTrackIndex(null);
    setQueuedSectionIndex(null);
  };

  // ✅ Core Receiver
  const handleSyncCommand = (payload: any, validatedReplay = false) => {
    if (!payload || typeof payload !== "object") return;
    if (!validatedReplay && !validatePlaybackPayload(payload as PlaybackStatePayload)) return;

    if (payload.action === "TELEMETRY_SYNC") {
      applyTelemetryUpdate(payload as TelemetryUpdate);
      return;
    }

    if (
      !isSyncedRef.current &&
      ["START", "STOP", "JUMP", "TRACK_CHANGE", "HEARTBEAT", "PLAYBACK_STATE"].includes(payload.action || "")
    ) {
      if (
        payload.action !== "PLAYBACK_STATE" ||
        payload.targetConnectionId === localPresenceUserRef.current?.connectionId
      ) {
        pendingPlaybackStateRef.current = payload;
      }
      return;
    }

    if (payload.action === "START") {
      clearPlaybackStateRetry();
      playbackSyncRevisionRef.current++;
      const targetTrackIdx = payload.trackIndex !== undefined ? payload.trackIndex : currentTrackIndexRef.current;
      isPlayingRef.current = true; setIsPlayingFlow(true);
      isYtBackingTrackStartRef.current = payload.isYtSource || false;
      const startTime = payload.mdSectionStartTime || getGlobalTime();
      executeJumpNow(targetTrackIdx, payload.sectionIndex, startTime, true, "start");
      const elapsedMs = getGlobalTime() - startTime;
      if (elapsedMs > 0 && activeSongRef.current) {
        const sectionStartBeat = beatMapRef.current.sectionStartBeats[payload.sectionIndex] || 0;
        const beatDurationMs = 60000 / (activeSongRef.current.tempo || 75);
        lastAudioBeatRef.current = getNextTimelineBeat(
          sectionStartBeat + elapsedMs / beatDurationMs,
          getTimelineMeter(activeSongRef.current.section_timings)
        );
      }
    }
    else if (payload.action === "STOP") {
      clearPlaybackStateRetry();
      pendingPlaybackStateRef.current = null;
      playbackSyncRevisionRef.current++;
      executeLocalResetSequence(true);
    }
    else if (payload.action === "JUMP") {
      clearPlaybackStateRetry();
      playbackSyncRevisionRef.current++;
      const jumpTime = payload.mdSectionStartTime || getGlobalTime();
      const timeUntilJump = jumpTime - getGlobalTime();
      if (isPlayingRef.current && timeUntilJump > 50) {
        pendingQuantizedJumpRef.current = { trackIndex: payload.trackIndex ?? currentTrackIndexRef.current, sectionIndex: payload.sectionIndex, jumpTime };
        setQueuedTrackIndex(payload.trackIndex ?? currentTrackIndexRef.current);
        setQueuedSectionIndex(payload.sectionIndex);
      } else {
        executeJumpNow(
          payload.trackIndex ?? currentTrackIndexRef.current,
          payload.sectionIndex,
          jumpTime,
          false,
          "explicit-jump"
        );
      }
    }
    else if (payload.action === "TRACK_CHANGE") { playbackSyncRevisionRef.current++; mountTargetSetlistTrackIndex(payload.trackIndex); }
    else if (payload.action === "QUEUE") { setQueuedTrackIndex(payload.trackIndex); setQueuedSectionIndex(payload.sectionIndex); }
    else if (payload.action === "HEARTBEAT" && !localPresenceUserRef.current?.isMD) {
      applySharedPlaybackState(payload);
    }
    else if (payload.action === "PLAYBACK_STATE_REQUEST") {
      if (localPresenceUserRef.current?.isMD && payload.requesterConnectionId) {
        const isPlaying = isPlayingRef.current;
        const trackIndex = isPlaying ? playingTrackIndexRef.current : currentTrackIndexRef.current;
        const startTime = mdSectionStartTimeRef.current;
        const beatDurationMs = 60000 / (activeSongRef.current?.tempo || 75);
        const sectionStartBeat = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0;
        const elapsedBeats = isPlaying && typeof startTime === "number"
          ? Math.floor((getGlobalTime() - startTime) / beatDurationMs)
          : null;
        sendSupabaseBroadcast({
          action: "PLAYBACK_STATE",
          targetConnectionId: payload.requesterConnectionId,
          isPlaying,
          trackIndex,
          sectionIndex: currentSectionIndexRef.current,
          mdSectionStartTime: startTime,
          ...(elapsedBeats === null || typeof startTime !== "number" ? {} : {
            mdAbsoluteBeat: sectionStartBeat + elapsedBeats,
            mdGlobalBeatTime: startTime + elapsedBeats * beatDurationMs
          }),
          queuedTrackIndex: queuedTrackIndexRef.current,
          queuedSectionIndex: queuedSectionIndexRef.current,
          isYtSource: isPlaying && isYtBackingTrackStartRef.current
        });
      }
    }
    else if (payload.action === "PLAYBACK_STATE") {
      applyPlaybackState(payload);
    }
    else if (payload.action === "MD_TAKEOVER") {
      latestMdBroadcastRef.current = { mdId: payload.newMdId, timestamp: Date.now() };
      setOnlineUsers(prev => prev.map(u => ({ ...u, isMD: u.id === payload.newMdId })));
      const newAuthority = payload.newMdId === localPresenceUserRef.current?.id
        ? localPresenceUserRef.current
        : onlineUsers.find(user => user.id === payload.newMdId);
      const authoritySessionId = payload.authoritySessionId || newAuthority?.authoritySessionId;
      updatePlaybackAuthority(newAuthority?.connectionId && authoritySessionId
        ? { userId: newAuthority.id, connectionId: newAuthority.connectionId, sessionId: authoritySessionId }
        : null);

      if (localPresenceUserRef.current?.isMD && localPresenceUserRef.current.id !== payload.newMdId) {
        const downgradedPayload = { ...localPresenceUserRef.current, isMD: false, updatedAt: Date.now() };
        setLocalPresenceUser(downgradedPayload);
        localPresenceUserRef.current = downgradedPayload;
        if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(downgradedPayload);
        executeLocalResetSequence();
      } else if (localPresenceUserRef.current?.id === payload.newMdId && !localPresenceUserRef.current?.isMD) {
        // ✅ SURGICAL FIX: Explicitly upgrade the requester when the transfer is accepted!
        const upgradedPayload = {
          ...localPresenceUserRef.current,
          isMD: true,
          authoritySessionId: authoritySessionId || localPresenceUserRef.current.authoritySessionId,
          updatedAt: Date.now()
        };
        setLocalPresenceUser(upgradedPayload);
        localPresenceUserRef.current = upgradedPayload;
        if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(upgradedPayload);
      }
    }
    else if (payload.action === "MD_RELEASE") {
      latestMdBroadcastRef.current = { mdId: null, timestamp: Date.now() };
      updatePlaybackAuthority(null);
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
    // ✅ SURGICAL FIX: Decentralized Chat History Auto-Sync
    else if (payload.action === "CHAT_SYNC_REQUEST") {
      // Allow ANYONE in the room with history to answer. This prevents failure if MD drops or desyncs!
      if (lobbyMessagesRef.current.length > 0) {
        const globalHistory = lobbyMessagesRef.current.filter(m => !m.targetUserId);
        sendSupabaseBroadcast({ action: "CHAT_SYNC_RESPONSE", requesterId: payload.requesterId, history: globalHistory });
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

  handleSyncCommandRef.current = (payload, validatedReplay) => handleSyncCommand(payload, validatedReplay);
  useEffect(() => {
    if (!isSynced) return;
    setPlaybackClockNotice(null);
    const pendingState = pendingPlaybackStateRef.current;
    if (!pendingState) return;
    pendingPlaybackStateRef.current = null;
    handleSyncCommandRef.current(pendingState, true);
  }, [isSynced]);

  // ✅ SURGICAL ADDITION: MD Transfer Request Senders
  const handleRequestMusicDirector = () => {
    const currentMd = onlineUsers.find(u => u.isMD);
    if (currentMd) {
      sendSupabaseBroadcast({ action: "MD_REQUEST", requester: localPresenceUserRef.current });
      alert("Transfer request sent to " + currentMd.name);
    } else {
      handleTogglePlaybackAuthority();
    }
  };

  const handleAcceptMdRequest = (requesterId: string) => {
    const downgraded = { ...localPresenceUserRef.current, isMD: false, updatedAt: Date.now() };
    setLocalPresenceUser(downgraded);
    localPresenceUserRef.current = downgraded;
    if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(downgraded);
    executeLocalResetSequence();

    // ✅ SURGICAL FIX: Delay the broadcast slightly to ensure Supabase presence updates cleanly for all clients!
    const newAuthority = onlineUsers.find(user => user.id === requesterId);
    const authoritySessionId = crypto.randomUUID();
    setTimeout(() => {
      sendSupabaseBroadcast({
        action: "MD_TAKEOVER",
        newMdId: requesterId,
        authorityConnectionId: newAuthority?.connectionId,
        authoritySessionId
      });
    }, 150);
    setMdRequest(null);
  };

  function executeStartSequence(isYtSource: boolean = false) {
    if (isPlayingRef.current || pendingYoutubeStartRef.current) return;
    if (!hasCurrentPlaybackAuthority()) { setPlaybackClockNotice("Waiting for Music Director authority to synchronize."); return; }
    if (!isSyncedRef.current) { setPlaybackClockNotice("Waiting for clock synchronization before starting the setlist."); return; }

    initAudioContext();

    // Apply the exact scrubbed beat memory
    let startTimestamp = getGlobalTime();
    const exactScrubBeat = explicitScrubBeat;
    if (exactScrubBeat !== null && activeSongRef.current) {
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0;
      const beatDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 1000;
      startTimestamp = getGlobalTime() - ((exactScrubBeat - sectionStartBeat) * beatDurationMs);
      setExplicitScrubBeat(null);
    }

    if (isYtSource) {
      isYtBackingTrackStartRef.current = true;
      pendingYoutubeStartRef.current = {
        trackIndex: currentTrackIndexRef.current,
        sectionIndex: currentSectionIndexRef.current,
        exactBeat: exactScrubBeat
      };
      pendingYoutubeSyncRef.current = null;

      if (isYtPlayerReadyRef.current && ytPlayerRef.current) beginYoutubeBackedStart();
      return;
    }

    completeLiveStart(currentTrackIndexRef.current, currentSectionIndexRef.current, startTimestamp, false, exactScrubBeat);
  }

  function beginYoutubeBackedStart() {
    if (!pendingYoutubeStartRef.current || !isYtPlayerReadyRef.current) return;
    const player = ytPlayerRef.current;
    if (!player || typeof player.seekTo !== "function" || typeof player.playVideo !== "function") return;
    const pendingStart = pendingYoutubeStartRef.current;

    const startVisualTimelineWithoutYoutube = () => {
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[pendingStart.sectionIndex] || 0;
      const beatDurationMs = (60 / (activeSongRef.current?.tempo || 75)) * 1000;
      const now = getGlobalTime();
      const startTimestamp = pendingStart.exactBeat == null
        ? now
        : now - (pendingStart.exactBeat - sectionStartBeat) * beatDurationMs;
      completeLiveStart(
        pendingStart.trackIndex,
        pendingStart.sectionIndex,
        startTimestamp,
        false,
        pendingStart.exactBeat
      );
    };

    try {
      const song = activeSongRef.current;
      const offsetMs = song?.youtube_sync_offset_ms || 0;
      let expectedYoutubeTime;

      if (pendingStart.exactBeat !== undefined && pendingStart.exactBeat !== null) {
        expectedYoutubeTime = getYoutubeTimeForTimeline(pendingStart.exactBeat, 0, song?.tempo || 75, offsetMs);
      } else {
        const sectionStartBeat = beatMapRef.current.sectionStartBeats[pendingStart.sectionIndex] || 0;
        expectedYoutubeTime = getYoutubeTimeForTimeline(sectionStartBeat, 0, song?.tempo || 75, offsetMs);
        const isFreshStart = mdSectionStartTimeRef.current ? Math.abs(getGlobalTime() - mdSectionStartTimeRef.current) < 500 : true;
        if (pendingStart.sectionIndex === 0 && isFreshStart) expectedYoutubeTime = 0;
      }

      setTimeout(() => {
        if (pendingYoutubeStartRef.current !== pendingStart) return;
        try {
          player.seekTo(Math.max(0, expectedYoutubeTime), true);
          player.playVideo();
          if (player.getPlayerState?.() === 1) {
            handleYoutubePlaybackStarted(player.getCurrentTime?.() ?? expectedYoutubeTime);
          }
        } catch (error) {
          console.warn("Could not start the optional YouTube player.", error);
          startVisualTimelineWithoutYoutube();
        }
      }, 0);
    } catch (error) {
      console.warn("Could not start the optional YouTube player.", error);
      startVisualTimelineWithoutYoutube();
    }
  }

  function handleYoutubePlaybackStarted(currentTimeSeconds: number) {
    const pendingStart = pendingYoutubeStartRef.current;
    if (!pendingStart) return;

    const song = activeSongRef.current;
    const offsetMs = song?.youtube_sync_offset_ms || 0;
    const beatDurationMs = 60000 / (song?.tempo || 75);
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[pendingStart.sectionIndex] || 0;

    let expectedYoutubeTime;
    if (pendingStart.exactBeat !== undefined && pendingStart.exactBeat !== null) {
      expectedYoutubeTime = getYoutubeTimeForTimeline(pendingStart.exactBeat, 0, song?.tempo || 75, offsetMs);
    } else {
      expectedYoutubeTime = getYoutubeTimeForTimeline(sectionStartBeat, 0, song?.tempo || 75, offsetMs);
      const isFreshStart = mdSectionStartTimeRef.current ? Math.abs(getGlobalTime() - mdSectionStartTimeRef.current) < 500 : true;
      if (pendingStart.sectionIndex === 0 && isFreshStart) expectedYoutubeTime = 0;
    }

    const actualTimeSecs = Math.abs(currentTimeSeconds - expectedYoutubeTime) > 2.0 ? expectedYoutubeTime : currentTimeSeconds;
    const totalSongElapsedMs = (actualTimeSecs * 1000) - offsetMs;

    // ✅ MUST BE RELATIVE TO SECTION START BEAT so the engine doesn't wipe out negative pre-rolls!
    const theoreticalSectionStartMs = sectionStartBeat * beatDurationMs;
    const sectionElapsedMs = totalSongElapsedMs - theoreticalSectionStartMs;
    const startTimestamp = getGlobalTime() - sectionElapsedMs;

    completeLiveStart(pendingStart.trackIndex, pendingStart.sectionIndex, startTimestamp, true, pendingStart.exactBeat);
  }

  function completeLiveStart(
    trackIndex: number,
    sectionIndex: number,
    startTimestamp: number,
    isYtSource: boolean,
    exactStartBeat?: number | null
  ) {
    if (
      !hasCurrentPlaybackAuthority() ||
      trackIndex !== currentTrackIndexRef.current ||
      sectionIndex !== currentSectionIndexRef.current
    ) {
      pendingYoutubeStartRef.current = null;
      isYtBackingTrackStartRef.current = false;
      ytPlayerRef.current?.pauseVideo?.();
      return;
    }

    pendingYoutubeStartRef.current = null;
    isYtBackingTrackStartRef.current = isYtSource;
    playingTrackIndexRef.current = trackIndex;
    setPlayingTrackIndex(trackIndex);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;
    isPlayingRef.current = true;
    setIsPlayingFlow(true);
    mdSectionStartTimeRef.current = startTimestamp;

    void startPlaybackTelemetry();

    executeJumpNow(trackIndex, sectionIndex, startTimestamp, true, isYtSource ? "start" : undefined, exactStartBeat === null ? undefined : exactStartBeat);

    sendSupabaseBroadcast({
      action: "START",
      trackIndex,
      sectionIndex,
      mdSectionStartTime: startTimestamp,
      isYtSource: isYtSource
    });
  }

  function handleYoutubePlaybackError() {
    const pendingStart = pendingYoutubeStartRef.current;
    if (pendingStart) {
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[pendingStart.sectionIndex] || 0;
      const beatDurationMs = (60 / (activeSongRef.current?.tempo || 75)) * 1000;
      const now = getGlobalTime();
      const startTimestamp = pendingStart.exactBeat == null
        ? now
        : now - (pendingStart.exactBeat - sectionStartBeat) * beatDurationMs;
      completeLiveStart(
        pendingStart.trackIndex,
        pendingStart.sectionIndex,
        startTimestamp,
        false,
        pendingStart.exactBeat
      );
    }
  }

  const {
    youtubeVideoId,
    isYtPlayerReady,
    ytPlayerRef, isYtPlayerReadyRef
  } = useYouTubeSync({
    activeSong,
    activeSongRef,
    beatMapRef,
    currentSectionIndexRef,
    getGlobalTime,
    youtubeVolumeRef,
    isYoutubeSyncEnabled,
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
    mode: "start" | "explicit-jump" | "snapshot"
  ) => {
    if (youtubeStartTimeoutRef.current) {
      clearTimeout(youtubeStartTimeoutRef.current);
      youtubeStartTimeoutRef.current = null;
    }

    const request = { sectionIndex, sectionStartTime, mode };
    pendingYoutubeSyncRef.current = request;
    const song = activeSongRef.current;
    const player = ytPlayerRef.current;
    if (
      !isYtBackingTrackStartRef.current ||
      !song ||
      !player ||
      !isYtPlayerReadyRef.current ||
      typeof player.seekTo !== "function"
    ) return;

    const offsetMs = song.youtube_sync_offset_ms || 0;
    const now = getGlobalTime();

    // ✅ NO CLAMPING: Allow negative time so engine knows we are in the Pre-Roll!
    const elapsedTimelineMs = now - sectionStartTime;
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[sectionIndex] || 0;
    const beatDurationMs = 60000 / (song.tempo || 75);

    const theoreticalYoutubeTimeMs = (sectionStartBeat * beatDurationMs) + elapsedTimelineMs + offsetMs;
    const expectedYoutubeTimeSecs = Math.max(0, theoreticalYoutubeTimeMs / 1000);

    try {
      setTimeout(() => {
        player.seekTo(expectedYoutubeTimeSecs, true);
        pendingYoutubeSyncRef.current = null;

        const ensurePlaying = () => {
          if (
            isPlayingRef.current &&
            isYtBackingTrackStartRef.current &&
            player.getPlayerState?.() !== 1
          ) {
            try { player.playVideo?.(); } catch (error) { console.warn(error); }
          }
        };

        // Pause YT only if required time is genuinely in the negative future (Before Video 0:00).
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
      }, 0);
    } catch (error) {}
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

    triggerMetronomeSound: (beatPulse, time) => {
      if (localClickVolumeRef.current <= 0) return;
      const soundKey = `metronome_${metronomeSoundTypeRef.current}_${beatPulse}`;
      playZeroLatencyAudio(soundKey, localClickVolumeRef.current, time);
    },

    executeJumpNow, localPresenceUserRef,
    sendSupabaseBroadcast,
    updateMetronomeUI, activeLineIndexRef, setActiveLineIndex,
    handleAdvanceToNextSetlistTrack,
    sectionStartTimeRef, pauseOffsetMsRef, animationFrameRef, playingTrackIndexRef
  });

  const [roomChannelGeneration, setRoomChannelGeneration] = useState(0);

  useEffect(() => {
    if (
      loading ||
      roomChannelGeneration === 0 ||
      !isChannelSubscribedRef.current ||
      !localPresenceUserRef.current ||
      localPresenceUserRef.current.isMD
    ) {
      return;
    }

    const requestPlaybackState = () => {
      if (!isChannelSubscribedRef.current || !localPresenceUserRef.current || localPresenceUserRef.current.isMD) return;
      realtimeChannelRef.current?.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: {
          action: "PLAYBACK_STATE_REQUEST",
          requesterConnectionId: localPresenceUserRef.current.connectionId
        }
      });
    };

    clearPlaybackStateRetry();
    requestPlaybackState();
    playbackStateRetryRef.current = setInterval(requestPlaybackState, 2500);
    return clearPlaybackStateRetry;
  }, [loading, roomChannelGeneration, localPresenceUser?.connectionId, localPresenceUser?.isMD]);

  useEffect(() => {
    if (!setlistId || !localPresenceUser?.connectionId) return;
    isChannelSubscribedRef.current = false;

    const lobbyChannel = supabase.channel(`setlist_lobby_${setlistId}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: localPresenceUser.connectionId }
      }
    });

    lobbyChannel
      .on("presence", { event: "sync" }, () => {
        const presenceState = lobbyChannel.presenceState();
        let flatUsers = Object.values(presenceState).flat() as any[];

        flatUsers.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        let mdClaimant: any = null;
        flatUsers = flatUsers.map(u => {
            if (u.isMD && !mdClaimant) {
                mdClaimant = u;
                return u;
            } else if (u.isMD) {
                return { ...u, isMD: false };
            }
            return u;
        });

        const override = latestMdBroadcastRef.current;
        if (Date.now() - override.timestamp < 3000) {
           flatUsers = flatUsers.map(u => ({ ...u, isMD: override.mdId === u.id }));
           mdClaimant = flatUsers.find(u => u.isMD) || null;
        }

        const currentMdId = mdClaimant ? mdClaimant.id : null;
        updatePlaybackAuthority(
          mdClaimant?.connectionId && mdClaimant?.authoritySessionId
            ? {
                userId: mdClaimant.id,
                connectionId: mdClaimant.connectionId,
                sessionId: mdClaimant.authoritySessionId
              }
            : null
        );
        if (prevMdRef.current && !currentMdId) {
            executeLocalResetSequence();

            if (flatUsers.length > 0) {
                const nextMD = [...flatUsers].sort((a, b) => a.id.localeCompare(b.id))[0];
                if (nextMD.id === localPresenceUserRef.current?.id) {
                    const upgraded = {
                      ...localPresenceUserRef.current,
                      isMD: true,
                      authoritySessionId: crypto.randomUUID(),
                      updatedAt: Date.now()
                    };
                    setLocalPresenceUser(upgraded);
                    localPresenceUserRef.current = upgraded;
                    updatePlaybackAuthority({
                      userId: upgraded.id,
                      connectionId: upgraded.connectionId,
                      sessionId: upgraded.authoritySessionId
                    });
                    if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(upgraded);
                    sendSupabaseBroadcast({
                      action: "MD_TAKEOVER",
                      newMdId: upgraded.id,
                      authorityConnectionId: upgraded.connectionId,
                      authoritySessionId: upgraded.authoritySessionId
                    });
                }
            }
        }
        prevMdRef.current = currentMdId;

        const liveUserIds = new Set(Object.values(presenceState).flat().map((u: any) => u.id));
        setOnlineUsers(flatUsers.filter(u => liveUserIds.has(u.id)));

        if (localPresenceUserRef.current?.isMD && mdClaimant && mdClaimant.id !== localPresenceUserRef.current.id) {
            const downgradedPayload = { ...localPresenceUserRef.current, isMD: false, updatedAt: Date.now() };
            setLocalPresenceUser(downgradedPayload);
            localPresenceUserRef.current = downgradedPayload;
            if (isChannelSubscribedRef.current) realtimeChannelRef.current?.track(downgradedPayload);
            executeLocalResetSequence();
        }

      })
      .on("broadcast", { event: "lobby_sync" }, ({ payload }) => {
        handleSyncCommand(payload);
      })
      .on("broadcast", { event: "lobby_chat" }, ({ payload }) => {
        setLobbyMessages(prev => [...prev, { ...payload, seenBy: payload.seenBy || [] }].slice(-100));
        if (!isUserLobbyOpenRef.current) setUnreadMessageCount(prev => prev + 1);
      })
      .on("broadcast", { event: "lobby_chat_seen" }, ({ payload }) => {
        setLobbyMessages(prev => prev.map(msg => {
          const filteredSeenBy = (msg.seenBy || []).filter((u: any) => u.id !== payload.reader.id);
          if (msg.id === payload.messageId) {
            return { ...msg, seenBy: [...filteredSeenBy, payload.reader] };
          }
          return { ...msg, seenBy: filteredSeenBy };
        }));
      })
      .on("broadcast", { event: "lobby_ping" }, ({ payload }) => {
        if (!payload.targetUserId || payload.targetUserId === localPresenceUserRef.current?.id) {
          setPingAlert({ senderName: payload.senderName, isWhisper: !!payload.targetUserId, text: payload.text });
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
          setRoomChannelGeneration(generation => generation + 1);
          lobbyChannel.track(localPresenceUserRef.current);
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
    return () => {
      playbackSyncRevisionRef.current++;
      isChannelSubscribedRef.current = false;
      if (lobbyChannel) supabase.removeChannel(lobbyChannel);
    };
  }, [setlistId, localPresenceUser?.connectionId]);

  function executeJumpNow(
    targetTrackIdx: number,
    targetSectionIdx: number,
    jumpTime: number,
    isInitialStart: boolean = false,
    youtubeSyncMode?: "start" | "explicit-jump" | "snapshot",
    exactStartBeat?: number | null
  ) {
    if (cancelFutureAudio) cancelFutureAudio();

    if (targetTrackIdx !== undefined && targetTrackIdx !== playingTrackIndexRef.current) {
      mountTargetSetlistTrackIndex(targetTrackIdx);
    }

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

        // jumpTime is the section-start timestamp; the exact scrub beat only seeds the next click.
        const targetAbsoluteBeat = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0;
        const beatSpeedSecs = 60 / (activeSongRef.current?.tempo || 75);
        const theoreticalSongStartOffset = targetAbsoluteBeat * beatSpeedSecs;

        audioContextStartTimeRef.current = absoluteHardwareTimeAtJump - theoreticalSongStartOffset;
      }
      if (youtubeSyncMode) {
        syncYoutubeToTimeline(targetSectionIdx, jumpTime, youtubeSyncMode);
      }
    }

    if (localPresenceUserRef.current?.isMD && isRecordingRef.current && playingSectionsRef.current.length > 0) {
      const track = tracksListRef.current[targetTrackIdx];
      const section = playingSectionsRef.current[targetSectionIdx];
      if (track && section) {
          const newItem = {
              timestamp: getGlobalTime(),
              title: track.songs?.title || "Unknown Song",
              label: `[${jumpReasonRef.current}] - ${section.section_name}`
          };
          const newHistory = updateRehearsalHistory([newItem, ...rehearsalHistoryRef.current]);
          void persistTelemetryUpdate({ rehearsal_history: newHistory });
      }
    }
    jumpReasonRef.current = "Auto Play";

    currentSectionIndexRef.current = targetSectionIdx; setCurrentSectionIndex(targetSectionIdx);

    // Seed trackers INSTANTLY with the exact scrub beat
    const sectionStartBeat = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0;
    const beatDurationMs = 60000 / (activeSongRef.current?.tempo || 75);
    const absoluteStart = exactStartBeat !== undefined && exactStartBeat !== null
      ? exactStartBeat
      : sectionStartBeat;

    lastAudioBeatRef.current = Math.max(sectionStartBeat, absoluteStart);
    lastBeatRef.current = 0; lastVisualBeatRef.current = 0;
    setTracksPlayheadBeat(isPlayingRef.current
      ? sectionStartBeat + (getGlobalTime() - jumpTime) / beatDurationMs
      : absoluteStart);

    setQueuedTrackIndex(null); setQueuedSectionIndex(null); pendingQuantizedJumpRef.current = null;
    hasPlayedCueRef.current = false;

    setShowSyncBack(false);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (isPlayingRef.current) {
      const apparentLatency = getGlobalTime() - jumpTime;
      sectionStartTimeRef.current = performance.now() - apparentLatency;
    }
  }

  function executeLocalResetSequence(preservePosition = false) {
    if (cancelFutureAudio) cancelFutureAudio();
    if (youtubeStartTimeoutRef.current) {
      clearTimeout(youtubeStartTimeoutRef.current);
      youtubeStartTimeoutRef.current = null;
    }

    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
       try { ytPlayerRef.current.pauseVideo(); } catch(e) {}
    }
    pendingYoutubeSyncRef.current = null;
    pendingYoutubeStartRef.current = null;
    isYtBackingTrackStartRef.current = false;

    setExplicitScrubBeat(null); // Clear memory on reset
    if (!preservePosition) setTracksPlayheadBeat(0);

    isPlayingRef.current = false; setIsPlayingFlow(false); hasPlayedCueRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (!preservePosition) {
      currentSectionIndexRef.current = 0;
      activeLineIndexRef.current = 0;
      setCurrentSectionIndex(0);
      setActiveLineIndex(0);
    }
    lastBeatRef.current = 0;
    updateMetronomeUI(1, false);
    setQueuedTrackIndex(null); setQueuedSectionIndex(null); setCurrentDriftMs(null);
    setShowSyncBack(false);
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (simplifiedProgressBarRef.current) simplifiedProgressBarRef.current.style.transform = "scaleX(0)";
  }

  async function persistStructure(workingBlocks: ArrangementSection[]) {
    const track = tracksListRef.current[currentTrackIndexRef.current];
    if (!track?.id) {
      setStructureSaveError("Could not save this structure because the setlist track is unavailable.");
      return;
    }

    const trackId = track.id;
    const originalStructure = track.custom_structure || [];
    const trackIndex = currentTrackIndexRef.current;
    const optimisticTracks = tracksListRef.current.map((item) =>
      item.id === trackId ? { ...item, custom_structure: workingBlocks } : item
    );
    setIsSavingStructure(true);
    setStructureSaveError(null);
    setTracksList(optimisticTracks);
    tracksListRef.current = optimisticTracks;
    setSections(workingBlocks);
    sectionsRef.current = workingBlocks;

    try {
      const { error } = await supabase
        .from("setlist_songs")
        .update({ custom_structure: workingBlocks })
        .eq("id", trackId);
      if (error) throw error;
      if (currentTrackIndexRef.current === trackIndex) handleResetFlowTrigger();
    } catch (error) {
      console.error("Failed to save setlist structure:", error);
      const restoredTracks = tracksListRef.current.map((item) =>
        item.id === trackId ? { ...item, custom_structure: originalStructure } : item
      );
      setTracksList(restoredTracks);
      tracksListRef.current = restoredTracks;
      if (currentTrackIndexRef.current === trackIndex) {
        setSections(originalStructure);
        sectionsRef.current = originalStructure;
      }
      setStructureSaveError("Could not save the structure. The previous structure has been restored; please try again.");
    } finally {
      setIsSavingStructure(false);
    }
  }

  function handleUserSelectTrackBadge(trackIdx: number) {
    mountTargetSetlistTrackIndex(trackIdx);
    if (!isPlayingFlow && localPresenceUser?.isMD) {
      sendSupabaseBroadcast({ action: "TRACK_CHANGE", trackIndex: trackIdx });
    }
  }

  function handleAdvanceToNextSetlistTrack() {
    if (!localPresenceUserRef.current?.isMD) {
      executeLocalResetSequence();
      return;
    }

    jumpReasonRef.current = "Auto Play";
    const nextTrackIndex = playingTrackIndexRef.current + 1;
    if (nextTrackIndex >= tracksListRef.current.length) {
      handleResetFlowTrigger();
      return;
    }

    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    mountTargetSetlistTrackIndex(nextTrackIndex);

    setTimeout(() => {
      if (!localPresenceUserRef.current?.isMD) return;
      const jumpTime = getGlobalTime();
      mdSectionStartTimeRef.current = jumpTime;
      isPlayingRef.current = true;
      setIsPlayingFlow(true);
      executeJumpNow(nextTrackIndex, 0, jumpTime, true);
      sendSupabaseBroadcast({ action: "START", trackIndex: nextTrackIndex, sectionIndex: 0, mdSectionStartTime: jumpTime, isYtSource: false });
    }, 120);
  }

  function handleToggleFlowPlaybackState() {
    if (!hasCurrentPlaybackAuthority()) { setIsMdLockModalOpen(true); return; }
    if (pendingYoutubeStartRef.current) {
      pendingYoutubeStartRef.current = null;
      isYtBackingTrackStartRef.current = false;
      ytPlayerRef.current?.pauseVideo?.();
      return;
    }
    if (isPlayingFlow) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
      handleResetFlowTrigger(true);
    } else {
      if (sections.length === 0 || !activeSong) return;
      executeStartSequence(localPresenceUserRef.current?.isMD === true && isYoutubeSyncEnabled && !!youtubeVideoId);
    }
  }

  function handleResetFlowTrigger(preservePosition = false) {
    void stopPlaybackTelemetry();
    executeLocalResetSequence(preservePosition);
    if (localPresenceUserRef.current?.isMD) sendSupabaseBroadcast({ action: "STOP" });
  }

  function handleSectionInteractiveSelection(index: number, overrideTrackIndex?: number, exactBeat?: number) {
    if (!hasCurrentPlaybackAuthority()) return;
    if (!isPlayingFlow && !isSyncedRef.current) {
      setPlaybackClockNotice("Waiting for clock synchronization before starting the setlist.");
      return;
    }

    const targetTrackIndex = overrideTrackIndex !== undefined ? overrideTrackIndex : currentTrackIndex;
    jumpReasonRef.current = isPlayingFlow ? "Queued" : "Quick Play";

    if (targetTrackIndex !== currentTrackIndex) {
      mountTargetSetlistTrackIndex(targetTrackIndex);
    }

    let timeOffsetMs = 0;
    if (exactBeat !== undefined && activeSongRef.current) {
      const sectionStartBeat = beatMapRef.current.sectionStartBeats[index] || 0;
      const beatDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 1000;
      timeOffsetMs = (exactBeat - sectionStartBeat) * beatDurationMs;
      setExplicitScrubBeat(exactBeat);
    } else {
      setExplicitScrubBeat(null);
    }

    if (!isPlayingFlow) {
      const jumpTime = getGlobalTime() + 150;
      const effectiveStartTime = jumpTime - timeOffsetMs;
      // ✅ SURGICAL FIX: Must pass exactBeat down to executeJumpNow
      executeJumpNow(targetTrackIndex, index, effectiveStartTime, false, "explicit-jump", exactBeat);
      sendSupabaseBroadcast({ action: "JUMP", trackIndex: targetTrackIndex, sectionIndex: index, mdSectionStartTime: effectiveStartTime });
      return;
    }

    if (clickTimeoutRef.current && exactBeat === undefined) {
      clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null;
      setQueuedTrackIndex(targetTrackIndex); setQueuedSectionIndex(index); pendingQuantizedJumpRef.current = null;
      sendSupabaseBroadcast({ action: "QUEUE", trackIndex: targetTrackIndex, sectionIndex: index });
    } else {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        let jumpTime = getGlobalTime() + 150;
        let effectiveStartTime = jumpTime - timeOffsetMs;

        if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current && exactBeat === undefined) {
          const currentPlayingSong = playingSongRef.current || activeSongRef.current;
          const currentMeter = getTimelineMeter(currentPlayingSong.section_timings);
          const currentMeasureDurationMs = (60 / (currentPlayingSong.tempo || 75)) * 1000 * currentMeter.quarterBeatsPerMeasure;

          jumpTime = getGlobalTime() + (currentMeasureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % currentMeasureDurationMs));
          effectiveStartTime = jumpTime;
          pendingQuantizedJumpRef.current = { trackIndex: targetTrackIndex, sectionIndex: index, jumpTime };
          setQueuedTrackIndex(targetTrackIndex); setQueuedSectionIndex(index);
        } else {
          // ✅ SURGICAL FIX: Must pass exactBeat down to executeJumpNow
          executeJumpNow(targetTrackIndex, index, effectiveStartTime, false, "explicit-jump", exactBeat);
        }
        sendSupabaseBroadcast({ action: "JUMP", trackIndex: targetTrackIndex, sectionIndex: index, mdSectionStartTime: effectiveStartTime });
      }, exactBeat !== undefined ? 0 : 250);
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
    const beatsPerMeasure = getTimelineMeter(activeSong.section_timings).quarterBeatsPerMeasure;

    let currentStartTime = offsetSec;

    sections.forEach((sec, idx) => {
      let rawTimings = activeSong?.section_timings?.[sec.section_name];
      if (typeof rawTimings === 'string') { try { rawTimings = JSON.parse(rawTimings); } catch(e){} }
      const timings = rawTimings || {};
      const isSpacer = sec.section_name.toLowerCase().startsWith("spacer");
      const spacerDurationBeats = isSpacer
        ? getTimelineDurationBeats(activeSong?.section_timings, idx, sec.id, activeSong?.default_structure) ?? 0.5
        : 0;

      const sectionMultiplier = (Number(timings.repeats) || 0) + 1;
      let basePassBeats = ((Number(timings.measures) || 4) * beatsPerMeasure) + (Number(timings.beats) || 0);
      let rawLineTimings: unknown = timings.line_timings;
      if (typeof rawLineTimings === "string") {
        try { rawLineTimings = JSON.parse(rawLineTimings); } catch { rawLineTimings = undefined; }
      }
      const lineTimings = rawLineTimings && typeof rawLineTimings === "object"
        ? rawLineTimings as Record<string, { measures?: number; beats?: number; repeats?: number }>
        : null;
      if (lineTimings && typeof lineTimings === "object") {
        const lineCount = (sec.content || "").split("\n").length;
        const linePassBeats = Array.from({ length: lineCount }, (_, lineIndex) => {
          const line = lineTimings[String(lineIndex)];
          if (!line) return 0;
          return (
            ((Number(line.measures) || 0) * beatsPerMeasure + (Number(line.beats) || 0)) *
            ((Number(line.repeats) || 0) + 1)
          );
        }).reduce((total, duration) => total + duration, 0);
        if (linePassBeats > 0) basePassBeats = linePassBeats;
      }
      const totalCoreBeats = basePassBeats * sectionMultiplier;
      const headBeats = (Number(timings.head_m) || 0) * beatsPerMeasure;
      const tailBeats = (Number(timings.tail_m) || 0) * beatsPerMeasure;

      let totalBeats = isSpacer ? spacerDurationBeats : totalCoreBeats + headBeats + tailBeats;
      if (!isSpacer && totalBeats <= 0) totalBeats = 16;

      const durationSec = totalBeats * secPerBeat;
      if (!sec.section_name.toLowerCase().startsWith("spacer")) {
        segments.push({
          label: sec.section_name,
          start: currentStartTime,
          end: currentStartTime + durationSec,
          duration: durationSec,
          color: getSectionColor(sec.section_name),
          sectionIndex: idx,
        });
      }
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
    if (!activeSong || sections.length === 0) {
      return { totalBeats: 0, nodes: [], sectionStartBeats: [] };
    }
    return compileTimelineBeatMap(
      sections,
      activeSong.section_timings,
      memoizedSongAstTree.map((section) => section.lines.length),
      activeSong.default_structure
    );
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
    const beatsPerMeasure = getTimelineMeter(activeSong?.section_timings).quarterBeatsPerMeasure;
    const sectionMultiplier = (Number(timings.repeats) || 0) + 1;
    let basePassBeats = ((Number(timings.measures) || 4) * beatsPerMeasure) + (Number(timings.beats) || 0);
    let rawLineTimings: unknown = timings.line_timings;
    if (typeof rawLineTimings === "string") {
      try { rawLineTimings = JSON.parse(rawLineTimings); } catch { rawLineTimings = undefined; }
    }
    const lineTimings = rawLineTimings && typeof rawLineTimings === "object"
      ? rawLineTimings as Record<string, { measures?: number; beats?: number; repeats?: number }>
      : null;
    if (sectionIdx !== undefined && lineTimings && typeof lineTimings === "object") {
      const lineCount = memoizedSongAstTree[sectionIdx]?.lines.length || 1;
      const linePassBeats = Array.from({ length: lineCount }, (_, lineIndex) => {
        const line = lineTimings[String(lineIndex)];
        if (!line) return 0;
        return (
          ((Number(line.measures) || 0) * beatsPerMeasure + (Number(line.beats) || 0)) *
          ((Number(line.repeats) || 0) + 1)
        );
      }).reduce((total, duration) => total + duration, 0);
      if (linePassBeats > 0) basePassBeats = linePassBeats;
    }

    const totalCoreBeats = basePassBeats * sectionMultiplier;
    const headBeats = (Number(timings.head_m) || 0) * beatsPerMeasure;
    const tailBeats = (Number(timings.tail_m) || 0) * beatsPerMeasure;

    let totalBeats = totalCoreBeats + headBeats + tailBeats;
    if (totalBeats <= 0) totalBeats = 16;

    const tempo = Number(activeSong?.tempo) || 75;
    const totalSeconds = Math.round((totalBeats * (60000 / tempo)) / 1000);

    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  if (loading) return <PageSkeleton message="LOADING SETLIST..." variant="live" />;

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
          isRecordingTelemetry={isRecording}
          isTelemetryPaused={isPaused}
          recordingStartTime={recordingStartTime}
          recordingAccumulatedMs={recordingAccumulatedMs}
          telemetrySaveError={telemetrySaveError}
          getGlobalTime={getGlobalTime}
        />
      )}

      {playbackClockNotice && (
        <div role="status" className="fixed top-20 left-1/2 z-[500000] -translate-x-1/2 rounded-xl bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-900 shadow-lg">
          {playbackClockNotice}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ✅ DYNAMIC VIEW ROUTER: Sheet (Horizontal), Stack (Vertical), Tracks (Split) */}
      {/* ========================================================================= */}
      {isSimplifiedMode ? (
        <div className="flex-1 w-full h-full relative overflow-hidden bg-surface">
          <SimplifiedStackView
            setlistAst={memoizedSetlistAst}
            memoizedSongAstTree={memoizedSongAstTree}
            currentSectionIndex={currentSectionIndex}
            queuedSectionIndex={queuedSectionIndex}
            queuedTrackIndex={queuedTrackIndex}
            currentTrackIndex={currentTrackIndex}
            activeLineIndex={activeLineIndex}
            chordFormat={chordFormat}
            activeDisplayKey={activeDisplayKey}
            getSectionDurationString={getSectionDurationString}
            simplifiedProgressBarRef={simplifiedProgressBarRef}
            upcomingTrackItem={tracksList[currentTrackIndex + 1] || null}
            handleSectionInteractiveSelection={handleSectionInteractiveSelection}
            handleUserSelectTrackBadge={handleUserSelectTrackBadge}
            showChords={showChords} lyricsFontSize={lyricsFontSize} lineSpacing={lineSpacing}
          />
        </div>
      ) : isTracksMode ? (
        <div className="flex-1 w-full h-full relative overflow-hidden bg-[#09090b]">
          <TracksView
             activeSong={activeSong} // ✅ SURGICAL FIX: Feed the raw song data so it can parse line timings
             sections={sections}
             songAst={memoizedSongAstTree}
             sectionStarts={beatMapRef.current.sectionStartBeats}
             sectionDurations={sections.map((_, i) => Math.max(0, (beatMapRef.current.sectionStartBeats[i + 1] ?? beatMapRef.current.totalBeats) - (beatMapRef.current.sectionStartBeats[i] ?? 0)))}
             totalBeats={beatMapRef.current.totalBeats}
             quarterBeatsPerMeasure={getTimelineMeter(activeSong?.section_timings).quarterBeatsPerMeasure}
             activeSectionIndex={currentSectionIndex}
             queuedSectionIndex={queuedTrackIndex === currentTrackIndex ? queuedSectionIndex : null}
             activeLineIndex={activeLineIndex}
             playheadBeat={isPlayingFlow ? tracksPlayheadBeat : (explicitScrubBeat !== null ? explicitScrubBeat : (beatMapRef.current.sectionStartBeats[currentSectionIndex] ?? 0))}
             isPlaying={isPlayingFlow}
             tempo={activeSong?.tempo ?? 75}
             showChords={showChords}
             lyricsFontSize={lyricsFontSize}
             lineSpacing={lineSpacing}
             chordFormat={chordFormat}
             activeDisplayKey={activeDisplayKey}
             // ✅ SURGICAL FIX: Feed MD capabilities to TracksView so the timeline can be clicked!
             handleSectionInteractiveSelection={handleSectionInteractiveSelection}
             isMD={localPresenceUser?.isMD}
          />
        </div>
      ) : (
        <div
          ref={carouselRef}
          className="flex-1 flex flex-row w-full h-full relative overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {memoizedSetlistAst.map((trackAst, idx) => {
            const isActive = idx === currentTrackIndex;
            const localScrollRef = trackScrollRefs.current[idx];
            const localSectionRefs = trackSectionRefs.current[idx];

            return (
              <div key={trackAst.trackId} className="w-full min-w-full max-w-full h-full shrink-0 relative flex flex-col overflow-x-hidden snap-center">
                  <StandardSheetView
                    memoizedSongAstTree={isActive ? memoizedSongAstTree : trackAst.ast}
                    isPlayingFlow={isActive ? isPlayingFlow : false}
                    isInteractive={isActive}
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
                    sectionRefs={localSectionRefs}
                    scrollContainerRef={localScrollRef}
                  />
              </div>
            );
          })}
        </div>
      )}

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
        isSettingsModalOpen={isSettingsModalOpen} setIsSettingsModalOpen={setIsSettingsModalOpen} localPresenceUser={localPresenceUser} onlineUsers={onlineUsers} handleToggleMusicDirectorMode={handleTogglePlaybackAuthority}
        showChords={showChords} setShowChords={setShowChords} chordFormat={chordFormat} setChordFormat={setChordFormat} isSimplifiedMode={isSimplifiedMode} setIsSimplifiedMode={setIsSimplifiedMode} isTracksMode={isTracksMode} setIsTracksMode={setIsTracksMode}
        isZenMode={isZenMode} setIsZenMode={setIsZenMode}
        metronomeSoundType={metronomeSoundType}
        setMetronomeSoundType={setMetronomeSoundType}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing} lyricsFontSize={lyricsFontSize} setLyricsFontSize={setLyricsFontSize}
        isMetronomeSoundEnabled={isMetronomeSoundEnabled} setIsMetronomeSoundEnabled={setIsMetronomeSoundEnabled} isDoubleMetronomeEnabled={isDoubleMetronomeEnabled} setIsDoubleMetronomeEnabled={setIsDoubleMetronomeEnabled}
        localClickVolume={localClickVolume} setLocalClickVolume={setLocalClickVolume} audioLatencyOffsetMs={audioLatencyOffsetMs} setAudioLatencyOffsetMs={setAudioLatencyOffsetMs}
        isTestingSync={isTestingSync} setIsTestingSync={setIsTestingSync} testVisualBeat={testVisualBeat} activeSong={activeSong}
        isYoutubeSyncEnabled={localPresenceUser?.isMD === true && isYoutubeSyncEnabled}
        setIsYoutubeSyncEnabled={handleSetYoutubeSync}
        youtubeVolume={youtubeVolume} setYoutubeVolume={setYoutubeVolume}
        isClickGuideHardPannedRight={isClickGuideHardPannedRight}
        setIsClickGuideHardPannedRight={setIsClickGuideHardPannedRight}
        canEditSong={canEditSong}
        isRecording={isRecording} setIsRecordModalOpen={setIsRecordModalOpen}
        recordingStartTime={recordingStartTime}
        isPaused={isPaused} recordingAccumulatedMs={recordingAccumulatedMs}
        getGlobalTime={getGlobalTime}
        isPlayingFlow={isPlayingFlow} router={router} handleOpenTransposerModal={() => setIsTransposerOpen(true)} setIsStructureModalOpen={setIsStructureModalOpen}
      />

      <StructureEditorModal
        isStructureModalOpen={isStructureModalOpen} setIsStructureModalOpen={setIsStructureModalOpen} isSavingStructure={isSavingStructure} sections={sections}
        originalStructure={tracksList[currentTrackIndex]?.original_structure || []}
        onReset={() => { void persistStructure([...(tracksList[currentTrackIndex]?.original_structure || [])]); }}
        draggedSectionIndex={draggedSectionIndex} setDraggedSectionIndex={setDraggedSectionIndex} dragOverIndex={dragOverIndex} setDragOverIndex={setDragOverIndex}
        handleModalSectionDrop={(idx) => {
          if (isSavingStructure || draggedSectionIndex === null || draggedSectionIndex === idx || !activeSong) return;
          const workingBlocks = [...sections];
          workingBlocks.splice(idx, 0, workingBlocks.splice(draggedSectionIndex, 1)[0]);
          setDragOverIndex(null);
          setDraggedSectionIndex(null);
          void persistStructure(workingBlocks);
        }}
        handleModalSectionRemoveItem={(idx) => {
          if (isSavingStructure || !activeSong || sections.length <= 1) return;
          void persistStructure(sections.filter((_, i) => i !== idx));
        }}
        setIsAddBlockModalOpen={setIsAddBlockModalOpen}
        saveError={structureSaveError}
      />

      <AddBlockModal
        isAddBlockModalOpen={isAddBlockModalOpen}
        setIsAddBlockModalOpen={setIsAddBlockModalOpen}
        availableSectionNames={availableSongSections}
        handleModalAppendNewSectionItem={async (name) => {
          if (!activeSong || isSavingStructure) return;
          let sectionContent = sections.find((section) => section.section_name === name)?.content;
          if (!sectionContent?.trim()) {
            const { data, error } = await supabase
              .from("song_sections")
              .select("content")
              .eq("song_id", activeSong.id)
              .eq("section_name", name)
              .maybeSingle();
            if (error) {
              setStructureSaveError("Could not load the selected section. Please try again.");
              return;
            }
            sectionContent = data?.content || undefined;
          }
          const workingBlocks = [...sections, { id: `local-${Date.now()}`, section_name: name, content: sectionContent || " " }];
          await persistStructure(workingBlocks);
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
        saveError={telemetrySaveError}
        getGlobalTime={getGlobalTime}
        onStartRecording={async () => {
          if (!localPresenceUser?.isMD) return;
          const now = getGlobalTime(); setIsRecording(true); setIsPaused(false); setRecordingStartTime(now);
          isRecordingRef.current = true;
          isPausedRef.current = false;
          const isFreshStart = !isPaused && recordingAccumulatedMs === 0;
          const updatedHistory = updateRehearsalHistory([
            {
              timestamp: now,
              title: isFreshStart ? "🎙️ New Recording Session" : "▶️ Session Resumed",
              label: isFreshStart ? "Session Initiated" : "Timer continued",
            },
            ...rehearsalHistoryRef.current,
          ]);
          await persistTelemetryUpdate({
            is_recording: true,
            is_paused: false,
            recording_start_time: now,
            rehearsal_history: updatedHistory,
            ...(isFreshStart ? { recording_accumulated_ms: 0 } : {}),
          });
        }}
        onPauseRecording={async () => {
          if (!localPresenceUser?.isMD || !recordingStartTime) return;
          const now = getGlobalTime(); const newAccumulated = recordingAccumulatedMs + (now - recordingStartTime);
          setIsPaused(true); setRecordingAccumulatedMs(newAccumulated);
          isPausedRef.current = true;
          const updatedHistory = updateRehearsalHistory([
            { timestamp: now, title: "⏸️ Session Paused", label: "Timer halted" },
            ...rehearsalHistoryRef.current,
          ]);
          await persistTelemetryUpdate({
            is_paused: true,
            recording_accumulated_ms: newAccumulated,
            rehearsal_history: updatedHistory,
          });
        }}
        onStopRecording={async () => {
          if (!localPresenceUser?.isMD) return;
          const now = getGlobalTime(); setIsRecording(false); setIsPaused(false); setRecordingStartTime(null); setRecordingAccumulatedMs(0);
          isRecordingRef.current = false;
          isPausedRef.current = false;
          if (playbackTelemetrySessionRef.current) {
            playbackTelemetrySessionRef.current.ownsRecording = false;
          }
          const updatedHistory = updateRehearsalHistory([
            { timestamp: now, title: "⏹️ Session Ended", label: "Recording finalized" },
            ...rehearsalHistoryRef.current,
          ]);
          await persistTelemetryUpdate({
            is_recording: false,
            is_paused: false,
            recording_start_time: null,
            recording_accumulated_ms: 0,
            rehearsal_history: updatedHistory,
          });
        }}
      />

      <MdLockModal
        isMdLockModalOpen={isMdLockModalOpen} setIsMdLockModalOpen={setIsMdLockModalOpen}
        activeMDConnection={onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id)}
        handleToggleMusicDirectorMode={handleTogglePlaybackAuthority}
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
                                  // ✅ SURGICAL FIX: "Play Now" while stopped actually STARTS the playback from this chapter!
                                  currentSectionIndexRef.current = seg.sectionIndex;
                                  setCurrentSectionIndex(seg.sectionIndex);
                                  executeStartSequence(localPresenceUserRef.current?.isMD === true && isYoutubeSyncEnabled && !!youtubeVideoId);
                                } else {
                                  let jumpTime = getGlobalTime() + 150;
                                  if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
                                    const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000;
                                    jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
                                    pendingQuantizedJumpRef.current = { trackIndex: currentTrackIndex, sectionIndex: seg.sectionIndex, jumpTime };
                                    setQueuedTrackIndex(currentTrackIndex); setQueuedSectionIndex(seg.sectionIndex);
                                  } else {
                                    executeJumpNow(currentTrackIndex, seg.sectionIndex, jumpTime, false, "explicit-jump");
                                  }
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
        teamId={setlistTeamId || userTeamId}
        setlistId={setlistId}
        setlistName={setlistName}
        eventName={setlistEventName}
        trackTitles={setlistTrackTitles}
      />

      <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-50"><div id="yt-live-player-container"></div></div>

    </div>
  );
}