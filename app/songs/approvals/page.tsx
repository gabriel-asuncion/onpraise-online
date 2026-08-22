"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import GlobalLoader from "../../../components/GlobalLoader";

interface PendingSong {
  id: string;
  title: string;
  artist?: string | null;
  approval_status?: string;
}

export default function ApprovalsDashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const { activeRole } = useEngine();

  const [loading, setLoading] = useState(true);
  const [pendingSongs, setPendingSongs] = useState<PendingSong[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Security Gate: Bounce unauthorized users back to the songs list
  useEffect(() => {
    if (activeRole !== "admin" && activeRole !== "moderator") {
      router.replace("/songs");
    }
  }, [activeRole, router]);

  const fetchPendingSongs = async () => {
    try {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingSongs((data as PendingSong[]) || []);
    } catch (err) {
      console.error("Failed to fetch pending songs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeRole === "admin" || activeRole === "moderator") {
      void fetchPendingSongs();
    }
  }, [activeRole]);

  // ✅ The Approval Engine
  const handleApprove = async (id: string) => {
    setProcessingId(id);
    
    // Optimistic UI Update: Remove from list instantly
    setPendingSongs(prev => prev.filter(song => song.id !== id));

    const { error } = await supabase
      .from("songs")
      .update({ approval_status: "approved" })
      .eq("id", id);

    if (error) {
      alert("Failed to approve song. Reverting UI.");
      fetchPendingSongs(); // Re-fetch on failure to restore state
    }
    setProcessingId(null);
  };

  // ✅ The Rejection Engine
  const handleReject = async (id: string, title: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to permanently delete "${title}"?`);
    if (!confirmDelete) return;

    setProcessingId(id);
    setPendingSongs(prev => prev.filter(song => song.id !== id));

    // Delete the garbage data completely to keep the DB clean
    const { error } = await supabase
      .from("songs")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Failed to delete song. Reverting UI.");
      fetchPendingSongs();
    }
    setProcessingId(null);
  };

  if (loading) return <GlobalLoader message="FETCHING PENDING APPROVALS..." />;

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col animate-in fade-in duration-300">
      
      {/* ========================================= */}
      {/* 1. DASHBOARD HEADER                       */}
      {/* ========================================= */}
      <header className="sticky top-0 z-[100] bg-white px-4 md:px-8 py-5 border-b border-zinc-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/songs")}
            className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center font-bold transition-all active:scale-95"
          >
            ←
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900" style={{ fontFamily: "Georgia, serif" }}>
              Pending Approvals
            </h2>
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
              Review and moderate community submissions
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
          <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
            {pendingSongs.length} in Queue
          </span>
        </div>
      </header>

      {/* ========================================= */}
      {/* 2. PENDING SONGS FEED                     */}
      {/* ========================================= */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        {pendingSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-zinc-200 rounded-3xl bg-zinc-50/50 mt-10">
            <span className="text-4xl mb-4">🎉</span>
            <h3 className="text-lg font-black text-zinc-800 tracking-tight">Inbox Zero</h3>
            <p className="text-xs font-bold text-zinc-400 mt-1">All community submissions have been reviewed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingSongs.map(song => (
              <div 
                key={song.id} 
                className={`bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all ${
                  processingId === song.id ? "opacity-50 scale-[0.98] pointer-events-none" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200 mb-2">
                      Awaiting Review
                    </span>
                    <h4 className="font-bold text-lg text-zinc-900 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
                      {song.title}
                    </h4>
                    <p className="text-[11px] font-bold text-indigo-600/90 flex items-center gap-1 mt-1">
                      <img src="/assets/artist.svg" alt="Artist" className="w-3 h-3 object-contain opacity-80" />
                      {song.artist || "Unknown Artist"}
                    </p>
                  </div>
                  
                  {/* Quick Preview Button */}
                  <button 
                    onClick={() => router.push(`/songs/${song.id}`)}
                    className="text-[10px] font-black text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors"
                  >
                    PREVIEW ↗
                  </button>
                </div>

                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-zinc-100">
                  <button 
                    onClick={() => handleReject(song.id, song.title)}
                    className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all active:scale-95"
                  >
                    Reject & Delete
                  </button>
                  <button 
                    onClick={() => handleApprove(song.id)}
                    className="flex-1 py-2.5 bg-zinc-900 hover:bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-md transition-all active:scale-95"
                  >
                    Approve Song
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}