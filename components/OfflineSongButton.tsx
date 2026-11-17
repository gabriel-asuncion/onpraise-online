"use client";

import { useEffect, useState } from "react";
import { useEngine } from "../app/context/EngineContext";
import { useOnlineStatus } from "../app/context/NetworkContext";
import { captureOfflineGeneration, getOfflineSong, isCurrentOfflineGeneration, removeOfflineSong, saveOfflineSong, type OfflineSong } from "../lib/offline-db";
import { cacheOfflineRoutes } from "../lib/offline-shell";
import { getSongChordChart, getSongDetails } from "../utils/supabase/actions";
import { createClient } from "../utils/supabase/client";

export default function OfflineSongButton({ songId }: { songId: string }) {
  const { realUserId } = useEngine();
  const { isOnline, openNoConnectionModal } = useOnlineStatus();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!realUserId) return;
    let active = true;
    const refresh = () => {
      void getOfflineSong(songId, realUserId).then((song) => {
        if (active) setReady(Boolean(song));
      }).catch((failure: unknown) => {
        console.error("Could not check the offline song.", failure);
        if (active) setError("Could not check offline storage.");
      });
    };
    refresh();
    window.addEventListener("onpraise-offline-data", refresh);
    return () => { active = false; window.removeEventListener("onpraise-offline-data", refresh); };
  }, [songId, realUserId]);

  const toggle = async () => {
    if (busy) return;
    const generation = captureOfflineGeneration();
    if (!realUserId) { setError("Your account is not ready yet."); return; }
    if (!ready && !isOnline) { openNoConnectionModal("Downloading a song"); return; }
    setBusy(true);
    setError("");
    try {
      if (ready) {
        await removeOfflineSong(songId, realUserId);
      } else {
        const [song, sections] = await Promise.all([getSongDetails(songId), getSongChordChart(songId)]);
        await cacheOfflineRoutes([`/songs/${encodeURIComponent(songId)}`, `/songs/${encodeURIComponent(songId)}/edit`]);
        const { data: { session }, error: sessionError } = await createClient().auth.getSession();
        if (!isCurrentOfflineGeneration(generation)) return;
        if (sessionError) throw sessionError;
        if (session?.user.id !== realUserId) throw new Error("Your account changed while the song was downloading.");
        const saved = await saveOfflineSong({
          ...song,
          song_sections: sections,
          ownerId: realUserId,
          downloadedAt: new Date().toISOString(),
        } as OfflineSong, generation);
        if (!saved) return;
      }
      setReady(!ready);
      window.dispatchEvent(new Event("onpraise-offline-data"));
    } catch (failure) {
      if (!isCurrentOfflineGeneration(generation)) return;
      console.error("Could not update the offline song.", failure);
      setError(failure instanceof Error ? failure.message : "Could not update the offline song.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={() => void toggle()} aria-disabled={busy || (!ready && !isOnline)} className={`rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-bold ${busy || (!ready && !isOnline) ? "opacity-50 cursor-not-allowed" : "hover:bg-white/10"}`}>
        {busy ? "Preparing..." : ready ? "Offline Ready · Remove" : "Make Available Offline"}
      </button>
      {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
