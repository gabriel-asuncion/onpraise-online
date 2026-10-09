"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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

// ✅ Timeline Segment Models & Color Engine
interface SongSegment {
  label: string;
  start: number;
  end: number;
  duration: number;
  color: string;
}

function getSectionColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes('chorus')) return 'bg-orange-500';
  if (l.includes('verse')) return 'bg-sky-500';
  if (l.includes('bridge')) return 'bg-primary';
  if (l.includes('intro') || l.includes('inst') || l.includes('inter')) return 'bg-emerald-500';
  if (l.includes('outro')) return 'bg-purple-500';
  if (l.includes('tag') || l.includes('pre')) return 'bg-secondary';
  return 'bg-zinc-500';
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
  
  // ✅ SURGICAL ADDITION: Portal Mounting Engine & Expanded State
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);

  // ✅ SURGICAL ADDITION: Chapters & Looping Engine State
  const [isChaptersModalOpen, setIsChaptersModalOpen] = useState(false);
  const [loopMode, setLoopMode] = useState<"off" | "once" | "forever">("off");
  const [loopTargetSegment, setLoopTargetSegment] = useState<SongSegment | null>(null);
  const [hasLoopedOnce, setHasLoopedOnce] = useState(false);

  // 🟢 SURGICAL FIX: Ref-backed loop state so the 60fps scrubber never reads stale data!
  const loopEngineRef = useRef<{ mode: "off" | "once" | "forever", target: SongSegment | null, hasLoopedOnce: boolean }>({
    mode: "off", target: null, hasLoopedOnce: false
  });

  const updateLoopState = (mode: "off" | "once" | "forever", target: SongSegment | null, loopedOnce: boolean) => {
    setLoopMode(mode);
    setLoopTargetSegment(target);
    setHasLoopedOnce(loopedOnce);
    loopEngineRef.current = { mode, target, hasLoopedOnce: loopedOnce };
  };

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
  const dashboardProgressRef = useRef<HTMLDivElement | null>(null);

  

  // ✅ SURGICAL ADDITION: Tell the Sidebar to slide down to 68px when playing!
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: ytPlaying }));
    }
  }, [ytPlaying]);

  // ✅ Math Engine for Anime-style Segmented Scrubber
  const songSegments = useMemo(() => {
    const segments: SongSegment[] = [];
    if (!activePracticeSong || ytDuration <= 0) {
      return [{ label: "Track", start: 0, end: ytDuration || 100, duration: ytDuration || 100, color: "bg-primary" }];
    }
    
    const offsetSec = (activePracticeSong.youtube_sync_offset_ms || 0) / 1000;
    const tempo = activePracticeSong.tempo || 120;
    const secPerBeat = 60 / tempo;
    
    const chordpro = activePracticeSong.chordpro_content || "";
    const sectionRegex = /^\[(.*?)\]/gm;
    let match;
    const sectionSequence = [];
    while ((match = sectionRegex.exec(chordpro)) !== null) {
      sectionSequence.push(match[1]);
    }
    
    let currentStartTime = offsetSec;
    const timings = activePracticeSong.section_timings;
    
    // Add Pre-roll Pad
    if (currentStartTime > 0) {
      segments.push({ label: "Pre-Roll", start: 0, end: currentStartTime, duration: currentStartTime, color: "bg-zinc-700" });
    }
    
    // Map Sections proportionally
    if (timings && sectionSequence.length > 0) {
      sectionSequence.forEach(secLabel => {
         const t = timings[secLabel];
         if (t) {
           const beatsPerMeasure = parseInt((activePracticeSong.time_signature || '4/4').split('/')[0]) || 4;
           const totalBeats = ((t.measures || 0) * beatsPerMeasure + (t.beats || 0)) * ((t.repeats || 0) + 1) + ((t.head_m || 0) * beatsPerMeasure) + ((t.tail_m || 0) * beatsPerMeasure);
           const durationSec = totalBeats * secPerBeat;
           
           if (durationSec > 0) {
               segments.push({ label: secLabel, start: currentStartTime, end: currentStartTime + durationSec, duration: durationSec, color: getSectionColor(secLabel) });
               currentStartTime += durationSec;
           }
         }
      });
    }
    
    // Fill remaining video timeline
    if (segments.length === 0 || currentStartTime < ytDuration) {
       const remain = Math.max(0, ytDuration - currentStartTime);
       if (remain > 1) segments.push({ label: "Post-Roll", start: currentStartTime, end: ytDuration, duration: remain, color: "bg-zinc-700" });
    }
    
    return segments;
  }, [activePracticeSong, ytDuration]);

  const activeSegment = songSegments.find(s => ytCurrentTime >= s.start && ytCurrentTime < s.end) || songSegments[0];

  const handleSkipNextSection = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!ytPlayerRef.current || typeof ytPlayerRef.current.seekTo !== 'function') return;
      const nextSeg = songSegments.find(s => s.start > ytCurrentTime + 1); // +1s buffer
      if (nextSeg) { ytPlayerRef.current.seekTo(nextSeg.start, true); setYtCurrentTime(nextSeg.start); }
  };

  const handleSkipPrevSection = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!ytPlayerRef.current || typeof ytPlayerRef.current.seekTo !== 'function') return;
      const currentSegIndex = songSegments.findIndex(s => ytCurrentTime >= s.start && ytCurrentTime < s.end);
      if (currentSegIndex >= 0) {
          const currentSeg = songSegments[currentSegIndex];
          if (ytCurrentTime > currentSeg.start + 3) {
              ytPlayerRef.current.seekTo(currentSeg.start, true); setYtCurrentTime(currentSeg.start);
          } else if (currentSegIndex > 0) {
              ytPlayerRef.current.seekTo(songSegments[currentSegIndex - 1].start, true); setYtCurrentTime(songSegments[currentSegIndex - 1].start);
          } else {
              ytPlayerRef.current.seekTo(0, true); setYtCurrentTime(0);
          }
      }
  };

  async function loadDashboardMetrics() {
    try {
      // ✅ SURGICAL FIX: Strict Auth & Onboarding Bounce
      const { data: authData, error: authError } = await supabase.auth.getUser();

      // 1. If no valid user session exists, bounce to login
      if (authError || !authData?.user) {
        router.push("/login"); // (or your sign-in route)
        return;
      }

      // 2. Fetch the user's core profile data
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, team_id, avatar_url")
        .eq("id", authData.user.id)
        .maybeSingle();

      // 3. If the profile row is missing, or the name is empty, aggressively route to onboarding
      if (!profile || !profile.full_name || profile.full_name.trim() === "") { 
        router.push("/onboarding"); 
        return; 
      }

      const activeProfileData = profile;

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
            // ✅ Fetching extra columns for Timeline Math
            .select("id, setlist_id, sequence_order, custom_key, song:songs(id, title, artist, original_key, tempo, youtube_url, section_timings, chordpro_content, youtube_sync_offset_ms)")
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
        const currentTime = ytPlayerRef.current.getCurrentTime();
        
        // ✅ SURGICAL FIX: 60fps Scrubber, Segment Masking, & Intelligent Looping Engine
        const duration = ytPlayerRef.current.getDuration() || 1;
        const progressPercent = (currentTime / duration) * 100;

        if (dashboardProgressRef.current) {
           dashboardProgressRef.current.style.transform = `scaleX(${currentTime / duration})`;
        }

        // Sync anime scrubber clip-paths globally
        document.querySelectorAll('.segmented-scrubber-mask').forEach(el => {
          (el as HTMLElement).style.clipPath = `inset(0 ${100 - progressPercent}% 0 0)`;
        });

        // 🟢 THE LOOPING ENGINE INTERCEPTOR (Using Ref to prevent Stale State Bugs)
        const engine = loopEngineRef.current;
        if (engine.mode !== "off" && engine.target) {
          // Safety: If user skips way outside the loop segment, kill the loop automatically.
          if (currentTime < engine.target.start - 2 || currentTime > engine.target.end + 2) {
             updateLoopState("off", null, false);
          } else if (currentTime >= engine.target.end - 0.2) { 
             // We hit the end boundary
            if (engine.mode === "forever") {
              ytPlayerRef.current.seekTo(engine.target.start, true);
            } else if (engine.mode === "once" && !engine.hasLoopedOnce) {
              updateLoopState("once", engine.target, true);
              ytPlayerRef.current.seekTo(engine.target.start, true);
            } else if (engine.mode === "once" && engine.hasLoopedOnce) {
              updateLoopState("off", null, false);
            }
          }
        }

        if (!isMobile || isPlayerExpanded) {
           setYtCurrentTime(currentTime);
        }
      }
      ytTimeTrackerRef.current = requestAnimationFrame(updateScrubber);
    };
    if (ytPlaying) ytTimeTrackerRef.current = requestAnimationFrame(updateScrubber);
    return () => { if (ytTimeTrackerRef.current) cancelAnimationFrame(ytTimeTrackerRef.current); };
  }, [ytPlaying, isMobile, isPlayerExpanded]);

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
          
             {/* ... [Keep existing Section 3 Search & Media Player content] ... */}
             

            {/* MEDIA PLAYER (Portaled on Mobile) */}
            {mounted && activePracticeSong && (() => {
              
              // 1. The Full-Screen Expanded Overlay (Safely Portaled to the absolute Root)
              const ExpandedPlayer = isMobile && isPlayerExpanded ? createPortal(
                <div className="fixed inset-0 z-[250000] bg-surface flex flex-col p-6 animate-in slide-in-from-bottom-full duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  <div className="flex items-center justify-between w-full shrink-0 mb-6 pt-safe mt-4">
                    <button onClick={() => setIsPlayerExpanded(false)} className="w-10 h-10 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-bright transition-colors shadow-sm active:scale-95 cursor-pointer">
                      <span className="material-symbols-outlined text-[24px] text-on-surface">keyboard_arrow_down</span>
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Now Playing</span>
                    <div className="w-10"></div> 
                  </div>

                  <div className="flex flex-col items-center justify-center flex-1">
                    {/* ✅ SURGICAL FIX: Relative container with floating Prev/Next buttons */}
                    <div className="relative w-full aspect-square max-w-[320px] rounded-2xl overflow-hidden shadow-2xl mb-8 border border-outline-variant/20 bg-surface-container-high">
                      {activeYoutubeId ? (
                        <img src={`https://img.youtube.com/vi/${activeYoutubeId}/hqdefault.jpg`} alt="cover" className="w-full h-full object-cover opacity-90" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-[64px] text-outline-variant">music_note</span>
                        </div>
                      )}
                      
                      <button type="button" onClick={handleSkipPrevSection} className="absolute bottom-2 left-2 px-3 py-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-lg text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-md active:scale-95 border border-white/10 transition-all">
                        <span className="material-symbols-outlined text-[16px]">skip_previous</span>Prev Section
                      </button>
                      <button type="button" onClick={handleSkipNextSection} className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-lg text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-md active:scale-95 border border-white/10 transition-all">
                        Next Section<span className="material-symbols-outlined text-[16px]">skip_next</span>
                      </button>
                    </div>
                    
                    <div className="w-full flex items-center justify-between mb-8">
                      <div className="flex flex-col flex-1 min-w-0 pr-4">
                        <h2 className="font-black text-2xl text-on-surface tracking-tight mb-1 truncate">{activePracticeSong?.title || "Unknown Track"}</h2>
                        <p className="font-bold text-sm text-on-surface-variant truncate">{activePracticeSong?.artist || "Unknown Artist"}</p>
                      </div>
                      
                      <button 
                        onClick={() => setIsChaptersModalOpen(true)}
                        className="w-10 h-10 shrink-0 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-surface-bright transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                      </button>
                    </div>

                    {/* ✅ SURGICAL FIX: Uncolored Anime Scrubber */}
                    <div className="w-full max-w-sm mb-8">
                      <div className="relative w-full h-[8px] group flex items-center cursor-pointer mb-3">
                        <div className="absolute w-full h-full flex gap-[2px] rounded-full overflow-hidden">
                          {songSegments.map((seg, i) => (
                            <div key={`bg-${i}`} className="h-full bg-white/20 transition-opacity" style={{ width: `${(seg.duration / ytDuration) * 100}%` }} title={seg.label} />
                          ))}
                        </div>
                        <div className="segmented-scrubber-mask absolute w-full h-full flex gap-[2px] rounded-full overflow-hidden pointer-events-none" style={{ clipPath: `inset(0 ${100 - seekPercentage}% 0 0)` }}>
                          {songSegments.map((seg, i) => (
                            <div key={`fg-${i}`} className="h-full bg-[#38BDF8]" style={{ width: `${(seg.duration / ytDuration) * 100}%` }} />
                          ))}
                        </div>
                        <input 
                          type="range" min="0" max={ytDuration || 100} step="0.1" value={ytCurrentTime}
                          onChange={(e) => { const t = parseFloat(e.target.value); setYtCurrentTime(t); if (ytPlayerRef.current) ytPlayerRef.current.seekTo(t, true); }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-mono font-bold pointer-events-none">
                        <span className="text-on-surface-variant">{formatTime(ytCurrentTime)}</span>
                        <span className="px-3 py-1 rounded bg-[#38BDF8] text-zinc-950 uppercase tracking-widest text-[9px] shadow-sm font-black leading-none">{activeSegment?.label || "Track"}</span>
                        <span className="text-on-surface-variant">-{formatTime(Math.max(0, ytDuration - ytCurrentTime))}</span>
                      </div>
                    </div>

                    {/* ✅ SURGICAL FIX: 5-Button Track Skip Array (Mobile) */}
                    <div className="flex items-center justify-center gap-4 sm:gap-6 mb-4 w-full px-4">
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.max(0, ytCurrentTime - 10); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-90"><span className="material-symbols-outlined text-[28px]">replay_10</span></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.max(0, ytCurrentTime - 5); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-90"><span className="material-symbols-outlined text-[28px]">replay_5</span></button>

                      <button 
                        type="button"
                        className="w-20 h-20 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(38,185,255,0.4)] active:scale-95 transition-transform cursor-pointer outline-none shrink-0"
                        onClick={(e) => { e.stopPropagation(); if (!ytPlayerRef.current) return; if (ytPlaying) ytPlayerRef.current.pauseVideo(); else ytPlayerRef.current.playVideo(); }}
                      >
                        <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>{ytPlaying ? 'stop' : 'play_arrow'}</span>
                      </button>

                      <button type="button" onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.min(ytDuration, ytCurrentTime + 5); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-90"><span className="material-symbols-outlined text-[28px]">forward_5</span></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.min(ytDuration, ytCurrentTime + 10); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer active:scale-90"><span className="material-symbols-outlined text-[24px]">forward_10</span></button>
                    </div>
                  </div>
                </div>,
                document.body
              ) : null;

              // 2. The Inline or Docked Player
              const CollapsedPlayer = (
                <div 
                  onClick={() => { if (isMobile) setIsPlayerExpanded(true); }}
                  className={`relative overflow-hidden shadow-sm border border-outline-variant/20 transition-all ${isMobile ? "w-full h-[64px] bg-[#18181A] rounded-t-2xl px-4 flex items-center justify-between cursor-pointer border-t" : "rounded-xl bg-surface-container-low p-4 mt-1"} ${isMobile && isPlayerExpanded ? "hidden" : ""}`}
                >
                  {!isMobile && <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-primary-container/10 blur-2xl pointer-events-none"></div>}
                  
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
                      <div className="flex items-center gap-2.5 shrink-0 z-10">
                        {/* ✅ SURGICAL FIX: Added Chapters button directly beside it */}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation(); 
                              setIsChaptersModalOpen(true);
                            }}
                            disabled={!activeYoutubeId}
                            className="w-10 h-10 flex items-center justify-center shrink-0 transition-transform active:scale-90 disabled:opacity-50 text-on-surface-variant hover:text-white"
                          >
                            <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                          </button>
                          {/* ✅ SURGICAL FIX: Restored Play/Pause Button */}
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
                        
                        {/* ✅ SURGICAL FIX: Swapped to hardware-accelerated CSS Transforms via Callback Ref */}
                        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-surface-container-highest z-50">
                          <div 
                            ref={(el) => { if (dashboardProgressRef) dashboardProgressRef.current = el; }}
                            className="h-full bg-primary origin-left transition-transform duration-100 ease-linear" 
                            style={{ transform: 'scaleX(0)' }} 
                          />
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


                       {/* ✅ SURGICAL FIX: Uncolored Desktop Scrubber & Chapters Button */}
                      <div className="w-full mt-4 mb-3 relative z-10">
                        <div className="flex justify-between items-end mb-2 ml-1 mr-1 select-none">
                          <div className="text-[10px] font-mono font-bold text-on-surface-variant tracking-widest flex items-center gap-4">
                            <span>{formatTime(ytCurrentTime)} / {formatTime(ytDuration)}</span>
                            
                          </div>
                          <span className="px-2 py-0.5 rounded uppercase tracking-widest text-[9px] bg-[#38BDF8] text-zinc-950 shadow-sm font-black leading-none">
                            {activeSegment?.label || "Track"}
                          </span>
                        </div>
                        
                        <div className="relative w-full h-[8px] group flex items-center cursor-pointer">
                          <div className="absolute w-full h-full flex gap-[2px] rounded-full overflow-hidden">
                            {songSegments.map((seg, i) => (
                              <div key={`dt-bg-${i}`} className="h-full bg-white/20 transition-opacity" style={{ width: `${(seg.duration / ytDuration) * 100}%` }} title={seg.label} />
                            ))}
                          </div>
                          <div className="segmented-scrubber-mask absolute w-full h-full flex gap-[2px] rounded-full overflow-hidden pointer-events-none" style={{ clipPath: `inset(0 ${100 - seekPercentage}% 0 0)` }}>
                            {songSegments.map((seg, i) => (
                              <div key={`dt-fg-${i}`} className="h-full bg-[#38BDF8]" style={{ width: `${(seg.duration / ytDuration) * 100}%` }} />
                            ))}
                          </div>
                          <input 
                            type="range" min="0" max={ytDuration || 100} step="0.1" value={ytCurrentTime}
                            onChange={(e) => { const t = parseFloat(e.target.value); setYtCurrentTime(t); if (ytPlayerRef.current) ytPlayerRef.current.seekTo(t, true); }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                        </div>
                      </div>


                      {/* ✅ 7-Button Seek Row for Desktop Inline Player */}
                      <div className="flex items-center justify-between relative z-10 pt-1">
                        <div className="flex items-center gap-1.5">
                          <button type="button" disabled={!activeYoutubeId} onClick={handleSkipPrevSection} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-white bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined text-[18px]">skip_previous</span>
                          </button>
                          <button type="button" disabled={!activeYoutubeId} onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.max(0, ytCurrentTime - 10); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined text-[18px]">replay_10</span>
                          </button>
                          <button type="button" disabled={!activeYoutubeId} onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.max(0, ytCurrentTime - 5); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined text-[18px]">replay_5</span>
                          </button>

                          <button 
                            type="button"
                            disabled={!activeYoutubeId}
                            className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform cursor-pointer outline-none shrink-0 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${ytPlaying ? 'bg-secondary-container text-on-secondary-container border border-secondary/20' : 'bg-primary border border-primary/20 text-on-primary'}`}
                            onClick={handleTogglePlay}
                          >
                            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                              {ytPlaying ? 'stop' : 'play_arrow'}
                            </span>
                          </button>

                          <button type="button" disabled={!activeYoutubeId} onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.min(ytDuration, ytCurrentTime + 5); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined text-[18px]">forward_5</span>
                          </button>
                          <button type="button" disabled={!activeYoutubeId} onClick={(e) => { e.stopPropagation(); if (ytPlayerRef.current) { const t = Math.min(ytDuration, ytCurrentTime + 10); setYtCurrentTime(t); ytPlayerRef.current.seekTo(t, true); } }} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined text-[18px]">forward_10</span>
                          </button>
                          <button type="button" disabled={!activeYoutubeId} onClick={handleSkipNextSection} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-white bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="material-symbols-outlined text-[18px]">skip_next</span>
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <button 
                                onClick={() => setIsChaptersModalOpen(true)}
                                className="px-2 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-title-mobile text-[12px] active:scale-95 transition-all border border-outline-variant/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                                <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                                {/* CHAPTERS */}
                          </button>

                          <button 
                            onClick={() => activePracticeSong && router.push(`/songs/${activePracticeSong.id}`)}
                            disabled={!activePracticeSong}
                            className="px-2 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-title-mobile text-[12px] active:scale-95 transition-all border border-outline-variant/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px] text-secondary">lyrics</span>
                            {/* <span className="hidden sm:inline">Check Lyrics</span> */}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );

              // 3. Mount Logic
              if (isMobile) {
                const portalSlot = document.getElementById("media-player-portal-slot");
                return (
                  <>
                    {ExpandedPlayer}
                    {portalSlot ? createPortal(CollapsedPlayer, portalSlot) : null}
                  </>
                );
              }
              
              return CollapsedPlayer;
            })()}
          

          {/* SECTION 4: MY ACTIVE PLANS */}
          <div className="rounded-3xl bg-surface-container-lowest p-5 md:p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-4">
             {/* ... [Keep existing Section 4 My Active Plans content] ... */}
             <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-section-heading text-[16px] text-on-surface font-extrabold">My Active Plans</span>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-secondary font-label-sm text-[10px] font-bold shadow-inner">{userAssignedActivePlans.length} Assigned</span>
              </div>
            </div>

            {/* ✅ SURGICAL FIX: Wrapped the Search Input and the Accordion List in a single flex-col with gap-2 to eliminate the awkward spacing */}
            <div className="flex flex-col gap-2 relative z-20">
              {/* Search Input */}
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
                <div key={evt.id} className="flex flex-col bg-surface-container border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm">
                  
                  <div 
                    onClick={() => setIsSetlistAccordionOpen(prev => ({...prev, [evt.id]: !prev[evt.id]}))}
                    className={`flex items-center justify-between p-3.5 hover:bg-surface-container-high transition-colors cursor-pointer select-none ${isAccordionOpen ? 'border-b border-outline-variant/20 bg-surface-container-high' : 'bg-surface-container'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center">
                        {/* ✅ SURGICAL FIX: Reduced calendar icon to 14px to match sidebar specs */}
                        <span className="material-symbols-outlined text-on-surface-variant !text-[16px]">calendar_month</span>
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
                                className="px-2.5 py-1.5 rounded-lg bg-primary-container/20 text-primary hover:bg-primary-container hover:text-on-primary-container text-[10px] font-bold flex items-center gap-1.5 transition-colors border border-primary/20 cursor-pointer shadow-sm"
                              >
                                {/* ✅ SURGICAL FIX: Reduced star icon from 14px to 12px */}
                                <span className="material-symbols-outlined !text-[12px]">auto_awesome</span>
                                Launch Setlist
                              </button>
                            </div>

                            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto custom-scrollbar p-1 pl-2">
                              {sl.songs.map((ss: any, sIdx: number) => {
                                const isExpanded = activeExpandedId === ss.id;
                                const song = ss.song || {};

                                if (isExpanded) {
                                  return (
                                    // ✅ SURGICAL FIX: Changed from bg-surface-container-high to bg-[#18181A] (matching the precision dark aesthetic)
                                    <div key={ss.id} className="rounded-xl bg-[#18181A] p-3.5 relative overflow-hidden border border-secondary/30 transition-all shrink-0 shadow-sm">
                                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary"></div>
                                      <div className="flex items-start justify-between gap-3 h-full">
                                        <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-badge-caps text-[8px] uppercase font-black">REHEARSING NOW</span>
                                            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest border border-outline-variant/30 text-secondary font-badge-caps text-[8px] uppercase font-bold">CHORDS + LYRICS</span>
                                          </div>
                                          <span className="font-headline-title-mobile text-[15px] text-on-surface truncate font-bold leading-tight">{song.title}</span>
                                          <div className="flex items-center gap-2 mt-1 text-on-surface-variant">
                                            {/* ✅ SURGICAL FIX: Display custom_key if it exists */}
                                            <span className="font-body-compact text-[10px] text-on-surface font-bold">Key of {ss.custom_key || song.original_key || 'G'}</span><span>•</span>
                                            <span className="font-body-compact text-[10px] tnum">{song.tempo ? `${song.tempo} BPM` : '-- BPM'}</span>
                                          </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-end justify-between h-full shrink-0 gap-3">
                                          <button onClick={(e) => { e.stopPropagation(); router.push(`/songs/${song.id}`); }} className="px-3 py-1.5 rounded-lg bg-primary-container hover:bg-primary border border-primary/20 text-on-primary font-label-sm text-[10px] font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer">
                                            <span className="material-symbols-outlined !text-[16px]">music_note</span>View Chords
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
                                              <span className="material-symbols-outlined !text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    // ✅ SURGICAL FIX: Changed from bg-surface-container to bg-[#18181A] and border-zinc-800/80
                                    <div key={ss.id} onClick={() => setExpandedSetlistSong(prev => ({...prev, [sl.id]: ss.id}))} className="rounded-xl bg-[#18181A] p-2.5 flex items-center justify-between gap-3 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-colors shrink-0 shadow-sm">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface-variant shrink-0 font-section-heading text-[12px] font-black">{sIdx + 1}</div>
                                        <div className="flex flex-col min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="font-headline-title-mobile text-[13px] leading-tight text-on-surface truncate font-semibold">{song.title}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant font-badge-caps text-[7px] uppercase hidden sm:block">CHORDS</span>
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5 text-on-surface-variant">
                                            {/* ✅ SURGICAL FIX: Display custom_key if it exists */}
                                            <span className="font-body-compact text-[10px] text-on-surface">Key of {ss.custom_key || song.original_key || 'G'}</span><span>•</span>
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
          <div className="rounded-3xl bg-surface-container-lowest p-5 md:p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-[18px] text-on-surface tracking-tight">Upcoming Events Queue</h2>
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant">
                {upcomingEventsSectionData.length} SCHEDULED
              </span>
            </div>
            
            <div className="flex flex-col gap-2">
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
                           <span className="material-symbols-outlined !text-[12px] shrink-0">schedule</span>
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

        {/* ✅ SURGICAL FIX: Fixed margin to mt-0 so it matches the gap-4 spacing of the flex parent */}
          <div 
            onClick={() => router.push('/md-live')}
            className="flex items-center justify-between p-5 md:p-6 rounded-3xl bg-surface-container-lowest border border-outline-variant/40 cursor-pointer group shadow-sm mt-0"
          >
            <div className="flex items-center gap-4 min-w-0">
              {/* <div className="w-10 h-10 rounded-full bg-[#3B82F6] flex items-center justify-center shrink-0 shadow-[0_0_20px_-5px_rgba(59,130,246,0.6)] group-hover:shadow-[0_0_25px_-5px_rgba(59,130,246,0.8)] transition-shadow">
                <span className="material-symbols-outlined !text-[16px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>graphic_eq</span>
              </div> */}
              <div className="flex flex-col min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-extrabold text-[18px] md:text-[20px] text-on-surface leading-none truncate tracking-tight">MD Live Studio</span>
                </div>
                <span className="font-black text-[10px] text-[#38BDF8] uppercase tracking-[0.1em] truncate block">Standalone Metronome & Cues</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-outline group-hover:bg-primary-container/20 group-hover:border-primary/30 group-hover:text-primary transition-colors shrink-0">
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
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

      {/* ✅ SURGICAL ADDITION: In-Video Chapters & Looping Modal */}
      {isChaptersModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300000] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-150">
          <div className="bg-surface-container rounded-t-3xl md:rounded-[2rem] shadow-2xl border-t border-x md:border border-outline-variant/30 w-full max-w-md flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-full md:zoom-in-95 duration-300">
            
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">format_list_bulleted</span>
                <h3 className="font-black text-[16px] text-on-surface">Song Sections</h3>
              </div>
              <button 
                onClick={() => setIsChaptersModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant flex items-center justify-center transition-colors border border-outline-variant/30"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-1.5 pb-safe">
              {songSegments.map((seg, idx) => {
                const isActive = ytCurrentTime >= seg.start && ytCurrentTime < seg.end;
                const isTargetedForLoop = loopTargetSegment?.label === seg.label && loopTargetSegment?.start === seg.start;
                
                return (
                  <div 
                    key={`chap-${idx}`}
                    onClick={() => {
                      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
                        // ✅ SURGICAL FIX: Jumping sections kills active loops, leaves modal open
                        updateLoopState("off", null, false);
                        ytPlayerRef.current.seekTo(seg.start, true);
                        setYtCurrentTime(seg.start);
                      }
                    }}
                    className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border ${isActive ? 'bg-primary/10 border-primary/30' : 'bg-surface-container hover:bg-surface-container-high border-transparent'}`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`font-bold text-[14px] truncate ${isActive ? 'text-primary' : 'text-on-surface'}`}>{seg.label}</span>
                      <span className="font-mono text-[11px] text-on-surface-variant tracking-widest mt-0.5">{formatTime(seg.start)}</span>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation(); // Don't trigger the row jump
                        if (isTargetedForLoop) {
                           // Cycle logic: once -> forever -> off
                           if (loopMode === "once") updateLoopState("forever", seg, false);
                           else if (loopMode === "forever") updateLoopState("off", null, false);
                        } else {
                           updateLoopState("once", seg, false);
                        }
                      }}
                      className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all ${isTargetedForLoop && loopMode !== "off" ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container-highest text-on-surface-variant hover:text-white hover:bg-surface-bright'}`}
                      title="Toggle Loop Segment"
                    >
                       {isTargetedForLoop && loopMode === "once" ? (
                         <span className="material-symbols-outlined text-[18px]">repeat_one</span>
                       ) : isTargetedForLoop && loopMode === "forever" ? (
                         <span className="material-symbols-outlined text-[18px]">repeat</span>
                       ) : (
                         <span className="material-symbols-outlined text-[18px] opacity-50 group-hover:opacity-100">repeat</span>
                       )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}