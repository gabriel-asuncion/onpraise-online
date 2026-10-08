"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import GlobalLoader from '../../../components/GlobalLoader';

import { getSongContentType, SongContentType } from "../../setlists/[id]/live/utils/setlist-helpers";

interface MySongRecord {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  tempo: number;
  approval_status: string;
  reviewer_feedback?: string;
  created_at: string;
  chordpro_content?: string;
  youtube_url?: string;
}

const ContentTypeBadge = ({ type }: { type: SongContentType }) => {
  if (type === "Empty") return null;

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

export default function SongDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { simulatedUserId } = useEngine();

  const [loading, setLoading] = useState(true);
  const [mySongs, setMySongs] = useState<MySongRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean; title: string; feedback: string }>({ isOpen: false, title: "", feedback: "" });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchMySongs = async () => {
    if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") return;
    try {
      const { data, error } = await supabase
        .from("songs")
        .select("id, title, artist, original_key, tempo, approval_status, reviewer_feedback, created_at, chordpro_content, youtube_url")
        .eq("created_by", simulatedUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMySongs(data || []);
    } catch (err) {
      console.error("Error fetching personal songs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMySongs();
  }, [simulatedUserId]);

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete your submission for "${title}"?`)) return;
    
    setIsDeleting(id);
    try {
      await supabase.from("song_sections").delete().eq("song_id", id);
      const { error } = await supabase.from("songs").delete().eq("id", id);
      
      if (error) throw error;
      setMySongs(prev => prev.filter(s => s.id !== id));
      router.refresh(); // Flush cache
    } catch (err: any) {
      alert(`Failed to delete song: ${err.message}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredSongs = mySongs.filter(song => {
    if (activeFilter === "all") return true;
    return song.approval_status === activeFilter;
  });

  const pendingCount = mySongs.filter(s => s.approval_status === "pending").length;
  const approvedCount = mySongs.filter(s => s.approval_status === "approved").length;
  const rejectedCount = mySongs.filter(s => s.approval_status === "rejected").length;

  if (loading) return <GlobalLoader message="LOADING YOUR DASHBOARD..." />;

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col relative bg-surface font-sans text-on-surface">
      
      {/* HEADER */}
      <header className="shrink-0 w-full z-50 bg-surface/85 backdrop-blur-xl border-b border-outline-variant/30 pt-safe">
        <div className="flex items-center justify-between px-4 md:px-8 py-4 w-full">
          <div className="flex items-center gap-4">
            <button 
              type="button" 
              onClick={() => router.push("/songs")} 
              className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant font-bold flex items-center justify-center transition-colors shadow-sm cursor-pointer border border-outline-variant/30"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="flex flex-col">
              <h1 className="font-black text-[20px] md:text-[24px] text-on-surface tracking-tight leading-none" style={{ fontFamily: "Georgia, serif" }}>Song Dashboard</h1>
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Manage your repertoire contributions</span>
            </div>
          </div>
          
          <button 
            onClick={() => router.push("/songs/new/edit")}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md hover:bg-primary/90 transition-colors cursor-pointer border border-primary/20"
          >
            <span className="material-symbols-outlined text-[16px]">add</span> Add New Song
          </button>
        </div>

        {/* FILTERS */}
        <div className="px-4 md:px-8 pb-3 pt-2 overflow-x-auto no-scrollbar flex items-center gap-2">
          <button onClick={() => setActiveFilter("all")} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${activeFilter === "all" ? "bg-surface-container-highest text-on-surface border border-outline-variant/50 shadow-sm" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high border border-transparent"}`}>
            All Submissions ({mySongs.length})
          </button>
          <button onClick={() => setActiveFilter("pending")} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${activeFilter === "pending" ? "bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high border border-transparent"}`}>
            Pending ({pendingCount})
          </button>
          <button onClick={() => setActiveFilter("approved")} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${activeFilter === "approved" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shadow-sm" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high border border-transparent"}`}>
            Approved ({approvedCount})
          </button>
          <button onClick={() => setActiveFilter("rejected")} className={`px-4 py-2 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${activeFilter === "rejected" ? "bg-amber-500/10 text-amber-500 border border-amber-500/30 shadow-sm" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high border border-transparent"}`}>
            Requires Edit ({rejectedCount})
          </button>
        </div>
      </header>

      {/* MAIN LIST CANVAS */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 custom-scrollbar pb-safe-bottom">
        <div className="max-w-6xl mx-auto w-full">
          
          {filteredSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 bg-surface-container-lowest border border-dashed border-outline-variant/30 rounded-3xl shadow-sm mt-10">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-outline mb-4">
                <span className="material-symbols-outlined text-[32px]">library_music</span>
              </div>
              <h3 className="text-lg font-black text-on-surface">No songs found.</h3>
              <p className="text-[12px] font-bold text-on-surface-variant mt-1 max-w-sm">
                {activeFilter === "all" 
                  ? "You haven't submitted any tracks yet. Click + Add Song to contribute to the repertoire." 
                  : `You don't have any songs with the "${activeFilter}" status.`}
              </p>
              {activeFilter === "all" && (
                <button 
                  onClick={() => router.push("/songs/new/edit")}
                  className="mt-6 px-6 py-3 bg-primary text-on-primary rounded-xl font-black text-[12px] uppercase tracking-widest shadow-md hover:bg-primary/90 transition-colors cursor-pointer border border-primary/20"
                >
                  + Add New Song
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSongs.map((song) => {
                const isApproved = song.approval_status === "approved";
                const isRejected = song.approval_status === "rejected";
                const isPending = song.approval_status === "pending";

                const contentType = getSongContentType(song.chordpro_content || "");
                const ytId = song.youtube_url ? song.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1] : null;

                return (
                  <article 
                    key={song.id} 
                    className="relative overflow-hidden z-0 bg-[#18181A] rounded-2xl p-5 shadow-lg flex flex-col h-full transition-all duration-200 border border-zinc-800/80 hover:border-zinc-700"
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

                      {isPending && (
                        <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-rose-500/10 text-rose-400 text-[8px] font-black uppercase tracking-widest border border-rose-500/30 shadow-sm">
                          <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>schedule</span>
                          <span className="leading-none pt-px">Pending Review</span>
                        </span>
                      )}
                      {isApproved && (
                        <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest border border-emerald-500/30 shadow-sm">
                          <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>check_circle</span>
                          <span className="leading-none pt-px">Approved</span>
                        </span>
                      )}
                      {isRejected && (
                        <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-widest border border-amber-500/30 shadow-sm">
                          <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>error</span>
                          <span className="leading-none pt-px">Needs Edit</span>
                        </span>
                      )}
                      
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
                      
                      {/* Left: Delete */}
                      <button 
                        onClick={(e) => handleDelete(e, song.id, song.title)}
                        disabled={isDeleting === song.id}
                        className="h-7 px-2.5 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-bold hover:bg-rose-500/20 flex items-center justify-center gap-1 cursor-pointer border border-rose-500/30 shadow-sm shrink-0 transition-colors active:scale-95 disabled:opacity-50"
                        title="Delete Submission"
                      >
                        {isDeleting === song.id ? (
                          <span className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>delete</span>
                            <span className="hidden sm:inline">Delete</span>
                          </>
                        )}
                      </button>
                      
                      {/* Right: Operational Actions */}
                      <div className="flex items-center gap-1.5 overflow-hidden justify-end w-full">
                        {song.reviewer_feedback && (
                          <button 
                            onClick={() => setFeedbackModal({ isOpen: true, title: song.title, feedback: song.reviewer_feedback! })}
                            className="h-7 px-2.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-[10px] font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>rate_review</span>
                            <span className="hidden lg:inline">Feedback</span>
                          </button>
                        )}

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
                      </div>
                    </div>

                  </article>
                );
              })}
            </div>
          )}

        </div>
      </main>

      {/* FEEDBACK MODAL */}
      {feedbackModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
          <div className="bg-[#18181A] border border-zinc-800/80 rounded-3xl shadow-2xl p-6 max-w-md w-full relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setFeedbackModal({ isOpen: false, title: "", feedback: "" })}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#202022] hover:bg-[#2C2C2E] text-zinc-400 flex items-center justify-center transition-colors cursor-pointer border border-zinc-800"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            
            <div className="flex items-center gap-3 mb-4 border-b border-zinc-800/80 pb-4 pr-6">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shadow-inner border border-amber-500/30">
                <span className="material-symbols-outlined text-[20px]">rate_review</span>
              </div>
              <div className="flex flex-col">
                <h3 className="text-[16px] font-black text-white tracking-tight leading-tight">Admin Feedback</h3>
                <span className="text-[11px] font-bold text-zinc-400 mt-0.5 truncate max-w-[200px]">{feedbackModal.title}</span>
              </div>
            </div>

            <div className="bg-[#141416] border border-zinc-800/80 rounded-xl p-4 max-h-[40vh] overflow-y-auto custom-scrollbar shadow-inner">
              <p className="text-[13px] text-zinc-300 font-medium leading-relaxed whitespace-pre-wrap">
                {feedbackModal.feedback}
              </p>
            </div>

            <div className="mt-5 pt-2">
              <button 
                onClick={() => setFeedbackModal({ isOpen: false, title: "", feedback: "" })}
                className="w-full py-3 bg-[#202022] hover:bg-[#2C2C2E] text-white rounded-xl font-black text-[12px] uppercase tracking-widest shadow-sm border border-zinc-700 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE ADD BUTTON */}
      <button 
        onClick={() => router.push("/songs/new/edit")}
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-on-primary rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.4)] flex sm:hidden items-center justify-center z-50 cursor-pointer active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </button>

    </div>
  );
}