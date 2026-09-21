"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import GlobalLoader from "../../components/GlobalLoader";

interface MDProject {
  id: string;
  title: string;
  created_at: string;
  tracks_data: any[];
}

export default function MDLiveDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const { userTeamId } = useEngine();
  
  const [projects, setProjects] = useState<MDProject[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");

  // Creation Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!userTeamId) return;
    fetchProjects();
  }, [userTeamId]);

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('md_live_projects')
      .select('*')
      .eq('team_id', userTeamId)
      .order('created_at', { ascending: false });
      
    if (!error && data) setProjects(data);
    setLoading(false);
  };

  const handleOpenCreateModal = () => {
    setNewProjectTitle(`Track Session ${new Date().toLocaleDateString()}`);
    setIsCreateModalOpen(true);
  };

  const executeCreateProject = async () => {
    if (!userTeamId || !newProjectTitle.trim()) return;
    setIsCreating(true);
    
    const { data, error } = await supabase
      .from('md_live_projects')
      .insert([{ team_id: userTeamId, title: newProjectTitle.trim(), tracks_data: [] }])
      .select()
      .single();

    if (!error && data) {
      router.push(`/md-live/${data.id}`);
    } else {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this track session?")) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    await supabase.from('md_live_projects').delete().eq('id', id);
  };

  // ============================================================================
  // SMART PARSER & SEARCH ENGINE
  // ============================================================================
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;

    let textSearch = searchQuery;
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    let songFilter = "";

    const dateRegex = /:date:(\d{4}-\d{2}-\d{2})(?:,(\d{4}-\d{2}-\d{2}))?/;
    const dateMatch = textSearch.match(dateRegex);
    if (dateMatch) {
       startDate = new Date(dateMatch[1]);
       endDate = dateMatch[2] ? new Date(dateMatch[2]) : new Date(dateMatch[1]);
       startDate.setHours(0, 0, 0, 0);
       endDate.setHours(23, 59, 59, 999);
       textSearch = textSearch.replace(dateRegex, ''); 
    }

    const songRegex = /:song:([a-zA-Z0-9\s_-]+)(?=(?::date:|$))/;
    const songMatch = textSearch.match(songRegex);
    if (songMatch) {
       songFilter = songMatch[1].trim().toLowerCase();
       textSearch = textSearch.replace(songMatch[0], ''); 
    }

    textSearch = textSearch.trim().toLowerCase();

    return projects.filter(proj => {
      if (textSearch && !proj.title.toLowerCase().includes(textSearch)) return false;
      if (startDate && endDate) {
        const projDate = new Date(proj.created_at);
        if (projDate < startDate || projDate > endDate) return false;
      }
      if (songFilter) {
         const tracks = proj.tracks_data || [];
         const hasSong = tracks.some((t: any) => t.title && t.title.toLowerCase().includes(songFilter));
         if (!hasSong) return false;
      }
      return true;
    });
  }, [projects, searchQuery]);

  if (loading) return <GlobalLoader message="LOADING STUDIO PROJECTS..." />;

  return (
    <div className="bg-[#0e0e11] text-[#f3f4f6] font-sans antialiased min-h-[100dvh] w-full flex flex-col items-center select-none">
      
      {/* HEADER */}
      <header className="w-full max-w-2xl px-5 pt-8 pb-5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <button onClick={() => router.push("/dashboard")} className="w-11 h-11 rounded-full bg-[#1c1c22] border border-[#2a2a35]/60 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-[#24242c] active:scale-95 transition-all shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.07),_0_4px_12px_rgba(0,0,0,0.5)] cursor-pointer">
            <span className="material-symbols-outlined text-[22px]">chevron_left</span>
          </button>
          <div className="flex flex-col">
            <h1 className="text-[22px] font-bold tracking-tight text-white leading-tight">MD Live Studio</h1>
            <span className="text-[11px] font-black tracking-widest text-[#3b82f6] uppercase mt-0.5">Workspace Projects</span>
          </div>
        </div>
        <button 
          onClick={handleOpenCreateModal} 
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3b82f6] text-white hover:bg-blue-500 transition-colors shadow-[0_4px_14px_rgba(59,130,246,0.3)] active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="text-xs font-bold tracking-wide uppercase">Add Tracks</span>
        </button>
      </header>

      {/* SMART SEARCH BAR */}
      <div className="w-full max-w-2xl px-5 mb-8">
        <div className="relative flex items-center bg-[#18181b] border border-white/5 rounded-xl px-3 py-3 focus-within:border-white/10 transition-colors shadow-sm">
          <span className="material-symbols-outlined text-zinc-500 text-[20px] mr-2.5">search</span>
          <input 
            type="text"
            placeholder="Search sessions... (e.g., :date:2026-09-01)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-zinc-200 placeholder-zinc-500 outline-none"
          />
          <div className="px-1.5 py-0.5 rounded-[4px] bg-white/5 border border-white/10 text-zinc-500 text-[10px] font-mono tracking-widest ml-2 shrink-0">⌘K</div>
        </div>
      </div>

      {/* TRACK LISTING */}
      <main className="w-full max-w-2xl px-5 flex flex-col gap-3 pb-12">
        <div className="flex items-center justify-between px-1 mb-1">
          <h2 className="text-[11px] font-bold text-zinc-400 tracking-[0.15em] uppercase">Track List</h2>
          <span className="text-[11px] font-bold text-zinc-500">{filteredProjects.length} Sessions</span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl bg-[#141414] p-10 border border-dashed border-white/10 flex flex-col items-center justify-center text-center mt-2">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
              <span className="material-symbols-outlined text-[32px]">graphic_eq</span>
            </div>
            <h3 className="font-bold text-[16px] text-white mb-1">No Tracks Yet</h3>
            <p className="text-[12px] text-zinc-400 font-medium">Create a new track session to start building automated sequences.</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-10 mt-2">
            <p className="text-zinc-500 font-bold text-[13px]">No sessions match your search criteria.</p>
          </div>
        ) : (
          filteredProjects.map(proj => {
            const trackCount = proj.tracks_data ? proj.tracks_data.length : 0;
            const dateStr = new Date(proj.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            return (
              <div 
                key={proj.id} 
                onClick={() => router.push(`/md-live/${proj.id}`)}
                className="rounded-2xl bg-[#141414] border border-white/5 hover:border-white/10 transition-colors cursor-pointer group flex flex-col p-4 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[14px] bg-blue-500/10 border border-blue-500/20 text-[#3b82f6] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>music_note</span>
                    </div>
                    <h3 className="font-bold text-[16px] text-white tracking-tight">{proj.title}</h3>
                  </div>
                  <button onClick={(e) => handleDeleteProject(e, proj.id)} className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-[#ef4444] hover:bg-red-500/10 transition-colors">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
                
                <div className="w-full h-px bg-white/5 mb-3.5"></div>
                
                <div className="flex items-center gap-5 text-[11px] font-semibold text-zinc-400 ml-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-zinc-500">calendar_today</span>
                    {dateStr}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-zinc-500">layers</span>
                    {trackCount} Track{trackCount !== 1 && 's'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* CREATION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[350000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#1c1c22] rounded-3xl border border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 p-6">
            
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-xl text-white tracking-tight">New Track Session</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="w-8 h-8 rounded-full bg-[#24242c] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#2a2a35] transition-colors cursor-pointer">✕</button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">Session Title</label>
                <input 
                  type="text" 
                  value={newProjectTitle} 
                  onChange={(e) => setNewProjectTitle(e.target.value)} 
                  placeholder="e.g. Sunday Morning Set" 
                  className="w-full bg-[#141414] border border-white/10 rounded-xl p-3 text-sm font-bold outline-none focus:border-[#3b82f6] text-white transition-colors" 
                  autoFocus
                />
              </div>

              <div className="pt-2">
                <button 
                  onClick={executeCreateProject} 
                  disabled={!newProjectTitle.trim() || isCreating} 
                  className="w-full py-3.5 bg-[#3b82f6] text-white rounded-xl font-black text-[13px] shadow-[0_4px_14px_rgba(59,130,246,0.4)] hover:bg-blue-500 disabled:opacity-50 disabled:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                      CREATING...
                    </>
                  ) : (
                    "CREATE SESSION"
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}