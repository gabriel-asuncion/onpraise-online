"use client";

import React, { useEffect, useRef, useState } from "react";
import { SongRecord, SetlistTrackItem } from "../types/setlist";
import { useWebAudioEngine } from "../hooks/useWebAudioEngine";

interface LiveHeaderProps {
  activeSong: SongRecord | null;
  activeDisplayKey: string;
  currentDriftMs: number | null;
  localPresenceUser: any;
  isPlayingFlow: boolean;
  currentBeat: number;
  currentMeasureLength: number;
  metronomeRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  setIsSettingsModalOpen: (val: boolean) => void;
  handleToggleFlowPlaybackState: () => void;
  displayedOnlineUsers: any[];
  tracksList: SetlistTrackItem[];
  currentTrackIndex: number;
  handleUserSelectTrackBadge: (trackIdx: number) => void;
  backdropProgressRef: React.MutableRefObject<HTMLDivElement | null>;
  accentProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  isSoloMode?: boolean;
  isSimplifiedMode?: boolean;
  wakeUpAudioEngine?: () => void; 
  localClickVolume?: number; 
  metronomeSoundType?: "blip" | "bell" | "block" | "glass"; 
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  // ✅ NEW: Props for the Expanded UI section cards
  activeSectionName?: string;
  nextSectionName?: string;
  handleSyncBack?: () => void;
  showSyncBack?: boolean;
}

export function LiveHeader({
  activeSong, activeDisplayKey, currentDriftMs, localPresenceUser,
  isPlayingFlow, currentBeat, currentMeasureLength, metronomeRefs,
  setIsSettingsModalOpen, handleToggleFlowPlaybackState, displayedOnlineUsers,
  tracksList, currentTrackIndex, handleUserSelectTrackBadge,
  backdropProgressRef, accentProgressBarRef, isSoloMode = false, isSimplifiedMode = false,
  wakeUpAudioEngine, localClickVolume = 1.0, metronomeSoundType = "blip",
  scrollContainerRef, activeSectionName, nextSectionName, handleSyncBack,
  showSyncBack // ✅ Added here
}: LiveHeaderProps) {
  
  // ✅ The morphing state controllers
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);

  // ✅ Instant scroll direction detection engine
  useEffect(() => {
    const scrollEl = scrollContainerRef?.current;
    if (!scrollEl) return;

    let lastScrollY = scrollEl.scrollTop;
    
    const handleScroll = () => {
      const currentScrollY = scrollEl.scrollTop;
      
      // 1. Force visible if at the absolute top of the container
      if (currentScrollY <= 0) {
        setIsNavVisible(true);
      } 
      // 2. Instant down trigger
      else if (currentScrollY > lastScrollY) {
        setIsNavVisible(false);
      } 
      // 3. Instant up trigger
      else if (currentScrollY < lastScrollY) {
        setIsNavVisible(true);
      }
      
      lastScrollY = currentScrollY;
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef]);

  // --- AUDIO ENGINE ---
  const { playZeroLatencyAudio, fetchAndDecodeAudio } = useWebAudioEngine();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sounds = ["blip", "bell", "block", "glass"];
      sounds.forEach(snd => {
        fetchAndDecodeAudio(`/sound_files/metronome_${snd}_1.wav`, `metronome_${snd}_1`);
        fetchAndDecodeAudio(`/sound_files/metronome_${snd}_2.wav`, `metronome_${snd}_2`);
      });
    }
  }, [fetchAndDecodeAudio]);

  const liveVolumeRef = useRef(localClickVolume);
  useEffect(() => { liveVolumeRef.current = localClickVolume; }, [localClickVolume]);

  const liveSoundTypeRef = useRef(metronomeSoundType);
  useEffect(() => { liveSoundTypeRef.current = metronomeSoundType; }, [metronomeSoundType]);

  useEffect(() => {
    if (!isPlayingFlow) return;
    const observers: MutationObserver[] = [];
    metronomeRefs.current.forEach((node, index) => {
      if (!node) return;
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === "class") {
            const newClasses = (mutation.target as HTMLElement).className || "";
            const oldClasses = mutation.oldValue || "";
            const isNowActive = newClasses.includes("text-white");
            const wasActive = oldClasses.includes("text-white");

            if (isNowActive && !wasActive) {
              const currentSound = liveSoundTypeRef.current;
              const soundKey = index === 0 ? `metronome_${currentSound}_1` : `metronome_${currentSound}_2`;
              playZeroLatencyAudio(soundKey, liveVolumeRef.current);
            }
          }
        });
      });
      observer.observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ["class"] });
      observers.push(observer);
    });
    return () => observers.forEach(obs => obs.disconnect());
  }, [isPlayingFlow, metronomeRefs, playZeroLatencyAudio]);

  return (
    <>
      {/* 
        ✅ THE MORPHING BOTTOM SHEET 
      */}
      <div 
        // 1. ✅ SURGICAL FIX: Bumped z-index to 150000 to cleanly cover the global nav
        // 2. ✅ SURGICAL FIX: Added premium iOS-style cubic-bezier easing for buttery smoothness
        className={`fixed z-[150000] left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] 
          transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col overflow-hidden ${
          isExpanded 
            ? "top-0 bottom-0 rounded-none" 
            : "h-16 rounded-t-2xl sm:rounded-t-3xl max-w-5xl mx-auto border-x border-t border-zinc-200"
        }`}
        style={{
          // 3. ✅ SURGICAL FIX: Ignore scroll and lock to bottom (0px) when playing!
          bottom: isExpanded 
            ? '0px' 
            : (isPlayingFlow 
                ? '0px' 
                : (isNavVisible ? 'calc(4rem + env(safe-area-inset-bottom, 0px))' : '0px')
              )
        }}
      >
        {/* ========================================= */}
        {/* DOCKED VIEW (Only visible when collapsed) */}
        {/* ========================================= */}
        <div 
          className={`flex items-center justify-between px-5 h-16 w-full shrink-0 cursor-pointer transition-opacity duration-300 ${isExpanded ? "opacity-0 hidden" : "opacity-100"}`}
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex flex-col flex-1 overflow-hidden">
            <h3 className="font-black text-zinc-950 truncate text-[15px] leading-tight">
              {activeSong?.title || "Loading..."}
            </h3>
            {!isSoloMode && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="flex -space-x-1 overflow-hidden">
                  {displayedOnlineUsers.slice(0, 3).map((user, idx) => (
                    <div key={idx} className="w-3.5 h-3.5 rounded-full ring-1 ring-white bg-blue-600 flex items-center justify-center overflow-hidden">
                       {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[5px] text-white font-bold">{user.initials}</span>}
                    </div>
                  ))}
                </div>
                <span className="text-[9px] font-bold text-zinc-400 lowercase">online now</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            
            {/* ✅ SURGICAL FIX: The button now appears exactly when the scroll engine says so! */}
            {showSyncBack && (
              <button 
                onClick={(e) => {
                  e.stopPropagation(); 
                  if (handleSyncBack) handleSyncBack();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors rounded-full font-black text-[10px] uppercase tracking-widest shadow-sm animate-in zoom-in-95 fade-in duration-200"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Sync Back
              </button>
            )}

            <button 
              onClick={(e) => {
                e.stopPropagation(); // Prevents the player from expanding
                if (wakeUpAudioEngine) wakeUpAudioEngine();
                handleToggleFlowPlaybackState();
              }}
              className="w-10 h-10 flex items-center justify-center shrink-0"
            >
              {isPlayingFlow ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-900"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-900"><path d="M6 4l15 8-15 8z"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* ========================================= */}
        {/* EXPANDED VIEW (Only visible when expanded) */}
        {/* ========================================= */}
        <div className={`flex flex-col h-full w-full p-5 sm:p-6 transition-opacity duration-300 delay-75 ${isExpanded ? "opacity-100" : "opacity-0 hidden"}`}>
          
          {/* Top Bar: Minimize Chevron, Metronome, Settings */}
          <div className="flex items-center justify-between w-full shrink-0 mb-6">
            <button onClick={() => setIsExpanded(false)} className="w-10 h-10 flex items-center justify-center bg-zinc-50 rounded-full hover:bg-zinc-100 transition-colors border border-zinc-200/60 shadow-sm active:scale-95">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            
            {/* Metronome Visualizer */}
            <div className="flex items-center gap-1.5 bg-zinc-50/80 p-1.5 rounded-[14px] border border-zinc-200/80 shadow-inner">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((beatNum) => (
                  <div 
                    key={beatNum} 
                    ref={(el) => { metronomeRefs.current[beatNum - 1] = el; }} 
                    style={{ display: beatNum <= currentMeasureLength ? 'flex' : 'none' }} 
                    className={`w-8 h-8 items-center justify-center font-mono font-black text-sm rounded-lg border transition-all duration-75 select-none ${
                      isPlayingFlow && currentBeat === beatNum 
                        ? beatNum === 1 
                          ? "bg-[#faba37] text-white border-[#e0a22b]" 
                          : "bg-blue-600 text-white border-blue-500" 
                        : "bg-white text-zinc-200 border-zinc-100 shadow-sm"
                    }`}
                  >
                    {beatNum}
                  </div>
                ))}
            </div>
            
            <button onClick={() => setIsSettingsModalOpen(true)} className="w-10 h-10 flex items-center justify-center bg-zinc-50 rounded-full hover:bg-zinc-100 transition-colors border border-zinc-200/60 shadow-sm active:scale-95">
              <img src="/assets/settings.svg" alt="Settings" className="w-4 h-4 opacity-60" />
            </button>
          </div>

          {/* Current / Next Section Display Cards */}
          <div className="flex gap-4 mb-6 shrink-0 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-3xl p-4 border border-zinc-100">
             
             {/* Current Section */}
             <div className="flex-1 flex flex-col relative pb-2 border-b-2 border-blue-600">
               <span className="text-[11px] font-black text-zinc-950 capitalize tracking-wide mb-2.5">Current</span>
               <div className="flex items-center gap-2">
                 <span className="bg-blue-600 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full uppercase tracking-tighter shrink-0 shadow-sm">
                   {activeSectionName?.substring(0, 2) || "In"}
                 </span>
                 <span className="font-bold text-blue-600 text-sm tracking-tight truncate uppercase">
                   {activeSectionName || "---"}
                 </span>
               </div>
             </div>

             {/* Next Section */}
             <div className="flex-1 flex flex-col relative pb-2">
               <span className="text-[11px] font-black text-zinc-950 capitalize tracking-wide mb-2.5">Next</span>
               <div className="flex items-center gap-2">
                 <span className="bg-blue-600/10 text-blue-600 border border-blue-600/20 text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full uppercase tracking-tighter shrink-0">
                   {nextSectionName?.substring(0, 2) || "In"}
                 </span>
                 <span className="font-bold text-blue-600 text-sm tracking-tight truncate uppercase">
                   {nextSectionName || "---"}
                 </span>
               </div>
             </div>

          </div>

          {/* Vertical Tracklist */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pb-4">
            {(() => {
              // 1. Group tracks contiguously while preserving their global index
              const groupedTracks: { name: string, color: string, tracks: { track: SetlistTrackItem, originalIndex: number }[] }[] = [];
              let currentGroup: any = null;
              
              tracksList.forEach((track, originalIndex) => {
                // ✅ Reads the exact name and color saved from the Events page
                const groupName = (track as any).group_name || ""; 
                const groupColor = (track as any).group_color || "zinc"; 
                
                // If it's a new group name, create a new bounding box
                if (!currentGroup || currentGroup.name !== groupName) {
                  currentGroup = { name: groupName, color: groupColor, tracks: [] };
                  groupedTracks.push(currentGroup);
                }
                currentGroup.tracks.push({ track, originalIndex });
              });

              // 2. Render the color-coded bounding boxes dynamically
              return groupedTracks.map((group, gIdx) => {
                const hasName = Boolean(group.name);
                
                // Dynamic Tailwind Map based on the exact palettes in EventCockpitPage
                const colorMaps: Record<string, string> = {
                  zinc: "border-zinc-200/80 bg-zinc-50/40 text-zinc-700",
                  blue: "border-blue-200/80 bg-blue-50/40 text-blue-700",
                  emerald: "border-emerald-200/80 bg-emerald-50/40 text-emerald-700",
                  purple: "border-purple-200/80 bg-purple-50/40 text-purple-700",
                  amber: "border-amber-200/80 bg-amber-50/40 text-amber-700",
                  rose: "border-rose-200/80 bg-rose-50/40 text-rose-700",
                  indigo: "border-indigo-200/80 bg-indigo-50/40 text-indigo-700",
                  cyan: "border-cyan-200/80 bg-cyan-50/40 text-cyan-700",
                };
                
                // Fallback to zinc if the color is missing
                const activeColorString = colorMaps[group.color] || colorMaps.zinc;

                return (
                  <div 
                    key={gIdx} 
                    className={hasName ? `rounded-[28px] border p-2 flex flex-col gap-2 ${activeColorString.split(" text-")[0]}` : `flex flex-col gap-2`}
                  >
                    {hasName && (
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 pt-2 pb-1 ${activeColorString.split(" ")[2]}`}>
                        {group.name}
                      </span>
                    )}
                    
                    {group.tracks.map(({ track, originalIndex }) => {
                      const isSelected = currentTrackIndex === originalIndex;
                      const keySig = track.custom_key || track.songs?.original_key || "-";
                      
                      return (
                        <button 
                          key={track.id}
                          onClick={() => handleUserSelectTrackBadge(originalIndex)}
                          className={`px-4 py-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all outline-none active:scale-[0.98] ${
                            isSelected 
                              ? "border-blue-500 bg-white shadow-[0_0_0_1px_rgba(59,130,246,1)] relative overflow-hidden" 
                              : "border-zinc-200/80 bg-white hover:border-zinc-300 shadow-sm"
                          }`}
                        >
                          {isSelected && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-red-100 rounded-l-full opacity-60" />}
                          
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full bg-zinc-100 text-[9px] font-black text-zinc-500">
                              {keySig.charAt(0)}
                            </span>
                            <span className="text-[9px] font-black bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full tracking-widest uppercase">
                              {track.songs?.tempo || "--"} BPM
                            </span>
                          </div>
                          <span className={`font-black text-[16px] tracking-tight ${isSelected ? "text-zinc-950" : "text-zinc-800"}`}>
                            {track.songs?.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>

          {/* Massive Master Play Button */}
          <div className="mt-auto shrink-0 flex justify-center pb-safe pt-2">
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (wakeUpAudioEngine) wakeUpAudioEngine();
                  handleToggleFlowPlaybackState();
                }}
                className="w-16 h-16 sm:w-18 sm:h-18 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-[0_8px_24px_rgba(37,99,235,0.4)] transition-transform active:scale-90"
             >
               {isPlayingFlow ? (
                 <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
               ) : (
                 <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><path d="M6 4l15 8-15 8z"/></svg>
               )}
             </button>
          </div>

        </div>
      </div>
    </>
  );
}