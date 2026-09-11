import React from "react";
import { CompiledSectionToken, SetlistTrackItem } from "../types/setlist";
import { getSectionAbbreviation } from "../utils/setlist-helpers";
import { MemoizedLyricLine } from "./MemoizedLyricLine";

interface StandardSheetViewProps {
  memoizedSongAstTree: CompiledSectionToken[];
  isPlayingFlow: boolean;
  playingTrackIndex: number;
  currentTrackIndex: number;
  currentSectionIndex: number;
  queuedTrackIndex: number | null;
  queuedSectionIndex: number | null;
  getSectionDurationString: (sectionName: string, sectionIdx?: number) => string;
  handleSectionInteractiveSelection: (idx: number) => void;
  sectionRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>;
  activeLineIndex: number;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
  chordFormat: "Key" | "Numbers";
  activeDisplayKey: string;
  upcomingTrackItem: SetlistTrackItem | null;
  handleUserSelectTrackBadge: (trackIdx: number) => void;
  scrollContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
  setShowSyncBack: (val: boolean) => void; 
}

export function StandardSheetView(props: StandardSheetViewProps) {
  const {
    memoizedSongAstTree, isPlayingFlow, playingTrackIndex, currentTrackIndex, currentSectionIndex,
    queuedTrackIndex, queuedSectionIndex, getSectionDurationString, handleSectionInteractiveSelection,
    sectionRefs, activeLineIndex, showChords, lyricsFontSize, lineSpacing, chordFormat, activeDisplayKey,
    upcomingTrackItem, handleUserSelectTrackBadge, scrollContainerRef, isAutoScrollingRef, setShowSyncBack
  } = props;

  const handleUserScrollIntent = () => {
    if (!isAutoScrollingRef.current) setShowSyncBack(true);
  };

  return (
    <div 
      ref={scrollContainerRef} 
      onWheel={handleUserScrollIntent}
      onTouchMove={handleUserScrollIntent}
      className="flex-1 overflow-y-auto p-4 md:p-8 pt-6 custom-scrollbar pb-64 bg-surface"
    >
      <div className="max-w-5xl w-full mx-auto space-y-6 md:space-y-7 pt-2">
        {memoizedSongAstTree.map((section, idx) => {
          const isThisSectionActivePlayback = isPlayingFlow && playingTrackIndex === currentTrackIndex && currentSectionIndex === idx;
          const isThisSectionQueuedNext = queuedTrackIndex === currentTrackIndex && queuedSectionIndex === idx;
          const isStagedUnstartedTarget = !isPlayingFlow && currentSectionIndex === idx;
          const formattedDuration = getSectionDurationString(section.section_name, idx);
          
          const isEmptyChordOnlySection = section.lines.length === 0 || (section.lines.length === 1 && section.lines[0].words.every((w: any) => !w.word.trim()));

          return (
            <div
              key={section.id}
              ref={(el) => { sectionRefs.current[section.id] = el; }}
              onClick={() => handleSectionInteractiveSelection(idx)}
              className={`rounded-xl md:rounded-2xl px-4 pb-3 pt-5 md:px-5 md:pb-4 md:pt-6 shadow-sm transition-all duration-300 relative cursor-pointer ${
                isThisSectionActivePlayback 
                  ? "bg-surface-container-high shadow-[0_0_24px_rgba(37,99,235,0.22)] scale-[1.02] z-20" 
                  : isThisSectionQueuedNext
                  ? "bg-surface-container shadow-[0_0_12px_rgba(147,51,234,0.15)] scale-[1.001] z-10"
                  : isEmptyChordOnlySection
                  ? "bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface-container-low"
                  : "bg-surface-container-low border border-outline-variant/20 opacity-85 hover:opacity-100 hover:border-primary/50"
              }`}
              style={isStagedUnstartedTarget && !isThisSectionQueuedNext && !isThisSectionActivePlayback ? { borderColor: '#f59e0b', boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.1)' } : {}}
            >
              
              {isThisSectionActivePlayback && (
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_12px_rgba(37,99,235,0.9)] rounded-l-xl md:rounded-l-2xl"></div>
              )}

              <div className="absolute -top-3.5 left-4 flex items-center justify-between w-[calc(100%-2rem)] z-10">
                {isThisSectionActivePlayback ? (
                   <div className="flex items-center gap-2 pl-2 bg-surface-container-high rounded-full shadow-sm">
                     <span className="px-1.5 py-0.5 rounded text-[9px] bg-primary text-on-primary font-black uppercase tracking-widest shadow-sm">LIVE</span>
                     <span className="font-section-heading text-[15px] font-extrabold text-on-surface uppercase tracking-tight">{section.section_name}</span>
                   </div>
                ) : (
                   <div className="flex items-center gap-1.5">
                     <span className={`w-5 h-5 rounded-md flex items-center justify-center font-black text-[9px] border shadow-sm ${isEmptyChordOnlySection ? "bg-surface-container-highest text-on-surface border-outline-variant/30" : isStagedUnstartedTarget ? "bg-[#f59e0b] text-[#78350f] border-[#f59e0b]" : "bg-primary-container/20 text-primary border-primary/20"}`}>
                       {getSectionAbbreviation(section.section_name)}
                     </span>
                     <span className={`font-badge-caps text-[10px] uppercase tracking-wider font-extrabold shadow-sm bg-surface-container px-2 py-0.5 rounded-md border ${isStagedUnstartedTarget ? "text-[#f59e0b] border-[#f59e0b]/50" : "text-on-surface-variant border-outline-variant/20"}`}>
                       {section.section_name}
                     </span>
                     {isThisSectionQueuedNext && (<span className="ml-1 text-[8px] font-black bg-[#9333ea] text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm border border-[#7e22ce]">⚡ QUEUED</span>)}
                   </div>
                )}

                <div className={`flex items-center gap-1 font-label-sm text-[11px] font-bold border rounded-md px-2 py-0.5 shadow-sm transition-colors ${isThisSectionActivePlayback ? "text-primary bg-primary-container/10 border-primary/20" : "text-on-surface-variant bg-surface-container border-outline-variant/20"}`}>
                  {isThisSectionActivePlayback && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>}
                  <span className={isThisSectionActivePlayback ? "" : "material-symbols-outlined text-[12px] opacity-70"}>{isThisSectionActivePlayback ? "" : "schedule"}</span>
                  <span className="tnum">{formattedDuration} {isThisSectionActivePlayback && "Rem."}</span>
                </div>
              </div>

              <div className="pl-0.5 select-text selection:bg-primary-container/30 text-on-surface space-y-0.5 mt-2 relative z-10">
                {section.lines.length === 0 ? <div className="h-4" /> : section.lines.map((line, lIdx) => {
                  const isCurrentlyPlayingLine = isThisSectionActivePlayback && activeLineIndex === lIdx;
                  return (
                    <div key={lIdx} className={`transition-all duration-300 ${isCurrentlyPlayingLine ? "opacity-100" : isThisSectionActivePlayback ? "opacity-35" : "opacity-100"}`}>
                      <MemoizedLyricLine 
                        line={line} sectionIndex={idx} lineIndex={lIdx} isCurrentlyPlayingLine={isCurrentlyPlayingLine}
                        showChords={showChords} lyricsFontSize={lyricsFontSize} lineSpacing={lineSpacing} chordFormat={chordFormat} activeDisplayKey={activeDisplayKey}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {upcomingTrackItem?.songs && (
          <div className="pt-2 animate-in fade-in duration-300">
            <div onClick={() => { handleUserSelectTrackBadge(currentTrackIndex + 1); document.getElementById("fixed-live-header")?.scrollIntoView({ behavior: "smooth" }); }} className="w-full bg-surface-container-lowest border border-dashed border-outline-variant/30 hover:bg-surface-container-high rounded-2xl p-5 text-center cursor-pointer transition-all select-none group shadow-sm">
              <span className="text-[10px] font-black tracking-widest text-outline uppercase block mb-0.5">Up Next</span>
              <h4 className="font-extrabold text-[15px] text-on-surface group-hover:text-primary transition-colors flex justify-center items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">fast_forward</span>
                {upcomingTrackItem.songs.title} 
                <span className="font-bold opacity-70 text-[11px] px-1.5 py-0.5 rounded-md bg-surface-container-highest border border-outline-variant/30">
                  Key {upcomingTrackItem.custom_key || upcomingTrackItem.songs.original_key}
                </span>
              </h4>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}