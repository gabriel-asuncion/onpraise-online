"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useEngine } from "../app/context/EngineContext";

interface AssignedEvent {
  id: string;
  title?: string;
  event_date?: string;
  // ✅ SURGICAL FIX: Added flex-types for the Setlist ID
  setlist_id?: string; 
  setlists?: { id: string }[] | { id: string }; 
}

export default function LiveRehearsalFab() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  
  const { simulatedUserId } = useEngine();

  const [assignedEvents, setAssignedEvents] = useState<AssignedEvent[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [position, setPosition] = useState(() => ({
    x: typeof window === "undefined" ? 0 : window.innerWidth - 64,
    y: typeof window === "undefined" ? 0 : window.innerHeight - 64,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const isMovedRef = useRef(false);

  useEffect(() => {
    // ✅ SURGICAL FIX: Keep it glued to the correct corner during window resizes
    const handleResize = () => {
      setPosition((prev) => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Check if it was previously sitting on the right or bottom halves of the screen
        const snapX = prev.x > centerX ? window.innerWidth - 64 : 16;
        const snapY = prev.y > centerY ? window.innerHeight - 64 : 16;

        return { x: snapX, y: snapY };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function fetchAssignedEvents() {
      try {
        let targetUserId = simulatedUserId;

        if (!targetUserId || targetUserId === "00000000-0000-0000-0000-000000000000") {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) targetUserId = user.id;
        }

        if (!targetUserId) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("event_rosters")
          .select(`
            event_id,
            events (
              id,
              title,
              event_date,
              setlists ( id )
            )
          `)
          .eq("user_id", targetUserId);

        if (error) {
          console.error("🚨 FAB Query Error:", error.message);
          setLoading(false);
          return;
        }

        if (data) {
          const validEvents = data
            .map((row: Record<string, unknown>) => {
              const joinedKey = Object.keys(row).find(k => typeof row[k] === 'object' && row[k] !== null);
              const candidate = joinedKey ? row[joinedKey as keyof typeof row] : (row.events ?? row.event);
              const evNode = Array.isArray(candidate) ? candidate[0] : candidate;
              return evNode as AssignedEvent | null;
            })
            .filter((e): e is AssignedEvent => e !== null && e !== undefined);

          const today = new Date();
          today.setHours(0, 0, 0, 0); 

          const upcomingEvents = validEvents.filter(ev => {
            const evDateRaw = ev.event_date;
            if (!evDateRaw) return true; 
            return new Date(evDateRaw) >= today;
          });

          const uniqueEvents = Array.from(new Map(upcomingEvents.map(e => [e.id, e])).values());
          setAssignedEvents(uniqueEvents);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown event fetch error.";
        console.error("Failed to load rehearsal fab events:", message);
      } finally {
        setLoading(false);
      }
    }

    fetchAssignedEvents();
  }, [simulatedUserId]);

  if (pathname === "/" || pathname?.includes("/login") || pathname?.includes("/auth") || pathname?.includes("/live")) return null;
  if (loading || assignedEvents.length === 0) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    isMovedRef.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = Math.abs(e.clientX - dragStartPos.current.x);
    const dy = Math.abs(e.clientY - dragStartPos.current.y);
    if (dx > 3 || dy > 3) isMovedRef.current = true;
    
    if (isMovedRef.current) {
      // ✅ SURGICAL FIX: The Glass Wall applied during the drag.
      // Fab is 48px + 16px padding = 64px max boundary.
      const rawX = e.clientX - dragOffset.current.x;
      const rawY = e.clientY - dragOffset.current.y;
      
      setPosition({ 
        x: Math.min(Math.max(16, rawX), window.innerWidth - 64), 
        y: Math.min(Math.max(16, rawY), window.innerHeight - 64) 
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // ✅ SURGICAL FIX: Calculate the nearest corner based on screen quadrants
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // 48px (button size) + 16px (padding) = 64px boundaries
    const snapX = position.x < centerX ? 16 : window.innerWidth - 64;
    const snapY = position.y < centerY ? 16 : window.innerHeight - 64;

    setPosition({ x: snapX, y: snapY });
  };

  // ✅ SURGICAL FIX: The Smart Router!
  const getTargetUrl = (ev: AssignedEvent) => {
    // Automatically digs through the object to find the Setlist ID, no matter how Supabase returned it.
    // If it absolutely can't find one, it safely falls back to the Event ID to prevent a crash.
    const targetSetlistId = ev.setlist_id || (Array.isArray(ev.setlists) ? ev.setlists[0]?.id : ev.setlists?.id) || ev.id;
    return `/setlists/${targetSetlistId}/live`;
  };

  const handleFabClick = () => {
    if (isMovedRef.current) return; 

    if (assignedEvents.length === 1) {
      router.push(getTargetUrl(assignedEvents[0]));
    } else {
      setIsMenuOpen(!isMenuOpen);
    }
  };

  return (
    <div 
      // ✅ Applies a smooth glide transition ONLY when you are not actively dragging it
      className={`fixed z-[100000] select-none touch-none ${!isDragging ? "transition-all duration-300 ease-out" : ""}`}
      style={{ left: position.x, top: position.y }}
    >
      {isMenuOpen && assignedEvents.length > 1 && (
        <div className="absolute bottom-14 right-0 mb-2 bg-white border border-zinc-200 rounded-[1rem] shadow-2xl p-2 w-56 flex flex-col gap-1 animate-in zoom-in-95 origin-bottom-right">
          <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-zinc-100 mb-1">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Active Rehearsals</h4>
          </div>
          
          <div className="max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-1">
            {assignedEvents.map((ev) => {
              const displayTitle = ev.title || "Unnamed Event";
              const displayDate = ev.event_date 
                ? new Date(ev.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                : "No date set";

              return (
                <button
                  key={ev.id}
                  onPointerDown={(e) => e.stopPropagation()} 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    router.push(getTargetUrl(ev)); // ✅ Uses the smart router
                  }}
                  className="text-left px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer group border border-transparent hover:border-blue-100"
                >
                  <span className="block text-[12px] font-black text-zinc-800 group-hover:text-blue-700 leading-tight">
                    {displayTitle}
                  </span>
                  <span className="block text-[9px] font-bold text-zinc-400 mt-0.5">
                    {displayDate}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleFabClick}
        title="Live Rehearsal"
        className={`flex items-center justify-center w-[48px] h-[48px] rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.15)] transition-colors duration-200 active:scale-95 border ${
          isDragging ? "cursor-grabbing opacity-90 scale-105" : "cursor-grab"
        } ${
          isMenuOpen 
            ? "bg-zinc-900 text-white border-zinc-800" 
            : "bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
        }`}
      >
        {isMenuOpen ? (
          <span className="font-black text-lg leading-none">✕</span>
        ) : (
          <img 
            src="/assets/setlist.svg" 
            alt="Live Rehearsal" 
            // ✅ SURGICAL FIX: pointer-events-none kills the ghost drag!
            className="w-5 h-5 object-contain pointer-events-none select-none user-select-none" 
            style={{ filter: "brightness(0) invert(1)" }} 
          />
        )}
        
        {assignedEvents.length > 1 && !isMenuOpen && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[8px] font-black shadow-sm pointer-events-none">
            {assignedEvents.length}
          </div>
        )}
      </button>
    </div>
  );
}