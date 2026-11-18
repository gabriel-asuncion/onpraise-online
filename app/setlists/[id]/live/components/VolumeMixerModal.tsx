"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import type { useMultitrackEngine } from "../../../../../hooks/useMultitrackEngine";
import {
  findSongAudioFiles, findSongAudioFilesFromFileList, getSavedAudioFolderHandle,
  getSongAudioStems, inferStemRole, isDirectoryHandlePickerSupported,
  pickAndSaveRootAudioFolder, removeSongAudioStem, resolveSongAudioStems,
  saveFilesToDeviceDownloads, saveSongAudioStem, verifyFolderPermission,
  type AudioDirectoryHandle, type StoredAudioStem,
} from "../../../../../lib/offline-audio";
import { expandAndFilterStemFiles } from "../../../../../lib/zip-audio";
import {
  downloadPublicDriveStemFile,
  findMatchingDriveStemFiles,
  formatDriveFileSize,
  isGoogleDriveConfigured,
  listPublicDriveStems,
  type DriveStemFile,
} from "../../../../../lib/google-drive-stems";
import { getStemSlot, groupStemSlots, type StemSlot } from "../../../../../lib/stem-slots";
import type { MultitrackEngine } from "../../../../../lib/multitrack-engine";
import { STEM_MIDI_ACTION_GROUPS } from "../hooks/midiProfiles";
import type { ControlActionId, MidiControlMapping } from "../hooks/useKeyboardMidiControls";

interface VolumeMixerModalProps {
  audioSource?: "youtube" | "local";
  multitrack?: ReturnType<typeof useMultitrackEngine>;
  songId?: string;
  songTitle?: string;
  userId?: string | null;
  midiBindings?: Partial<Record<ControlActionId, MidiControlMapping>>;
  learningActionId?: ControlActionId | null;
  onStartMidiLearn?: (actionId: ControlActionId) => void;
  onClearMidiBinding?: (actionId: ControlActionId) => void;
  onApplySmcStemPreset?: () => void;
  onStemsChanged?: (stems: StoredAudioStem[]) => void;
  isStemsLoading?: boolean;
  midiError?: string | null;
  isOpen: boolean;
  onClose: () => void;
  localClickVolume: number;
  setLocalClickVolume: (val: number) => void;
  guideVolume: number;
  setGuideVolume: (val: number) => void;
  youtubeVolume: number;
  setYoutubeVolume: (val: number) => void;
  mixerMutes: { click: boolean; guide: boolean; yt: boolean };
  setMixerMutes: React.Dispatch<React.SetStateAction<{ click: boolean; guide: boolean; yt: boolean }>>;
  mixerSolos: { click: boolean; guide: boolean; yt: boolean };
  setMixerSolos: React.Dispatch<React.SetStateAction<{ click: boolean; guide: boolean; yt: boolean }>>;
  isClickGuideHardPannedRight: boolean;
  setIsClickGuideHardPannedRight: (val: boolean) => void;
  // ✅ SURGICAL FIX: Match the strict types here too
  metronomeSoundType: "blip" | "bell" | "block" | "glass";
  setMetronomeSoundType: (val: "blip" | "bell" | "block" | "glass") => void;
}

// --- REUSABLE CUSTOM FADER COMPONENT ---
interface FaderChannelProps {
  id: string;
  label: string;
  val: number;
  setVal: (v: number) => void;
  isMuted: boolean;
  isSoloed: boolean;
  anySoloActive: boolean;
  toggleMute: () => void;
  toggleSolo: () => void;
  top?: React.ReactNode;
  disabled?: boolean;
  meterActive?: boolean;
  assignMode?: boolean;
  actions?: { vol: ControlActionId; mute: ControlActionId; solo: ControlActionId };
  learningActionId?: ControlActionId | null;
  midiBindings?: Partial<Record<ControlActionId, MidiControlMapping>>;
  onStartMidiLearn?: (actionId: ControlActionId) => void;
  onClearMidiBinding?: (actionId: ControlActionId) => void;
}

const FaderChannel = ({ 
  label, val, setVal, isMuted, isSoloed, anySoloActive, toggleMute, toggleSolo,
  top, disabled, meterActive = true, assignMode, actions, learningActionId, midiBindings, onStartMidiLearn, onClearMidiBinding,
}: FaderChannelProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateValueFromPointer = (clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    
    let newY = clientY - rect.top;
    
    if (newY < 0) newY = 0;
    if (newY > rect.height) newY = rect.height;
    
    const percent = 1 - (newY / rect.height);
    setVal(percent);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (assignMode && actions) {
      onStartMidiLearn?.(actions.vol);
      return;
    }
    if (disabled) return;
    isDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateValueFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const badge = (action: ControlActionId) => {
    const binding = midiBindings?.[action];
    if (!assignMode || !binding) return null;
    return <span className="text-[9px] text-cyan-300">{binding.messageType === "pitchbend" ? `PB ${binding.channel + 1}` : `${binding.messageType === "note" ? "N" : "CC"} ${binding.number}`}
      <button type="button" aria-label={`Clear ${action} binding`} onClick={() => onClearMidiBinding?.(action)}> ×</button></span>;
  };

  return (
    <div className="flex flex-col items-center bg-[#333336] p-3 sm:p-4 rounded-xl border border-[#222] shadow-xl w-[108px] sm:w-[118px] shrink-0 select-none touch-none">
      {top && <div className="w-full min-h-[34px] flex flex-col justify-center mb-1">{top}</div>}
      <div className={`h-48 relative flex justify-center items-center my-3 w-full ${disabled ? "opacity-45" : ""}`}>
        {/* Left Decibel Markers */}
        <div className="absolute left-1.5 top-0 bottom-0 flex flex-col justify-between text-[8px] text-zinc-500 font-mono h-full py-2 pointer-events-none">
          <span>12</span><span>6</span><span>0</span><span>-5</span><span>-10</span><span>-24</span>
        </div>
        
        {/* CUSTOM FADER UI */}
        <div 
          className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-12 flex justify-center touch-none cursor-pointer z-10 rounded-lg ${actions && learningActionId === actions.vol ? "animate-pulse ring-2 ring-cyan-400" : ""}`}
          role={assignMode && actions ? "button" : undefined}
          aria-label={assignMode && actions ? `Assign ${label} fader MIDI` : undefined}
          tabIndex={assignMode && actions ? 0 : undefined}
          onKeyDown={(event) => {
            if (assignMode && actions && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onStartMidiLearn?.(actions.vol);
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div ref={trackRef} className="relative w-2 h-full bg-zinc-100 rounded-full shadow-inner pointer-events-none">
            <div className="absolute bottom-0 left-0 w-full bg-blue-600 rounded-full transition-none" style={{ height: `${val * 100}%` }} />
            <div className="absolute left-1/2 -translate-x-1/2 w-5 h-5 bg-blue-600 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition-none" style={{ bottom: `${val * 100}%`, transform: 'translateY(50%)' }} />
          </div>
        </div>
        
        {/* Right LED Lights */}
        <div className="absolute right-1.5 top-0 bottom-0 flex flex-col justify-between h-full py-2 opacity-80 pointer-events-none">
          {[...Array(6)].map((_, i) => {
            const isLightOn = meterActive && val >= (1 - (i * 0.2)) - 0.01 && !isMuted && (!anySoloActive || isSoloed);
            return (
              <div key={i} className={`w-1.5 h-1.5 rounded-sm ${isLightOn ? 'bg-green-400 shadow-[0_0_5px_#4ade80]' : 'bg-[#1a1a1a]'}`} />
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mt-2 w-full justify-center">
        <button type="button" disabled={disabled && !assignMode} aria-label={`Mute ${label}`} aria-pressed={isMuted} onClick={() => assignMode && actions ? onStartMidiLearn?.(actions.mute) : toggleMute()} className={`w-8 h-8 rounded-md text-xs font-black shadow-sm transition-all active:scale-95 ${actions && learningActionId === actions.mute ? "animate-pulse ring-2 ring-cyan-400" : ""} ${isMuted ? (actions ? 'bg-amber-500 text-white' : 'bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]') : 'bg-[#444] text-zinc-300 border-b-2 border-[#222] hover:bg-[#555]'}`}>M</button>
        <button type="button" disabled={disabled && !assignMode} aria-label={`Solo ${label}`} aria-pressed={isSoloed} onClick={() => assignMode && actions ? onStartMidiLearn?.(actions.solo) : toggleSolo()} className={`w-8 h-8 rounded-md text-xs font-black shadow-sm transition-all active:scale-95 ${actions && learningActionId === actions.solo ? "animate-pulse ring-2 ring-cyan-400" : ""} ${isSoloed ? 'bg-amber-400 text-white shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'bg-[#444] text-zinc-300 border-b-2 border-[#222] hover:bg-[#555]'}`}>S</button>
      </div>
      {actions && assignMode && <div className="flex flex-col items-center gap-0.5 mt-1.5">{badge(actions.vol)}{badge(actions.mute)}{badge(actions.solo)}</div>}
      <div className="mt-3.5 text-[10px] text-zinc-300 font-black tracking-widest uppercase text-center w-full truncate border-t border-[#444] pt-2.5">
        {label}
      </div>
    </div>
  );
};


export function VolumeMixerModal({
  isOpen, onClose, localClickVolume, setLocalClickVolume,
  guideVolume, setGuideVolume, youtubeVolume, setYoutubeVolume,
  mixerMutes: mutes, setMixerMutes: setMutes, mixerSolos: solos, setMixerSolos: setSolos,
  isClickGuideHardPannedRight, setIsClickGuideHardPannedRight,
  metronomeSoundType, setMetronomeSoundType, audioSource = "youtube", multitrack,
  songId, songTitle, userId, midiBindings, learningActionId, onStartMidiLearn,
  onClearMidiBinding, onApplySmcStemPreset, onStemsChanged, isStemsLoading = false, midiError,
}: VolumeMixerModalProps) {
  const [stems, setStems] = useState<StoredAudioStem[]>([]);
  const [mixes, setMixes] = useState<ReturnType<MultitrackEngine["getStemMixes"]>>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFolder, setHasFolder] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [linkedFolderName, setLinkedFolderName] = useState<string | null>(null);
  const [folderNeedsPermission, setFolderNeedsPermission] = useState(false);
  const [isDriveOpen, setIsDriveOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveStemFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveStatus, setDriveStatus] = useState<string | null>(null);
  const [driveProgress, setDriveProgress] = useState<{
    percent: number | null;
    loadedBytes: number;
    totalBytes: number | null;
    phase: "downloading" | "extracting";
  } | null>(null);
  const hasGoogleDrive = isGoogleDriveConfigured();
  const batchInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);
  const folderFallbackInput = useRef<HTMLInputElement>(null);
  const folderRef = useRef<AudioDirectoryHandle | null>(null);
  const selectedSlot = useRef<StemSlot | null>(null);
  const revision = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const getEngine = multitrack?.getEngine;
  const loadWhilePaused = multitrack?.loadWhilePaused;

  const reportError = useCallback((reason: unknown) => {
    console.error("Stage mixer local audio error:", reason);
    setError(reason instanceof Error ? reason.message : "Could not update local audio.");
  }, []);

  useEffect(() => {
    if (!isOpen || audioSource !== "local" || !userId || !songId) return;
    const current = ++revision.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const start = async () => {
      try {
        const [saved, folder] = await Promise.all([
          resolveSongAudioStems(userId, songId, songTitle ?? "", controller.signal),
          getSavedAudioFolderHandle(userId),
        ]);
        if (current !== revision.current) return;
        setStems(saved);
        onStemsChanged?.(saved);
        setLoadedKey(`${userId}:${songId}`);
        setHasFolder(Boolean(folder));
        setLinkedFolderName(folder?.folderName ?? null);
        folderRef.current = folder?.handle ?? null;
        if (folder?.handle) {
          const perm = await folder.handle.queryPermission({ mode: "read" });
          if (current === revision.current) setFolderNeedsPermission(perm !== "granted");
        } else {
          setFolderNeedsPermission(false);
        }
        if (onStemsChanged || !getEngine || !loadWhilePaused || saved.length === 0) return;
        const engine = getEngine();
        if (engine.getStemMixes().length === 0 && !engine.isPlaying) {
          await loadWhilePaused(saved.map((stem) => ({ id: stem.stemId, blob: stem.blob, sourceVersion: stem.updatedAt })), controller.signal);
        }
      } catch (reason) {
        if (current === revision.current) reportError(reason);
      }
    };
    void start();
    return () => { revision.current += 1; controller.abort(); folderRef.current = null; };
  }, [isOpen, audioSource, userId, songId, getEngine, loadWhilePaused, reportError, onStemsChanged]);

  useEffect(() => {
    if (!isOpen || audioSource !== "local" || !getEngine) return;
    let active = true;
    let failed = false;
    const update = () => {
      if (failed) return;
      try {
        const engine = getEngine();
        const next = engine.getStemMixes();
        setPlaying(engine.isPlaying);
        setMixes((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      } catch (reason) {
        failed = true;
        if (active) reportError(reason);
      }
    };
    update();
    const interval = window.setInterval(update, 150);
    return () => { active = false; window.clearInterval(interval); };
  }, [isOpen, audioSource, getEngine, reportError]);

  const run = async (action: (signal: AbortSignal) => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const signal = abortRef.current?.signal;
    try {
      if (!userId || !songId || !multitrack) throw new Error("An active song, user, and multitrack engine are required.");
      if (isStemsLoading) throw new Error("Wait for the song's stems to finish loading.");
      const engine = multitrack.getEngine();
      if (engine.isPlaying) throw new Error("Pause local playback before changing stems.");
      if (loadedKey !== `${userId}:${songId}`) throw new Error("Wait for the song's stems to finish loading.");
      if (engine.getStemMixes().some((mix) => !stems.some((stem) => stem.ownerId === userId && stem.songId === songId && stem.stemId === mix.id))) {
        throw new Error("The audio engine contains other tracks. Clear them in the current player before changing files here.");
      }
      if (!signal || signal.aborted) throw new Error("The audio mixer is no longer active.");
      await action(signal);
    } catch (reason) {
      if (!signal?.aborted) {
        reportError(reason);
        if (userId && songId) {
          try {
            const saved = await getSongAudioStems(userId, songId);
            if (!signal?.aborted) { setStems(saved); onStemsChanged?.(saved); }
          } catch (storageError) {
            console.error("Could not refresh stored stems after the mixer error:", storageError);
          }
        }
      }
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  const reload = async (signal: AbortSignal) => {
    if (!userId || !songId || !multitrack) throw new Error("An active song and audio engine are required.");
    const saved = await getSongAudioStems(userId, songId);
    if (signal.aborted) return;
    setStems(saved);
    onStemsChanged?.(saved);
    if (!await multitrack.loadWhilePaused(saved.map((stem) => ({ id: stem.stemId, blob: stem.blob, role: stem.role, sourceVersion: stem.updatedAt })), signal)) {
      if (signal.aborted) return;
      throw new Error("Audio loading was interrupted. Reopen the mixer and try again.");
    }
    setMixes(multitrack.getEngine().getStemMixes());
  };

  const importFiles = async (files: File[], signal: AbortSignal, slot?: StemSlot): Promise<File[]> => {
    if (!userId || !songId) throw new Error("Select a song and sign in before importing audio.");
    const resolvedFiles = slot ? files : await expandAndFilterStemFiles(files, signal);
    if (signal.aborted) return [];
    if (!resolvedFiles.length) {
      throw new Error("No valid stem audio files were found (instrumental tracks are ignored).");
    }
    const existing = await getSongAudioStems(userId, songId);
    const groups = groupStemSlots(existing);
    const used = new Set<StemSlot>();
    for (const file of resolvedFiles) {
      if (signal.aborted) return [];
      const role = slot ?? getStemSlot(inferStemRole(file.name));
      if (used.has(role) || groups[role].length > 1) {
        throw new Error(`Multiple files match ${role.toUpperCase()}. Resolve the conflict before importing.`);
      }
      used.add(role);
    }
    for (const file of resolvedFiles) {
      if (signal.aborted) return [];
      const role = slot ?? getStemSlot(inferStemRole(file.name));
      const stemId = groups[role][0]?.stemId ?? crypto.randomUUID();
      await saveSongAudioStem({ key: `${userId}:${songId}:${stemId}`, ownerId: userId, songId, stemId,
        label: file.name, role, fileName: file.name, mimeType: file.type, blob: file, updatedAt: new Date().toISOString() });
    }
    await reload(signal);
    return resolvedFiles;
  };

  const loadDriveLibrary = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && driveFiles.length > 0) {
      setIsDriveOpen(true);
      return;
    }
    setIsDriveOpen(true);
    setDriveLoading(true);
    setError(null);
    try {
      const files = await listPublicDriveStems(abortRef.current?.signal);
      setDriveFiles(files);
    } catch (reason) {
      if (!abortRef.current?.signal.aborted) reportError(reason);
    } finally {
      setDriveLoading(false);
    }
  }, [driveFiles.length, reportError]);

  const importFromDrive = (targets: DriveStemFile[]) => {
    if (!targets.length) return;
    void run(async (signal) => {
      try {
        const downloaded: File[] = [];
        const knownSizes = targets.map((t) => Number(t.size) || 0);
        const allSizesKnown = knownSizes.every((s) => s > 0);
        const batchTotalBytes = allSizesKnown ? knownSizes.reduce((sum, s) => sum + s, 0) : null;
        let completedBytes = 0;

        for (let i = 0; i < targets.length; i++) {
          if (signal.aborted) return;
          const target = targets[i];
          setDriveStatus(
            targets.length > 1
              ? `Downloading ${target.name} (${i + 1}/${targets.length})...`
              : `Downloading ${target.name}...`
          );
          const file = await downloadPublicDriveStemFile(target, signal, (prog) => {
            const total = batchTotalBytes ?? (targets.length === 1 ? prog.totalBytes : null);
            const loaded = completedBytes + prog.loadedBytes;
            const percent = total && total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : prog.percent;
            setDriveProgress({
              percent,
              loadedBytes: loaded,
              totalBytes: total,
              phase: "downloading",
            });
          });
          completedBytes += file.size;
          downloaded.push(file);
        }

        setDriveStatus("Extracting & saving stems to Downloads...");
        setDriveProgress({
          percent: 100,
          loadedBytes: completedBytes,
          totalBytes: completedBytes || null,
          phase: "extracting",
        });
        const importedStems = await importFiles(downloaded, signal);
        if (!signal.aborted && importedStems.length > 0) {
          await saveFilesToDeviceDownloads(importedStems, songTitle);
        }
        setIsDriveOpen(false);
      } finally {
        setDriveStatus(null);
        setDriveProgress(null);
      }
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setIsDriveOpen(false);
      setDriveSearch("");
      setDriveStatus(null);
      setDriveProgress(null);
    }
  }, [isOpen]);

  const updateMix = (id: string, update: { volume?: number; muted?: boolean; solo?: boolean }) => {
    try {
      if (!getEngine) throw new Error("The audio engine is unavailable.");
      const engine = getEngine();
      engine.setStemMix(id, update);
      setMixes(engine.getStemMixes());
    } catch (reason) { reportError(reason); }
  };

  // --- FLUID DISMISS ENGINE ---
  const [dragY, setDragY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const startY = useRef(0);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); setDragY(0); onClose(); }, 250); 
  };

  const handleTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) setDragY(diff); 
  };
  const handleTouchEnd = () => { dragY > 100 ? handleClose() : setDragY(0); };

  const groups = groupStemSlots(stems.filter((stem) => stem.ownerId === userId && stem.songId === songId));
  const anySoloActive = solos.click || solos.yt || solos.guide;

  if (!isOpen) return null;

  // ✅ SURGICAL FIX: Strictly type the array so the onClick handler is happy
  const SOUND_OPTIONS: ("blip" | "bell" | "block" | "glass")[] = ['blip', 'bell', 'block', 'glass'];

  return (
    <div className={`fixed inset-0 z-[500000] flex items-end justify-center sm:items-center transition-opacity duration-250 ${isClosing ? "opacity-0" : "animate-in fade-in"}`}>
      <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div 
        className={`w-full ${audioSource === "local" ? "sm:max-w-4xl" : "sm:max-w-md"} bg-[#2b2b2b] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#444] overflow-hidden flex flex-col pb-safe relative z-10 animate-in slide-in-from-bottom-full duration-300`}
        style={{ transform: isClosing ? 'translateY(100vh)' : (dragY > 0 ? `translateY(${dragY}px)` : undefined), transition: isClosing || dragY === 0 ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none' }}
      >
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#333] cursor-grab active:cursor-grabbing touch-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="flex flex-col flex-1 items-center sm:items-start pl-8 sm:pl-0">
            <div className="w-10 h-1 bg-[#555] rounded-full mb-3 sm:hidden" /> 
            <h3 className="text-sm font-black tracking-wider uppercase text-zinc-200">Stage Mixer</h3>
          </div>
          <button onClick={handleClose} className="w-8 h-8 bg-[#444] hover:bg-[#555] text-zinc-300 rounded-full flex items-center justify-center font-bold transition-colors shrink-0">✕</button>
        </div>

        {audioSource === "local" && <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-[#262628] border-b border-[#343438] text-[11px] font-bold text-zinc-200">
          <input ref={batchInput} type="file" accept="audio/*,.zip,application/zip,application/x-zip-compressed" multiple className="hidden" onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = "";
            if (files.length) void run((signal) => importFiles(files, signal));
          }} />
          <input ref={slotInput} type="file" accept="audio/*" className="hidden" onChange={(event) => {
            const file = event.currentTarget.files?.[0]; const slot = selectedSlot.current; event.currentTarget.value = "";
            if (file && slot) void run((signal) => importFiles([file], signal, slot));
          }} />
          <input
            ref={(el) => {
              folderFallbackInput.current = el;
              if (el) {
                el.setAttribute("webkitdirectory", "");
                el.setAttribute("directory", "");
              }
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (!files.length) return;
              const pickedFolderName = files[0]?.webkitRelativePath?.split(/[\\/]/)[0] || "Selected Folder";
              void run(async (signal) => {
                if (!userId || !songId) throw new Error("Select a song and sign in first.");
                const matched = await findSongAudioFilesFromFileList(files, songId, songTitle ?? "");
                if (signal.aborted) return;
                if (!matched.length) {
                  throw new Error(`No matching stem files for "${songTitle || songId}" were found in "${pickedFolderName}".`);
                }
                setLinkedFolderName(pickedFolderName);
                await importFiles(matched, signal);
              });
            }}
          />
          <button
            type="button"
            aria-pressed={multitrack?.eqEnabled ?? true}
            disabled={!multitrack}
            onClick={() => multitrack?.setEqEnabled(!(multitrack?.eqEnabled ?? true))}
            className={`rounded-lg border px-3 py-1.5 transition-colors disabled:opacity-40 ${
              (multitrack?.eqEnabled ?? true)
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                : "border-white/10 bg-[#38383d] text-zinc-400 hover:bg-[#44444a]"
            }`}
          >
            AI Stem EQ: {(multitrack?.eqEnabled ?? true) ? "ON" : "OFF"}
          </button>
          <button type="button" className="rounded-lg bg-[#38383d] hover:bg-[#44444a] border border-white/10 px-3 py-1.5 transition-colors disabled:opacity-40" disabled={busy || playing || !userId || !songId || !multitrack} onClick={() => batchInput.current?.click()}>Import Stems</button>
          {hasGoogleDrive && (
            <button
              type="button"
              disabled={busy || playing || !userId || !songId || !multitrack}
              onClick={() => void loadDriveLibrary(false)}
              className="rounded-lg border border-sky-400/35 bg-sky-500/15 px-3 py-1.5 text-sky-300 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
            >
              Google Drive
            </button>
          )}
          {isDriveOpen && (
            <div className="fixed inset-0 z-[600000] flex items-end justify-center p-0 sm:items-center sm:p-4">
              <div className="absolute inset-0 animate-in fade-in bg-black/70 backdrop-blur-sm" onClick={() => setIsDriveOpen(false)} />
              <div className="relative z-10 flex w-full max-h-[90vh] flex-col overflow-hidden rounded-t-2xl border border-white/15 bg-[#1e1e22] shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-xl sm:rounded-2xl sm:slide-in-from-bottom-8">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-zinc-100">Google Drive Stems</h4>
                    <p className="text-[11px] font-medium text-zinc-400">
                      Select a song ZIP or stem audio file to download to your device Downloads folder for {songTitle || "this song"}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={driveLoading || busy}
                      onClick={() => void loadDriveLibrary(true)}
                      className="rounded-lg border border-white/10 bg-[#2f2f35] px-3 py-1.5 text-[11px] font-bold text-zinc-200 transition-colors hover:bg-[#3a3a42] disabled:opacity-40"
                    >
                      {driveLoading ? "Refreshing..." : "Refresh"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setIsDriveOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2f2f35] text-zinc-300 transition-colors hover:bg-[#3a3a42] hover:text-white disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                </div>

              {(() => {
                const matchedFiles = findMatchingDriveStemFiles(driveFiles, songTitle);
                const primaryZipMatch = matchedFiles.find((f) => /\.zip$/i.test(f.name));
                const quickTargets = primaryZipMatch ? [primaryZipMatch] : matchedFiles;
                const filteredFiles = driveFiles.filter((file) =>
                  file.name.toLowerCase().includes(driveSearch.trim().toLowerCase())
                );
                const loadedLabel = driveProgress ? formatDriveFileSize(String(driveProgress.loadedBytes)) : null;
                const totalLabel = driveProgress?.totalBytes ? formatDriveFileSize(String(driveProgress.totalBytes)) : null;

                return (
                  <div className="flex flex-1 flex-col overflow-hidden p-4 gap-3">
                    {quickTargets.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                            Matched for {songTitle}
                          </div>
                          <div className="truncate text-xs font-semibold text-zinc-100">
                            {quickTargets.length === 1
                              ? quickTargets[0].name
                              : `${quickTargets.length} stem files matched`}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy || driveLoading}
                          onClick={() => importFromDrive(quickTargets)}
                          className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                        >
                          {busy ? "Importing..." : "Import Match"}
                        </button>
                      </div>
                    )}

                    {(driveStatus || driveProgress) && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-xl border border-sky-400/30 bg-[#141417] px-3.5 py-2.5 shadow-inner"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate font-semibold text-sky-300">
                            {driveStatus ?? "Downloading..."}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-zinc-300">
                            {driveProgress?.phase === "extracting"
                              ? "Unzipping"
                              : driveProgress?.percent !== null && driveProgress?.percent !== undefined
                                ? `${driveProgress.percent}%${loadedLabel && totalLabel ? ` · ${loadedLabel} / ${totalLabel}` : ""}`
                                : loadedLabel ?? ""}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full rounded-full transition-all duration-150 ${
                              driveProgress?.phase === "extracting"
                                ? "w-full animate-pulse bg-emerald-400"
                                : driveProgress?.percent !== null && driveProgress?.percent !== undefined
                                  ? "bg-gradient-to-r from-sky-500 to-cyan-400"
                                  : "w-1/2 animate-pulse bg-sky-400"
                            }`}
                            style={
                              driveProgress?.phase !== "extracting" &&
                              driveProgress?.percent !== null &&
                              driveProgress?.percent !== undefined
                                ? { width: `${driveProgress.percent}%` }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    )}

                    <input
                      type="search"
                      value={driveSearch}
                      onChange={(e) => setDriveSearch(e.target.value)}
                      placeholder="Search song ZIP in Stems folder..."
                      className="w-full rounded-lg border border-white/10 bg-[#141417] px-3 py-2 text-xs font-medium text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400/50 focus:outline-none"
                    />

                    <div className="flex-1 overflow-y-auto divide-y divide-white/5 rounded-xl border border-white/10 bg-[#16161a]">
                      {driveLoading ? (
                        <div className="p-6 text-center text-xs font-medium text-zinc-400">
                          Loading songs from Google Drive...
                        </div>
                      ) : filteredFiles.length === 0 ? (
                        <div className="p-6 text-center text-xs font-medium text-zinc-400">
                          {driveFiles.length === 0
                            ? "No .zip or stem audio files found in the Stems folder."
                            : "No files match your search."}
                        </div>
                      ) : (
                        filteredFiles.map((file) => {
                          const sizeLabel = formatDriveFileSize(file.size);
                          return (
                            <div
                              key={file.id}
                              className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/[0.03]"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-zinc-100">{file.name}</div>
                                {sizeLabel && (
                                  <div className="text-[10px] font-medium text-zinc-500">{sizeLabel}</div>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => importFromDrive([file])}
                                className="shrink-0 rounded-lg border border-white/10 bg-[#2d2d34] px-3 py-1.5 text-[11px] font-bold text-zinc-100 hover:bg-[#3a3a42] disabled:opacity-40"
                              >
                                Import
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
              </div>
            </div>
          )}
          {hasFolder && folderRef.current && (
            <button
              type="button"
              className="rounded-lg border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-40"
              disabled={busy || playing || !userId || !songId || !multitrack}
              onClick={() => void run(async (signal) => {
                if (!userId || !songId || !folderRef.current) return;
                if (!await verifyFolderPermission(folderRef.current)) {
                  throw new Error("Folder permission was not granted.");
                }
                if (signal.aborted) return;
                setFolderNeedsPermission(false);
                const files = await findSongAudioFiles(folderRef.current, songId, songTitle ?? "");
                if (!files.length) {
                  throw new Error(`No matching stem files for "${songTitle || songId}" were found in ${linkedFolderName || "the linked folder"}.`);
                }
                await importFiles(files, signal);
              })}
            >
              {folderNeedsPermission ? "Authorize Folder" : "Scan Folder"}
            </button>
          )}
          <button
            type="button"
            className="rounded-lg bg-[#38383d] hover:bg-[#44444a] border border-white/10 px-3 py-1.5 transition-colors disabled:opacity-40"
            disabled={busy || playing || !userId || !songId || !multitrack}
            title={linkedFolderName ? `Linked folder: ${linkedFolderName} (click to assign a different folder)` : "Assign a local folder on this device to check first for stem files"}
            onClick={() => {
              if (!userId || !songId) {
                reportError(new Error("Select a song and sign in first."));
                return;
              }
              if (!isDirectoryHandlePickerSupported()) {
                folderFallbackInput.current?.click();
                return;
              }
              void run(async (signal) => {
                const saved = await pickAndSaveRootAudioFolder(userId);
                const handle = saved.handle;
                if (!await verifyFolderPermission(handle)) throw new Error("Folder permission was not granted.");
                if (signal.aborted) return;
                folderRef.current = handle;
                setHasFolder(true);
                setLinkedFolderName(saved.folderName);
                setFolderNeedsPermission(false);
                const files = await findSongAudioFiles(handle, songId, songTitle ?? "");
                if (files.length) {
                  await importFiles(files, signal);
                }
              });
            }}
          >
            {hasFolder ? `Folder: ${linkedFolderName || "Linked"}` : "Link Folder"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {assignMode && <button type="button" disabled={!onApplySmcStemPreset} className="rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/25 px-3 py-1.5 transition-colors disabled:opacity-40" onClick={onApplySmcStemPreset}>Auto-Map Strips 3–8</button>}
            <button type="button" disabled={!onStartMidiLearn} aria-pressed={assignMode} className={`rounded-lg px-3 py-1.5 border transition-colors disabled:opacity-40 ${assignMode ? "bg-blue-600 border-blue-400 text-white" : "bg-[#38383d] hover:bg-[#44444a] border-white/10 text-zinc-200"}`} onClick={() => setAssignMode(!assignMode)}>MIDI Assign</button>
          </div>
          {assignMode && learningActionId && <span className="w-full text-cyan-300 pt-1" role="status">Move fader / press button on your controller...</span>}
          {assignMode && midiError && <span className="w-full text-red-300 pt-1" role="alert">{midiError}</span>}
          {isStemsLoading && <span className="w-full text-zinc-400 pt-1">Loading stems...</span>}
          {playing && <span className="w-full text-zinc-400 pt-1">Pause playback to import or replace stems.</span>}
          {(!multitrack || !userId || !songId) && <span className="w-full text-zinc-400 pt-1">Select a song to manage local stems.</span>}
          {multitrack && stems.some((stem) => stem.ownerId === userId && stem.songId === songId && !mixes.some((mix) => mix.id === stem.stemId && mix.sourceVersion === stem.updatedAt)) &&
            <div className="w-full text-amber-300 pt-1">Some saved stems are not loaded. <button type="button" disabled={busy || playing} className="underline disabled:opacity-50" onClick={() => void run(reload)}>Reload stems</button></div>}
          {error && <span className="w-full text-red-300 pt-1" role="alert">{error}</span>}
        </div>}
        <div className={`px-6 py-7 bg-[#222] flex items-stretch gap-3 sm:gap-4 overflow-x-auto ${audioSource === "local" ? "justify-start" : "justify-center"}`}>
          
          {/* ✅ NEW: Metronome Sound Selector Sidebar */}
          <div className="flex flex-col justify-between py-2 pr-4 sm:pr-6 border-r border-[#333] shrink-0">
            {SOUND_OPTIONS.map((sound) => {
              const isActive = metronomeSoundType === sound;
              return (
                <button
                  key={sound}
                  onClick={() => setMetronomeSoundType(sound)}
                  className="flex flex-col items-center gap-1.5 group outline-none transition-all active:scale-95"
                >
                  <div className={`w-5 h-5 rounded-full border-[3px] transition-all flex items-center justify-center ${isActive ? 'border-blue-500' : 'border-[#444] group-hover:border-[#555]'}`}>
                     {isActive && <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_5px_#3b82f6]" />}
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest transition-colors ${isActive ? 'text-blue-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                    {sound}
                  </span>
                </button>
              );
            })}
          </div>

          <FaderChannel 
            id="click" label="Click" val={localClickVolume} setVal={setLocalClickVolume}
            isMuted={mutes.click} isSoloed={solos.click} anySoloActive={anySoloActive}
            toggleMute={() => setMutes(p => ({...p, click: !p.click}))} toggleSolo={() => setSolos(p => ({...p, click: !p.click}))}
          />
          <FaderChannel 
            id="guide" label="Guides" val={guideVolume} setVal={setGuideVolume}
            isMuted={mutes.guide} isSoloed={solos.guide} anySoloActive={anySoloActive}
            toggleMute={() => setMutes(p => ({...p, guide: !p.guide}))} toggleSolo={() => setSolos(p => ({...p, guide: !p.guide}))}
          />
          {audioSource !== "local" ? <FaderChannel
            id="yt" label="YT Sync" val={youtubeVolume} setVal={setYoutubeVolume}
            isMuted={mutes.yt} isSoloed={solos.yt} anySoloActive={anySoloActive}
            toggleMute={() => setMutes(p => ({...p, yt: !p.yt}))} toggleSolo={() => setSolos(p => ({...p, yt: !p.yt}))}
          /> : STEM_MIDI_ACTION_GROUPS.map((group) => {
            const candidates = groups[group.slot];
            const stem = candidates.length === 1 ? candidates[0] : undefined;
            const mix = mixes.find((item) => item.id === stem?.stemId && item.sourceVersion === stem?.updatedAt);
            const anyStemSolo = mixes.some((item) => item.solo);
            return <FaderChannel key={group.slot} id={group.slot} label={group.label}
              val={mix?.volume ?? 1} isMuted={mix?.muted ?? false} isSoloed={mix?.solo ?? false} anySoloActive={anyStemSolo}
              setVal={(volume) => stem && updateMix(stem.stemId, { volume })}
              toggleMute={() => {
                if (!stem || !mix) return;
                if (multitrack?.toggleStemMute) {
                  multitrack.toggleStemMute(stem.stemId);
                  setMixes(multitrack.getEngine().getStemMixes());
                } else {
                  updateMix(stem.stemId, { muted: !mix.muted });
                }
              }}
              toggleSolo={() => {
                if (!stem || !mix) return;
                if (multitrack?.toggleStemSolo) {
                  multitrack.toggleStemSolo(stem.stemId);
                  setMixes(multitrack.getEngine().getStemMixes());
                } else {
                  updateMix(stem.stemId, { solo: !mix.solo });
                }
              }}
              disabled={!stem || !mix} meterActive={playing && Boolean(mix)} assignMode={assignMode} actions={group} learningActionId={learningActionId}
              midiBindings={midiBindings} onStartMidiLearn={onStartMidiLearn} onClearMidiBinding={onClearMidiBinding}
              top={<div className="w-full flex flex-col items-center gap-1 text-[9px] text-zinc-300">
                {candidates.length > 1 ? <div className="w-full text-amber-300 text-center">Conflict ({candidates.length})
                  {candidates.map((candidate) => <div key={candidate.stemId} className="flex items-center justify-between gap-1 px-1">
                    <span className="truncate" title={candidate.fileName}>{candidate.fileName}</span>
                    <button type="button" aria-label={`Clear ${candidate.fileName}`} disabled={busy || playing || !multitrack} onClick={() => void run(async (signal) => {
                      if (!userId || !songId) throw new Error("Select a song and sign in first.");
                      await removeSongAudioStem(userId, songId, candidate.stemId);
                      await reload(signal);
                    })}>×</button>
                  </div>)}
                </div> : stem ? (
                  <div className="w-full flex items-center justify-between gap-1 rounded-md bg-[#262629] border border-white/5 px-2 py-1">
                    <button
                      type="button"
                      title={`${stem.fileName} (Click to replace)`}
                      disabled={busy || playing || !multitrack || !userId || !songId}
                      onClick={() => { selectedSlot.current = group.slot; slotInput.current?.click(); }}
                      className="truncate text-left font-medium text-zinc-200 hover:text-blue-300 disabled:opacity-50"
                    >
                      {stem.fileName}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${stem.fileName}`}
                      title="Remove stem"
                      disabled={busy || playing || !multitrack}
                      onClick={() => void run(async (signal) => {
                        if (!userId || !songId) throw new Error("Select a song and sign in first.");
                        await removeSongAudioStem(userId, songId, stem.stemId);
                        await reload(signal);
                      })}
                      className="shrink-0 text-zinc-500 hover:text-red-400 font-bold disabled:opacity-50"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy || playing || !multitrack || !userId || !songId}
                    onClick={() => { selectedSlot.current = group.slot; slotInput.current?.click(); }}
                    className="w-full rounded-md border border-dashed border-zinc-600/80 py-1 text-zinc-400 hover:border-blue-400/60 hover:text-blue-300 font-bold tracking-wider uppercase transition-colors disabled:opacity-40"
                  >
                    + Assign
                  </button>
                )}
              </div>}
            />;
          })}
        </div>
        <div className="mx-4 mb-4 flex items-center justify-between gap-4 rounded-xl border border-[#3a3a3f] bg-[#29292d] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-200">Click &amp; guide pan</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              {isClickGuideHardPannedRight ? "Hard right" : "Center"}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isClickGuideHardPannedRight}
            aria-label="Hard pan click and guide right"
            onClick={() => setIsClickGuideHardPannedRight(!isClickGuideHardPannedRight)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
              isClickGuideHardPannedRight
                ? "border-blue-500 bg-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.25)]"
                : "border-[#4a4a50] bg-[#1a1a1e]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                isClickGuideHardPannedRight ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}