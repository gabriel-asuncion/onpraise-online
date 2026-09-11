"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useEngine } from "../app/context/EngineContext";

import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, eachDayOfInterval } from "date-fns";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  ministries: string[];
  unavailable_dates: string[];
}

interface AssignedSetlist {
  setlistId: string;
  setlistName: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
}

export default function Sidebar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter(); 
  
  const { simulatedRole, simulatedUserId, userTeamId, primaryTeamId, secondaryTeamIds, switchWorkspace } = useEngine();

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/login"); 
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };
  
  const [teamNamesMap, setTeamNamesMap] = useState<Record<string, string>>({});
  const [modalJoinCode, setModalJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [copyText, setCopyText] = useState("Copy Code");

  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isPlaymodeActive, setIsPlaymodeActive] = useState(false);
  const [isUiFocused, setIsUiFocused] = useState(false); 

  const [assignedSetlists, setAssignedSetlists] = useState<AssignedSetlist[]>([]);
  const [isSetlistDrawerOpen, setIsSetlistDrawerOpen] = useState(false);

  useEffect(() => {
    async function fetchAssignments() {
      if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") return;

      try {
        const { data: rosters } = await supabase.from("event_rosters").select("event_id").eq("user_id", simulatedUserId);
        if (!rosters || rosters.length === 0) return;
        const eventIds = rosters.map(r => r.event_id);

        const { data: events } = await supabase.from("events").select("id, title, event_date").in("id", eventIds);
        if (!events || events.length === 0) return;

        const { data: setlists } = await supabase.from("setlists").select("id, name, event_id").in("event_id", eventIds);

        const combined = (setlists || []).map(sl => {
          const ev = events.find(e => e.id === sl.event_id);
          return {
            setlistId: sl.id,
            setlistName: sl.name,
            eventId: ev?.id || "",
            eventTitle: ev?.title || "Unknown Event",
            eventDate: ev?.event_date || new Date().toISOString()
          };
        });

        const todayString = new Date().toISOString().split("T")[0];
        const activeAssignments = combined.filter(item => {
          const eventDateStr = item.eventDate.split("T")[0];
          return eventDateStr >= todayString;
        });

        setAssignedSetlists(activeAssignments);
      } catch (err) {
        console.error("Failed to load navigation assignments", err);
      }
    }
    fetchAssignments();
  }, [simulatedUserId]);

  const handleSetlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (assignedSetlists.length === 1) {
      router.push(`/setlists/${assignedSetlists[0].setlistId}/live`);
    } else {
      setIsSetlistDrawerOpen(true);
    }
  };

  const fetchActiveProfileContext = useCallback(async () => {
    if (!simulatedUserId) return;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", simulatedUserId).maybeSingle();
    if (!error && data) {
      setActiveProfile({ ...data, ministries: data.ministries || [], unavailable_dates: data.unavailable_dates || [] });
      if (data.team_id || (data.secondary_team_ids && data.secondary_team_ids.length > 0)) {
        const teamIdsToFetch = [data.team_id, ...(data.secondary_team_ids || [])].filter(Boolean);
        if (teamIdsToFetch.length > 0) {
          const { data: teamsData } = await supabase.from("teams").select("id, name").in("id", teamIdsToFetch);
          if (teamsData) {
            const map: Record<string, string> = {};
            teamsData.forEach(t => { map[t.id] = t.name; });
            setTeamNamesMap(map);
          }
        }
      }
    }
  }, [simulatedUserId, supabase]);

  const openAccountModal = useCallback(async () => {
    setIsAccountModalOpen(true); 
    await fetchActiveProfileContext(); 
  }, [fetchActiveProfileContext]);

  useEffect(() => {
    let lastScrollY = 0;
    let ticking = false;
    const handleScroll = (e: Event) => {
      const target = (e.target as Document).scrollingElement || (e.target as HTMLElement);
      const currentScrollY = target.scrollTop || window.scrollY || 0;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentScrollY > lastScrollY && currentScrollY > 50) setIsNavVisible(false); 
          else if (currentScrollY < lastScrollY) setIsNavVisible(true);  
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    
    const handlePlaymodeSignal = (e: Event) => setIsPlaymodeActive((e as CustomEvent<boolean>).detail);
    window.addEventListener("onpraise-playmode", handlePlaymodeSignal);

    const handleFocusState = (e: Event) => setIsUiFocused((e as CustomEvent<boolean>).detail);
    window.addEventListener("onpraise-ui-focus", handleFocusState);

    const handleOpenAccount = () => { void openAccountModal(); };
    window.addEventListener("onpraise-open-account", handleOpenAccount as EventListener);

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("onpraise-playmode", handlePlaymodeSignal);
      window.removeEventListener("onpraise-ui-focus", handleFocusState);
      window.removeEventListener("onpraise-open-account", handleOpenAccount as EventListener);
    };
  }, [openAccountModal]);

  async function handleJoinFromProfile() {
    if (!modalJoinCode.trim() || !simulatedUserId) return;
    setIsJoining(true);
    try {
      const { data: teamData, error: teamError } = await supabase.from("teams").select("id").eq("join_code", modalJoinCode.toLowerCase().trim()).maybeSingle();
      if (teamError || !teamData) { alert("Invalid join code."); setIsJoining(false); return; }
      const { error: profileError } = await supabase.from("profiles").update({ team_id: teamData.id }).eq("id", simulatedUserId);
      if (profileError) throw profileError;
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
      setIsJoining(false);
    }
  }

  async function handleCopyJoinCode() {
    if (!userTeamId) return;
    const { data } = await supabase.from("teams").select("join_code").eq("id", userTeamId).single();
    if (data?.join_code) {
      const inviteUrl = `${window.location.origin}/?invite=${data.join_code.toUpperCase()}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopyText("Link Copied! ✅");
      setTimeout(() => setCopyText("Copy Code"), 2000);
    }
  }

  const selectedDatesStr: string[] = [];
  if (dateRange?.from && dateRange?.to) {
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    selectedDatesStr.push(...days.map(d => format(d, 'yyyy-MM-dd')));
  } else if (dateRange?.from) {
    selectedDatesStr.push(format(dateRange.from, 'yyyy-MM-dd'));
  }

  const isRemoving = selectedDatesStr.length > 0 && selectedDatesStr.every(d => activeProfile?.unavailable_dates.includes(d));
  const blockedDates = (activeProfile?.unavailable_dates || []).map(dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  async function handleAddBlockoutDateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProfile || selectedDatesStr.length === 0 || isSavingSchedule) return;
    setIsSavingSchedule(true);
    let combinedDates: string[];
    if (isRemoving) combinedDates = activeProfile.unavailable_dates.filter(d => !selectedDatesStr.includes(d));
    else combinedDates = Array.from(new Set([...activeProfile.unavailable_dates, ...selectedDatesStr])).sort();

    const { error } = await supabase.from("profiles").update({ unavailable_dates: combinedDates }).eq("id", activeProfile.id);
    if (!error) {
      setActiveProfile({ ...activeProfile, unavailable_dates: combinedDates });
      setDateRange(undefined); 
    } else {
      alert(`Schedule Save Failed: ${error.message}`);
    }
    setIsSavingSchedule(false);
  }

  const navItems = [
    { icon: "home", label: "Home", href: "/dashboard", activePattern: "/dashboard" },
    { icon: "music_note", label: "Songs", href: "/songs", activePattern: "/songs" },
    { icon: "playlist_play", label: "Setlist", isAction: true },
    { icon: "group", label: "Team", href: "/events", activePattern: "/events" },
  ];

  return (
    <>
      <aside className={`w-20 h-[100dvh] bg-surface-container-lowest border-r border-outline-variant/30 shrink-0 select-none z-40 sticky top-0 transition-all duration-300 flex-col items-center justify-between hidden md:flex ${isPlaymodeActive ? "-ml-20 opacity-0 pointer-events-none" : "ml-0 opacity-100"}`}>
        <div className="flex flex-col items-center gap-8 w-full pt-6">
          <Link href="/dashboard" className="w-10 h-10 flex items-center justify-center transition-transform active:scale-95">
            <img src="/assets/logo.svg" className="w-9 h-9 object-contain" alt="Logo" />
          </Link>
          <div className="flex flex-col items-center gap-4 w-full px-2">
            {navItems.map((item) => {
              const isActive = item.isAction 
                ? (pathname.includes("/events/") || pathname.includes("/setlists")) 
                : (item.label === "Team" ? pathname === "/events" : pathname.startsWith(item.activePattern!));

              const btnClass = `w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-150 relative cursor-pointer ${
                isActive 
                  ? "bg-surface-container-high text-primary border border-outline-variant/30 scale-100 shadow-sm" 
                  : "bg-transparent text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:scale-105 border border-transparent"
              }`;

              const content = (
                <>
                  <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
                  {item.isAction && assignedSetlists.length > 1 && (
                    <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-surface-container-lowest ${isActive ? "bg-surface-container-highest text-on-surface" : "bg-error text-on-error"}`}>
                      {assignedSetlists.length}
                    </span>
                  )}
                </>
              );

              if (item.isAction) return <button key={item.label} onClick={handleSetlistClick} className={btnClass}>{content}</button>;
              return <Link key={item.href} href={item.href!} className={btnClass}>{content}</Link>;
            })}
          </div>
        </div>
      </aside>

      {/* 2. MOBILE VIEWPORT BOTTOM TRAY NAV BAR */}
      <nav 
        className="fixed bottom-0 left-0 right-0 flex flex-col pb-safe bg-[#111113] backdrop-blur-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.85)] md:hidden z-[100000] select-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          // ✅ SURGICAL FIX: Calculates the exact height of the icons + iOS home bar padding.
          // Slides down just enough to hide the icons, leaving the media player flush to the bottom!
          transform: (!isNavVisible || isUiFocused || isPlaymodeActive) 
            ? "translateY(calc(68px + env(safe-area-inset-bottom, 0px)))" 
            : "translateY(0)"
        }}
      >
        
        {/* ✅ THE GLOBAL PORTAL SLOT: The Media Player securely docks here automatically */}
        <div id="media-player-portal-slot" className="w-full empty:hidden border-b border-white/5 relative z-10"></div>

        {/* Navigation Icons Row (Explicitly 68px tall) */}
        <div className="flex items-center justify-around h-[68px] px-4 relative z-0">
          {navItems.map((item) => {
            const isActive = item.isAction 
              ? (pathname.includes("/events/") || pathname.includes("/setlists")) 
              : (item.label === "Team" ? pathname === "/events" : pathname.startsWith(item.activePattern!));
              
            const btnClass = `flex flex-col items-center justify-center min-w-[64px] h-[52px] rounded-xl transition-all border cursor-pointer ${
              isActive ? "text-primary bg-surface-container-high border-outline-variant/30 shadow-sm" : "text-on-surface-variant border-transparent hover:text-on-surface"
            }`;

            const content = (
              <>
                <div className="relative">
                  <span className="material-symbols-outlined text-[24px] mb-0.5">{item.icon}</span>
                  {item.isAction && assignedSetlists.length > 1 && (
                    <span className={`absolute -top-1.5 -right-2 text-[9px] font-black w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#111113] shadow-sm ${isActive ? "bg-surface-container-highest text-on-surface" : "bg-error text-on-error"}`}>
                      {assignedSetlists.length}
                    </span>
                  )}
                </div>
                <span className="font-label-sm text-[10px]">{item.label}</span>
              </>
            );

            if (item.isAction) return <button key={item.label} onClick={handleSetlistClick} className={btnClass}>{content}</button>;
            return <Link key={item.href} href={item.href!} className={btnClass}>{content}</Link>;
          })}
        </div>
      </nav>

      {/* MULTIPLE ASSIGNMENTS DRAWER */}
      {isSetlistDrawerOpen && (
        <div className="fixed inset-0 z-[200000] flex items-end justify-center pb-[80px] p-4 select-none">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsSetlistDrawerOpen(false)} />
          
          <div className="bg-surface-container-low border border-outline-variant/30 w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 flex flex-col animate-in slide-in-from-bottom-full duration-300 p-6 max-h-[70vh]">
            <button 
              onClick={() => setIsSetlistDrawerOpen(false)} 
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant font-bold text-xs flex items-center justify-center transition-colors border border-outline-variant/30 cursor-pointer"
            >
              ✕
            </button>
            
            <h3 className="text-[18px] font-extrabold text-on-surface tracking-tight mb-1">Your Active Plans</h3>
            <p className="text-[12px] text-on-surface-variant mb-4 font-bold">Select an assigned event to enter the cockpit.</p>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
              {assignedSetlists.length === 0 && (
                <div className="text-center py-12 flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined text-[32px] text-outline">event_busy</span>
                  <span className="text-on-surface-variant text-[12px] font-bold">No active assignments found.</span>
                </div>
              )}
              {assignedSetlists.map((sl, i) => (
                <button 
                  key={i} 
                  onClick={() => { setIsSetlistDrawerOpen(false); router.push(`/setlists/${sl.setlistId}/live`); }} 
                  className="p-4 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-left flex flex-col gap-1 transition-colors active:scale-[0.98] cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.6)]"></span>
                    <span className="font-extrabold text-[15px] text-on-surface tracking-tight group-hover:text-primary transition-colors">{sl.eventTitle}</span>
                  </div>
                  <span className="text-[12px] font-bold text-on-surface-variant ml-3.5">{sl.setlistName}</span>
                  <span className="text-[10px] font-black text-outline uppercase tracking-widest ml-3.5 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                    {new Date(sl.eventDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT MODAL */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-surface-container rounded-xl md:rounded-[1.5rem] shadow-2xl border border-outline-variant w-full max-w-2xl p-4 relative grid grid-cols-1 md:grid-cols-2 gap-4 animate-in zoom-in-95 duration-350 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              type="button" 
              onClick={() => setIsAccountModalOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-bold border border-outline-variant flex items-center justify-center hover:text-on-surface hover:bg-surface-bright transition-colors z-50 cursor-pointer"
            >
              ✕
            </button>

            {!activeProfile ? (
              <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-20 gap-4">
                <span className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></span>
                <span className="text-on-surface-variant font-label-sm uppercase tracking-widest">Loading Account...</span>
              </div>
            ) : (
              <>
                <div className="space-y-5 border-b md:border-b-0 md:border-r pb-6 md:pb-0 md:pr-6 border-outline-variant/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-4">
                      {activeProfile.avatar_url ? (
                        <img src={activeProfile.avatar_url} className="w-16 h-16 rounded-2xl object-cover border border-outline-variant" alt="" />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-primary text-on-primary text-xl font-black flex items-center justify-center shadow-[0_0_16px_rgba(37,99,235,0.3)]">
                          {activeProfile.full_name?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-black text-on-surface tracking-tight flex items-center gap-1.5">
                          {activeProfile.full_name}
                          {simulatedRole !== "none" && <span className="bg-amber-500/20 border border-amber-500/40 text-amber-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">SIM</span>}
                        </h3>
                        <p className="text-xs text-on-surface-variant font-bold mt-0.5">{activeProfile.email}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-6">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block">Qualified Skill Teams</label>
                      <div className="flex flex-wrap gap-1.5">
                        {activeProfile.ministries.map(m => (
                          <span key={m} className="px-3 py-1 bg-surface-container-high border border-outline-variant/50 font-extrabold text-[11px] text-on-surface rounded-full">{m}</span>
                        ))}
                        {activeProfile.ministries.length === 0 && <span className="text-xs italic text-on-surface-variant">No special teams mapped.</span>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-outline-variant/30 mt-auto">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        Current Branch
                      </label>
                      {userTeamId && (
                        <button
                          onClick={handleCopyJoinCode}
                          className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest hover:text-secondary transition-colors cursor-pointer"
                        >
                          {copyText}
                        </button>
                      )}
                    </div>
                    
                    {!userTeamId ? (
                      <div className="bg-surface-container-high border border-outline-variant rounded-xl p-1.5 flex gap-2 shadow-inner">
                        <input
                          type="text"
                          value={modalJoinCode}
                          onChange={(e) => setModalJoinCode(e.target.value)}
                          placeholder="Enter Church ID..."
                          className="flex-1 bg-surface border border-outline-variant/50 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider text-on-surface focus:outline-none focus:border-primary transition-all"
                          maxLength={10}
                        />
                        <button
                          onClick={handleJoinFromProfile}
                          disabled={isJoining || modalJoinCode.trim().length < 10}
                          className="px-4 bg-primary hover:bg-primary/80 disabled:bg-surface-container-highest disabled:text-outline-variant disabled:cursor-not-allowed text-on-primary text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer"
                        >
                          {isJoining ? "..." : "Join"}
                        </button>
                      </div>
                    ) : secondaryTeamIds && secondaryTeamIds.length > 0 ? (
                      <select 
                        value={userTeamId || ""}
                        onChange={(e) => switchWorkspace(e.target.value)}
                        className="w-full bg-primary-container border border-primary/30 rounded-xl px-3 py-2 text-xs font-black text-on-primary-container outline-none focus:border-primary cursor-pointer shadow-sm transition-all hover:bg-primary-container/80"
                      >
                        <option value={primaryTeamId || ""}>👑 Primary ({teamNamesMap[primaryTeamId || ""] || "Mother Church"})</option>
                        {secondaryTeamIds.map(id => (
                          <option key={id} value={id}>🌐 {teamNamesMap[id] || `Campus: ${id.substring(0, 8)}...`}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-3 py-2 text-xs font-black text-on-surface-variant shadow-sm cursor-not-allowed flex items-center gap-2">
                        <span className="opacity-75">👑</span> 
                        <span className="truncate">Primary: ({teamNamesMap[primaryTeamId || ""] || "Mother Church"})</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[16px] font-black text-on-surface tracking-tight flex items-center gap-1.5">
                      📅 Blockout Schedule Manager
                    </h4>
                    <p className="text-[11px] font-bold text-on-surface-variant mt-0.5">
                      Flag dates you are unavailable to serve to automatically filter yourself out of roster line-ups.
                    </p>
                  </div>

                  <form onSubmit={handleAddBlockoutDateSubmit} className="pt-2 flex flex-col items-center flex-1 justify-center">
                    <div className="bg-surface border border-outline-variant rounded-2xl p-2 w-full flex justify-center shadow-inner">
                      <DayPicker
                        mode="range"
                        selected={dateRange}
                        onSelect={setDateRange}
                        className="!m-0 text-xs font-bold font-sans text-on-surface"
                        modifiers={{ blocked: blockedDates }}
                        modifiersClassNames={{
                          selected: "bg-primary text-on-primary rounded-md shadow-md",
                          range_middle: "!bg-primary-container !text-on-primary-container !rounded-none",
                          range_start: "bg-primary text-on-primary rounded-l-md",
                          range_end: "bg-primary text-on-primary rounded-r-md",
                          today: "text-secondary font-black",
                          blocked: "text-error font-black bg-error/10 border border-error/20 line-through decoration-error", 
                        }}
                      />
                    </div>
                    
                    <button 
                      type="submit"
                      disabled={isSavingSchedule || selectedDatesStr.length === 0}
                      className={`w-full py-3 mt-4 font-black text-xs rounded-xl shadow-md uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                        isRemoving ? "bg-error text-on-error hover:bg-error/80" : "bg-surface-bright text-on-surface hover:bg-primary border border-outline-variant hover:border-primary hover:text-on-primary"
                      }`}
                    >
                      {isSavingSchedule 
                        ? "Syncing..." 
                        : isRemoving 
                          ? `Remove Block (${selectedDatesStr.length})` 
                          : dateRange?.to ? "Block Range" : "Block Date"}
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-outline-variant/30">
                    <button 
                      type="button" 
                      onClick={handleLogout}
                      className="w-full py-3 bg-error/10 border border-error/20 hover:bg-error hover:text-on-error text-error font-black text-[11px] uppercase tracking-widest rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </>
  );
}