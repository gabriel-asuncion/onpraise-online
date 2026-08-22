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
  isAutoScrollingRef: React.MutableRefObject<boolean>; // ✅ Added
  setShowSyncBack: (val: boolean) => void;             // ✅ Added
}

export function StandardSheetView(props: StandardSheetViewProps) {
  const {
    memoizedSongAstTree, isPlayingFlow, playingTrackIndex, currentTrackIndex, currentSectionIndex,
    queuedTrackIndex, queuedSectionIndex, getSectionDurationString, handleSectionInteractiveSelection,
    sectionRefs, activeLineIndex, showChords, lyricsFontSize, lineSpacing, chordFormat, activeDisplayKey,
    upcomingTrackItem, handleUserSelectTrackBadge, scrollContainerRef, isAutoScrollingRef, setShowSyncBack
  } = props;

  // ✅ Catch manual user scrolling
  const handleUserScrollIntent = () => {
    if (!isAutoScrollingRef.current) setShowSyncBack(true);
  };

  return (
    <div 
      ref={scrollContainerRef} 
      onWheel={handleUserScrollIntent}     // ✅ Detects mouse wheels
      onTouchMove={handleUserScrollIntent} // ✅ Detects mobile swipes
      className="flex-1 overflow-y-auto p-4 md:p-8 pt-6 custom-scrollbar pb-64"
    >
      <div className="max-w-5xl w-full mx-auto space-y-6 md:space-y-7 pt-2">
        {memoizedSongAstTree.map((section, idx) => {
          const isThisSectionActivePlayback = isPlayingFlow && playingTrackIndex === currentTrackIndex && currentSectionIndex === idx;
          const isThisSectionQueuedNext = queuedTrackIndex === currentTrackIndex && queuedSectionIndex === idx;
          const isStagedUnstartedTarget = !isPlayingFlow && currentSectionIndex === idx;
          const formattedDuration = getSectionDurationString(section.section_name, idx);

          return (
            <div
              key={section.id}
              ref={(el) => { sectionRefs.current[section.id] = el; }}
              onClick={() => handleSectionInteractiveSelection(idx)}
              className={`bg-white border rounded-xl md:rounded-2xl px-4 pb-3 pt-5 md:px-5 md:pb-4 md:pt-6 shadow-sm transition-all duration-300 relative ${
                isThisSectionActivePlayback ? "border-blue-500 ring-4 ring-blue-500/10 shadow-md z-10 cursor-pointer" : isThisSectionQueuedNext ? "border-purple-500 ring-4 ring-purple-500/10 scale-[1.001] shadow-md z-10 cursor-pointer" : `border-zinc-200 opacity-95 cursor-pointer hover:border-blue-400 hover:bg-zinc-50/30`
                }`}
              style={isStagedUnstartedTarget && !isThisSectionQueuedNext ? { borderColor: '#fbbf24', boxShadow: '0 0 0 4px rgba(251, 191, 36, 0.1)' } : {}}
            >
              <div className={`absolute -top-3.5 left-4 flex items-center bg-white border rounded-full p-0.5 pr-3 shadow-sm select-none z-10 transition-colors ${isThisSectionActivePlayback ? "border-blue-400" : isStagedUnstartedTarget ? "border-amber-400" : "border-blue-200/60"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mr-2 shadow-inner ${isThisSectionActivePlayback ? "bg-blue-600 text-white" : isStagedUnstartedTarget ? "bg-amber-500 text-white" : "bg-blue-50 text-blue-500"}`}>
                  {getSectionAbbreviation(section.section_name)}
                </div>
                <span className={`text-[11px] font-black uppercase tracking-wider ${isThisSectionActivePlayback ? "text-blue-700" : isStagedUnstartedTarget ? "text-amber-600" : "text-blue-500"}`}>
                  {section.section_name}
                </span>
                {isThisSectionQueuedNext && (<span className="ml-2 text-[8px] font-black bg-purple-600 text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm">⚡ QUEUED</span>)}
              </div>
              
              <div className="absolute -top-3.5 right-4 flex items-center bg-white border border-zinc-200 rounded-full px-2.5 py-1 shadow-sm select-none z-10 transition-colors">
                <span className="text-[10px] font-mono font-bold text-zinc-400">⏱ {formattedDuration}</span>
              </div>

              <div className="pl-0.5 select-text text-zinc-800 space-y-0.5 mt-2">
                {section.lines.length === 0 ? <div className="h-4" /> : section.lines.map((line, lIdx) => {
                  const isCurrentlyPlayingLine = isThisSectionActivePlayback && activeLineIndex === lIdx;
                  return (
                    <MemoizedLyricLine 
                      key={lIdx} line={line} sectionIndex={idx} lineIndex={lIdx} isCurrentlyPlayingLine={isCurrentlyPlayingLine}
                      showChords={showChords} lyricsFontSize={lyricsFontSize} lineSpacing={lineSpacing} chordFormat={chordFormat} activeDisplayKey={activeDisplayKey}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {upcomingTrackItem?.songs && (
          <div className="pt-2 animate-in fade-in duration-300">
            <div onClick={() => { handleUserSelectTrackBadge(currentTrackIndex + 1); document.getElementById("fixed-live-header")?.scrollIntoView({ behavior: "smooth" }); }} className="w-full bg-zinc-50 border border-dashed border-zinc-300/80 hover:bg-zinc-100/50 rounded-2xl p-5 text-center cursor-pointer transition-all select-none group">
              <span className="text-[8px] font-black tracking-widest text-zinc-400 uppercase block mb-0.5">Up Next</span>
              <h4 className="font-black text-xs text-zinc-600 group-hover:text-blue-600 transition-colors">
                ⏩ {upcomingTrackItem.songs.title} <span className="font-normal opacity-50 font-mono text-[10px]">({upcomingTrackItem.custom_key || upcomingTrackItem.songs.original_key})</span>
              </h4>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}