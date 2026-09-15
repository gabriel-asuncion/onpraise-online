"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import GlobalLoader from "../../../components/GlobalLoader";
import { getSongContentType, SongContentType } from "../../setlists/[id]/live/utils/setlist-helpers";

interface PendingSong {
  id: string;
  title: string;
  artist?: string | null;
  approval_status?: string;
  youtube_url?: string;
  original_key?: string;
  tempo?: string | number;
  chordpro_content?: string;
  themes?: string;
}

const ContentTypeBadge = ({ type }: { type: SongContentType }) => {
  if (type === "Empty") return null;

  // The design uses a blue outline and background tint for the content type
  const colorClasses = "bg-blue-500/10 border border-blue-500/40 text-blue-400"; 

  return (
    <span className={`h-5 px-2 rounded-full text-[8px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1 shadow-sm ${colorClasses}`}>
      {type === "Chords + Lyrics" && (
        <span className="flex items-center gap-0.5">
          <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>music_note</span>
          <span className="text-[8px] leading-none opacity-60">+</span>
          <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>subject</span>
        </span>
      )}
      {type === "Chords" && (
        <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>music_note</span>
      )}
      {type === "Lyrics" && (
        <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>subject</span>
      )}
      <span className="leading-none pt-px">{type === "Chords + Lyrics" ? "Chords + Lyrics" : type}</span>
    </span>
  );
};

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
    <div className="h-full w-full bg-surface text-on-surface flex flex-col overflow-hidden animate-in fade-in duration-300">
      
      {/* ========================================= */}
      {/* 1. DASHBOARD HEADER                       */}
      {/* ========================================= */}
      <header className="shrink-0 z-[100] sticky top-0 bg-surface/90 px-4 md:px-8 py-5 border-b border-outline-variant/30 shadow-sm flex items-center justify-between supports-[backdrop-filter]:backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/songs")}
            className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant flex items-center justify-center font-bold transition-all active:scale-95 border border-outline-variant/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-on-surface" style={{ fontFamily: "Georgia, serif" }}>
              Pending Approvals
            </h2>
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">
              Review and moderate community submissions
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-error/10 border border-error/20 px-3 py-1.5 rounded-lg shadow-inner">
          <span className="text-[10px] font-black text-error uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
            {pendingSongs.length} in Queue
          </span>
        </div>
      </header>

      {/* ========================================= */}
      {/* 2. PENDING SONGS FEED                     */}
      {/* ========================================= */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto w-full custom-scrollbar pb-safe-bottom-stage">
        {pendingSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-outline-variant/30 rounded-3xl bg-surface-container-lowest mt-10 shadow-sm">
            <span className="material-symbols-outlined text-[48px] text-primary mb-4">task_alt</span>
            <h3 className="text-lg font-black text-on-surface tracking-tight">Inbox Zero</h3>
            <p className="text-xs font-bold text-on-surface-variant mt-1">All community submissions have been reviewed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingSongs.map(song => {
              const contentType = getSongContentType(song.chordpro_content || "");
              const ytId = song.youtube_url ? song.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1] : null;

              return (
                <article 
                  key={song.id} 
                  className={`relative overflow-hidden z-0 bg-[#18181A] rounded-2xl p-5 shadow-lg flex flex-col h-full transition-all duration-200 border border-zinc-800/80 hover:border-zinc-700 ${
                    processingId === song.id ? "opacity-50 scale-[0.98] pointer-events-none" : ""
                  }`}
                >
                  {/* YouTube Background Overlay */}
                  {ytId && (
                    <div 
                      className="absolute inset-0 z-[-1] opacity-[0.10] pointer-events-none bg-cover bg-center mix-blend-luminosity"
                      style={{ backgroundImage: `url('https://img.youtube.com/vi/${ytId}/hqdefault.jpg')` }}
                    />
                  )}

                  {/* Badges / Header Row */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4 relative z-10">
                    <ContentTypeBadge type={contentType} />

                    <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-rose-500/10 text-rose-400 text-[8px] font-black uppercase tracking-widest border border-rose-500/30 shadow-sm">
                      <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>schedule</span>
                      <span className="leading-none pt-px">Pending Review</span>
                    </span>
                    
                    {ytId && (
                      <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest border border-red-500/30 shadow-sm">
                        <svg viewBox="0 0 24 24" className="w-[11px] h-[11px] fill-red-500 shrink-0">
                          <path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.254,4,12,4,12,4S5.746,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.746,2,12,2,12s0,4.254,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.746,20,12,20,12,20s6.254,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.254,22,12,22,12S22,7.746,21.582,6.186z M9.996,15.505V8.495L15.993,12L9.996,15.505z" />
                        </svg>
                        <span className="leading-none pt-px">YouTube</span>
                      </span>
                    )}
                  </div>

                  {/* Title and Artist Row */}
                  <div className="flex flex-col mb-4 relative z-10">
                    <h2 className="text-xl text-white font-extrabold tracking-tight truncate leading-tight mb-1">{song.title}</h2>
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <span className="material-symbols-outlined text-[16px]">mic</span>
                      <span className="text-[13px] font-semibold truncate">{song.artist || "Unknown Artist"}</span>
                    </div>
                  </div>

                  {/* Key and BPM Metrics Row */}
                  <div className="flex items-center gap-2.5 mb-5 relative z-10">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141416] border border-zinc-800/80 text-blue-400 font-medium text-[11px] shadow-sm">
                      <span className="material-symbols-outlined leading-none" style={{ fontSize: '12px' }}>music_note</span>
                      <span>Key: <span className="text-blue-300 ml-0.5">{song.original_key || "G"}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141416] border border-zinc-800/80 text-zinc-300 font-medium text-[11px] shadow-sm tnum">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                        <path d="m15.5 19-3-11.5a1.8 1.8 0 0 0-3.5 0L6 19h9.5z"/>
                        <path d="M12.5 11 11 16"/>
                      </svg>
                      <span>{song.tempo || "--"} BPM</span>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="mt-auto shrink-0 flex items-center justify-between bg-surface-container/75 backdrop-blur-md -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl border-t border-zinc-800/80 relative z-10 gap-2">
                    
                    {/* Left: Reject Action */}
                    <button 
                      onClick={() => handleReject(song.id, song.title)} 
                      className="h-7 px-2.5 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-bold hover:bg-rose-500/20 flex items-center justify-center gap-1 cursor-pointer border border-rose-500/30 shadow-sm shrink-0 transition-colors active:scale-95"
                      title="Reject & Delete"
                    >
                      {/* ✅ SURGICAL FIX: Force font-size to 12px inline to override Material defaults */}
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>delete</span>
                      <span className="hidden sm:inline">Reject</span>
                    </button>
                    
                    {/* Right: Operational Actions */}
                    <div className="flex items-center gap-1.5 overflow-hidden justify-end w-full">
                      <button 
                        onClick={() => router.push(`/songs/${song.id}/edit`)} 
                        className="h-7 px-2.5 rounded-md bg-[#202022] text-zinc-300 hover:bg-[#2C2C2E] text-[10px] font-bold transition-colors cursor-pointer border border-zinc-700 shadow-sm flex items-center justify-center gap-1 shrink-0 active:scale-95"
                        title="Edit Song"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>edit</span>
                        <span className="hidden lg:inline">Edit</span>
                      </button>
                      <button 
                        onClick={() => router.push(`/songs/${song.id}`)} 
                        className="h-7 px-2.5 rounded-md bg-[#202022] text-zinc-300 hover:bg-[#2C2C2E] text-[10px] font-bold transition-colors cursor-pointer border border-zinc-700 shadow-sm flex items-center justify-center gap-1 shrink-0 active:scale-95"
                        title="View Song"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>visibility</span>
                        <span className="hidden lg:inline">View</span>
                      </button>
                      <button 
                        onClick={() => handleApprove(song.id)} 
                        className="h-7 px-2.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>check_circle</span>
                        <span>Approve</span>
                      </button>
                    </div>
                  </div>

                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}