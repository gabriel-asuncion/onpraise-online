"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SongRecord, SetlistTrackItem } from "../types/setlist";

interface LiveHeaderProps {
  activeSong: SongRecord | null;
  activeDisplayKey?: string;
  currentDriftMs?: number | null;
  localPresenceUser?: any;
  isPlayingFlow: boolean;
  currentBeat: number;
  currentMeasureLength: number;
  metronomeRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
  setIsSettingsModalOpen?: (val: boolean) => void;
  handleToggleFlowPlaybackState: () => void;
  displayedOnlineUsers?: any[];
  tracksList?: SetlistTrackItem[];
  currentTrackIndex?: number;
  handleUserSelectTrackBadge?: (idx: number) => void;
  backdropProgressRef?: React.MutableRefObject<HTMLDivElement | null>;
  accentProgressBarRef?: React.MutableRefObject<HTMLDivElement | null>;
  isSoloMode?: boolean;
  isSimplifiedMode?: boolean;
  wakeUpAudioEngine?: () => void; 
  localClickVolume?: number; 
  metronomeSoundType?: string; 
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  activeSectionName?: string;
  nextSectionName?: string;
  handleSyncBack?: () => void;
  showSyncBack?: boolean;
}

export function LiveHeader({
  activeSong, activeDisplayKey, localPresenceUser,
  isPlayingFlow, currentBeat, currentMeasureLength, metronomeRefs,
  setIsSettingsModalOpen, handleToggleFlowPlaybackState, displayedOnlineUsers = [],
  tracksList = [], currentTrackIndex = 0, handleUserSelectTrackBadge,
  accentProgressBarRef, isSoloMode = false,
  wakeUpAudioEngine, 
  scrollContainerRef, activeSectionName, nextSectionName, handleSyncBack,
  showSyncBack
}: LiveHeaderProps) {
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  
  // React Portal Mounting State
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Instant scroll direction detection engine for desktop hiding
  useEffect(() => {
    const scrollEl = scrollContainerRef?.current;
    if (!scrollEl) return;

    let lastScrollY = scrollEl.scrollTop;
    
    const handleScroll = () => {
      const currentScrollY = scrollEl.scrollTop;
      if (currentScrollY <= 0) setIsNavVisible(true);
      else if (currentScrollY > lastScrollY) setIsNavVisible(false);
      else if (currentScrollY < lastScrollY) setIsNavVisible(true);
      lastScrollY = currentScrollY;
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef]);

  const PlayIcon = () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white ml-1">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
  
  const PauseIcon = () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );

  // =========================================
  // 1. COLLAPSED VIEW (Mobile Docked Player)
  // =========================================
  const CollapsedMobilePlayer = () => (
    <div 
      onClick={() => setIsExpanded(true)}
      className="flex items-center justify-between w-full h-[64px] px-4 cursor-pointer bg-[#18181A] rounded-t-2xl shadow-lg transition-transform active:scale-[0.99] border-t border-outline-variant/10"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-md bg-surface-container flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          {activeSong?.youtube_url ? (
            <img 
              src={`https://img.youtube.com/vi/${activeSong.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1]}/default.jpg`} 
              alt="thumbnail" 
              className="w-full h-full object-cover opacity-90" 
            />
          ) : (
            <span className="material-symbols-outlined text-outline-variant text-[20px]">music_note</span>
          )}
        </div>
        
        <div className="flex flex-col min-w-0 pr-2 pb-0.5">
          <h2 className="font-extrabold text-[14px] text-white truncate tracking-tight leading-tight">
            {activeSong?.title || "No Track Selected"}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            {!isSoloMode && displayedOnlineUsers.length > 0 && (
               <div className="flex items-center gap-1 shrink-0">
                  <div className="w-3.5 h-3.5 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
                    {displayedOnlineUsers[0].avatar ? <img src={displayedOnlineUsers[0].avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[5px] text-white font-bold">{displayedOnlineUsers[0].initials}</span>}
                  </div>
                  <span className="text-[9px] font-bold text-zinc-400 lowercase">online</span>
               </div>
            )}
            <span className="text-[11px] font-semibold text-zinc-400 truncate">
              {activeSong?.artist || "Unknown"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {showSyncBack && handleSyncBack && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleSyncBack(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 active:scale-95 transition-all animate-in fade-in"
          >
            <span className="w-1.5 h-1.5 rounded-full border border-amber-500 bg-transparent"></span>
            <span className="font-black text-[9px] uppercase tracking-widest">Sync Back</span>
          </button>
        )}
        <button 
          onClick={(e) => {
            e.stopPropagation(); 
            if (wakeUpAudioEngine) wakeUpAudioEngine();
            handleToggleFlowPlaybackState();
          }}
          className={`w-10 h-10 flex items-center justify-center shrink-0 transition-transform active:scale-90 ${isPlayingFlow ? "text-primary" : "text-white"}`}
        >
          {isPlayingFlow ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </div>
  );

  // =========================================
  // 2. EXPANDED VIEW (Mobile Full Screen)
  // =========================================
  const ExpandedMobilePlayer = () => (
    <div className="fixed inset-0 z-[200000] bg-surface flex flex-col p-6 animate-in slide-in-from-bottom-full duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
      <div className="flex items-center justify-between w-full shrink-0 mb-6 pt-safe">
        <button onClick={() => setIsExpanded(false)} className="w-10 h-10 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-bright transition-colors shadow-sm active:scale-95 cursor-pointer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        
        <div className="flex items-center gap-1.5 bg-surface-container p-1.5 rounded-[14px] shadow-inner">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((beatNum) => (
              <div 
                key={beatNum} 
                ref={(el) => { if (metronomeRefs?.current) metronomeRefs.current[beatNum - 1] = el; }} 
                style={{ display: beatNum <= currentMeasureLength ? 'flex' : 'none' }} 
                className={`w-8 h-8 items-center justify-center font-mono font-black text-sm rounded-lg border transition-all duration-75 select-none ${
                  isPlayingFlow && currentBeat === beatNum 
                    ? beatNum === 1 
                      ? "bg-[#faba37] text-white border-[#e0a22b]" 
                      : "bg-primary text-on-primary border-primary/50" 
                    : "bg-surface-container-high text-on-surface-variant border-outline-variant/30"
                }`}
              >
                {beatNum}
              </div>
            ))}
        </div>
        
        <button onClick={() => setIsSettingsModalOpen?.(true)} className="w-10 h-10 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-bright transition-colors shadow-sm active:scale-95 cursor-pointer border border-outline-variant/30">
          <span className="material-symbols-outlined text-[20px] opacity-70">settings</span>
        </button>
      </div>

      <div className="flex gap-4 mb-6 shrink-0 bg-surface-container-low shadow-md rounded-3xl p-4 border border-outline-variant/20">
         <div className="flex-1 flex flex-col relative pb-2 border-b-2 border-primary">
           <span className="text-[11px] font-black text-on-surface uppercase tracking-widest mb-2.5">Current</span>
           <div className="flex items-center gap-2">
             <span className="bg-primary text-on-primary text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full uppercase tracking-tighter shrink-0 shadow-sm">
               {activeSectionName?.substring(0, 2) || "In"}
             </span>
             <span className="font-extrabold text-primary text-sm tracking-tight truncate uppercase">
               {activeSectionName || "---"}
             </span>
           </div>
         </div>

         <div className="flex-1 flex flex-col relative pb-2">
           <span className="text-[11px] font-black text-on-surface uppercase tracking-widest mb-2.5">Next</span>
           <div className="flex items-center gap-2">
             <span className="bg-primary-container/20 text-primary border border-primary/20 text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full uppercase tracking-tighter shrink-0">
               {nextSectionName?.substring(0, 2) || "In"}
             </span>
             <span className="font-extrabold text-primary text-sm tracking-tight truncate uppercase">
               {nextSectionName || "---"}
             </span>
           </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pb-4">
        {(() => {
          const groupedTracks: { name: string, color: string, tracks: { track: SetlistTrackItem, originalIndex: number }[] }[] = [];
          let currentGroup: any = null;
          
          tracksList.forEach((track, originalIndex) => {
            const groupName = (track as any).group_name || ""; 
            const groupColor = (track as any).group_color || "zinc"; 
            if (!currentGroup || currentGroup.name !== groupName) {
              currentGroup = { name: groupName, color: groupColor, tracks: [] };
              groupedTracks.push(currentGroup);
            }
            currentGroup.tracks.push({ track, originalIndex });
          });

          return groupedTracks.map((group, gIdx) => {
            const hasName = Boolean(group.name);
            const colorMaps: Record<string, string> = {
              zinc: "border-outline-variant/30 bg-surface-container text-on-surface-variant",
              blue: "border-primary/30 bg-primary-container/10 text-primary",
            };
            const activeColorString = colorMaps[group.color] || colorMaps.zinc;

            return (
              <div key={gIdx} className={hasName ? `rounded-[28px] border p-2 flex flex-col gap-2 ${activeColorString.split(" text-")[0]}` : `flex flex-col gap-2`}>
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
                      onClick={() => handleUserSelectTrackBadge?.(originalIndex)}
                      className={`px-4 py-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all outline-none active:scale-[0.98] ${
                        isSelected 
                          ? "border-primary bg-surface-container-high shadow-md relative overflow-hidden" 
                          : "border-outline-variant/30 bg-surface-container-low hover:border-outline-variant/50 shadow-sm"
                      }`}
                    >
                      {isSelected && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-l-full opacity-60" />}
                      
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full bg-surface-container-highest text-[9px] font-black text-on-surface-variant shadow-inner">
                          {keySig.charAt(0)}
                        </span>
                        <span className="text-[9px] font-black bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded-full tracking-widest uppercase shadow-inner">
                          {track.songs?.tempo || "--"} BPM
                        </span>
                      </div>
                      <span className={`font-extrabold text-[16px] tracking-tight ${isSelected ? "text-on-surface" : "text-on-surface-variant"}`}>
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

      <div className="mt-auto shrink-0 flex justify-center pb-safe pt-2">
         <button 
            onClick={(e) => {
              e.stopPropagation();
              if (wakeUpAudioEngine) wakeUpAudioEngine();
              handleToggleFlowPlaybackState();
            }}
            className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-on-primary shadow-[0_8px_24px_rgba(37,99,235,0.4)] transition-transform active:scale-90 cursor-pointer"
         >
           {isPlayingFlow ? (
             <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
           ) : (
             <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><path d="M6 4l15 8-15 8z"/></svg>
           )}
         </button>
      </div>
    </div>
  );

  // =========================================
  // 3. DESKTOP VIEW (Fixed Top Bar)
  // =========================================
  const DesktopHeader = () => (
    <header className="fixed top-0 left-20 right-0 bg-surface/90 backdrop-blur-xl z-50 overflow-hidden border-b border-outline-variant/30 select-none hidden md:block">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-surface-container-highest z-0">
        <div ref={accentProgressBarRef} className="h-full bg-primary origin-left scale-x-0 transition-transform duration-100 ease-linear" />
      </div>

      <div className="flex items-center justify-between h-[72px] px-6 relative z-10 w-full max-w-5xl mx-auto">
        <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setIsSettingsModalOpen?.(true)}>
          <div className="w-11 h-11 rounded-lg bg-surface-container flex items-center justify-center border border-outline-variant/30 shadow-sm shrink-0 overflow-hidden">
            {activeSong?.youtube_url ? (
              <img src={`https://img.youtube.com/vi/${activeSong.youtube_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1]}/default.jpg`} alt="thumbnail" className="w-full h-full object-cover opacity-80" />
            ) : (
              <span className="material-symbols-outlined text-outline-variant text-[20px]">music_note</span>
            )}
          </div>
          
          <div className="flex flex-col min-w-0 pr-2">
            <h2 className="font-extrabold text-[18px] text-on-surface truncate tracking-tight leading-tight">
              {activeSong?.title || "No Track Selected"}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-bold text-on-surface-variant truncate max-w-[120px]">
                {activeSong?.artist || "Unknown Artist"}
              </span>
              <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
              <span className="text-[10px] font-black text-primary bg-primary-container/20 px-1.5 rounded uppercase tracking-widest border border-primary/20">
                {activeDisplayKey || activeSong?.original_key || "C"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {showSyncBack && handleSyncBack && (
            <button onClick={handleSyncBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer animate-in fade-in">
              <span className="w-1.5 h-1.5 rounded-full border border-amber-500 bg-transparent"></span>
              <span className="font-black text-[10px] uppercase tracking-widest">Sync Back</span>
            </button>
          )}

          <button 
            onClick={handleToggleFlowPlaybackState}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-90 cursor-pointer ${isPlayingFlow ? "bg-primary-container text-primary shadow-sm" : "bg-transparent text-on-surface"}`}
          >
            {isPlayingFlow ? <PauseIcon /> : <PlayIcon />}
          </button>
        </div>
      </div>
    </header>
  );

  // =========================================
  // RENDER LOGIC: PORTAL MOUNTING ENGINE
  // =========================================
  if (!mounted) return null;

  if (isMobile) {
    const portalSlot = document.getElementById("media-player-portal-slot");
    return (
      <>
        {/* Render the Collapsed player INTO the Sidebar's DOM slot if it exists */}
        {portalSlot && !isExpanded ? createPortal(<CollapsedMobilePlayer />, portalSlot) : null}
        
        {/* Render the Expanded player as a full-screen overlay */}
        {isExpanded && <ExpandedMobilePlayer />}
      </>
    );
  }

  // Desktop simply renders inline normally
  return <DesktopHeader />;
}