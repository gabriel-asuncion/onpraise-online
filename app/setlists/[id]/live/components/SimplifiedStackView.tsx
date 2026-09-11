import React, { useEffect, useRef, useState } from "react";
import { CompiledSectionToken, SetlistTrackItem } from "../types/setlist";
import { getSectionAbbreviation } from "../utils/setlist-helpers";
import { MemoizedLyricLine } from "./MemoizedLyricLine";

interface SimplifiedStackViewProps {
  setlistAst?: any[]; 
  memoizedSongAstTree: CompiledSectionToken[];
  currentSectionIndex: number;
  queuedSectionIndex: number | null;
  queuedTrackIndex: number | null;
  currentTrackIndex: number;
  activeLineIndex: number;
  chordFormat: "Key" | "Numbers";
  activeDisplayKey: string;
  getSectionDurationString: (sectionName: string, sectionIdx?: number) => string;
  simplifiedProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  upcomingTrackItem: SetlistTrackItem | null;
  
  handleSectionInteractiveSelection: (idx: number) => void;
  handleUserSelectTrackBadge: (trackIdx: number) => void;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
}

export function SimplifiedStackView(props: SimplifiedStackViewProps) {
  const {
    setlistAst = [], currentSectionIndex, queuedSectionIndex, queuedTrackIndex, currentTrackIndex,
    activeLineIndex, chordFormat, getSectionDurationString, simplifiedProgressBarRef,
    handleSectionInteractiveSelection, handleUserSelectTrackBadge, showChords, lyricsFontSize, lineSpacing
  } = props;

  const [overflowingTitles, setOverflowingTitles] = useState<{ [key: string]: boolean }>({});
  const titleRefs = useRef<{ [key: string]: HTMLHeadingElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);

  const handleScroll = () => {
    const now = Date.now();
    if (now - lastScrollTime.current < 50) return; 
    lastScrollTime.current = now;

    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const containerTop = container.getBoundingClientRect().top;

    let activeIdx = currentTrackIndex;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    
    if (isAtBottom) {
      activeIdx = setlistAst[setlistAst.length - 1].trackIndex;
    } else {
      setlistAst.forEach(song => {
        const el = document.getElementById(`stack-song-${song.trackIndex}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const relativeTop = rect.top - containerTop;
          if (relativeTop <= 200) {
            activeIdx = song.trackIndex;
          }
        }
      });
    }

    if (activeIdx !== currentTrackIndex) {
      handleUserSelectTrackBadge(activeIdx);
    }
  };

  useEffect(() => {
    const checkOverflows = () => {
      const newOverflows: { [key: string]: boolean } = {};
      Object.keys(titleRefs.current).forEach(key => {
        const el = titleRefs.current[key];
        if (el && el.parentElement) {
          el.classList.remove("truncate");
          el.style.whiteSpace = "nowrap";
          const isOverflowing = el.scrollWidth > el.parentElement.clientWidth;
          newOverflows[key] = isOverflowing;
          if (isOverflowing) el.parentElement.style.setProperty('--marquee-container-width', `${el.parentElement.clientWidth}px`);
          else el.classList.add("truncate");
        }
      });
      setOverflowingTitles(newOverflows);
    };
    const timer = setTimeout(checkOverflows, 100);
    window.addEventListener('resize', checkOverflows);
    return () => { clearTimeout(timer); window.removeEventListener('resize', checkOverflows); };
  }, [setlistAst]);

  if (!setlistAst || setlistAst.length === 0) return null;

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto custom-scrollbar bg-surface relative z-0 scroll-smooth pb-[50vh]"
    >
      <style>{`
        @keyframes marquee-dynamic {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(calc(var(--marquee-container-width) - 100%)); }
        }
        .animate-marquee-dynamic {
          display: inline-block;
          animation: marquee-dynamic 7s ease-in-out infinite alternate;
        }
      `}</style>

      {/* DYNAMIC SLOT-MACHINE HEADER */}
      <div className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant/20 shadow-sm w-full h-[76px] overflow-hidden">
        <div className="w-full max-w-5xl mx-auto h-full relative">
          {setlistAst.map((song, idx) => {
            const isActive = idx === currentTrackIndex;
            const isPast = idx < currentTrackIndex;
            
            return (
              <div 
                key={song.trackId}
                className={`absolute inset-0 flex items-center gap-3 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] px-4 md:px-8 ${
                  isActive ? "translate-y-0 opacity-100 pointer-events-auto scale-100" :
                  isPast ? "-translate-y-full opacity-0 pointer-events-none scale-95" :
                  "translate-y-full opacity-0 pointer-events-none scale-95"
                }`}
              >
                <span className="text-primary font-black text-xl md:text-2xl opacity-40 shrink-0 tnum">#{String(song.trackIndex + 1).padStart(2, '0')}</span>
                
                <div className="flex-1 min-w-0 overflow-hidden relative flex items-center h-8" style={{ maskImage: overflowingTitles[song.trackId] ? "linear-gradient(to right, black 85%, transparent 100%)" : "none", WebkitMaskImage: overflowingTitles[song.trackId] ? "linear-gradient(to right, black 85%, transparent 100%)" : "none" }}>
                  <h2 
                    ref={(el) => { titleRefs.current[song.trackId] = el; }} 
                    className={`text-2xl md:text-[28px] font-extrabold text-on-surface tracking-tight leading-none ${overflowingTitles[song.trackId] ? 'animate-marquee-dynamic pr-8' : 'truncate'}`}
                  >
                    {song.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 ml-auto shrink-0 hidden sm:block">
                  <span className="bg-surface-container-high text-on-surface-variant text-[10px] font-black uppercase px-2.5 py-1 rounded-md shadow-inner border border-outline-variant/30 tnum">
                    {song.tempo} BPM
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto flex flex-col pt-8">
        {setlistAst.map((song) => {
           const isCurrentSong = song.trackIndex === currentTrackIndex;

           return (
             <div key={song.trackId} className={`flex flex-col relative pb-16 md:pb-24`} id={`stack-song-${song.trackIndex}`}>
               
               <div className="flex flex-col gap-6 md:gap-7 px-4 md:px-8">
                 {song.ast.map((sec: any, secIdx: number) => {
                   const isActive = isCurrentSong && currentSectionIndex === secIdx;
                   const isQueued = queuedTrackIndex === song.trackIndex && queuedSectionIndex === secIdx;
                   
                   // Determine Block Type (Red active vs Yellow inactive)
                   const isEmptyChordOnlySection = sec.lines.length === 0 || (sec.lines.length === 1 && sec.lines[0].words.every((w: any) => !w.word.trim()));

                   return (
                     <div
                       key={sec.id}
                       id={`stack-sec-${song.trackIndex}-${secIdx}`}
                       onClick={() => {
                         if (!isCurrentSong) {
                           handleUserSelectTrackBadge(song.trackIndex);
                           setTimeout(() => handleSectionInteractiveSelection(secIdx), 150);
                         } else {
                           handleSectionInteractiveSelection(secIdx);
                         }
                       }}
                       className={`rounded-xl md:rounded-2xl px-4 pb-3 pt-5 md:px-5 md:pb-4 md:pt-6 shadow-sm transition-all duration-300 relative cursor-pointer ${
                         isActive 
                           ? "bg-surface-container-high shadow-[0_0_24px_rgba(37,99,235,0.22)] scale-[1.02] z-20" 
                           : isQueued
                           ? "bg-surface-container shadow-[0_0_12px_rgba(147,51,234,0.15)] scale-[1.001] z-10"
                           : isEmptyChordOnlySection
                           ? "bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface-container-low"
                           : "bg-surface-container-low border border-outline-variant/20 opacity-80 hover:opacity-100 hover:border-primary/50"
                       }`}
                     >
                       
                       {/* Active Sidebar Strip */}
                       {isActive && (
                         <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_12px_rgba(37,99,235,0.9)] rounded-l-xl md:rounded-l-2xl"></div>
                       )}

                       {/* Inner Active Progress Tracker */}
                       {isActive && (
                         <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl md:rounded-2xl">
                           <div ref={simplifiedProgressBarRef} className="absolute bottom-0 left-0 h-1.5 md:h-2 bg-[#2563eb] origin-left scale-x-0 w-full z-0" style={{ willChange: 'transform' }} />
                         </div>
                       )}

                       {/* Top Badges (No longer clamped by overflow-hidden) */}
                       <div className="absolute -top-3.5 left-4 flex items-center justify-between w-[calc(100%-2rem)] z-10">
                         {isActive ? (
                            <div className="flex items-center gap-2 pl-2 bg-surface-container-high rounded-full shadow-sm">
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-primary text-on-primary font-black uppercase tracking-widest shadow-sm">LIVE</span>
                              <span className="font-section-heading text-[15px] font-extrabold text-on-surface uppercase tracking-tight">{sec.section_name}</span>
                            </div>
                         ) : (
                            <div className="flex items-center gap-1.5">
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center font-black text-[9px] border shadow-sm ${isEmptyChordOnlySection ? "bg-surface-container-highest text-on-surface border-outline-variant/30" : "bg-primary-container/20 text-primary border-primary/20"}`}>
                                {getSectionAbbreviation(sec.section_name)}
                              </span>
                              <span className="font-badge-caps text-[10px] uppercase text-on-surface-variant tracking-wider font-extrabold shadow-sm bg-surface-container px-2 py-0.5 rounded-md border border-outline-variant/20">
                                {sec.section_name}
                              </span>
                              {isQueued && (<span className="ml-1 text-[8px] font-black bg-[#9333ea] text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm border border-[#7e22ce]">⚡ QUEUED</span>)}
                            </div>
                         )}

                         <div className={`flex items-center gap-1 font-label-sm text-[11px] font-bold border rounded-md px-2 py-0.5 shadow-sm transition-colors ${isActive ? "text-primary bg-primary-container/10 border-primary/20" : "text-on-surface-variant bg-surface-container border-outline-variant/20"}`}>
                           {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>}
                           <span className={isActive ? "" : "material-symbols-outlined text-[12px] opacity-70"}>{isActive ? "" : "schedule"}</span>
                           <span className="tnum">{getSectionDurationString(sec.section_name, isCurrentSong ? secIdx : undefined)} {isActive && "Rem."}</span>
                         </div>
                       </div>

                       <div className="pl-0.5 select-text selection:bg-primary-container/30 text-on-surface space-y-0.5 mt-2 relative z-10">
                         {sec.lines.length === 0 ? <div className="h-4" /> : sec.lines.map((line: any, lIdx: number) => {
                           const isLineActive = isActive && activeLineIndex === lIdx;

                           return (
                             <div 
                               key={lIdx} 
                               className={`transition-all duration-300 ${isLineActive ? "opacity-100" : isActive ? "opacity-35" : "opacity-100"}`}
                             >
                               <MemoizedLyricLine 
                                 line={line} 
                                 sectionIndex={isCurrentSong ? secIdx : 9999 + secIdx} 
                                 lineIndex={lIdx} 
                                 isCurrentlyPlayingLine={isLineActive}
                                 showChords={showChords} 
                                 lyricsFontSize={lyricsFontSize} 
                                 lineSpacing={lineSpacing} 
                                 chordFormat={chordFormat} 
                                 activeDisplayKey={song.displayKey}
                               />
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })}
               </div>
               
             </div>
           );
        })}
      </div>
    </div>
  );
}