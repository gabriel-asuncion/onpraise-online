"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import { getAllSongs } from "../../utils/supabase/actions";
import GlobalLoader from '../../components/GlobalLoader';


// ✅ SURGICAL FIX: Standardized Discord-Style Tokens
const KEYWORD_SUGGESTIONS_CATALOG = [
  { token: ":artist:", hint: "Filter by author or band name" },
  { token: ":key:", hint: "Filter by core song key signature (e.g., G, C#m)" },
  { token: ":bpm:", hint: "Filter by exact tempo (e.g., 74)" },
  { token: ":bpm-range:", hint: "Filter by tempo range (e.g., 70-90)" },
  { token: ":theme:", hint: "Filter by set categories or preset themes" },
  { token: ":lyrics:", hint: "Scan song line rows for exact phrases" }
];

export default function SongsListPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollContainerRef = useRef<HTMLElement>(null);
  
  const { simulatedUserId, activeRole } = useEngine();
  const canEditLibrary = ["admin", "moderator", "musician"].includes(activeRole);

  const canApproveSongs = ["admin", "moderator"].includes(activeRole);
  // const pendingSongsCount = allDatabaseSongs.filter(song => song.approval_status === 'pending').length;

  const [loading, setLoading] = useState(true);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({
    artist: "", key: "", lyrics: "", theme: "", bpm: "", bpmRange: ""
  });
  // ✅ SURGICAL FIX: Tracks which chip is currently an active, typing input field
  const [editingFilter, setEditingFilter] = useState<string | null>(null);
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Smart Add Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState("");

  const pendingSongsCount = allDatabaseSongs.filter(song => song.approval_status === 'pending').length;

  const loadSongsData = async () => {
    try {
      const songs = await getAllSongs();
      setAllDatabaseSongs(songs || []);
    } catch (e) { console.error("Failed to load songs assets:", e); }
    setLoading(false);
  };

  useEffect(() => {
    async function syncActiveUserBookmarksMatrix() {
      if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") {
        setBookmarkedSongIds([]); return;
      }
      const { data, error } = await supabase.from("profiles").select("bookmarked_songs").eq("id", simulatedUserId).maybeSingle();
      if (!error && data?.bookmarked_songs) setBookmarkedSongIds(data.bookmarked_songs);
      else setBookmarkedSongIds([]);
    }
    syncActiveUserBookmarksMatrix();
  }, [simulatedUserId]);

  useEffect(() => { loadSongsData(); }, []);
  useEffect(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" }); }, [currentPage]);

  const handleToggleBookmark = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") return;
    const alreadyBookmarked = bookmarkedSongIds.includes(songId);
    const updatedBookmarks = alreadyBookmarked ? bookmarkedSongIds.filter(id => id !== songId) : [...bookmarkedSongIds, songId];
    try {
      const { error } = await supabase.from("profiles").update({ bookmarked_songs: updatedBookmarks }).eq("id", simulatedUserId);
      if (!error) setBookmarkedSongIds(updatedBookmarks);
      else alert(`Bookmark Update Failed: ${error.message}`);
    } catch (err) { console.error(err); }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setYtUrlInput(text);
    } catch (err) { alert("Clipboard access is blocked or not supported by your browser."); }
  };

  const handleProcessYoutubeLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrlInput.trim()) return;
    setYtLoading(true); setYtError("");
    try {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = ytUrlInput.match(regExp);
      const ytId = match && match[2].length === 11 ? match[2] : null;
      if (!ytId) throw new Error("Invalid YouTube link.");
      const { data: existingSongs, error: dbError } = await supabase.from("songs").select("id, title").ilike("youtube_url", `%${ytId}%`).limit(1);
      if (dbError) throw new Error("Database scan failed.");
      if (existingSongs && existingSongs.length > 0) throw new Error(`Duplicate Blocked! Song exists as: "${existingSongs[0].title}"`);
      const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(ytUrlInput)}`);
      const metadata = await oembedRes.json();
      if (metadata.error) throw new Error("Could not fetch video metadata.");
      const searchParams = new URLSearchParams({ title: metadata.title || "", artist: metadata.author_name || "", youtube_url: ytUrlInput });
      setIsAddModalOpen(false); setYtUrlInput("");
      router.push(`/songs/new/edit?${searchParams.toString()}`);
    } catch (err: any) { setYtError(err.message || "An unexpected error occurred."); } 
    finally { setYtLoading(false); }
  };

  // ✅ SURGICAL FIX: The Interceptor Engine (Instantly creates the chip when typed)
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const match = val.match(/:(artist|key|lyrics|theme|bpm|bpm-range):/i);
    
    if (match) {
      const rawKey = match[1].toLowerCase();
      const filterKey = rawKey === "bpm-range" ? "bpmRange" : rawKey;
      const beforeToken = val.substring(0, match.index!).trim();
      const afterToken = val.substring(match.index! + match[0].length).trim();

      setActiveFilters(prev => ({ ...prev, [filterKey]: afterToken }));
      setEditingFilter(filterKey);
      setSongSearchQuery(beforeToken); 
      setTimeout(() => document.getElementById(`edit-${filterKey}`)?.focus(), 50);
      return;
    }
    setSongSearchQuery(val);
  };

  const filteredSongs = allDatabaseSongs.filter(song => {
    const cleanTitle = songSearchQuery.replace(/:[a-z-]*$/i, "").trim().toLowerCase();
    if (cleanTitle && !song.title?.toLowerCase().includes(cleanTitle)) return false;
    
    // Evaluates the active filters instantly as you type inside the chips!
    if (activeFilters.artist && !song.artist?.toLowerCase().includes(activeFilters.artist.toLowerCase())) return false;
    if (activeFilters.key && !song.original_key?.toLowerCase().includes(activeFilters.key.toLowerCase())) return false;
    if (activeFilters.theme && !song.themes?.toLowerCase().includes(activeFilters.theme.toLowerCase())) return false;
    if (activeFilters.lyrics && !song.chordpro_content?.toLowerCase().includes(activeFilters.lyrics.toLowerCase())) return false;
    if (activeFilters.bpm && String(song.tempo) !== activeFilters.bpm) return false;
    if (activeFilters.bpmRange) {
      const [minStr, maxStr] = activeFilters.bpmRange.split("-");
      const min = parseInt(minStr) || 0;
      const max = parseInt(maxStr) || 999;
      const songTempo = parseInt(song.tempo) || 0;
      if (songTempo < min || songTempo > max) return false;
    }
    return true;
  });

  const typingWordsArray = songSearchQuery.split(/\s+/);
  const currentActiveWordFragment = typingWordsArray[typingWordsArray.length - 1] || "";
  const shouldShowHintsDropdown = currentActiveWordFragment.startsWith(":");
  const filteredKeywordSuggestions = KEYWORD_SUGGESTIONS_CATALOG.filter(item =>
    item.token.toLowerCase().includes(currentActiveWordFragment.toLowerCase())
  );

  const handleSelectKeywordSuggestion = (token: string) => {
    const rawKey = token.replace(/:/g, "").toLowerCase();
    const filterKey = rawKey === "bpm-range" ? "bpmRange" : rawKey;
    const tokensList = [...typingWordsArray];
    tokensList.pop(); 
    setSongSearchQuery(tokensList.join(" ").trim());
    
    // Instantly spawn the chip and focus it
    setEditingFilter(filterKey);
    setTimeout(() => document.getElementById(`edit-${filterKey}`)?.focus(), 50);
  };

  const totalPages = Math.max(1, Math.ceil(filteredSongs.length / ITEMS_PER_PAGE));
  const paginatedSongs = filteredSongs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const getPageNumbers = () => {
    const pages: number[] = [];
    let startPage = Math.max(1, currentPage - 2);
    let endPage = startPage + 4;
    if (endPage > totalPages) { endPage = totalPages; startPage = Math.max(1, endPage - 4); }
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  };

  useEffect(() => { setCurrentPage(1); }, [songSearchQuery, activeFilters]);

  // ✅ SURGICAL FIX: The dynamic Chip Renderer (Embeds the input INSIDE the chip!)
  const renderInteractiveChip = (tokenPrefix: string, filterKey: string) => {
    const isActive = activeFilters[filterKey] !== "" || editingFilter === filterKey;
    if (!isActive) return null;
    const isEditing = editingFilter === filterKey;

    return (
      <div 
        key={filterKey} 
        onClick={() => { setEditingFilter(filterKey); setTimeout(() => document.getElementById(`edit-${filterKey}`)?.focus(), 50); }} 
        className={`inline-flex items-center gap-1 bg-white border text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm cursor-pointer transition-all ${isEditing ? 'ring-2 ring-blue-500/50 border-blue-400 scale-105' : 'hover:border-blue-300 animate-in zoom-in-95'}`}
      >
        <span className="opacity-40 font-mono text-[9px]">{tokenPrefix}</span>
        {isEditing ? (
          <input
            id={`edit-${filterKey}`}
            value={activeFilters[filterKey]}
            onChange={(e) => setActiveFilters(prev => ({ ...prev, [filterKey]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); setEditingFilter(null); setTimeout(() => searchInputRef.current?.focus(), 50); } 
              else if (e.key === 'Backspace' && activeFilters[filterKey] === "") { setEditingFilter(null); setActiveFilters(prev => ({ ...prev, [filterKey]: "" })); setTimeout(() => searchInputRef.current?.focus(), 50); }
            }}
            onBlur={() => setEditingFilter(null)}
            className="bg-transparent outline-none min-w-[15px] max-w-[120px] text-zinc-900"
            style={{ width: `${Math.max(1, activeFilters[filterKey].length)}ch` }}
          />
        ) : (
          <span className="max-w-[70px] truncate">{activeFilters[filterKey]}</span>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); setActiveFilters(prev => ({ ...prev, [filterKey]: "" })); setEditingFilter(null); setTimeout(() => searchInputRef.current?.focus(), 50); }} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500">✕</button>
      </div>
    );
  };

  if (loading) {
    return <GlobalLoader message="LOADING SONGS LIBRARY..." />;
  }

  return (
  <div className="h-[100dvh] w-full overflow-hidden bg-[#f8f9fa] flex flex-col relative animate-in fade-in duration-200">
    <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

    {/* ========================================= */}
    {/* 1. STICKY HEADER & SEARCH BAR BLOCK       */}
    {/* ========================================= */}
    <header className="sticky top-0 z-[100] flex-shrink-0 w-full bg-[#ffffff] px-4 md:px-8 pt-4 md:pt-8 pb-4 space-y-4 border-b border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3 md:gap-4">
          {canEditLibrary && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-[#2563eb] hover:bg-blue-700 text-white flex items-center justify-center font-black text-xl shadow-md transition-transform active:scale-95 shrink-0"
            >
              ＋
            </button>
          )}
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#111827] truncate" style={{ fontFamily: "Georgia, serif" }}>
            Songs Database
          </h2>
        </div>
        
        {/* ✅ SURGICAL FIX: Responsive Approvals Button (Visible on Mobile!) */}
        {canApproveSongs && pendingSongsCount > 0 && (
          <button
            onClick={() => router.push("/songs/approvals")}
            className="flex items-center gap-1.5 md:gap-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl transition-all cursor-pointer active:scale-95 shadow-sm shrink-0"
          >
            <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-amber-500"></span>
            </span>
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
              {pendingSongsCount} <span className="hidden sm:inline">Pending Review</span><span className="sm:hidden">Review</span>
            </span>
          </button>
        )}
      </div>
      
      <div className="flex flex-col relative overflow-visible">
        <div className="w-full flex flex-wrap items-center gap-2 bg-[#f3f4f6] rounded-full px-5 py-3 border border-zinc-200 shadow-inner focus-within:bg-white focus-within:border-blue-500 transition-all cursor-text" onClick={() => searchInputRef.current?.focus()}>
          
          {/* ✅ Render the magical interactive chips */}
          {renderInteractiveChip(":artist:", "artist")}
          {renderInteractiveChip(":key:", "key")}
          {renderInteractiveChip(":lyrics:", "lyrics")}
          {renderInteractiveChip(":theme:", "theme")}
          {renderInteractiveChip(":bpm:", "bpm")}
          {renderInteractiveChip(":bpm-range:", "bpmRange")}

          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search titles or type a command... (e.g. :artist:)" 
            value={songSearchQuery} 
            onChange={handleSearchInputChange}
            className="flex-1 text-xs font-semibold text-zinc-800 bg-transparent outline-none placeholder-zinc-400 min-w-[140px]" 
          />
        </div>

        {shouldShowHintsDropdown && filteredKeywordSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-2xl p-2 z-[99999] flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
            {filteredKeywordSuggestions.map((item) => (
              <button
                key={item.token}
                type="button"
                onClick={() => handleSelectKeywordSuggestion(item.token)}
                className="w-full flex items-center justify-between text-left p-2 rounded-xl hover:bg-blue-50/60 transition-colors cursor-pointer group"
              >
                <span className="text-xs font-mono font-black text-blue-600 bg-blue-50/50 border border-blue-200/40 px-1.5 py-0.5 rounded-lg">{item.token}</span>
                <span className="text-[10px] font-bold text-zinc-400 text-right group-hover:text-zinc-600">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>

    {/* ========================================= */}
    {/* 2. SCROLLING GRID CONTENT                 */}
    {/* ========================================= */}
    <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 md:pb-8 custom-scrollbar w-full">
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start w-full">
        {paginatedSongs.map(song => {
          const isBookmarked = bookmarkedSongIds.includes(song.id);
          return (
            <div 
              key={song.id} 
              onClick={() => router.push(`/songs/${song.id}`)}
              className="p-5 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50/50 transition-all cursor-pointer flex flex-col justify-between min-h-[145px] relative group shadow-sm overflow-hidden"
            >
              <div className="space-y-1 pr-10">
                
                {/* ✅ SURGICAL FIX: Dynamic Status Badges Row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {song.approval_status === 'pending' && (
                    <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-widest rounded border border-amber-200 shadow-sm">
                      Pending Approval
                    </span>
                  )}
                  {/* Replace your old badge code with this block */}
        {song.youtube_url && (
          <div className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-md flex items-center gap-1.5 shadow-sm border ${
            song.is_youtube_sync_validated 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-red-50 text-red-600 border-red-100'
          }`}>
            <span className={song.is_youtube_sync_validated ? "text-green-500" : "text-red-500"}>▶</span>
            {song.is_youtube_sync_validated ? 'Youtube Sync' : 'Youtube Included'}
          </div>
        )}
                </div>
                
                <h4 className="font-bold text-[16px] text-zinc-900 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
                  {song.title}
                </h4>
                <p className="text-[11px] font-bold text-indigo-600/90 flex items-center gap-1">
                  <img 
                    src="/assets/artist.svg" 
                    alt="Artist" 
                    className="w-3 h-3 object-contain opacity-80" 
                  />
                  {song.artist || "Unknown Artist"}
                </p>
              </div>
              
              <button 
                type="button" 
                onClick={(e) => handleToggleBookmark(e, song.id)} 
                className="absolute top-5 right-5 w-5 h-5 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 z-20 cursor-pointer"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill={isBookmarked ? "#111827" : "none"} 
                  viewBox="0 0 24 24" 
                  strokeWidth={1.5} 
                  stroke="currentColor" 
                  className="w-5 h-5 text-zinc-800"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                </svg>
              </button>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
                <span className="px-2 py-0.5 rounded border border-zinc-200 bg-white text-[10px] font-mono font-bold text-zinc-500 shadow-inner">
                  {song.original_key || "G"}
                </span>
                <span className="text-[10px] font-mono font-black text-zinc-400 tracking-wider">
                  {song.tempo || "74"} BPM
                </span>
              </div>
            </div>
          );
        })}

        {filteredSongs.length === 0 && (
          <div className="col-span-full py-16 text-center text-xs font-semibold italic text-zinc-400 select-none border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 w-full">
            No arrangements found matching the current criteria tracking parameters.
          </div>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8 pb-4 animate-in fade-in">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-xs font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg disabled:opacity-40 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            &lt; Prev
          </button>

          {getPageNumbers().map(pageNum => (
            <button
              key={pageNum}
              onClick={() => setCurrentPage(pageNum)}
              className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                currentPage === pageNum
                  ? "bg-[#2563eb] text-white shadow-md scale-105"
                  : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {pageNum}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-xs font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg disabled:opacity-40 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Next &gt;
          </button>
        </div>
      )}
    </main>

    {/* ========================================= */}
    {/* 3. ADD NEW SONG MODAL                     */}
    {/* ========================================= */}
    {isAddModalOpen && (
      <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[200000] flex items-center justify-center p-4">
        <div className="absolute inset-0" onClick={() => setIsAddModalOpen(false)} />
        
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200 p-6 overflow-hidden">
          
          <button 
            type="button" 
            onClick={() => setIsAddModalOpen(false)} 
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 text-sm font-bold flex items-center justify-center transition-colors"
          >
            ✕
          </button>

          <div className="mb-6">
            <h3 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="text-blue-600">＋</span> Add New Song
            </h3>
            <p className="text-xs font-semibold text-zinc-500 mt-1">
              Add a new song with a youtube link or manual data entry
            </p>
          </div>

          <form onSubmit={handleProcessYoutubeLink} className="space-y-4">
            
            {/* The Smart YouTube Field */}
            <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-700 block">
                YouTube Link
              </label>
              
              {/* Row 1: Input + Paste Button */}
              <div className="flex gap-2">
                <input 
                  type="url" 
                  placeholder="https://youtube.com/watch?v=..."
                  value={ytUrlInput}
                  onChange={(e) => setYtUrlInput(e.target.value)}
                  disabled={ytLoading}
                  className="flex-1 w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-800 outline-none focus:border-blue-500 shadow-inner disabled:opacity-50"
                />
                <button 
                  type="button"
                  onClick={handlePasteClipboard}
                  disabled={ytLoading}
                  title="Paste from clipboard"
                  className="bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600 px-3.5 py-2.5 rounded-xl flex items-center justify-center shadow-sm transition-colors disabled:opacity-50 shrink-0 cursor-pointer active:scale-95"
                >
                  <img src="/assets/clipboard.svg" alt="Paste" className="w-4 h-4 opacity-70" />
                </button>
              </div>

              {/* Row 2: Submit Button */}
              <button 
                type="submit"
                disabled={!ytUrlInput.trim() || ytLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-3 rounded-xl text-xs font-black tracking-wide shadow-md transition-colors active:scale-[0.98] cursor-pointer"
              >
                {ytLoading ? "SCANNING..." : "CHECK"}
              </button>

              {ytError && (
                <div className="mt-2 text-[10px] font-bold text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 flex items-center gap-1.5 animate-in slide-in-from-top-1">
                  <span className="text-sm">⚠️</span> {ytError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 my-2">
              <div className="flex-1 h-[1px] bg-zinc-200" />
              <span className="text-[10px] font-black uppercase text-zinc-400">OR</span>
              <div className="flex-1 h-[1px] bg-zinc-200" />
            </div>

            {/* Manual Entry Fallback */}
            <button 
              type="button" 
              onClick={() => {
                setIsAddModalOpen(false);
                router.push("/songs/new/edit");
              }}
              className="w-full py-4 bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 rounded-2xl text-zinc-700 text-sm font-bold shadow-sm transition-all flex flex-col items-center justify-center gap-0.5"
            >
              <span>Manual Entry</span>
              <span className="text-[10px] font-semibold text-zinc-400">Start from a blank template</span>
            </button>

          </form>
        </div>
      </div>
    )}

  </div>
);
}