"use client";

import { useEffect, useState } from "react";
import { useEngine } from "../app/context/EngineContext";
import { useOnlineStatus } from "../app/context/NetworkContext";
import type { SetlistTrackItem } from "../app/setlists/[id]/live/types/setlist";
import { captureOfflineGeneration, getOfflineSetlist, isCurrentOfflineGeneration, removeOfflineSetlist, saveOfflineSetlistBundle, type OfflineSong } from "../lib/offline-db";
import { cacheOfflineRoutes } from "../lib/offline-shell";
import { getSongChordChart, getSongDetails } from "../utils/supabase/actions";
import { createClient } from "../utils/supabase/client";

export default function OfflineSetlistButton({ id, name, eventName, teamId, tracks }: {
  id: string;
  name: string;
  eventName: string;
  teamId: string | null;
  tracks: SetlistTrackItem[];
}) {
  const { realUserId } = useEngine();
  const { isOnline, openNoConnectionModal } = useOnlineStatus();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!realUserId) return;
    let active = true;
    void getOfflineSetlist(id, realUserId).then((setlist) => { if (active) setReady(Boolean(setlist)); })
      .catch((failure: unknown) => { console.error("Could not check the offline setlist.", failure); if (active) setError("Could not check offline storage."); });
    return () => { active = false; };
  }, [id, realUserId]);

  const toggle = async () => {
    if (busy) return;
    const generation = captureOfflineGeneration();
    if (!realUserId) { setError("Your account is not ready yet."); return; }
    if (!ready && !isOnline) { openNoConnectionModal("Downloading a setlist"); return; }
    setBusy(true);
    setError("");
    try {
      if (ready) {
        await removeOfflineSetlist(id, realUserId);
      } else {
        if (!tracks.length || tracks.some((track) => !track.songs)) throw new Error("This setlist has no complete songs to download.");
        const ids = [...new Set(tracks.flatMap((track) => track.songs ? [track.songs.id] : []))];
        const downloadedAt = new Date().toISOString();
        const songs: OfflineSong[] = await Promise.all(ids.map(async (songId) => {
          const [song, sections] = await Promise.all([getSongDetails(songId), getSongChordChart(songId)]);
          return { ...song, song_sections: sections, ownerId: realUserId, downloadedAt } as OfflineSong;
        }));
        await cacheOfflineRoutes([`/setlists/${encodeURIComponent(id)}/live`, ...ids.flatMap((songId) => [`/songs/${encodeURIComponent(songId)}`, `/songs/${encodeURIComponent(songId)}/edit`])]);
        const { data: { session }, error: sessionError } = await createClient().auth.getSession();
        if (!isCurrentOfflineGeneration(generation)) return;
        if (sessionError) throw sessionError;
        if (session?.user.id !== realUserId) throw new Error("Your account changed while the setlist was downloading.");
        const saved = await saveOfflineSetlistBundle({ id, name, eventName, teamId, tracks, ownerId: realUserId, downloadedAt }, songs, generation);
        if (!saved) return;
      }
      setReady(!ready);
      window.dispatchEvent(new Event("onpraise-offline-data"));
    } catch (failure) {
      if (!isCurrentOfflineGeneration(generation)) return;
      console.error("Could not update the offline setlist.", failure);
      setError(failure instanceof Error ? failure.message : "Could not update the offline setlist.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="flex flex-col items-center gap-1">
    <button type="button" onClick={() => void toggle()} aria-disabled={busy || (!isOnline && !ready)} className={`rounded-lg border border-white/20 px-3 py-2 text-xs font-bold ${busy || (!ready && !isOnline) ? "opacity-50 cursor-not-allowed" : ""}`}>
      {busy ? "Preparing..." : ready ? "Offline Ready · Remove" : "Make Setlist Available Offline"}
    </button>
    {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
  </div>;
}
