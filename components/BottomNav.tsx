"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useEngine } from "../app/context/EngineContext";

interface AssignedSetlist {
  setlistId: string;
  setlistName: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
}

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { simulatedUserId } = useEngine();

  const [assignedSetlists, setAssignedSetlists] = useState<AssignedSetlist[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Background fetcher for the user's active assignments
  useEffect(() => {
    async function fetchAssignments() {
      if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") return;

      try {
        // 1. Get user's rosters
        const { data: rosters } = await supabase
          .from("event_rosters")
          .select("event_id")
          .eq("user_id", simulatedUserId);
          
        if (!rosters || rosters.length === 0) return;
        const eventIds = rosters.map(r => r.event_id);

        // 2. Get the associated events
        const { data: events } = await supabase
          .from("events")
          .select("id, title, event_date")
          .in("id", eventIds);
          
        if (!events || events.length === 0) return;

        // 3. Get the setlists attached to those events
        const { data: setlists } = await supabase
          .from("setlists")
          .select("id, name, event_id")
          .in("event_id", eventIds);

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

        // Optional: Filter out past events here if needed
        setAssignedSetlists(combined);
      } catch (err) {
        console.error("Failed to load navigation assignments", err);
      }
    }

    fetchAssignments();
  }, [simulatedUserId]);

  const handleSetlistClick = () => {
    if (assignedSetlists.length === 0) {
      router.push("/events"); // Fallback to all events
    } else if (assignedSetlists.length === 1) {
      // Direct fast-path to their only assignment
      router.push(`/events/${assignedSetlists[0].eventId}`);
    } else {
      // 2+ assignments -> Open the router drawer
      setIsDrawerOpen(true);
    }
  };

  const navItems = [
    { label: "Home", path: "/", icon: "home", activeCheck: pathname === "/" },
    { label: "Songs", path: "/songs", icon: "music_note", activeCheck: pathname?.includes("/songs") },
    { label: "Settings", path: "/settings", icon: "settings", activeCheck: pathname?.includes("/settings") }
  ];

  return (
    <>
      <nav className="fixed bottom-0 w-full z-[100000] pb-safe bg-surface-container-lowest/90 backdrop-blur-xl border-t border-outline-variant/20 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] select-none">
        <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
          
          <button 
            onClick={() => router.push("/")} 
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 px-2 rounded-xl transition-all cursor-pointer ${pathname === "/" ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            <span className="material-symbols-outlined text-[24px]">home</span>
            <span className="font-label-sm text-[10px] mt-0.5 tracking-wide">Home</span>
          </button>

          <button 
            onClick={() => router.push("/songs")} 
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 px-2 rounded-xl transition-all cursor-pointer ${pathname?.includes("/songs") ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            <span className="material-symbols-outlined text-[24px]">music_note</span>
            <span className="font-label-sm text-[10px] mt-0.5 tracking-wide">Songs</span>
          </button>

          {/* SMART SETLIST BUTTON WITH BADGE */}
          <button 
            onClick={handleSetlistClick} 
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 px-2 rounded-xl transition-all cursor-pointer relative ${pathname?.includes("/events") || pathname?.includes("/setlists") ? "bg-primary text-on-primary shadow-md scale-105" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            <div className="relative">
              <span className="material-symbols-outlined text-[24px]">playlist_play</span>
              {assignedSetlists.length > 1 && (
                <span className={`absolute -top-1.5 -right-2 text-[9px] font-black w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-surface-container-lowest shadow-sm ${pathname?.includes("/events") || pathname?.includes("/setlists") ? "bg-surface-container-highest text-on-surface" : "bg-error text-on-error"}`}>
                  {assignedSetlists.length}
                </span>
              )}
            </div>
            <span className="font-label-sm text-[10px] mt-0.5 tracking-wide">Setlist</span>
          </button>

          <button 
            onClick={() => router.push("/settings")} 
            className={`flex flex-col items-center justify-center min-w-[56px] h-12 px-2 rounded-xl transition-all cursor-pointer ${pathname?.includes("/settings") ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            <span className="material-symbols-outlined text-[24px]">settings</span>
            <span className="font-label-sm text-[10px] mt-0.5 tracking-wide">Settings</span>
          </button>

        </div>
      </nav>

      {/* ========================================= */}
      {/* MULTIPLE ASSIGNMENTS DRAWER               */}
      {/* ========================================= */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[200000] flex items-end justify-center pb-[80px] p-4 select-none">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />
          
          <div className="bg-surface-container-low border border-outline-variant/30 w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 flex flex-col animate-in slide-in-from-bottom-full duration-300 p-6 max-h-[70vh]">
            <button 
              onClick={() => setIsDrawerOpen(false)} 
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant font-bold text-xs flex items-center justify-center transition-colors border border-outline-variant/30 cursor-pointer"
            >
              ✕
            </button>
            
            <h3 className="text-[18px] font-extrabold text-on-surface tracking-tight mb-1">Your Active Plans</h3>
            <p className="text-[12px] text-on-surface-variant mb-4 font-bold">Select an assigned event to enter the cockpit.</p>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
              {assignedSetlists.map((sl, i) => (
                <button 
                  key={i} 
                  onClick={() => { setIsDrawerOpen(false); router.push(`/events/${sl.eventId}`); }} 
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
    </>
  );
}