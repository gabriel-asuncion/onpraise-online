"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import { getAllSongs } from "../../utils/supabase/actions";
import GlobalLoader from '../../components/GlobalLoader';

import { getSongContentType, SongContentType } from "../setlists/[id]/live/utils/setlist-helpers";

const KEYWORD_SUGGESTIONS_CATALOG = [
  { token: ":artist:", hint: "Filter by author or band name" },
  { token: ":key:", hint: "Filter by core song key signature (e.g., G, C#m)" },
  { token: ":bpm:", hint: "Filter by exact tempo (e.g., 74)" },
  { token: ":bpm-range:", hint: "Filter by tempo range (e.g., 70-90)" },
  { token: ":theme:", hint: "Filter by set categories or preset themes" },
  { token: ":lyrics:", hint: "Scan song line rows for exact phrases" },
  // ✅ SURGICAL ADDITION: New Relational Commands
  { token: ":user:", hint: "Filter by a team member who played this song" },
  { token: ":role:", hint: "Filter by the role they played (e.g. Musician)" }
];


const QUICK_FILTERS = [
  { id: "all", label: "All Songs", count: true },
  { id: "chords-lyrics", label: "Chords & Lyrics" },
  { id: "fast-praise", label: "Fast / Praise" },
  { id: "slow-worship", label: "Slow / Worship" },
  { id: "youtube-included", label: "YouTube Included" },
  { id: "youtube-sync", label: "YouTube Sync Validated" },
  { id: "bookmarked", label: "Bookmarked", count: true },
  { id: "pending", label: "Pending Review", count: true }
];

const ContentTypeBadge = ({ type }: { type: SongContentType }) => {
  if (type === "Empty") return null;

  let colorClasses = "bg-surface-container-highest text-on-surface-variant border-outline-variant/30"; 

  if (type === "Chords + Lyrics") {
    colorClasses = "bg-tertiary-container text-on-tertiary border-tertiary/20";
  } else if (type === "Chords") {
    colorClasses = "bg-surface-container-highest text-on-surface-variant border-outline-variant/30";
  } else if (type === "Lyrics") {
    colorClasses = "bg-secondary-container text-on-secondary-container border-secondary/20";
  }

  return (
    <span className={`h-5 px-2 rounded-full text-[8px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1 border shadow-sm ${colorClasses}`}>
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

export default function SongsListPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollContainerRef = useRef<HTMLElement>(null);
  
  const { simulatedUserId, activeRole, userTeamId } = useEngine();
  const canEditLibrary = ["admin", "moderator", "musician"].includes(activeRole);
  const canApproveSongs = ["admin", "moderator"].includes(activeRole);

  type SongRecordSummary = {
    id: string;
    title?: string;
    artist?: string;
    original_key?: string;
    tempo?: number | string;
    chordpro_content?: string;
    approval_status?: string;
    youtube_url?: string;
    is_youtube_sync_validated?: boolean;
    themes?: string;
  };

  const [loading, setLoading] = useState(true);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<SongRecordSummary[]>([]);
  const [songUsageData, setSongUsageData] = useState<Record<string, { activeEventTitle?: string; pastEventCount: number }>>({});
  
  // Filtering States
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState("all");
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);
  
  // ✅ SURGICAL ADDITION: DOM Batching limits how many cards render at once
  const [visibleCount, setVisibleCount] = useState(24);

  // ✅ SURGICAL ADDITION: Local Storage Search History Engine
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const hist = JSON.parse(localStorage.getItem("onpraise_search_history") || "[]");
      setSearchHistory(hist);
    } catch(e){}
  }, []);

  const saveSearchToHistory = () => {
    const currentFullString = [
      songSearchQuery.trim(),
      ...Object.entries(activeFilters).filter(([_, v]) => v).map(([k, v]) => `:${k}: ${v}`)
    ].filter(Boolean).join(" ").trim();
    
    if (!currentFullString) return;
    
    setSearchHistory(prev => {
      const next = [currentFullString, ...prev.filter(s => s !== currentFullString)].slice(0, 3);
      localStorage.setItem("onpraise_search_history", JSON.stringify(next));
      return next;
    });
  };

  
  
  // Interceptor Engine States
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({
    artist: "", key: "", lyrics: "", theme: "", bpm: "", bpmRange: "", user: "", role: "" // ✅ Added user and role
  });
  
  // ✅ SURGICAL ADDITION: Autofill Dictionaries
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);

  const [editingFilter, setEditingFilter] = useState<string | null>(null);

  // Reset the visible chunk back to 24 anytime the user searches or filters
  useEffect(() => {
    setVisibleCount(24);
  }, [songSearchQuery, activeFilterId, activeFilters]);

  // Add Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState("");

  // YouTube Search Engine States
  const [ytSearchQuery, setYtSearchQuery] = useState("");
  const [ytResults, setYtResults] = useState<any[]>([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [isYtDropdownOpen, setIsYtDropdownOpen] = useState(false);

  const pendingSongsCount = allDatabaseSongs.filter(song => song.approval_status === 'pending').length;

  const loadSongsData = async () => {
    try {
      const songs = await getAllSongs();
      setAllDatabaseSongs(songs || []);

      // Cross-Reference Matrix for Song Usage Footer
      let evtsQuery = supabase.from("events").select("id, title, event_date");
      if (userTeamId && userTeamId !== "00000000-0000-0000-0000-000000000000") {
        evtsQuery = evtsQuery.eq("team_id", userTeamId);
      }
      const { data: evts } = await evtsQuery;
      
      const { data: sls } = await supabase.from("setlists").select("id, event_id");
      const { data: slSongs } = await supabase.from("setlist_songs").select("song_id, setlist_id");
      
      // ✅ SURGICAL ADDITION: Fetch Roster and Profiles for the new User/Role commands
      const { data: profiles } = await supabase.from("profiles").select("id, full_name");
      const { data: rosters } = await supabase.from("event_rosters").select("event_id, user_id, role");
      
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
      const eventRosterMap: Record<string, { userName: string, role: string }[]> = {};
      
      const uniqueUsers = new Set<string>();
      const uniqueRoles = new Set<string>();

      if (rosters) {
        rosters.forEach(r => {
          if (!eventRosterMap[r.event_id]) eventRosterMap[r.event_id] = [];
          const uName = profileMap[r.user_id] || "Unknown";
          const rName = r.role || "Unknown";
          
          eventRosterMap[r.event_id].push({ userName: uName, role: rName });
          uniqueUsers.add(uName);
          uniqueRoles.add(rName);
        });
      }
      
      setAvailableUsers(Array.from(uniqueUsers));
      setAvailableRoles(Array.from(uniqueRoles));

      const usageMap: Record<string, { activeEventTitle?: string; pastEventCount: number; participants: {userName: string, role: string}[] }> = {};
      
      if (evts && sls && slSongs) {
        const todayString = new Date().toISOString().split("T")[0];
        const setlistToEvent: Record<string, any> = {};
        
        sls.forEach(sl => {
          const event = evts.find(e => e.id === sl.event_id);
          if (event) setlistToEvent[sl.id] = event;
        });
        
        slSongs.forEach(ss => {
          const songId = ss.song_id;
          const event = setlistToEvent[ss.setlist_id];
          
          if (!usageMap[songId]) usageMap[songId] = { pastEventCount: 0, participants: [] };
          
          if (event) {
            const isFuture = (event.event_date ? event.event_date.split('T')[0] : "2026-06-12") >= todayString;
            if (isFuture) {
              usageMap[songId].activeEventTitle = event.title;
            } else {
              usageMap[songId].pastEventCount += 1;
            }
            // ✅ Append event participants to this song's historical matrix
            if (eventRosterMap[event.id]) {
              usageMap[songId].participants.push(...eventRosterMap[event.id]);
            }
          }
        });
      }
      setSongUsageData(usageMap);
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

  useEffect(() => { loadSongsData(); }, [userTeamId]);

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

  // ✅ FULLY RESTORED: Working YouTube Search Logic (Identical to Deployed Code + Safety Fallback)
  const handleSearchYouTube = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!ytSearchQuery.trim()) return;
    
    setIsSearchingYt(true);
    setIsYtDropdownOpen(true);
    
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(ytSearchQuery)}`);
      const data = await res.json();
      
      console.log("YouTube API Debug Response:", data); // Check your console to see what your local API is outputting
      
      // Safety fallback: if your local API wraps the array in an object, this safely resolves it so .map doesn't silently fail.
      const resolvedArray = Array.isArray(data) ? data : (data?.items || []);
      setYtResults(resolvedArray);
      
    } catch (err) {
      console.error("YouTube search failed", err);
    } finally {
      setIsSearchingYt(false);
    }
  };

  const handleSelectYouTubeVideo = async (videoId: string, title: string) => {
    const generatedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const { data: existingSong } = await supabase
      .from('songs')
      .select('id')
      .ilike('youtube_url', `%${videoId}%`)
      .maybeSingle();

    if (existingSong) {
      alert(`"${title}" is already in the database! Redirecting you now...`);
      router.push(`/songs/${existingSong.id}`);
    } else {
      setYtUrlInput(generatedUrl);
      setYtSearchQuery("");
      setYtResults([]);
      setIsYtDropdownOpen(false);
    }
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
      if (existingSongs && existingSongs.length > 0) {
        alert(`"${existingSongs[0].title}" is already in the database! Redirecting...`);
        router.push(`/songs/${existingSongs[0].id}`);
        return;
      }
      const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(ytUrlInput)}`);
      const metadata = await oembedRes.json();
      if (metadata.error) throw new Error("Could not fetch video metadata.");
      const searchParams = new URLSearchParams({ title: metadata.title || "", artist: metadata.author_name || "", youtube_url: ytUrlInput });
      setIsAddModalOpen(false); setYtUrlInput("");
      router.push(`/songs/new/edit?${searchParams.toString()}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setYtError(message);
    } finally { setYtLoading(false); }
  };

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
    
    setEditingFilter(filterKey);
    setTimeout(() => document.getElementById(`edit-${filterKey}`)?.focus(), 50);
  };

  const renderInteractiveChip = (tokenPrefix: string, filterKey: string, datalistId?: string) => {
    const isActive = activeFilters[filterKey] !== "" || editingFilter === filterKey;
    if (!isActive) return null;
    const isEditing = editingFilter === filterKey;

    return (
      <div 
        key={filterKey} 
        onClick={() => { setEditingFilter(filterKey); setTimeout(() => document.getElementById(`edit-${filterKey}`)?.focus(), 50); }} 
        className={`inline-flex items-center gap-1 bg-surface-container-high border text-on-surface text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm cursor-pointer transition-all ${isEditing ? 'ring-2 ring-primary/50 border-primary scale-105' : 'border-outline-variant/30 hover:border-primary/50'}`}
      >
        <span className="opacity-50 font-mono text-[9px]">{tokenPrefix}</span>
        {isEditing ? (
          <input
            id={`edit-${filterKey}`}
            list={datalistId} // ✅ Added datalist binding
            value={activeFilters[filterKey]}
            onChange={(e) => setActiveFilters(prev => ({ ...prev, [filterKey]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); setEditingFilter(null); setTimeout(() => searchInputRef.current?.focus(), 50); } 
              else if (e.key === 'Backspace' && activeFilters[filterKey] === "") { setEditingFilter(null); setActiveFilters(prev => ({ ...prev, [filterKey]: "" })); setTimeout(() => searchInputRef.current?.focus(), 50); }
            }}
            onBlur={() => setEditingFilter(null)}
            className="bg-transparent outline-none min-w-[15px] max-w-[120px] text-on-surface"
            style={{ width: `${Math.max(1, activeFilters[filterKey].length)}ch` }}
          />
        ) : (
          <span className="max-w-[70px] truncate">{activeFilters[filterKey]}</span>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); setActiveFilters(prev => ({ ...prev, [filterKey]: "" })); setEditingFilter(null); setTimeout(() => searchInputRef.current?.focus(), 50); }} className="text-[10px] ml-0.5 font-bold text-outline hover:text-error">✕</button>
      </div>
    );
  };

  // Filter Engine
  const filteredSongs = allDatabaseSongs.filter(song => {
    const q = songSearchQuery.replace(/:[a-z-]*$/i, "").trim().toLowerCase();
    if (q && !(song.title?.toLowerCase().includes(q) || song.artist?.toLowerCase().includes(q) || song.original_key?.toLowerCase().includes(q))) return false;
    
    if (activeFilters.artist && !song.artist?.toLowerCase().includes(activeFilters.artist.toLowerCase())) return false;
    if (activeFilters.key && !song.original_key?.toLowerCase().includes(activeFilters.key.toLowerCase())) return false;
    if (activeFilters.theme && !song.themes?.toLowerCase().includes(activeFilters.theme.toLowerCase())) return false;
    if (activeFilters.lyrics && !song.chordpro_content?.toLowerCase().includes(activeFilters.lyrics.toLowerCase())) return false;
    if (activeFilters.bpm && String(song.tempo) !== activeFilters.bpm) return false;
    if (activeFilters.bpmRange) {
      const [minStr, maxStr] = activeFilters.bpmRange.split("-");
      const min = Number.parseInt(minStr ?? "0", 10) || 0;
      const max = Number.parseInt(maxStr ?? "999", 10) || 999;
      const songTempo = Number.parseInt(String(song.tempo ?? 0), 10) || 0;
      if (songTempo < min || songTempo > max) return false;
    }

    const type = getSongContentType(song.chordpro_content);
    if (activeFilterId === "chords-lyrics" && type !== "Chords + Lyrics") return false;
    if (activeFilterId === "pending" && song.approval_status !== "pending") return false;
    if (activeFilterId === "bookmarked" && !bookmarkedSongIds.includes(song.id)) return false;
    
    // Fast / Slow Presets
    if (activeFilterId === "fast-praise") {
      const tempo = parseInt(String(song.tempo || 0), 10);
      if (tempo < 110) return false; 
    }
    if (activeFilterId === "slow-worship") {
      const tempo = parseInt(String(song.tempo || 0), 10);
      if (tempo >= 110 || tempo === 0) return false; 
    }

    // YouTube Filters
    if (activeFilterId === "youtube-included" && !song.youtube_url) return false;
    if (activeFilterId === "youtube-sync" && !song.is_youtube_sync_validated) return false;

    // ✅ SURGICAL ADDITION: Relational User/Role Matrix Scan
    if (activeFilters.user || activeFilters.role) {
      const usage = songUsageData[song.id] as any; // By-pass type checking for the new property
      if (!usage || !usage.participants || usage.participants.length === 0) return false;

      const targetUser = activeFilters.user.toLowerCase();
      const targetRole = activeFilters.role.toLowerCase();

      // Ensure the target user and target role co-occurred in the SAME event
      const hasMatch = usage.participants.some((p: any) => {
         const matchUser = targetUser ? p.userName.toLowerCase().includes(targetUser) : true;
         const matchRole = targetRole ? p.role.toLowerCase().includes(targetRole) : true;
         return matchUser && matchRole;
      });

      if (!hasMatch) return false;
    }

    return true;
  });

  if (loading) {
    return <GlobalLoader message="LOADING SONGS LIBRARY..." />;
  }

  return (
  <div className="h-[100dvh] w-full overflow-hidden flex flex-col relative bg-surface font-sans text-on-surface">

    {/* ========================================= */}
    {/* 1. TOP NAV & QUICK FILTERS                */}
    {/* ========================================= */}
    <section className="px-4 pt-safe flex flex-col gap-3 bg-surface z-50 shrink-0 border-b border-outline-variant/30 pb-3">
      
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-3">
          {canEditLibrary && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer border border-primary/20"
            >
              <span className="material-symbols-outlined text-[24px]">add</span>
            </button>
          )}
          <div className="flex flex-col">
            <h1 className="text-[20px] font-extrabold tracking-tight leading-tight">Songs</h1>
            <span className="font-label-sm text-[11px] text-on-surface-variant">{allDatabaseSongs.length} Live Arrangements</span>
          </div>
        </div>
        
        {canApproveSongs && pendingSongsCount > 0 && (
          <button 
            onClick={() => router.push("/songs/approvals")}
            className="flex items-center gap-2.5 px-2 py-2 "
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            <span className="font-bold text-[8px] uppercase tracking-widest text-secondary">{pendingSongsCount} Review</span>
            <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
          </button>
        )}
      </div>

      {/* Search Input Well & Command Interceptor */}
      <div className="relative w-full mt-1 flex flex-col overflow-visible">
        
        {/* ✅ Datalists for native browser autofill */}
        <datalist id="user-suggestions">
          {availableUsers.map(u => <option key={u} value={u} />)}
        </datalist>
        <datalist id="role-suggestions">
          {availableRoles.map(r => <option key={r} value={r} />)}
        </datalist>

        <div className="flex flex-wrap items-center w-full bg-surface-container-low rounded-xl px-4 py-2.5 shadow-inner border border-outline-variant/30 gap-1.5 focus-within:bg-surface-container focus-within:border-secondary transition-all cursor-text" onClick={() => searchInputRef.current?.focus()}>
          <span className="material-symbols-outlined text-outline text-[18px] mr-1">search</span>
          
          {/* Dynamic Typable Command Chips */}
          {renderInteractiveChip(":artist:", "artist")}
          {renderInteractiveChip(":key:", "key")}
          {renderInteractiveChip(":lyrics:", "lyrics")}
          {renderInteractiveChip(":theme:", "theme")}
          {renderInteractiveChip(":bpm:", "bpm")}
          {renderInteractiveChip(":bpm-range:", "bpmRange")}
          {/* ✅ Render the new chips with datalist IDs */}
          {renderInteractiveChip(":user:", "user", "user-suggestions")}
          {renderInteractiveChip(":role:", "role", "role-suggestions")}

          <input 
            ref={searchInputRef}
            type="text" 
            value={songSearchQuery}
            onChange={handleSearchInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveSearchToHistory();
            }}
            className="flex-1 bg-transparent text-[13px] font-semibold text-on-surface placeholder:text-outline focus:outline-none min-w-[140px]" 
            placeholder="Search titles, artists, or type a command... (e.g. :artist:)" 
          />
          {songSearchQuery && (
            <button onClick={() => setSongSearchQuery("")} className="text-outline hover:text-on-surface transition-colors flex items-center cursor-pointer ml-auto">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {shouldShowHintsDropdown && filteredKeywordSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-high border border-outline-variant/50 rounded-2xl shadow-2xl p-2 z-[99999] flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
            {filteredKeywordSuggestions.map((item) => (
              <button
                key={item.token}
                type="button"
                onClick={() => handleSelectKeywordSuggestion(item.token)}
                className="w-full flex items-center justify-between text-left p-2 rounded-xl hover:bg-surface-bright transition-colors cursor-pointer group"
              >
                <span className="text-xs font-mono font-black text-secondary bg-secondary-container/20 border border-secondary/20 px-1.5 py-0.5 rounded-lg">{item.token}</span>
                <span className="text-[10px] font-bold text-on-surface-variant text-right group-hover:text-on-surface">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Filter Scrollable Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mt-1">
        <button 
          onClick={() => { setActiveFilterId("all"); setSongSearchQuery(""); setActiveFilters({ artist: "", key: "", lyrics: "", theme: "", bpm: "", bpmRange: "" }); }}
          className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold shadow-sm transition-all border cursor-pointer ${
            activeFilterId === "all" 
              ? 'bg-primary-container text-on-primary border-primary/30' 
              : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border-transparent'
          }`}
        >
          All Songs ({allDatabaseSongs.length})
        </button>

        {/* ✅ Dynamic Search History Pills */}
        {searchHistory.map((histStr, idx) => (
          <button 
            key={`hist-${idx}`}
            onClick={() => {
              let query = histStr;
              const newFilters = { artist: "", key: "", lyrics: "", theme: "", bpm: "", bpmRange: "", user: "", role: "" };
              // ✅ SURGICAL FIX: Added user and role to the regex capture group
              const regex = /:(artist|key|lyrics|theme|bpm|bpm-range|user|role):\s*([^\s:]+(?:\s+[^\s:]+)*)/gi;
              let match;
              while ((match = regex.exec(histStr)) !== null) {
                const filterKey = match[1].toLowerCase() === "bpm-range" ? "bpmRange" : match[1].toLowerCase();
                newFilters[filterKey as keyof typeof newFilters] = match[2].trim();
                query = query.replace(match[0], "");
              }
              setSongSearchQuery(query.trim());
              setActiveFilters(newFilters);
              setActiveFilterId("all");
            }}
            className="whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold shadow-sm transition-all border border-secondary/30 bg-secondary-container/10 text-secondary hover:bg-secondary-container/30 cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined leading-none" style={{ fontSize: '12px' }}>history</span>
            {histStr}
          </button>
        ))}

        {QUICK_FILTERS.filter(f => f.id !== "all").map(filter => {
          const isActive = activeFilterId === filter.id;
          let displayLabel = filter.label;
          
          if (filter.count) {
            if (filter.id === "pending") displayLabel += ` (${pendingSongsCount})`;
            if (filter.id === "bookmarked") displayLabel += ` (${bookmarkedSongIds.length})`;
          }

          return (
            <button 
              key={filter.id}
              onClick={() => setActiveFilterId(filter.id)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-[10px] font-bold shadow-sm transition-all border cursor-pointer ${
                isActive 
                  ? 'bg-primary-container text-on-primary border-primary/30' 
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border-transparent'
              }`}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>
    </section>

    {/* ========================================= */}
    {/* 2. SCROLLING CARDS                        */}
    {/* ========================================= */}
    <main 
      ref={scrollContainerRef} 
      // ✅ SURGICAL FIX: Listen for scroll. If they hit the bottom 400px, load 24 more cards!
      onScroll={(e) => {
        const target = e.currentTarget;
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 400) {
          if (visibleCount < filteredSongs.length) {
            setVisibleCount(prev => prev + 24);
          }
        }
      }}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-safe-bottom-stage custom-scrollbar w-full"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
        
        {/* ✅ SURGICAL FIX: Only render up to the visibleCount limit */}
        {filteredSongs.slice(0, visibleCount).map(song => {
          const isBookmarked = bookmarkedSongIds.includes(song.id);
          const contentType = getSongContentType(song.chordpro_content);
          const usageInfo = songUsageData[song.id] || { pastEventCount: 0 };
          
          // Extract the 11-character YouTube ID if a link exists
          const ytId = song.youtube_url ? song.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1] : null;

          return (
            <article 
              key={song.id} 
              className="relative overflow-hidden z-0 bg-surface-container-low rounded-2xl p-4 shadow-sm flex flex-col h-full transition-all duration-200 border border-outline-variant/30 hover:border-outline-variant/50"
            >
              {/* YouTube Background Overlay */}
              {ytId && (
                <div 
                  className="absolute inset-0 z-[-1] opacity-[0.25] pointer-events-none bg-cover bg-center mix-blend-luminosity"
                  style={{ backgroundImage: `url('https://img.youtube.com/vi/${ytId}/hqdefault.jpg')` }}
                />
              )}

              {/* Absolute Bookmark Button */}
              <button 
                onClick={(e) => handleToggleBookmark(e, song.id)}
                className={`absolute top-4 right-4 z-10 cursor-pointer transition-transform active:scale-125 ${isBookmarked ? 'text-primary' : 'text-outline hover:text-primary'}`}
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isBookmarked ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
              </button>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-4 pr-8 relative z-10">
                <ContentTypeBadge type={contentType} />

                {song.approval_status === 'pending' && (
                  <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-error/10 text-error text-[8px] font-black uppercase tracking-widest border border-error/20 shadow-sm">
                    <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>schedule</span>
                    <span className="leading-none pt-px">Pending</span>
                  </span>
                )}
                
                {song.youtube_url && song.approval_status !== 'pending' && (
                  <span className="h-5 inline-flex items-center justify-center gap-1 px-2 rounded-full bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest border border-red-500/30 shadow-sm">
                    <svg viewBox="0 0 24 24" className="w-[11px] h-[11px] fill-red-500 shrink-0">
                      <path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.254,4,12,4,12,4S5.746,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.746,2,12,2,12s0,4.254,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.746,20,12,20,12,20s6.254,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.254,22,12,22,12S22,7.746,21.582,6.186z M9.996,15.505V8.495L15.993,12L9.996,15.505z" />
                    </svg>
                    <span className="leading-none pt-px">YouTube</span>
                  </span>
                )}

                {song.themes && song.themes.split(",").length > 0 && (
                   <span className="h-5 inline-flex items-center justify-center px-2 rounded-full bg-surface-container-highest text-on-surface-variant text-[8px] font-black uppercase tracking-widest border border-outline-variant/30 shadow-sm">
                     <span className="leading-none pt-px">{song.themes.split(",")[0].trim()}</span>
                   </span>
                )}
              </div>

              {/* Title & Artist Row */}
              <div className="flex flex-col mb-4 relative z-10 pr-8">
                <h2 className="text-[20px] text-on-surface font-extrabold tracking-tight truncate leading-tight mb-1">{song.title}</h2>
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>mic</span>
                  <span className="text-[13px] font-semibold truncate">{song.artist || "Unknown Artist"}</span>
                </div>
              </div>

              {/* Metrics Row (Key & BPM) */}
              <div className="flex items-center gap-2.5 mb-5 relative z-10">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-primary font-medium text-[11px] shadow-sm">
                  <span className="material-symbols-outlined leading-none" style={{ fontSize: '12px' }}>music_note</span>
                  <span>Key: <span className="text-on-surface ml-0.5">{song.original_key || "G"}</span></span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant font-medium text-[11px] shadow-sm tnum">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="m15.5 19-3-11.5a1.8 1.8 0 0 0-3.5 0L6 19h9.5z"/>
                    <path d="M12.5 11 11 16"/>
                  </svg>
                  <span>{song.tempo || "--"} BPM</span>
                </div>
              </div>

              {/* Dynamic Footer Actions */}
              <div className="mt-auto shrink-0 flex items-center justify-between bg-surface-container/75 backdrop-blur-md -mx-4 -mb-4 px-4 py-3 rounded-b-2xl border-t border-outline-variant/20 relative z-10 gap-2">
                {song.approval_status === 'pending' ? (
                  <>
                    <span className="text-[9px] font-bold text-error uppercase tracking-widest shrink-0 pr-2 truncate">
                      For Review
                    </span>
                    <div className="flex items-center gap-1.5 overflow-hidden justify-end w-full">
                      {canEditLibrary && (
                        <button 
                          onClick={() => router.push(`/songs/${song.id}/edit`)}
                          className="h-7 px-2.5 rounded-md bg-surface-container-highest text-on-surface text-[10px] font-bold hover:bg-surface-bright flex items-center justify-center gap-1 cursor-pointer border border-outline-variant/30 shadow-sm shrink-0 transition-colors active:scale-95"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>edit</span>
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      )}
                      <button 
                        onClick={() => router.push(`/songs/${song.id}`)}
                        className="h-7 px-2.5 rounded-md bg-primary text-on-primary text-[10px] font-bold shadow-sm active:scale-95 transition-colors flex items-center justify-center gap-1 cursor-pointer border border-primary/20 hover:bg-primary/90 shrink-0"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>library_music</span>
                        <span>Open</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] font-bold flex items-center gap-1 shrink-0 pr-2 truncate">
                      {usageInfo.activeEventTitle ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>event_available</span>
                          <span className="text-secondary truncate">In {usageInfo.activeEventTitle}</span>
                        </>
                      ) : usageInfo.pastEventCount > 0 ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>history</span>
                          <span className="text-on-surface-variant">Used in {usageInfo.pastEventCount} event{usageInfo.pastEventCount !== 1 && 's'}</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>library_add</span>
                          <span className="text-on-surface-variant">Newly Added</span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 overflow-hidden justify-end w-full">
                      {canEditLibrary && (
                        <button 
                          onClick={() => router.push(`/songs/${song.id}/edit`)}
                          className="h-7 px-2.5 rounded-md bg-surface-container-highest text-on-surface text-[10px] font-bold active:bg-surface-bright transition-colors cursor-pointer border border-outline-variant/30 shadow-sm flex items-center justify-center gap-1 shrink-0"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>edit</span>
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                      )}
                      <button 
                        onClick={() => router.push(`/songs/${song.id}`)}
                        className="h-7 px-2.5 rounded-md bg-primary text-on-primary text-[10px] font-bold shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-1 cursor-pointer border border-primary/20 hover:bg-primary/90 shrink-0"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>library_music</span>
                        <span>Open</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </article>
          );
        })}

        {filteredSongs.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[28px]">music_off</span>
            </div>
            <h3 className="text-[15px] text-on-surface font-bold">No songs matching criteria</h3>
            <p className="text-[11px] text-on-surface-variant max-w-xs">
              Try checking typos or use the "+ Add Song" button to bring in chords via YouTube link.
            </p>
            <button 
              onClick={() => { setSongSearchQuery(""); setActiveFilterId("all"); setActiveFilters({ artist: "", key: "", lyrics: "", theme: "", bpm: "", bpmRange: "" })}}
              className="mt-2 px-4 py-1.5 rounded-full bg-primary-container text-on-primary text-[10px] font-bold cursor-pointer shadow-sm active:scale-95 transition-transform border border-primary/20"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </main>

    {/* ========================================= */}
    {/* 3. ADD NEW SONG MODAL                     */}
    {/* ========================================= */}
    {isAddModalOpen && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4">
        <div className="absolute inset-0" onClick={() => setIsAddModalOpen(false)} />
        
        <div className="bg-surface-container-low border border-outline-variant/30 w-full max-w-lg rounded-[2rem] shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200 p-6">
          
          <button 
            type="button" 
            onClick={() => setIsAddModalOpen(false)} 
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface text-sm font-bold flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30"
          >
            ✕
          </button>

          <div className="mb-6">
            <h3 className="text-xl font-black text-on-surface tracking-tight flex items-center gap-2">
              <span className="text-primary material-symbols-outlined">queue_music</span> Add New Song
            </h3>
            <p className="text-xs font-semibold text-on-surface-variant mt-1">
              Auto-transcribe YouTube link or start blank sheet
            </p>
          </div>

          <form onSubmit={handleProcessYoutubeLink} className="space-y-4">
            
            <div className="space-y-3 p-4 bg-surface-container border border-outline-variant/30 rounded-2xl relative z-50 shadow-inner">
              <label className="text-[11px] font-black uppercase tracking-wider text-secondary block flex justify-between">
                <span>1. Search YouTube</span>
                <span className="text-on-surface-variant">OR PASTE LINK BELOW</span>
              </label>

              {/* SEARCH ROW */}
              <div className="flex gap-2 relative mb-3">
                <input
                  type="text"
                  value={ytSearchQuery}
                  onChange={(e) => setYtSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchYouTube(e); } }}
                  placeholder="e.g., 'Oceans Hillsong Live'..."
                  className="flex-1 w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-xs font-semibold text-on-surface outline-none focus:border-secondary shadow-inner transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSearchYouTube}
                  disabled={isSearchingYt || !ytSearchQuery.trim()}
                  className="bg-surface-container-high hover:bg-surface-bright disabled:opacity-50 text-on-surface px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm transition-colors shrink-0 border border-outline-variant/30 cursor-pointer"
                >
                  {isSearchingYt ? "..." : "Search"}
                </button>

                {/* ✅ FULLY RESTORED ORIGINAL DROPDOWN CODE */}
                {isYtDropdownOpen && ytResults && ytResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-high border border-outline-variant/50 rounded-2xl shadow-2xl overflow-hidden divide-y divide-outline-variant/20 max-h-64 overflow-y-auto custom-scrollbar z-[99999]">
                    {ytResults.map((video: any) => {
                      const videoId = video.id?.videoId || video.id || video.videoId;
                      const title = video.snippet?.title || video.title || "Unknown Title";
                      const thumbnail = video.snippet?.thumbnails?.default?.url || video.thumbnail;
                      const channelTitle = video.snippet?.channelTitle || video.channelTitle || "";

                      if (!videoId) return null;

                      return (
                        <button
                          key={videoId}
                          type="button"
                          onClick={() => handleSelectYouTubeVideo(videoId, title)}
                          className="w-full flex gap-3 p-3 hover:bg-surface-bright transition-colors text-left group cursor-pointer"
                        >
                          {thumbnail && (
                            <img
                              src={thumbnail}
                              alt="thumbnail"
                              className="w-20 h-14 object-cover rounded-lg bg-surface-container-lowest shrink-0 border border-outline-variant/30"
                            />
                          )}
                          <div className="flex flex-col justify-center overflow-hidden">
                            <span className="text-xs font-bold text-on-surface leading-tight line-clamp-2 group-hover:text-secondary transition-colors" dangerouslySetInnerHTML={{ __html: title }} />
                            <span className="text-[9px] font-bold text-on-surface-variant mt-1 uppercase tracking-wider truncate">
                              {channelTitle}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="text-[11px] font-black uppercase tracking-wider text-secondary block mt-2">
                2. Selected Link
              </label>

              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={ytUrlInput}
                  onChange={(e) => setYtUrlInput(e.target.value)}
                  disabled={ytLoading}
                  className="flex-1 w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-xs font-semibold text-on-surface outline-none focus:border-secondary shadow-inner disabled:opacity-50 transition-colors"
                />
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  disabled={ytLoading}
                  title="Paste from clipboard"
                  className="bg-surface-container-high border border-outline-variant/30 hover:bg-surface-bright text-on-surface px-4 py-3 rounded-xl flex items-center justify-center shadow-sm transition-colors disabled:opacity-50 shrink-0 cursor-pointer active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">content_paste</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={!ytUrlInput.trim() || ytLoading}
                className="w-full mt-2 bg-primary hover:bg-primary/90 disabled:bg-surface-container-highest disabled:text-on-surface-variant text-on-primary px-4 py-3.5 rounded-xl text-[12px] font-black uppercase tracking-widest shadow-md transition-colors active:scale-[0.98] cursor-pointer border border-primary/20 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">{ytLoading ? "hourglass_empty" : "auto_awesome"}</span>
                {ytLoading ? "SCANNING LINK..." : "CREATE FROM LINK"}
              </button>

            </div>

            <div className="flex items-center gap-4 my-2 text-outline-variant">
              <div className="flex-1 h-[1px] bg-outline-variant/30" />
              <span className="text-[10px] font-black uppercase tracking-widest">OR</span>
              <div className="flex-1 h-[1px] bg-outline-variant/30" />
            </div>

            <button 
              type="button" 
              onClick={() => {
                setIsAddModalOpen(false);
                router.push("/songs/new/edit");
              }}
              className="w-full py-4 bg-surface-container-high border border-outline-variant/30 hover:bg-surface-bright hover:border-outline-variant/50 rounded-2xl text-on-surface text-[14px] font-bold shadow-sm transition-all flex items-center justify-between px-6 cursor-pointer active:scale-[0.99]"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-extrabold tracking-tight">Manual Entry</span>
                <span className="text-[10px] font-semibold text-on-surface-variant">Start from a blank chord template</span>
              </div>
              <span className="material-symbols-outlined text-primary text-[24px]">edit_note</span>
            </button>

          </form>
        </div>
      </div>
    )}

  </div>
);
}