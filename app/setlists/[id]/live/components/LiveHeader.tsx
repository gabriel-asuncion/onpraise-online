import React, { useEffect, useRef, useState } from "react";
import { SongRecord, SetlistTrackItem } from "../types/setlist";
import { playZeroLatencyAudio } from "../hooks/useWebAudioEngine"; // Adjust relative path as needed

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
  isSoloMode?: boolean; // ✅ Added flag for Solo Practice Room
  isSimplifiedMode?: boolean;
  wakeUpAudioEngine?: () => void; // ✅ SURGICAL FIX: Accept the direct wake-up function
  localClickVolume?: number; // ✅ ADDED: Accept the mixer volume
  
}

export function LiveHeader({
  activeSong, activeDisplayKey, currentDriftMs, localPresenceUser,
  isPlayingFlow, currentBeat, currentMeasureLength, metronomeRefs,
  setIsSettingsModalOpen, handleToggleFlowPlaybackState, displayedOnlineUsers,
  tracksList, currentTrackIndex, handleUserSelectTrackBadge,
  backdropProgressRef, accentProgressBarRef, isSoloMode = false, isSimplifiedMode = false, // ✅ Added here
  wakeUpAudioEngine, localClickVolume = 1.0 // ✅ Default to 1.0 if missing
  
}: LiveHeaderProps) {
  
  // ✅ Encapsulated Title Overflow Logic
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const checkTitleOverflow = () => {
      if (titleContainerRef.current && titleTextRef.current) {
        const container = titleContainerRef.current;
        const textElement = titleTextRef.current;
        textElement.classList.remove("truncate");
        textElement.style.whiteSpace = "nowrap";
        const containerWidth = container.clientWidth;
        const textWidth = textElement.scrollWidth;
        const isOverflowing = textWidth > containerWidth;
        setIsTitleOverflowing(isOverflowing);
        if (isOverflowing) {
          container.style.setProperty('--marquee-container-width', `${containerWidth}px`);
        } else {
          textElement.classList.add("truncate");
        }
      }
    };
    const timer = setTimeout(checkTitleOverflow, 100);
    window.addEventListener('resize', checkTitleOverflow);
    return () => { clearTimeout(timer); window.removeEventListener('resize', checkTitleOverflow); };
  }, [activeSong?.title]);

// ============================================================================
  // ✅ SURGICAL FIX: Store live volume in a ref to bypass React's closure trap!
  // ============================================================================
  const liveVolumeRef = useRef(localClickVolume);
  useEffect(() => {
    liveVolumeRef.current = localClickVolume;
  }, [localClickVolume]);

  // ✅ Physically links the audio to the visual flashes
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

            // If the visual JUST turned on, fire the cached .wav file
            if (isNowActive && !wasActive) {
              const soundKey = index === 0 ? "metronome_blip_1" : "metronome_blip_2";
              // ✅ Read the LIVE volume from the ref!
              playZeroLatencyAudio(soundKey, liveVolumeRef.current);
            }
          }
        });
      });

      // Watch this exact visual block for class changes
      observer.observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ["class"] });
      observers.push(observer);
    });

    return () => {
      observers.forEach(obs => obs.disconnect());
    };
  }, [isPlayingFlow, metronomeRefs]);

  

  return (
    <div id="fixed-live-header" className="w-full bg-white border-b border-zinc-200 flex-shrink-0 z-50 shadow-sm px-4 md:px-8 py-3.5 landscape:py-2 relative overflow-hidden">
      
      {/* ✅ SURGICAL ADDITION: Injects the missing keyframes for Title & Track Pills */}
      <style>{`
        @keyframes marquee-dynamic {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(calc(var(--marquee-container-width) - 100%)); }
        }
        @keyframes marquee-alt {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(calc(65px - 100%)); }
        }
        .animate-marquee-dynamic {
          display: inline-block;
          animation: marquee-dynamic 8s ease-in-out infinite alternate;
        }
        .animate-marquee-alt {
          display: inline-block;
          animation: marquee-alt 5s ease-in-out infinite alternate;
        }
      `}</style>

      <div ref={backdropProgressRef} className="absolute inset-y-0 left-0 bg-blue-500/5 pointer-events-none z-0 origin-left w-full" style={{ willChange: 'transform' }} />
      <div ref={accentProgressBarRef} className="absolute bottom-0 left-0 h-[3px] bg-blue-600 pointer-events-none z-35 origin-left w-full" style={{ willChange: 'transform' }} />

      <div className="max-w-5xl mx-auto flex flex-col gap-2 relative z-10">
        
        {/* ROW 1: System Badges */}
        <div className="flex items-center gap-1.5 flex-wrap landscape:hidden">
          {!isSoloMode && (
            <span className="bg-zinc-950 text-white font-mono font-black text-[8px] tracking-wider px-1.5 py-0.5 rounded">SUBSCRIBED</span>
          )}
          <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded">⏱{activeSong?.tempo || "--"}</span>
          <div className="bg-zinc-50 text-zinc-600 rounded border font-mono font-black text-[8px] px-1.5 py-0.5 flex items-center gap-0.5">K:<span className="text-blue-600 font-black">{activeDisplayKey}</span></div>
        </div>

        {/* ROW 2: Title & Core Controls */}
        <div className="flex items-center justify-between gap-2 w-full">
          <div ref={titleContainerRef} className="flex-1 min-w-0 overflow-hidden relative flex items-center h-10" style={{ maskImage: isTitleOverflowing ? "linear-gradient(to right, black 85%, transparent 100%)" : "none", WebkitMaskImage: isTitleOverflowing ? "linear-gradient(to right, black 85%, transparent 100%)" : "none" }}>
            <h1 ref={titleTextRef} className={`text-2xl md:text-3xl font-black tracking-tight text-zinc-950 leading-none ${isTitleOverflowing ? 'animate-marquee-dynamic pr-8' : 'truncate'}`}>
              {activeSong?.title || "Loading..."}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <div className="relative flex items-center">
              {currentDriftMs !== null && !localPresenceUser?.isMD && isPlayingFlow && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[8px] font-mono font-black text-red-500 tracking-tighter w-max animate-in fade-in duration-150">[{Math.round(currentDriftMs)}ms]</span>
              )}
              
              <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-lg border border-zinc-200 shadow-inner shrink-0 mr-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((beatNum) => (
                  <div 
                    key={beatNum} 
                    ref={(el) => { metronomeRefs.current[beatNum - 1] = el; }} 
                    style={{ display: beatNum <= currentMeasureLength ? 'flex' : 'none' }} 
                    className={`w-6 h-6 items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none ${
                      isPlayingFlow && currentBeat === beatNum 
                        ? beatNum === 1 
                          ? "bg-[#faba37] text-white border-[#e0a22b]" 
                          : "bg-blue-600 text-white border-blue-500" 
                        : "bg-white text-zinc-200 border-zinc-100"
                    }`}
                  >
                    {beatNum}
                  </div>
                ))}
              </div>
            </div>

            <button type="button" onClick={() => setIsSettingsModalOpen(true)} className="h-8 w-8 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-600 font-extrabold text-xs flex items-center justify-center shadow-sm cursor-pointer hover:bg-zinc-100"><img src="/assets/settings.svg" alt="Settings" className="w-3 h-3 opacity-60" /></button>
            {/* ✅ SURGICAL FIX: Directly call the wake-up function! */}
            <button 
              type="button" 
              onClick={() => {
                if (wakeUpAudioEngine) wakeUpAudioEngine(); // Breaks the browser silence lock!
                handleToggleFlowPlaybackState();
              }} 
              className={`h-8 px-5 rounded-lg border text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${!localPresenceUser?.isMD ? "bg-zinc-100 border-zinc-200 text-zinc-500 cursor-pointer shadow-inner" : isPlayingFlow ? "bg-red-600 border-red-500 text-white ring-2 ring-red-500/20 cursor-pointer shadow-md" : "bg-blue-600 border-blue-500 text-white shadow-sm cursor-pointer"}`}
            >
              {!localPresenceUser?.isMD ? (<><img src="/assets/lock.svg" alt="Locked" className="w-3 h-3 opacity-60" /> <span>Locked</span></>) : isPlayingFlow ? "⏹" : "▶"}
            </button>
          </div>
        </div>

        {/* ROW 3: Active Presence Lobby */}
        {!isSoloMode && (
          <div className="flex items-center gap-1 landscape:hidden">
            <div className="flex -space-x-1.5 overflow-hidden py-0.5">
              {displayedOnlineUsers.map((user, idx) => (
                <div key={`${user.connectionId || user.id}-${idx}`} title={user.name} className="w-5 h-5 rounded-full ring-2 ring-white overflow-hidden shadow-sm shrink-0 select-none bg-zinc-100 flex items-center justify-center relative">
                  {user.avatar ? (<img src={user.avatar} alt="" className="w-full h-full object-cover" />) : (<div className={`w-full h-full ${user.bg || 'bg-blue-600'} text-white font-mono font-black text-[7px] flex items-center justify-center`}>{user.initials}</div>)}
                </div>
              ))}
            </div>
            <span className="text-[9px] font-bold text-zinc-400 ml-1 lowercase">online now</span>
          </div>
        )}

       {/* TRACK LIST TRAY WITH SCROLLING MARQUEE */}
        {!isSoloMode && !isSimplifiedMode && (
          <div className="w-full border-t border-zinc-100 pt-2.5 mt-1 landscape:pt-1.5 landscape:mt-0.5 flex items-center overflow-x-auto overflow-y-hidden flex-nowrap gap-1.5 scrollbar-none select-none pb-0.5 scroll-smooth">
            {tracksList.map((track, trackIdx) => {
              const title = track.songs?.title || "Song";
              const needsScroll = title.length > 10;
              return (
                <button key={track.id} type="button" onClick={(e) => { handleUserSelectTrackBadge(trackIdx); e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all cursor-pointer flex items-center gap-1 ${currentTrackIndex === trackIdx ? "bg-blue-600 border-blue-500 text-white shadow-sm" : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`}>
                  <div className="overflow-hidden w-[65px] relative flex items-center"><span className={`whitespace-nowrap ${needsScroll ? "animate-marquee-alt" : "truncate"}`}>{title}</span></div>
                  <span className="font-mono opacity-50 font-bold ml-0.5 shrink-0">({track.custom_key || track.songs?.original_key})</span>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}