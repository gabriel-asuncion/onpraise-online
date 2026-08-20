"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import Link from "next/link"; 
import { useEngine } from "../context/EngineContext";
import { getUserTeam, getAllProfiles } from "../../utils/supabase/actions";
import GlobalLoader from '../../components/GlobalLoader';

interface EventItem { 
  id: string; 
  title: string; 
  event_date: string; 
  description: string; 
  service_type?: string; 
}

interface TeamMemberRow {
  id: string;
  event_id: string;
  user_id: string;
  role: string;
}

interface DBProfile {
  id: string;
  full_name: string;
}

const SERVICE_TYPE_PRESETS = ["Midweek Service", "Divine Service", "Camp", "Concert", "Fellowship"];

export default function EventsManagerPage() {
  const supabase = createClient();
  const router = useRouter();
  
  const { activeRole, userTeamId } = useEngine();

  const [team, setTeam] = useState<any>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [rosterAllocations, setRosterAllocations] = useState<TeamMemberRow[]>([]);
  const [allProfiles, setAllProfiles] = useState<DBProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Accordion Toggle Interface Controller State
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Advanced Matrix Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterServiceType, setFilterServiceType] = useState("All");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterParticipantUserId, setFilterParticipantUserId] = useState("All");
  const [filterPlanStatus, setFilterPlanStatus] = useState("Active");

  // Create Event Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // Outputs exactly "2026-08-20" today
  });
  const [eventServiceType, setEventServiceType] = useState("Divine Service");
  const [eventDesc, setEventDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ SURGICAL ADDITION: Unsaved Changes Modal State
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const currentSystemDateString = useMemo(() => {
    return new Date().toISOString().split("T")[0]; 
  }, []);

  const isAnyFilterActive = useMemo(() => {
    return (
      searchQuery.trim() !== "" ||
      filterServiceType !== "All" ||
      filterStartDate !== "" ||
      filterEndDate !== "" ||
      filterParticipantUserId !== "All" ||
      filterPlanStatus !== "All"
    );
  }, [searchQuery, filterServiceType, filterStartDate, filterEndDate, filterParticipantUserId, filterPlanStatus]);

  async function loadEventsData() {
    try {
      const userTeam = await getUserTeam();
      setTeam(userTeam || { id: "00000000-0000-0000-0000-000000000000", name: "OnPraise Ministry Team" });

      let query = supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });

      if (userTeamId) {
        query = query.eq("team_id", userTeamId); 
      }

      const { data: records, error } = await query;
      if (!error && records) setEvents(records);

      const { data: globalRoster } = await supabase
        .from("team_members")
        .select("id, event_id, user_id, role");
      if (globalRoster) setRosterAllocations(globalRoster as TeamMemberRow[]);

      const profilesData = await getAllProfiles();
      if (profilesData) setAllProfiles(profilesData as DBProfile[]);

    } catch (err) {
      console.error("Failed to aggregate layout nodes:", err);
    } finally {
      setLoading(false);
    }
  }

  // ✅ SURGICAL ADDITION: Safely handle modal closure
  function handleCloseModalRequest() {
    // Check if any form fields have been touched/modified
    if (eventTitle.trim() !== "" || eventDesc.trim() !== "") {
      setShowExitConfirm(true);
    } else {
      setIsCreateModalOpen(false);
    }
  }

  // ✅ SURGICAL ADDITION: Force close discarding changes
  function forceCloseDiscardingChanges() {
    setShowExitConfirm(false);
    setIsCreateModalOpen(false);
    setEventTitle("");
    setEventDesc("");
    setEventServiceType("Divine Service");
    setEventDate("2026-06-12");
  }

  async function handleCreateEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    setIsSubmitting(true);

    const payload: any = {
      title: eventTitle.trim(),
      event_date: eventDate,
      service_type: eventServiceType, 
      description: eventDesc.trim() || "Worship gathering event plan block."
    };

    if (userTeamId) {
      payload.team_id = userTeamId;
    }

    try {
      const { data, error } = await supabase
        .from("events")
        .insert(payload)
        .select()
        .maybeSingle();

      if (error) {
        alert(`Supabase DB Error: ${error.message}`);
        return;
      }

      if (data) {
        setIsCreateModalOpen(false);
        setEventTitle("");
        setEventDesc("");
        setEventServiceType("Divine Service");
        await loadEventsData();
        router.push(`/events/${data.id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    loadEventsData();
  }, [userTeamId]);

  const parsedFilteredEventsGrid = events.filter(evt => {
    const cleanEvtDate = evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12";
    const isPlanExpired = cleanEvtDate < currentSystemDateString;
    const computedStatus = isPlanExpired ? "Inactive" : "Active";

    if (searchQuery && !evt.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterServiceType !== "All" && evt.service_type !== filterServiceType) return false;
    if (filterStartDate && cleanEvtDate < filterStartDate) return false;
    if (filterEndDate && cleanEvtDate > filterEndDate) return false;

    if (filterParticipantUserId !== "All") {
      const isUserAssignedToThisEvent = rosterAllocations.some(
        member => member.event_id === evt.id && member.user_id === filterParticipantUserId
      );
      if (!isUserAssignedToThisEvent) return false;
    }

    if (filterPlanStatus !== "All" && computedStatus !== filterPlanStatus) return false;

    return true;
  });

  function handleResetAllFiltersTrigger() {
    setSearchQuery("");
    setFilterServiceType("All");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterParticipantUserId("All");
    setFilterPlanStatus("Active");
  }


  if (loading) {
  return <GlobalLoader message="LOADING EVENTS LIST..." />;
}

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-screen w-full flex flex-col bg-[#f8f9fa] relative animate-in fade-in duration-200">
      
      <header className="sticky top-0 z-[50] w-full flex-shrink-0 bg-white border-b border-zinc-200 shadow-sm supports-[backdrop-filter]:bg-white/95 supports-[backdrop-filter]:backdrop-blur-md">
        <div className="max-w-7xl mx-auto w-full">
          
          <div className="flex justify-between items-center px-4 md:px-8 py-4 md:py-5">
            <h1 className="text-2xl md:text-3xl font-black text-zinc-950 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
              Events
            </h1>
            
            {activeRole === "admin" && (
              <div className="flex items-center gap-2 md:gap-3">
                <Link
                  href="/events/create-team"
                  className="px-4 py-2 md:px-5 md:py-2.5 bg-white border border-zinc-200 hover:border-blue-500 hover:text-blue-600 text-zinc-500 font-black text-[10px] md:text-xs rounded-xl shadow-sm transition-all active:scale-95 uppercase tracking-wider shrink-0 flex items-center gap-1.5"
                >
                  <span className="text-sm leading-none">🏛️</span> Create Team
                </Link>

                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-2 md:px-5 md:py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] md:text-xs rounded-xl shadow-md transition-all active:scale-95 uppercase tracking-wider shrink-0 flex items-center gap-1"
                >
                  <span className="text-sm leading-none">+</span> Add Event
                </button>
              </div>
            )}
          </div>

          <div className="px-4 md:px-8 pb-4">
            <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl overflow-hidden select-none transition-all">
              <button
                type="button"
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                className="w-full px-4 py-3 flex items-center justify-between font-bold text-zinc-700 hover:bg-zinc-100 transition-colors text-xs uppercase tracking-wider outline-none"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">🎛️</span>
                  <span>Search Filters</span>
                  {isAnyFilterActive && (
                    <span className="bg-blue-100/50 text-blue-600 border border-blue-200/50 text-[9px] font-black tracking-wide px-2 py-0.5 rounded-md flex items-center gap-1">
                      Active <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isAnyFilterActive && (
                    <span 
                      onClick={(e) => { e.stopPropagation(); handleResetAllFiltersTrigger(); }}
                      className="text-[10px] font-black text-zinc-400 hover:text-red-500 cursor-pointer lowercase normal-case bg-white border border-zinc-200 px-2 py-1 rounded-md transition-colors shadow-sm"
                    >
                      Clear all
                    </span>
                  )}
                  <span className="text-zinc-400 text-[10px] font-black transition-all">
                    {isFiltersOpen ? "▲" : "▼"}
                  </span>
                </div>
              </button>

              {isFiltersOpen && (
                <div className="p-4 pt-2 border-t border-zinc-200/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end text-xs font-bold animate-in slide-in-from-top-3 duration-200 bg-white">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Search Title</label>
                    <input 
                      type="text" 
                      placeholder="Type index query keyword..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-50 border rounded-xl px-3.5 py-2.5 font-bold text-zinc-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Service Preset</label>
                    <select 
                      value={filterServiceType} 
                      onChange={e => setFilterServiceType(e.target.value)}
                      className="w-full bg-zinc-50 border rounded-xl px-3 py-2.5 font-bold text-zinc-700 outline-none cursor-pointer focus:border-blue-500 transition-all shadow-inner text-xs h-[38px]"
                    >
                      <option value="All">All Service Presets</option>
                      {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5 lg:col-span-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block mb-1.5">Start Date</label>
                      <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-2 py-2 text-[11px] font-bold text-zinc-700 outline-none h-[38px] shadow-inner" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block mb-1.5">End Date</label>
                      <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-2 py-2 text-[11px] font-bold text-zinc-700 outline-none h-[38px] shadow-inner" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Assigned Participant</label>
                    <select 
                      value={filterParticipantUserId} 
                      onChange={e => setFilterParticipantUserId(e.target.value)}
                      className="w-full bg-zinc-50 border rounded-xl px-3 py-2.5 font-bold text-zinc-700 outline-none cursor-pointer focus:border-blue-500 transition-all shadow-inner text-xs h-[38px]"
                    >
                      <option value="All">All Team Volunteers</option>
                      {allProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name || "Worshipper Handle Node"}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Plan Allocation Status</label>
                    <div className="grid grid-cols-3 gap-1 bg-zinc-100 p-1 rounded-xl border h-[38px] items-center">
                      {(["All", "Active", "Inactive"] as const).map((statusOption) => (
                        <button
                          key={statusOption}
                          type="button"
                          onClick={() => setFilterPlanStatus(statusOption)}
                          className={`py-1.5 text-center text-[10px] font-black rounded-lg uppercase tracking-tight transition-all ${
                            filterPlanStatus === statusOption ? "bg-white text-zinc-950 border shadow-sm font-black" : "text-zinc-400 hover:text-zinc-600"
                          }`}
                        >
                          {statusOption}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar pb-24 md:pb-8 w-full">
        <div className="max-w-7xl w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 content-start">
            {parsedFilteredEventsGrid.map((evt) => {
              const cleanEvtDate = evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12";
              const isPlanExpired = cleanEvtDate < currentSystemDateString;

              return (
                <div 
                  key={evt.id}
                  onClick={() => router.push(`/events/${evt.id}`)}
                  className={`bg-white border border-zinc-200 p-5 rounded-2xl hover:border-blue-500 hover:shadow-md transition-all cursor-pointer shadow-sm flex flex-col justify-between min-h-[165px] group relative overflow-hidden ${
                    isPlanExpired ? "opacity-75 bg-zinc-50/50 hover:bg-zinc-50" : ""
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {isPlanExpired ? (
                        <span className="bg-zinc-100 border border-zinc-200 text-zinc-500 font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full block w-fit">
                          🚫 Inactive Plan
                        </span>
                      ) : (
                        <span className="bg-blue-50 border border-blue-100 text-blue-600 font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full block w-fit shadow-sm">
                          ⚡ Active Plan Workspace
                        </span>
                      )}

                      {evt.service_type && (
                        <span className="bg-zinc-50 border text-zinc-600 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wide block w-fit">
                          {evt.service_type}
                        </span>
                      )}
                    </div>
                    
                    <h4 className="font-bold text-lg text-zinc-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors" style={{ fontFamily: "Georgia, serif" }}>
                      {evt.title}
                    </h4>
                    {evt.description && <p className="text-xs font-medium text-zinc-400 mt-2 line-clamp-2 leading-relaxed">{evt.description}</p>}
                  </div>
                  
                  <div className="pt-4 border-t border-zinc-100 flex justify-between items-center text-[11px] font-bold text-zinc-400 mt-4 select-none">
                    <span className={`${isPlanExpired ? "text-zinc-400 line-through" : "text-zinc-500 font-black tracking-tight"}`}>
                      📅 {cleanEvtDate}
                    </span>
                  </div>
                </div>
              );
            })}

            {parsedFilteredEventsGrid.length === 0 && (
              <div className="col-span-full py-16 text-center text-xs font-semibold italic text-zinc-400 select-none border border-dashed border-zinc-200 rounded-2xl bg-white shadow-sm w-full">
                No Event Coordinates Match Filters. Try resetting your query parameters.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- CREATE NEW EVENT DIALOG MODAL PANEL --- */}
      {isCreateModalOpen && (
        // ✅ SURGICAL ADDITION: Backdrop onClick triggers handleCloseModalRequest
        <div 
          className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[140000] flex items-center justify-center p-4"
          onClick={handleCloseModalRequest}
        >
          {/* ✅ SURGICAL ADDITION: onClick={(e) => e.stopPropagation()} prevents form clicks from bubbling to backdrop */}
          <form 
            onSubmit={handleCreateEventSubmit} 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 relative flex flex-col space-y-4 animate-in zoom-in-95 duration-150"
          >
            <button type="button" onClick={handleCloseModalRequest} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 font-bold text-xs flex items-center justify-center transition-colors hover:bg-zinc-200">✕</button>
            <h3 className="text-xl font-black text-zinc-900 tracking-tight">Create Event Block</h3>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Event Title</label>
              <input type="text" required placeholder="e.g., June - week#1" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Type of Service Preset</label>
              <select 
                value={eventServiceType} 
                onChange={(e) => setEventServiceType(e.target.value)} 
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-colors cursor-pointer"
              >
                {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Target Service Date</label>
              <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Summary Description</label>
              <textarea placeholder="Details text notes parameters..." value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none h-20 resize-none focus:border-blue-500 focus:bg-white transition-colors custom-scrollbar" />
            </div>
            
            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 disabled:opacity-50 mt-2">
              {isSubmitting ? "Creating..." : "Instantiate Event Block"}
            </button>
          </form>
        </div>
      )}

      {/* ✅ SURGICAL ADDITION: Unsaved Changes Warning Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border border-zinc-200">
            <h3 className="text-lg font-black text-zinc-900 mb-2 tracking-tight">Discard changes?</h3>
            <p className="text-xs text-zinc-500 font-medium mb-6">You have unsaved details in your event block. Are you sure you want to close and lose this data?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors"
              >
                Keep Editing
              </button>
              <button 
                onClick={forceCloseDiscardingChanges}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}