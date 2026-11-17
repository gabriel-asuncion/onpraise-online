"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  findSongAudioFiles, getSavedAudioFolderHandle, getSongAudioStems, inferStemRole,
  pickAndSaveRootAudioFolder, removeSongAudioStem, saveSongAudioStem, verifyFolderPermission,
  type AudioDirectoryHandle, type StemRole, type StoredAudioStem,
} from "../lib/offline-audio";
import type { useMultitrackEngine } from "../hooks/useMultitrackEngine";

type AudioSource = "youtube" | "local";
type Mixer = ReturnType<typeof useMultitrackEngine>;
type Channel = { stem: StoredAudioStem; folder: boolean; volume: number; muted: boolean; solo: boolean };
type FolderState = "unsupported" | "unlinked" | "reconnect" | "ready";

interface Props {
  songId: string;
  songTitle: string;
  userId: string | null;
  isOnline: boolean;
  openNoConnectionModal: (featureName?: string) => void;
  audioSource: AudioSource;
  onAudioSourceChange: (source: AudioSource) => void;
  multitrack: Mixer;
  onAvailabilityChange?: (available: boolean) => void;
}

const roles: { value: StemRole; label: string }[] = [
  { value: "track", label: "Backing Track" }, { value: "drums", label: "Drums" },
  { value: "bass", label: "Bass" }, { value: "keys", label: "Keys" },
  { value: "guitars", label: "Guitars" }, { value: "vocals", label: "Vocals" },
  { value: "guide", label: "Guide" }, { value: "other", label: "Other" },
];

export default function MultitrackMixerDrawer({
  songId, songTitle, userId, isOnline, openNoConnectionModal, audioSource,
  onAudioSourceChange, multitrack, onAvailabilityChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [folderState, setFolderState] = useState<FolderState>("unsupported");
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [master, setMaster] = useState(1);
  const handleRef = useRef<AudioDirectoryHandle | null>(null);
  const savedHandleRef = useRef<AudioDirectoryHandle | null>(null);
  const revisionRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const availabilityRef = useRef(onAvailabilityChange);
  const channelsRef = useRef<Channel[]>([]);
  const hiddenFolderFilesRef = useRef<Set<string>>(new Set());
  const masterRef = useRef(1);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { load, cancelLoad, clear, getEngine } = multitrack;

  useEffect(() => { availabilityRef.current = onAvailabilityChange; }, [onAvailabilityChange]);

  const reportError = useCallback((reason: unknown) => {
    console.error("Could not load local audio.", reason);
    setError(reason instanceof Error ? reason.message : "Could not load local audio.");
  }, []);

  const reload = useCallback(async (handle: AudioDirectoryHandle | null, revision: number) => {
    if (!userId || !songId) return;
    const saved = await getSongAudioStems(userId, songId);
    const folderFiles = handle ? await findSongAudioFiles(handle, songId, songTitle) : [];
    if (revision !== revisionRef.current) return;
    const previous = new Map(channelsRef.current.map((channel) => [channel.stem.stemId, channel]));
    const next: Channel[] = saved.map((stem) => ({
      stem, folder: false, volume: previous.get(stem.stemId)?.volume ?? 1,
      muted: previous.get(stem.stemId)?.muted ?? false, solo: previous.get(stem.stemId)?.solo ?? false,
    }));
    for (const file of folderFiles) {
      if (hiddenFolderFilesRef.current.has(file.name) || saved.some((stem) => stem.fileName === file.name)) continue;
      const stemId = `folder:${file.name}`;
      const role = inferStemRole(file.name);
      next.push({
        folder: true, volume: previous.get(stemId)?.volume ?? 1,
        muted: previous.get(stemId)?.muted ?? false, solo: previous.get(stemId)?.solo ?? false,
        stem: { key: `${userId}:${songId}:${stemId}`, ownerId: userId, songId, stemId,
          label: file.name, role, fileName: file.name, mimeType: file.type, blob: file, updatedAt: new Date().toISOString() },
      });
    }
    if (next.length && !(await load(next.map(({ stem }) => ({ id: stem.stemId, blob: stem.blob, sourceVersion: stem.updatedAt }))))) return;
    if (revision !== revisionRef.current) return;
    if (!next.length) clear();
    else {
      const engine = getEngine();
      engine.setMasterVolume(masterRef.current);
      for (const channel of next) engine.setStemMix(channel.stem.stemId, {
        volume: channel.volume, muted: channel.muted, solo: channel.solo,
      });
    }
    channelsRef.current = next;
    setChannels(next);
    availabilityRef.current?.(next.length > 0);
  }, [clear, getEngine, load, songId, songTitle, userId]);

  useEffect(() => {
    const revision = ++revisionRef.current;
    clear();
    channelsRef.current = [];
    handleRef.current = null;
    savedHandleRef.current = null;
    hiddenFolderFilesRef.current.clear();
    const start = async () => {
      setBusy(true);
      setError(null);
      setChannels([]);
      availabilityRef.current?.(false);
      if (!userId || !songId) { setBusy(false); return; }
      try {
        const supported = "showDirectoryPicker" in window;
        const saved = supported ? await getSavedAudioFolderHandle(userId) : null;
        if (revision !== revisionRef.current) return;
        let handle: AudioDirectoryHandle | null = null;
        if (saved) {
          setFolderName(saved.folderName);
          if (await saved.handle.queryPermission({ mode: "read" }) === "granted") handle = saved.handle;
        }
        if (revision !== revisionRef.current) return;
        savedHandleRef.current = saved?.handle ?? null;
        handleRef.current = handle;
        setFolderState(!supported ? "unsupported" : !saved ? "unlinked" : handle ? "ready" : "reconnect");
        await reload(handle, revision);
      } catch (reason) {
        if (revision === revisionRef.current) reportError(reason);
      } finally {
        if (revision === revisionRef.current) setBusy(false);
      }
    };
    void start();
    return () => { revisionRef.current += 1; cancelLoad(); };
  }, [cancelLoad, clear, reload, reportError, songId, userId]);

  const run = async (action: (revision: number) => Promise<void>) => {
    const revision = ++revisionRef.current;
    cancelLoad();
    setBusy(true);
    setError(null);
    try { await action(revision); }
    catch (reason) { if (revision === revisionRef.current) reportError(reason); }
    finally { if (revision === revisionRef.current) setBusy(false); }
  };

  const updateChannel = (stemId: string, update: Partial<Pick<Channel, "volume" | "muted" | "solo">>) => {
    const next = channelsRef.current.map((channel) => channel.stem.stemId === stemId ? { ...channel, ...update } : channel);
    channelsRef.current = next;
    setChannels(next);
    getEngine().setStemMix(stemId, update);
  };

  const saveMetadata = (stem: StoredAudioStem) => {
    saveQueueRef.current = saveQueueRef.current.then(() => saveSongAudioStem(stem)).catch(reportError);
  };

  const updateMetadata = (channel: Channel, update: Partial<Pick<StoredAudioStem, "label" | "role">>, persist: boolean) => {
    const stem = { ...channel.stem, ...update, updatedAt: new Date().toISOString() };
    const next = channelsRef.current.map((item) => item.stem.stemId === stem.stemId ? { ...item, stem } : item);
    channelsRef.current = next;
    setChannels(next);
    if (persist && !channel.folder) saveMetadata(stem);
  };

  return (
    <div className="relative text-sm">
      <div className="flex items-center gap-1">
        <button type="button" aria-pressed={audioSource === "youtube"} aria-disabled={!isOnline}
          className={`rounded px-2 py-1 ${!isOnline ? "cursor-not-allowed opacity-50" : ""} ${audioSource === "youtube" ? "bg-blue-600" : "bg-zinc-700"}`}
          onClick={() => isOnline ? onAudioSourceChange("youtube") : openNoConnectionModal("YouTube playback")}>YouTube</button>
        <button type="button" aria-pressed={audioSource === "local"} className={`rounded px-2 py-1 ${audioSource === "local" ? "bg-blue-600" : "bg-zinc-700"}`}
          onClick={() => onAudioSourceChange("local")}>Local / Stems</button>
        <button type="button" aria-expanded={open} className="rounded bg-zinc-700 px-2 py-1" onClick={() => setOpen(!open)}>Mixer</button>
      </div>
      {open && <div className="absolute right-0 top-full z-[100] mt-2 max-h-[70vh] w-80 max-w-[90vw] overflow-auto rounded-lg bg-zinc-900 p-3 text-white shadow-xl">
        {error && <p role="alert" className="mb-2 text-red-300">{error}</p>}
        {busy && <p role="status" className="mb-2">Loading and decoding audio...</p>}
        {folderState !== "unsupported" && <button type="button" disabled={busy || !userId} className="mb-2 rounded bg-zinc-700 px-2 py-1"
          onClick={() => void run(async (revision) => {
            if (!userId) return;
            const saved = folderState === "reconnect" ? null : await pickAndSaveRootAudioFolder(userId);
            const handle = saved?.handle ?? savedHandleRef.current;
            if (!handle) throw new Error("The saved folder is no longer available.");
            if (!await verifyFolderPermission(handle)) throw new Error("Folder permission was not granted.");
            if (revision !== revisionRef.current) return;
            handleRef.current = handle;
            savedHandleRef.current = handle;
            setFolderName(saved?.folderName ?? handle.name);
            setFolderState("ready");
            await reload(handle, revision);
          })}>{folderState === "reconnect" ? "Reconnect Stems Folder" : folderState === "ready" ? `Change folder: ${folderName}` : "Link Stems Folder"}</button>}
        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          if (!files.length || !userId) return;
          void run(async (revision) => {
            for (const file of files) {
              const stemId = crypto.randomUUID();
              await saveSongAudioStem({ key: `${userId}:${songId}:${stemId}`, ownerId: userId, songId, stemId,
                label: file.name, role: inferStemRole(file.name), fileName: file.name, mimeType: file.type, blob: file, updatedAt: new Date().toISOString() });
            }
            if (revision === revisionRef.current) await reload(handleRef.current, revision);
          });
        }} />
        <button type="button" disabled={busy || !userId} className="mb-2 ml-1 rounded bg-zinc-700 px-2 py-1" onClick={() => fileInputRef.current?.click()}>Add Audio Stems</button>
        <label className="block">Master Stems Volume {Math.round(master * 100)}%
          <input className="w-full" type="range" min="0" max="1" step="0.01" value={master} disabled={busy || !channels.length} onChange={(event) => {
            const value = Number(event.currentTarget.value); masterRef.current = value; setMaster(value); getEngine().setMasterVolume(value);
          }} />
        </label>
        {channels.map((channel) => <div key={channel.stem.stemId} className="mt-2 rounded border border-zinc-700 p-2">
          <div className="flex gap-1">
            <input aria-label="Stem label" className="min-w-0 flex-1 rounded bg-zinc-800 px-1" value={channel.stem.label} disabled={busy}
              onChange={(event) => updateMetadata(channel, { label: event.currentTarget.value }, false)}
              onBlur={() => {
                const current = channelsRef.current.find((item) => item.stem.stemId === channel.stem.stemId);
                if (current && !current.folder) saveMetadata(current.stem);
              }} />
            <button type="button" disabled={busy} aria-label={`Remove ${channel.stem.label}`} onClick={() => void run(async (revision) => {
              hiddenFolderFilesRef.current.add(channel.stem.fileName);
              await saveQueueRef.current;
              if (!channel.folder) await removeSongAudioStem(channel.stem.ownerId, channel.stem.songId, channel.stem.stemId);
              if (revision !== revisionRef.current) return;
              await reload(handleRef.current, revision);
            })}>×</button>
          </div>
          {channel.folder && <p className="text-xs text-zinc-400">Folder file: changes and removal last until this song is reloaded.</p>}
          <select aria-label="Stem role" className="my-1 w-full rounded bg-zinc-800" value={channel.stem.role} disabled={busy}
            onChange={(event) => updateMetadata(channel, { role: event.currentTarget.value as StemRole }, true)}>
            {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input aria-label={`${channel.stem.label} volume`} type="range" min="0" max="1" step="0.01" value={channel.volume} disabled={busy}
              onChange={(event) => updateChannel(channel.stem.stemId, { volume: Number(event.currentTarget.value) })} />
            <button type="button" disabled={busy} aria-label={`Mute ${channel.stem.label}`} aria-pressed={channel.muted} className={channel.muted ? "text-yellow-300" : ""}
              onClick={() => updateChannel(channel.stem.stemId, { muted: !channel.muted })}>M</button>
            <button type="button" disabled={busy} aria-label={`Solo ${channel.stem.label}`} aria-pressed={channel.solo} className={channel.solo ? "text-yellow-300" : ""}
              onClick={() => updateChannel(channel.stem.stemId, { solo: !channel.solo })}>S</button>
          </div>
        </div>)}
      </div>}
    </div>
  );
}
