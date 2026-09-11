"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom"; // ✅ Added for Sidebar portaling
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import GlobalLoader from '../../components/GlobalLoader';

// Helper to extract YouTube ID
function extractYouTubeID(url: string) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Time formatter for media player
function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface EventItem {
  id: string;
  title: string;
  event_date: string;
  description: string;
  service_type?: string;
}

interface TeamMemberAllocation {
  id: string;
  event_id: string;
  user_id: string;
  role: string;
}

const GLOBAL_GREETINGS_DICTIONARY = [
  "Mabuhay", "Kamusta", "Magandang Araw", "Magandang Umaga", "Magandang Hapon", "Magandang Gabi", 
  "Tuloy po kayo", "Pasok!", "Musta?", "Ano'ng ganap?", "Balita?", "Uy, kamusta?", "Tara!", "G!", 
  "Rak na!", "Kumusta buhay?", "Ano na?", "Larga!", "O, nandito ka na", "Kamusta ang lahat?",
  "Hello", "Hi there", "Welcome back", "Good to see you", "Greetings", "What's up?", 
  "How's it going?", "What's good?", "Look who it is!", "Hey there", "Top of the morning", 
  "Greetings and salutations", "What's the good word?", "Ahoy!", "What's happening?", 
  "How's life treating you?", "Ready to rock?", "Let's get to work", "Welcome aboard", 
  "Great to have you here", "How's everything?", "What's new?", "Nice to see you", 
  "Rise and shine!", "Let's do this", "Hello, world!", "Howdy", "Hope you're doing well", 
  "Let's make it happen", "Glad you're here"
];

const FALLBACK_VERSES = [
  { text: "I can do all things through Christ who strengthens me.", reference: "Philippians 4:13" },
  { text: "For God has not given us a spirit of fear, but of power and of love and of a sound mind.", reference: "2 Timothy 1:7" },
  { text: "Trust in the Lord with all your heart, and lean not on your own understanding.", reference: "Proverbs 3:5" },
  { text: "The Lord is my light and my salvation; whom shall I fear?", reference: "Psalm 27:1" },
  { text: "But seek first the kingdom of God and His righteousness, and all these things shall be added to you.", reference: "Matthew 6:33" }
];

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  
  const { simulatedRole, simulatedUserId, userTeamId } = useEngine();

  const [loading, setLoading] = useState(true);
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [allocationsList, setAllocationsList] = useState<TeamMemberAllocation[]>([]);
  
  // User & Workspace States
  const [userName, setUserName] = useState("Worshipper");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Your Team");
  
  const [currentGreeting, setCurrentGreeting] = useState("Shalom");
  const [dailyVerse, setDailyVerse] = useState({ text: "Loading daily word...", reference: "" });
  
  const [allSongs, setAllSongs] = useState<any[]>([]);
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState("");

  // Setlist Active States 
  const [assignedSetlists, setAssignedSetlists] = useState<Record<string, { id: string, title: string, songs: any[] }[]>>({});
  const [expandedSetlistSong, setExpandedSetlistSong] = useState<Record<string, string>>({}); 
  const [isSetlistAccordionOpen, setIsSetlistAccordionOpen] = useState<Record<string, boolean>>({});

  // Media Player State
  const [liveSearchQuery, setLiveSearchQuery] = useState("");
  const [activePracticeSong, setActivePracticeSong] = useState<any>(null);
  
  // ✅ SURGICAL ADDITION: Portal Mounting Engine
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Headless YouTube Engine State
  const ytPlayerRef = useRef<any>(null);
  const isYtPlayerReadyRef = useRef<boolean>(false);
  const autoplayNextVideoRef = useRef<boolean>(false); // ✅ Added for intent-based autoplay
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const ytTimeTrackerRef = useRef<number | null>(null);

  // ✅ SURGICAL ADDITION: Tell the Sidebar to slide down to 68px when playing!
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: ytPlaying }));
    }
  }, [ytPlaying]);

  async function loadDashboardMetrics() {
    try {
      const { data: authData } = await supabase.auth.getUser();

      let activeProfileData: any = null;

      if (authData?.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name, team_id, avatar_url").eq("id", authData.user.id).maybeSingle();
        if (!profile || !profile.full_name) { router.push("/onboarding"); return; }
        activeProfileData = profile;
      }

      const targetTeamIdToFetch = userTeamId || activeProfileData?.team_id;
      if (targetTeamIdToFetch) {
        const { data: teamData } = await supabase.from("teams").select("name").eq("id", targetTeamIdToFetch).maybeSingle();
        if (teamData?.name) setTeamName(teamData.name);
      }

      const dayOfYearHash = Math.floor(Date.now() / 86400000);
      setCurrentGreeting(GLOBAL_GREETINGS_DICTIONARY[dayOfYearHash % GLOBAL_GREETINGS_DICTIONARY.length]);

      const now = new Date();
      const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // ✅ SMART DAILY VERSE ENGINE: Check DB -> If missing, fetch from API -> Save to DB for everyone else
      const { data: inspirationData } = await supabase.from("daily_inspiration").select("verse_text, verse_reference").eq("target_date", todayString).maybeSingle();

      if (inspirationData) {
        setDailyVerse({ text: inspirationData.verse_text, reference: inspirationData.verse_reference });
      } else {
        try {
          // Fetch a fresh verse from the public Bible API
          const res = await fetch("https://labs.bible.org/api/?passage=random&type=json");
          if (res.ok) {
            const apiData = await res.json();
            const verseObj = apiData[0];
            const cleanText = verseObj.text.replace(/<[^>]+>/g, '').trim(); // Strip any bold HTML tags
            const verseRef = `${verseObj.bookname} ${verseObj.chapter}:${verseObj.verse}`;
            
            setDailyVerse({ text: cleanText, reference: verseRef });
            // Cache it in Supabase so it becomes the definitive daily verse for all users today
            await supabase.from("daily_inspiration").insert([{ target_date: todayString, verse_text: cleanText, verse_reference: verseRef }]);
          } else {
            throw new Error("Bible API Unresponsive");
          }
        } catch (err) {
          console.error("Bible API failed, using fallback:", err);
          const selectedFallback = FALLBACK_VERSES[dayOfYearHash % FALLBACK_VERSES.length];
          setDailyVerse(selectedFallback);
          await supabase.from("daily_inspiration").insert([{ target_date: todayString, verse_text: selectedFallback.text, verse_reference: selectedFallback.reference }]);
        }
      }

      let fetchedEvents: EventItem[] = [];
      if (userTeamId) {
        const { data: eventsData } = await supabase.from("events").select("*").eq("team_id", userTeamId);
        if (eventsData) {
          setEventsList(eventsData);
          fetchedEvents = eventsData;
        }
      } else { setEventsList([]); }

      let fetchedRoster: TeamMemberAllocation[] = [];
      const { data: rosterData } = await supabase.from("event_rosters").select("*");
      if (rosterData) {
        setAllocationsList(rosterData);
        fetchedRoster = rosterData;
      }

      const userAssignedActive = fetchedEvents
        .filter(e => (e.event_date ? e.event_date.split("T")[0] : "2026-06-12") >= todayString)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .filter(evt => fetchedRoster.some(m => m.event_id === evt.id && m.user_id === simulatedUserId))
        .slice(0, 3);

      if (userAssignedActive.length > 0) {
        const eventIds = userAssignedActive.map(e => e.id);
        const { data: setlists } = await supabase.from("setlists").select("*").in("event_id", eventIds);
        
        if (setlists && setlists.length > 0) {
          const setlistIds = setlists.map(s => s.id);
          const { data: setlistSongs, error } = await supabase
            .from("setlist_songs")
            // ✅ SURGICAL FIX: Removed "link" to prevent the Supabase column error!
            .select("id, setlist_id, sequence_order, song:songs(id, title, artist, original_key, tempo, youtube_url)")
            .in("setlist_id", setlistIds)
            .order("sequence_order", { ascending: true });
            
          if (error) console.error("Error fetching setlist songs:", error);
          
          const newAssignedSetlists: Record<string, { id: string, title: string, songs: any[] }[]> = {};
          const newExpandedState: Record<string, string> = {};
          const initialAccordionState: Record<string, boolean> = {};

          userAssignedActive.forEach((evt, idx) => {
            const evtSetlists = setlists.filter(s => s.event_id === evt.id);
            
            const mappedSls = evtSetlists.map((sl, slIdx) => {
              const songsForSl = (setlistSongs || []).filter(ss => ss.setlist_id === sl.id);
              if (songsForSl.length > 0) newExpandedState[sl.id] = songsForSl[0].id; 

              return {
                id: sl.id,
                title: sl.title || sl.name || `Setlist ${String(slIdx + 1).padStart(2, '0')}`,
                songs: songsForSl
              };
            });

            newAssignedSetlists[evt.id] = mappedSls;
            initialAccordionState[evt.id] = idx === 0;
          });
          
          setAssignedSetlists(newAssignedSetlists);
          setExpandedSetlistSong(newExpandedState);
          setIsSetlistAccordionOpen(initialAccordionState);
        }
      }

      let userBookmarks: string[] = [];
      if (simulatedUserId && simulatedUserId !== "00000000-0000-0000-0000-000000000000") {
        const { data: profileData } = await supabase.from("profiles").select("full_name, bookmarked_songs, avatar_url").eq("id", simulatedUserId).maybeSingle();
        setUserName(profileData?.full_name ? profileData.full_name.split(" ")[0] : "Worshipper");
        userBookmarks = profileData?.bookmarked_songs || [];
        setBookmarkedSongIds(userBookmarks);
        if (profileData?.avatar_url) setUserAvatar(profileData.avatar_url);
      } else if (activeProfileData) {
        setUserName(activeProfileData.full_name.split(" ")[0]);
        if (activeProfileData.avatar_url) setUserAvatar(activeProfileData.avatar_url);
      }

      const { data: songsData } = await supabase.from("songs").select("*");
      const fetchedSongs = songsData || [];
      setAllSongs(fetchedSongs);

      if (userBookmarks.length > 0 && fetchedSongs.length > 0) {
        const firstBookmark = fetchedSongs.find(s => s.id === userBookmarks[0]);
        if (firstBookmark) setActivePracticeSong(firstBookmark);
      }

    } catch (err) {
      console.error("Dashboard metrics pipeline fault:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboardMetrics(); }, [simulatedUserId, simulatedRole, userTeamId]); 

  // ============================================================================
  // YouTube Headless iframe Mount Engine
  // ============================================================================
  const activeYoutubeId = activePracticeSong ? extractYouTubeID(activePracticeSong.youtube_url || activePracticeSong.link || "") : null;

  useEffect(() => {
    if (!activeYoutubeId) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try { ytPlayerRef.current.destroy(); } catch(e) {}
        ytPlayerRef.current = null;
        isYtPlayerReadyRef.current = false;
      }
      return;
    }

    const initPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) {
        setTimeout(initPlayer, 200); 
        return;
      }

      const container = document.getElementById('dashboard-headless-yt');
      if (!container) {
          setTimeout(initPlayer, 200); 
          return;
      }
      
      ytPlayerRef.current = new (window as any).YT.Player('dashboard-headless-yt', {
        height: '360', 
        width: '640', 
        videoId: activeYoutubeId,
        playerVars: { 
            'playsinline': 1, 
            'controls': 0, 
            'disablekb': 1,
            'origin': typeof window !== 'undefined' ? window.location.origin : '*' 
        }, 
        events: {
          'onReady': (event: any) => {
            isYtPlayerReadyRef.current = true; 
            try { setYtDuration(event.target.getDuration() || 0); } catch(e){}
            
            // ✅ SURGICAL FIX: Consume the autoplay intent if the user specifically clicked a "Play" button
            if (autoplayNextVideoRef.current) {
              event.target.playVideo();
              autoplayNextVideoRef.current = false; // Reset it
            }
          },
          'onStateChange': (event: any) => {
            if (event.data === 1 || event.data === 3) { 
              setYtPlaying(true);
              try { setYtDuration(event.target.getDuration() || 0); } catch(e){}
            } else if (event.data === 2 || event.data === 0) { 
              setYtPlaying(false);
            }
          },
          'onError': (error: any) => console.error("YT Dashboard Error:", error.data)
        }
      });
    };

    if (!(window as any).YT) {
      const tag = document.createElement('script'); 
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
    
    initPlayer();
    
    return () => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try { ytPlayerRef.current.destroy(); } catch(e) {}
        ytPlayerRef.current = null;
        isYtPlayerReadyRef.current = false;
      }
    };
  }, [activeYoutubeId]);

  const handleTogglePlay = () => {
    if (!activePracticeSong || !ytPlayerRef.current || typeof ytPlayerRef.current.playVideo !== 'function') return;
    if (ytPlaying) ytPlayerRef.current.pauseVideo();
    else ytPlayerRef.current.playVideo();
  };

  useEffect(() => {
    const updateScrubber = () => {
      if (ytPlaying && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        setYtCurrentTime(ytPlayerRef.current.getCurrentTime());
      }
      ytTimeTrackerRef.current = requestAnimationFrame(updateScrubber);
    };
    if (ytPlaying) ytTimeTrackerRef.current = requestAnimationFrame(updateScrubber);
    return () => { if (ytTimeTrackerRef.current) cancelAnimationFrame(ytTimeTrackerRef.current); };
  }, [ytPlaying]);

  const todayStr = new Date().toISOString().split("T")[0];
  const futureActiveEvents = eventsList.filter(e => (e.event_date ? e.event_date.split("T")[0] : "2026-06-12") >= todayStr).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const upcomingEventsSectionData = futureActiveEvents.slice(0, 5);
  const userAssignedActivePlans = futureActiveEvents.filter(evt => allocationsList.some(member => member.event_id === evt.id && member.user_id === simulatedUserId)).slice(0, 3);

  // ✅ SURGICAL ADDITION: Calculate Total Participated Events for the new metrics bar
  const totalParticipatedEvents = eventsList.filter(evt => allocationsList.some(member => member.event_id === evt.id && member.user_id === simulatedUserId)).length;

  const filteredBookmarkedSongs = allSongs.filter(song =>
    bookmarkedSongIds.includes(song.id) && 
    (song.title?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()) || 
     song.artist?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()))
  );

  const liveSearchResults = liveSearchQuery.trim() === "" ? [] : allSongs.filter(s => s.title?.toLowerCase().includes(liveSearchQuery.toLowerCase()) || s.artist?.toLowerCase().includes(liveSearchQuery.toLowerCase())).slice(0, 5);

  const activeBpm = activePracticeSong?.tempo ? activePracticeSong.tempo : "--";
  const seekPercentage = ytDuration > 0 ? (ytCurrentTime / ytDuration) * 100 : 0;

  if (loading) return <GlobalLoader message="LOADING DASHBOARD..." />;

  return (
    <div className="bg-surface text-on-surface font-body-lead text-body-lead flex flex-col h-full w-full overflow-hidden">
      
      {/* FIXED TOP HEADER */}
      <header className="shrink-0 w-full z-50 bg-surface/85 backdrop-blur-xl border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img alt="OnPraise Logo Mark" className="h-8 w-auto object-contain" src="/assets/logo.svg" />
            <div className="flex flex-col">
              <span className="font-headline-title-mobile text-[16px] text-on-surface tracking-tight leading-tight font-extrabold">OnPraise</span>
              <span className="font-label-sm text-[11px] text-on-surface-variant leading-tight">Home</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('onpraise-open-account'))}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors cursor-pointer shadow-md overflow-hidden border border-primary/50"
            >
              {userAvatar ? (
                <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* SINGLE ISOLATED SCROLL CANVAS */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative w-full bg-surface custom-scrollbar">
        <div className="flex flex-col w-full gap-4 max-w-4xl mx-auto pb-[140px]">
          
          {/* ========================================= */}
          {/* SECTION 1: GREETINGS & METRICS HERO CARD  */}
          {/* ========================================= */}
          <div className="rounded-3xl bg-surface-container-lowest p-5 md:p-6 border border-outline-variant/20 shadow-xl flex flex-col relative overflow-hidden mt-2">
            {/* Subtle background glow */}
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Header Row */}
            <div className="flex justify-between items-start relative z-10">
              <div className="flex flex-col">
                <h1 className="text-[28px] md:text-[32px] font-black text-on-surface tracking-tight leading-[1.1] mb-2">
                  {currentGreeting},<br/>{userName}! 
                </h1>
              </div>
            </div>

            {/* Daily Verse Card */}
            <div className="mt-6 rounded-2xl bg-surface-container p-4 md:p-5 border border-outline-variant/20 shadow-sm relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shadow-inner">
                    <span className="font-serif text-[24px] font-black leading-none mt-2.5">"</span>
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white">Daily Verse</span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-surface-container-highest text-[9px] font-black uppercase tracking-widest text-on-surface-variant shadow-inner">
                  Inspiration
                </span>
              </div>
              
              <p className="text-[15px] font-bold italic text-white leading-snug tracking-tight mb-5">
                "{dailyVerse.text}"
              </p>
              
              <div className="pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-cyan-400">
                  {dailyVerse.reference}
                </span>
                <span className="text-[10px] font-bold text-on-surface-variant">
                  NET Translation
                </span>
              </div>
            </div>

            {/* Metrics Bar */}
            <div className="mt-3 rounded-xl bg-surface-container border border-outline-variant/20 flex items-stretch overflow-hidden shadow-sm relative z-10 divide-x divide-outline-variant/10">
              <button 
                onClick={() => { setBookmarkSearchQuery(""); setIsBookmarksModalOpen(true); }}
                className="flex-1 py-3 px-2 flex flex-col items-center justify-center hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-cyan-400 mb-0.5">Saved</span>
                <span className="text-[12px] font-bold text-white tracking-tight">{bookmarkedSongIds.length} Bookmarked</span>
              </button>
              
              <div className="flex-1 py-3 px-2 flex flex-col items-center justify-center">
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-400 mb-0.5">Active</span>
                <span className="text-[12px] font-bold text-white tracking-tight">{userAssignedActivePlans.length} Live Event{userAssignedActivePlans.length !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="flex-1 py-3 px-2 flex flex-col items-center justify-center">
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-blue-500 mb-0.5">Total</span>
                <span className="text-[12px] font-bold text-white tracking-tight">{totalParticipatedEvents} Events</span>
              </div>
            </div>
          </div>

          {/* ========================================= */}
          {/* SECTION 2: SEARCH & MEDIA PLAYER          */}
          <div className="rounded-2xl bg-surface-container-lowest md:p-5 border border-outline-variant/40 shadow-sm flex flex-col gap-3">
             {/* ... [Keep existing Section 3 Search & Media Player content] ... */}
             

            {/* MEDIA PLAYER (Portaled on Mobile) */}
            {mounted && activePracticeSong && (() => {
              const PlayerContent = (
                <div className={`relative overflow-hidden shadow-sm border border-outline-variant/20 transition-all ${isMobile ? "w-full h-[64px] bg-[#18181A] rounded-t-2xl px-4 flex items-center justify-between cursor-pointer border-t" : "rounded-xl bg-surface-container-low p-4 mt-1"}`}>
                  
                  {!isMobile && <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-primary-container/10 blur-2xl pointer-events-none"></div>}
                  
                  {/* MOBILE COLLAPSED LAYOUT */}
                  {isMobile ? (
                    <>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-md bg-surface-container flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                          {activeYoutubeId ? (
                            <img src={`https://img.youtube.com/vi/${activeYoutubeId}/mqdefault.jpg`} className={`w-full h-full object-cover transition-opacity ${ytPlaying ? 'opacity-80' : 'opacity-100'}`} alt="Thumbnail" />
                          ) : (
                            <span className="material-symbols-outlined text-[20px] text-outline">music_off</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 pr-2 pb-0.5">
                          <h2 className="font-extrabold text-[14px] text-white truncate tracking-tight leading-tight">
                            {activePracticeSong?.title || "Select a Song"}
                          </h2>
                          <span className="text-[11px] font-semibold text-zinc-400 truncate mt-0.5">
                            {activePracticeSong?.artist || "Unknown"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation(); 
                            if (!ytPlayerRef.current || typeof ytPlayerRef.current.playVideo !== 'function') return;
                            if (ytPlaying) ytPlayerRef.current.pauseVideo();
                            else ytPlayerRef.current.playVideo();
                          }}
                          disabled={!activeYoutubeId}
                          className="w-10 h-10 flex items-center justify-center shrink-0 transition-transform active:scale-90 disabled:opacity-50"
                        >
                          {ytPlaying ? (
                            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white ml-1"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    /* DESKTOP INLINE LAYOUT */
                    <>
                      <div className="flex items-center gap-3.5 relative z-10">
                        <div className="w-[80px] h-[56px] bg-surface-container-highest rounded-lg overflow-hidden shrink-0 relative shadow-inner border border-outline-variant/30 flex items-center justify-center">
                          {activeYoutubeId ? (
                            <img src={`https://img.youtube.com/vi/${activeYoutubeId}/mqdefault.jpg`} className={`w-full h-full object-cover transition-opacity ${ytPlaying ? 'opacity-80' : 'opacity-100'}`} alt="Thumbnail" />
                          ) : (
                            <span className="material-symbols-outlined text-[20px] text-outline">music_off</span>
                          )}
                          {ytPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <span className="w-1.5 h-3 bg-secondary mx-0.5 animate-pulse rounded-full"></span>
                              <span className="w-1.5 h-5 bg-secondary mx-0.5 animate-pulse rounded-full delay-75"></span>
                              <span className="w-1.5 h-3 bg-secondary mx-0.5 animate-pulse rounded-full delay-150"></span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col flex-1 min-w-0 justify-center">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full bg-secondary ${ytPlaying ? 'animate-ping' : ''}`}></span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-secondary">
                              {ytPlaying ? "Playing Track..." : "Ready to Play"}
                            </span>
                          </div>
                          <span className="font-headline-title-mobile text-[15px] leading-tight text-on-surface truncate font-bold">
                            {activePracticeSong ? activePracticeSong.title : "Select a Song"}
                          </span>
                          <span className="font-label-sm text-[10px] text-on-surface-variant truncate mt-0.5">
                            {activePracticeSong ? (activePracticeSong.artist || "Unknown Artist") : "Search above to load"}
                          </span>
                        </div>

                        <div className="flex flex-col items-end shrink-0 gap-1 border-l border-outline-variant/30 pl-3">
                          <div className="flex items-baseline gap-1">
                            <span className="font-display-hero-mobile text-[20px] text-on-surface tracking-tighter tnum">
                              {activeBpm}
                            </span>
                            <span className="font-section-heading text-[10px] text-on-surface-variant font-bold">BPM</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-surface-container-highest border border-outline-variant/30 text-secondary font-label-sm text-[9px]">
                            {activePracticeSong?.time_signature || '4/4'}
                          </span>
                        </div>
                      </div>

                      {/* Seek Slider WITH TIMESTAMP */}
                      <div className="w-full mt-4 mb-3 relative z-10">
                        <div className="text-[10px] font-mono font-bold text-on-surface-variant mb-1.5 ml-1 select-none tracking-widest">
                          {formatTime(ytCurrentTime)} / {formatTime(ytDuration)}
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max={ytDuration || 100}
                          step="0.1"
                          value={ytCurrentTime}
                          onChange={(e) => {
                            const targetTime = Number(e.target.value);
                            setYtCurrentTime(targetTime);
                            if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
                              ytPlayerRef.current.seekTo(targetTime, true);
                            }
                          }}
                          className="w-full h-[6px] rounded-full appearance-none outline-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #38BDF8 ${seekPercentage}%, #333336 ${seekPercentage}%)`,
                            WebkitAppearance: 'none'
                          }}
                        />
                      </div>

                      {/* Play & Lyrics Buttons */}
                      <div className="grid grid-cols-2 gap-3 relative z-10">
                        <button 
                          onClick={handleTogglePlay}
                          disabled={!activeYoutubeId}
                          className={`flex items-center justify-center gap-2 py-2 rounded-xl font-headline-title-mobile text-[13px] shadow-[0_4px_20px_rgba(37,99,235,0.4)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${ytPlaying ? 'bg-secondary-container text-on-secondary-container border border-secondary/20' : 'bg-primary border border-primary/20 text-on-primary'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {ytPlaying ? 'stop' : 'play_arrow'}
                          </span>
                          <span>{ytPlaying ? 'STOP' : 'PLAY'}</span>
                        </button>

                        <button 
                          onClick={() => activePracticeSong && router.push(`/songs/${activePracticeSong.id}`)}
                          disabled={!activePracticeSong}
                          className="flex items-center justify-center gap-2 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-title-mobile text-[13px] active:scale-95 transition-all border border-outline-variant/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px] text-secondary">lyrics</span>
                          <span>Check Lyrics</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );

              if (isMobile) {
                const portalSlot = document.getElementById("media-player-portal-slot");
                return portalSlot ? createPortal(PlayerContent, portalSlot) : null;
              }
              return PlayerContent;
            })()}
          </div>

          {/* SECTION 4: MY ACTIVE PLANS */}
          <div className="rounded-2xl bg-surface-container-lowest p-4 md:p-5 border border-outline-variant/40 shadow-sm flex flex-col gap-4">
             {/* ... [Keep existing Section 4 My Active Plans content] ... */}
             <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-section-heading text-[16px] text-on-surface font-extrabold">My Active Plans</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-secondary font-label-sm text-[10px] font-bold shadow-inner">{userAssignedActivePlans.length} Assigned</span>
              </div>
              
            </div>

            {/* Search Input */}
            <div className="relative z-20">
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
                <input 
                  value={liveSearchQuery}
                  onChange={(e) => setLiveSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-low rounded-xl pl-10 pr-4 py-2.5 text-[13px] font-semibold text-on-surface placeholder:text-outline border border-outline-variant/30 focus:outline-none focus:border-secondary transition-colors" 
                  placeholder="Search titles, artists, or chord charts..." 
                  type="text"
                />
              </div>

              {/* Autocomplete Dropdown */}
              {liveSearchQuery.trim() !== "" && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-high border border-outline-variant/50 rounded-xl shadow-2xl overflow-hidden z-50">
                  {liveSearchResults.length > 0 ? liveSearchResults.map((song: any) => (
                    <button
                      key={song.id}
                      onClick={() => {
                        setActivePracticeSong(song);
                        setLiveSearchQuery("");
                        setYtPlaying(false);
                        autoplayNextVideoRef.current = true; // Search clicks do NOT autoplay
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-surface-bright flex items-center justify-between border-b border-outline-variant/10 last:border-0 cursor-pointer"
                    >
                      <div>
                        <div className="text-sm font-bold text-on-surface">{song.title}</div>
                        <div className="text-xs text-on-surface-variant">{song.artist || "Unknown Artist"}</div>
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-secondary bg-secondary-container/20 border border-secondary/20 px-2 py-1 rounded">
                        {song.tempo ? `${song.tempo} BPM` : '-- BPM'}
                      </div>
                    </button>
                  )) : (
                    <div className="px-4 py-4 text-sm text-on-surface-variant italic text-center">No songs found in database.</div>
                  )}
                </div>
              )}
            </div>
            
            {userAssignedActivePlans.length > 0 ? userAssignedActivePlans.map((evt) => {
              const rawSetlistData = assignedSetlists[evt.id];
              const evtSetlists = Array.isArray(rawSetlistData) ? rawSetlistData : (rawSetlistData && typeof rawSetlistData === 'object' && 'songs' in rawSetlistData ? [rawSetlistData as any] : []);
              const isAccordionOpen = isSetlistAccordionOpen[evt.id];
              const totalSongsCount = evtSetlists.reduce((sum, sl) => sum + (sl.songs?.length || 0), 0);

              return (
                <div key={evt.id} className="flex flex-col bg-surface-container-low border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm">
                  
                  <div 
                    onClick={() => setIsSetlistAccordionOpen(prev => ({...prev, [evt.id]: !prev[evt.id]}))}
                    className={`flex items-center justify-between p-3.5 hover:bg-surface-container transition-colors cursor-pointer select-none ${isAccordionOpen ? 'border-b border-outline-variant/20 bg-surface-container' : 'bg-surface-container-low'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface-variant text-[16px]">calendar_month</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-section-heading text-[14px] text-on-surface font-extrabold truncate">{evt.title}</span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant">{totalSongsCount} Songs Total</span>
                      </div>
                    </div>
                    <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-200 ${isAccordionOpen ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </div>

                  {isAccordionOpen && (
                    <div className="flex flex-col gap-6 p-3 pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      {evtSetlists.map((sl) => {
                        const activeExpandedId = expandedSetlistSong[sl.id];

                        return (
                          <div key={sl.id} className="flex flex-col gap-3 pl-1 border-l-2 border-outline-variant/30 ml-1">
                            
                            <div className="flex items-center justify-between mb-1 pr-1 pl-2">
                              <div className="flex items-center gap-2.5">
                                <span className="w-1 h-3 bg-secondary rounded-full"></span>
                                <span className="text-[11px] font-black text-on-surface uppercase tracking-wider">{sl.title}</span>
                              </div>
                              <button 
                                onClick={() => router.push(`/setlists/${sl.id}/live`)}
                                className="px-2.5 py-1.5 rounded-lg bg-primary-container/20 text-primary hover:bg-primary-container hover:text-on-primary-container text-[10px] font-bold flex items-center gap-1.5 transition-colors border border-primary/20 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                Launch Setlist
                              </button>
                            </div>

                            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto custom-scrollbar p-1 pl-2">
                              {sl.songs.map((ss: any, sIdx: number) => {
                                const isExpanded = activeExpandedId === ss.id;
                                const song = ss.song || {};

                                if (isExpanded) {
                                  return (
                                    <div key={ss.id} className="rounded-xl bg-surface-container-high p-3.5 relative overflow-hidden border border-secondary/30 transition-all shrink-0 shadow-sm">
                                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary"></div>
                                      <div className="flex items-start justify-between gap-3 h-full">
                                        <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-badge-caps text-[8px] uppercase font-black">REHEARSING NOW</span>
                                            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest border border-outline-variant/30 text-secondary font-badge-caps text-[8px] uppercase font-bold">CHORDS + LYRICS</span>
                                          </div>
                                          <span className="font-headline-title-mobile text-[15px] text-on-surface truncate font-bold leading-tight">{song.title}</span>
                                          <div className="flex items-center gap-2 mt-1 text-on-surface-variant">
                                            <span className="font-body-compact text-[10px] text-on-surface font-bold">Key of {song.original_key || 'G'}</span><span>•</span>
                                            <span className="font-body-compact text-[10px] tnum">{song.tempo ? `${song.tempo} BPM` : '-- BPM'}</span>
                                          </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-end justify-between h-full shrink-0 gap-3">
                                          <button onClick={(e) => { e.stopPropagation(); router.push(`/songs/${song.id}`); }} className="px-3 py-1.5 rounded-lg bg-primary-container hover:bg-primary border border-primary/20 text-on-primary font-label-sm text-[10px] font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-[14px]">music_note</span>View Chords
                                          </button>
                                          
                                          <div className="flex items-center gap-3 mt-auto">
                                            <span className="font-badge-caps text-[8px] text-secondary uppercase font-bold tracking-widest mt-0.5">Track {String(sIdx + 1).padStart(2, '0')}</span>
                                            <button 
                                              onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setActivePracticeSong(song); 
                                                autoplayNextVideoRef.current = true; // Sets intent to autoplay
                                              }}
                                              className="w-8 h-8 flex items-center justify-center rounded bg-white text-zinc-900 shadow-md hover:bg-zinc-200 active:scale-95 transition-all cursor-pointer"
                                            >
                                              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div key={ss.id} onClick={() => setExpandedSetlistSong(prev => ({...prev, [sl.id]: ss.id}))} className="rounded-xl bg-surface-container p-2.5 flex items-center justify-between gap-3 border border-outline-variant/15 cursor-pointer hover:bg-surface-container-high hover:border-outline-variant/40 transition-colors shrink-0">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface-variant shrink-0 font-section-heading text-[12px] font-black">{sIdx + 1}</div>
                                        <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-headline-title-mobile text-[13px] leading-tight text-on-surface truncate font-semibold">{song.title}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant font-badge-caps text-[7px] uppercase hidden sm:block">CHORDS</span>
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5 text-on-surface-variant">
                                            <span className="font-body-compact text-[10px] text-on-surface">Key of {song.original_key || 'G'}</span><span>•</span>
                                            <span className="font-body-compact text-[10px] tnum">{song.tempo ? `${song.tempo} BPM` : '-- BPM'}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="rounded-xl bg-surface-container-low p-8 border border-dashed border-outline-variant/30 text-center space-y-2 select-none shadow-sm">
                <span className="material-symbols-outlined text-outline text-[28px]">event_busy</span>
                <h4 className="font-section-heading text-[14px] text-on-surface font-bold">No Active Lineup Allocations</h4>
                <p className="text-on-surface-variant font-body-compact text-[11px]">You aren't scheduled to serve in any upcoming active workflows.</p>
              </div>
            )}
          </div>

          {/* ========================================= */}
          {/* SECTION 5: UPCOMING EVENTS (REDESIGNED)   */}
          {/* ========================================= */}
          <div className="rounded-2xl bg-surface-container-lowest md:p-5 border border-outline-variant/40 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between px-4 pt-4 md:px-0 md:pt-0">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-[18px] text-on-surface tracking-tight">Upcoming Events Queue</h2>
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant">
                {upcomingEventsSectionData.length} SCHEDULED
              </span>
            </div>
            
            <div className="flex flex-col gap-2 px-4 pb-4 md:px-0 md:pb-0">
              {upcomingEventsSectionData.map((evt: any, idx: number) => {
                 const dateObj = new Date(evt.event_date || new Date());
                 const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
                 const day = dateObj.getDate();
                 
                 // Display the first setlist name if available, else fallback to service type
                 const slName = assignedSetlists[evt.id]?.[0]?.title || evt.service_type || "Main Service";

                 return (
                   <div 
                     key={evt.id}
                     onClick={() => router.push(`/events/${evt.id}`)}
                     className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-outline-variant/10 hover:border-outline-variant/30 transition-colors cursor-pointer group"
                   >
                     <div className="flex items-center gap-3.5 min-w-0">
                       
                       {/* Calendar Icon Block */}
                       <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex flex-col items-center justify-center shrink-0 border border-outline-variant/20 shadow-inner">
                         <span className="text-[10px] font-black text-cyan-400 leading-none mb-0.5">{month}</span>
                         <span className="text-[15px] font-black text-on-surface leading-none">{day}</span>
                       </div>
                       
                       <div className="flex flex-col min-w-0 pr-2">
                         <div className="flex items-center gap-2 mb-1">
                           <span className="font-bold text-[14px] text-on-surface leading-none group-hover:text-cyan-400 transition-colors truncate">{evt.title}</span>
                           <span className="bg-indigo-500/20 text-indigo-400 text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0">#{idx + 1}</span>
                         </div>
                         <div className="flex items-center gap-1 text-on-surface-variant">
                           <span className="material-symbols-outlined text-[12px] shrink-0">schedule</span>
                           <span className="font-bold text-[11px] truncate max-w-[200px]">{slName}</span>
                         </div>
                       </div>
                     </div>
                     <span className="material-symbols-outlined text-outline text-[18px] group-hover:translate-x-0.5 transition-transform mr-1 shrink-0">chevron_right</span>
                   </div>
                 );
              })}
            </div>
          </div>

        </div>
      </main>

      {/* HEADLESS YOUTUBE IFRAME */}
      <div 
        key={activeYoutubeId || "empty"} 
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '640px', height: '360px' }}
      >
        <div id="dashboard-headless-yt"></div>
      </div>

      {/* BOOKMARKS MODAL PANEL */}
      {isBookmarksModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[250000] flex items-center justify-center p-4 animate-in fade-in duration-105">
          <div className="bg-surface-container rounded-xl md:rounded-[2.5rem] shadow-2xl border border-outline-variant/30 max-w-lg w-full p-4 md:p-6 flex flex-col space-y-3 md:space-y-4 max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2 select-none">
              <div className="flex items-center gap-2">
                <span className="text-secondary text-lg material-symbols-outlined">star</span>
                <h4 className="font-headline-title-mobile text-headline-title-mobile text-on-surface tracking-tight font-extrabold">Bookmarked Songs</h4>
              </div>
              <button 
                type="button" 
                onClick={() => setIsBookmarksModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright text-xs font-bold border border-outline-variant/30 flex items-center justify-center cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="relative flex items-center bg-surface-container-lowest rounded-xl px-3 py-2.5 border border-outline-variant/30 focus-within:border-secondary transition-colors shadow-inner">
              <span className="material-symbols-outlined text-outline text-[18px] mr-2">search</span>
              <input 
                type="text" 
                placeholder="Search matching bookmarks..." 
                value={bookmarkSearchQuery}
                onChange={e => setBookmarkSearchQuery(e.target.value)}
                className="w-full font-body-compact text-[13px] text-on-surface bg-transparent outline-none placeholder-outline"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[200px]">
              {filteredBookmarkedSongs.map((song: any) => (
                <div 
                  key={song.id}
                  onClick={() => { 
                    setActivePracticeSong(song);
                    setYtPlaying(false);
                    setIsBookmarksModalOpen(false); 
                  }}
                  className="p-3.5 bg-surface-container-high border border-outline-variant/30 hover:border-secondary rounded-xl flex items-center justify-between gap-4 transition-all group cursor-pointer shadow-sm"
                >
                  <div className="min-w-0">
                    <h5 className="font-body-lead text-[14px] text-on-surface font-bold tracking-tight group-hover:text-secondary transition-colors truncate">
                      {song.title}
                    </h5>
                    <p className="text-label-sm text-[10px] text-on-surface-variant truncate mt-0.5">
                      👤 {song.artist || "Unknown Artist"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded bg-surface-container border border-outline-variant/30 text-[10px] font-black uppercase text-outline shadow-inner">
                      {song.tempo ? `${song.tempo} BPM` : '-- BPM'}
                    </span>
                  </div>
                </div>
              ))}

              {filteredBookmarkedSongs.length === 0 && (
                <div className="p-8 text-center text-outline font-body-compact text-body-compact italic py-12">
                  No bookmarked track arrays match your search parameters.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}