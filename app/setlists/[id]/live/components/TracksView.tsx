import React, { useEffect, useRef, useState, useMemo } from "react";
import { CompiledSectionToken, ArrangementSection, SongRecord } from "../types/setlist";
import { MemoizedLyricLine } from "./MemoizedLyricLine";

interface TracksViewProps {
  activeSong: SongRecord | null;
  sections: ArrangementSection[];
  songAst: CompiledSectionToken[];
  sectionStarts: number[];
  sectionDurations: number[];
  totalBeats: number;
  quarterBeatsPerMeasure: number;
  activeSectionIndex: number;
  queuedSectionIndex: number | null;
  activeLineIndex: number;
  playheadBeat: number;
  isPlaying: boolean;
  tempo: number;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
  chordFormat: "Key" | "Numbers";
  activeDisplayKey: string;
  handleSectionInteractiveSelection: (idx: number, trackIdx?: number, exactBeat?: number) => void;
  isMD?: boolean;
  midiZoomSteps?: number;
}

function getSectionColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes('chorus')) return 'bg-orange-500';
  if (l.includes('verse')) return 'bg-sky-500';
  if (l.includes('bridge')) return 'bg-primary';
  if (l.includes('intro') || l.includes('inst') || l.includes('inter')) return 'bg-emerald-500';
  if (l.includes('outro')) return 'bg-purple-500';
  if (l.includes('tag') || l.includes('pre')) return 'bg-secondary';
  return 'bg-zinc-500';
}

export function TracksView(props: TracksViewProps) {
  const {
    activeSong, sections, songAst, sectionStarts, sectionDurations, totalBeats, quarterBeatsPerMeasure,
    activeSectionIndex, activeLineIndex, playheadBeat, isPlaying, tempo, showChords, lyricsFontSize,
    lineSpacing, chordFormat, activeDisplayKey, handleSectionInteractiveSelection, isMD, midiZoomSteps = 0
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const programmaticScrollRef = useRef<number | null>(null);

  const [pixelsPerBeat, setPixelsPerBeat] = useState(40);
  const lastMidiZoomRef = useRef(0);
  const [visualActiveIndex, setVisualActiveIndex] = useState(0);

  // 1. Responsive Zoom & Offset Calculation
  const offsetMs = activeSong?.youtube_sync_offset_ms || 0;
  const offsetBeats = Math.max(0, (offsetMs / 1000) / (60 / (tempo || 75)));
  const totalCanvasBeats = totalBeats + offsetBeats;

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const optimal = width / Math.max(1, totalCanvasBeats);
        setPixelsPerBeat(optimal);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [totalBeats, totalCanvasBeats]);

  useEffect(() => {
    const delta = midiZoomSteps - lastMidiZoomRef.current;
    lastMidiZoomRef.current = midiZoomSteps;
    if (!delta || !containerRef.current) return;
    const minimum = containerRef.current.clientWidth / Math.max(1, totalCanvasBeats);
    setPixelsPerBeat((current) => Math.min(Math.max(200, minimum), Math.max(minimum, current + delta * 10)));
  }, [midiZoomSteps, totalCanvasBeats]);

  // 2. Exact Line Parsing Engine
  const getLineBeats = (secName: string, expectedLineCount: number, durationBeats: number) => {
    const st = activeSong?.section_timings as Record<string, any> | undefined;
    let rawTimings = st?.[secName];

    if (typeof rawTimings === 'string') {
      try { rawTimings = JSON.parse(rawTimings); } catch(e){}
    }
    const timings = rawTimings || {};

    let lt = timings.line_timings;
    if (typeof lt === 'string') {
      try { lt = JSON.parse(lt); } catch(e){}
    }

    if (!lt || typeof lt !== 'object' || Object.keys(lt).length === 0) {
      return Array(expectedLineCount).fill(durationBeats / expectedLineCount);
    }

    const beatsArray = [];
    for (let i = 0; i < expectedLineCount; i++) {
      const line = lt[String(i)] || {};
      const m = Number(line.measures) || 0;
      const b = Number(line.beats) || 0;
      const r = Number(line.repeats) || 0;
      const dur = (m * quarterBeatsPerMeasure + b) * (r + 1);
      beatsArray.push(dur > 0 ? dur : (durationBeats / expectedLineCount));
    }
    return beatsArray;
  };

  const flatLines = useMemo(() => {
    const list: { sec: CompiledSectionToken, sIdx: number, line: any, lIdx: number, startBeat: number, endBeat: number }[] = [];
    songAst.forEach((sec, sIdx) => {
      const startBeat = sectionStarts[sIdx] ?? 0;
      const duration = sectionDurations[sIdx] ?? 0;
      const lineCount = Math.max(1, sec.lines.length);

      if (sec.lines.length === 0) {
        list.push({ sec, sIdx, line: null, lIdx: 0, startBeat, endBeat: startBeat + duration });
      } else {
        const lineBeats = getLineBeats(sec.section_name, lineCount, duration);
        let currentLineStart = startBeat;

        sec.lines.forEach((line, lIdx) => {
          const lineDur = lineBeats[lIdx];
          list.push({
            sec, sIdx, line, lIdx,
            startBeat: currentLineStart,
            endBeat: currentLineStart + lineDur
          });
          currentLineStart += lineDur;
        });
      }
    });
    return list;
  }, [songAst, sectionStarts, sectionDurations, activeSong, quarterBeatsPerMeasure]);

  // 3. Helper to find Section by Exact Beat
  const getSectionIndex = (beat: number) => {
    const target = sectionStarts.findIndex((start, i) => {
      const nextStart = sectionStarts[i + 1] ?? totalBeats;
      return beat >= start && beat < nextStart;
    });
    return target !== -1 ? target : 0;
  };

  // 4. Smooth 60FPS Hardware Synchronization
  const stateRef = useRef({ isPlaying, tempo, playheadBeat, pixelsPerBeat, offsetBeats });
  stateRef.current = { isPlaying, tempo, playheadBeat, pixelsPerBeat, offsetBeats };

  const lastBeatRef = useRef(playheadBeat);
  const lastBeatTimeRef = useRef(performance.now());
  const visualLineRef = useRef(0);

  useEffect(() => {
    if (!isPlaying && containerRef.current) {
      const target = Math.max(0, (playheadBeat + offsetBeats) * pixelsPerBeat);
      if (Math.abs(containerRef.current.scrollLeft - target) > 1) {
        containerRef.current.scrollLeft = target;
        programmaticScrollRef.current = containerRef.current.scrollLeft;
      }
    }
  }, [isPlaying, playheadBeat, offsetBeats, pixelsPerBeat]);

  if (playheadBeat !== lastBeatRef.current) {
    lastBeatRef.current = playheadBeat;
    lastBeatTimeRef.current = performance.now();
  }

  useEffect(() => {
    let rAF: number;
    const loop = () => {
      if (containerRef.current) {
        const { isPlaying, tempo, pixelsPerBeat, offsetBeats } = stateRef.current;
        let exactFloatBeat = lastBeatRef.current;

        if (isPlaying) {
          const beatDurationMs = 60000 / (tempo || 75);
          const elapsed = performance.now() - lastBeatTimeRef.current;
          exactFloatBeat = lastBeatRef.current + elapsed / beatDurationMs;

          // Auto-scroll the timeline natively (shifted right by the offset pre-roll space)
          containerRef.current.scrollLeft = (exactFloatBeat + offsetBeats) * pixelsPerBeat;
        } else {
          // If paused, read the exact float beat directly from the user's manual scroll position
          exactFloatBeat = (containerRef.current.scrollLeft / pixelsPerBeat) - offsetBeats;
        }

        let newVisualIdx = !isPlaying
          ? flatLines.findIndex((line) => line.sIdx === activeSectionIndex && line.lIdx === activeLineIndex)
          : flatLines.length - 1;
        if (isPlaying) {
          for (let i = 0; i < flatLines.length; i++) {
            if (exactFloatBeat < flatLines[i].endBeat - 1.0) {
              newVisualIdx = i;
              break;
            }
          }
        }

        if (newVisualIdx !== visualLineRef.current && newVisualIdx >= 0) {
          visualLineRef.current = newVisualIdx;
          setVisualActiveIndex(newVisualIdx);
        }
      }
      rAF = requestAnimationFrame(loop);
    };
    rAF = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rAF);
  }, [flatLines, activeSectionIndex, activeLineIndex]);

  // 5. Interactive Timeline Scrubbing (Clean implementation)
  const handleTimelineScroll = () => {
    if (isPlaying || !isMD) return;
    if (programmaticScrollRef.current !== null) {
      const expected = programmaticScrollRef.current;
      programmaticScrollRef.current = null;
      if (containerRef.current && Math.abs(containerRef.current.scrollLeft - expected) < 1) return;
    }
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      if (!containerRef.current) return;
      const centerBeat = (containerRef.current.scrollLeft / pixelsPerBeat) - offsetBeats;

      const targetSecIdx = getSectionIndex(centerBeat);

      // ✅ SURGICAL FIX: Directly pass the negative/positive exact beat to the engine
      handleSectionInteractiveSelection(targetSecIdx, undefined, Math.max(-offsetBeats, centerBeat));
    }, 150);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMD) return;

    const rect = containerRef.current!.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const centerX = rect.width / 2;

    const currentCenterBeat = (containerRef.current!.scrollLeft / pixelsPerBeat) - offsetBeats;

    // ✅ SURGICAL FIX: Directly calculate the exact sub-beat clicked
    const clickedBeat = Math.max(-offsetBeats, currentCenterBeat + ((clickX - centerX) / pixelsPerBeat));

    const targetSecIdx = getSectionIndex(clickedBeat);

    handleSectionInteractiveSelection(targetSecIdx, undefined, clickedBeat);

    if (containerRef.current) {
      containerRef.current.scrollTo({
        left: (clickedBeat + offsetBeats) * pixelsPerBeat,
        behavior: 'smooth'
      });
    }
  };

  const totalMeasures = Math.ceil(totalBeats / quarterBeatsPerMeasure);
  const preRollMeasures = Math.ceil(offsetBeats / quarterBeatsPerMeasure);
  const totalRenderMeasures = preRollMeasures + totalMeasures;

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] h-full relative overflow-hidden font-sans">

      {/* --- TELEPROMPTER LYRIC GLIDER --- */}
      <div className="flex-1 flex flex-col justify-center px-4 md:px-8 relative z-10 overflow-hidden">
        <div className="w-full max-w-4xl mx-auto h-[320px] relative flex items-center justify-center pointer-events-none">

          {flatLines.map((item, idx) => {
            const offset = idx - visualActiveIndex;
            if (offset < -1 || offset > 2) return null;

            const isActive = offset === 0;
            const yPos = offset === 0 ? 0 : offset === 1 ? 120 : offset === 2 ? 180 : -90;
            const opacity = isActive ? 1 : offset === 1 ? 0.6 : 0;
            const scale = isActive ? 1 : offset === 1 ? 0.95 : 0.9;

            return (
              <div
                key={`${item.sIdx}-${item.lIdx}`}
                className="absolute w-full transition-all duration-[700ms] ease-[cubic-bezier(0.25,1,0.5,1)]"
                style={{
                  transform: `translate3d(0, ${yPos}px, 0) scale(${scale})`,
                  opacity,
                  zIndex: isActive ? 20 : 10 - Math.abs(offset)
                }}
              >
                {isActive ? (
                  <div className="bg-[#18181b] rounded-[20px] border border-[#27272a] shadow-[0_12px_40px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col mx-auto w-full max-w-4xl">
                    <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
                    <div className="px-6 pt-5 pb-7 pl-8">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${getSectionColor(item.sec.section_name)}`}>
                          {item.sec.section_name}
                        </span>
                        <span className="text-blue-400 font-black text-[10px] tracking-widest uppercase">
                          LINE {item.lIdx + 1}/{Math.max(1, item.sec.lines.length)}
                        </span>
                      </div>

                      {item.line ? (
                        <MemoizedLyricLine
                          line={item.line} sectionIndex={item.sIdx} lineIndex={item.lIdx} isCurrentlyPlayingLine={true}
                          showChords={showChords} lyricsFontSize={Math.min(lyricsFontSize + 8, 48)} lineSpacing={lineSpacing}
                          chordFormat={chordFormat} activeDisplayKey={activeDisplayKey}
                        />
                      ) : (
                        <div className="h-10 text-zinc-600 font-black italic uppercase text-sm flex items-center">Instrumental</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-transparent px-6 pl-8 flex flex-col mx-auto w-full max-w-4xl">
                     {item.line ? (
                       <MemoizedLyricLine
                         line={item.line} sectionIndex={item.sIdx} lineIndex={item.lIdx} isCurrentlyPlayingLine={false}
                         showChords={showChords} lyricsFontSize={Math.min(lyricsFontSize, 32)} lineSpacing={lineSpacing}
                         chordFormat={chordFormat} activeDisplayKey={activeDisplayKey}
                       />
                     ) : (
                       <div className="h-6 text-zinc-700 font-black italic uppercase text-[12px] flex items-center">Instrumental</div>
                     )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- TIMELINE RIBBON --- */}
      <div className="h-[120px] bg-[#18181b] border-y border-[#27272a] shadow-[0_0_40px_rgba(0,0,0,0.5)] shrink-0 relative flex flex-col">

        {/* PLAYHEAD ANCHOR */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-red-500 z-50 pointer-events-none transform -translate-x-1/2 shadow-[0_0_12px_rgba(239,68,68,0.9)]">
           <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
           <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-red-500" />
        </div>

        {/* NATIVE SCROLL CANVAS */}
        <div
          ref={containerRef}
          onScroll={handleTimelineScroll}
          className={`absolute inset-0 overflow-x-auto overflow-y-hidden custom-scrollbar ${isPlaying ? 'pointer-events-none' : isMD ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{ scrollBehavior: 'auto' }}
        >
          <div
            className="h-full relative"
            style={{ width: `${totalCanvasBeats * pixelsPerBeat}px`, paddingLeft: '50vw', paddingRight: '50vw', boxSizing: 'content-box' }}
            onClick={handleCanvasClick}
          >
             {/* 1. Bar Numbers Layer */}
             <div className="absolute top-0 h-6 border-b border-[#27272a] flex items-end" style={{ left: '50vw', width: `${totalCanvasBeats * pixelsPerBeat}px` }}>
               {Array.from({ length: totalRenderMeasures }).map((_, i) => {
                 const mIdx = i - preRollMeasures;
                 const beatPos = mIdx * quarterBeatsPerMeasure;
                 if (beatPos + quarterBeatsPerMeasure < -offsetBeats || beatPos > totalBeats) return null;

                 return (
                   <div
                     key={`measure-${mIdx}`}
                     className="absolute h-full border-l border-[#3f3f46] text-[#71717a] font-mono text-[9px] font-bold pl-1 pt-1 pointer-events-none"
                     style={{ left: `${(beatPos + offsetBeats) * pixelsPerBeat}px`, width: `${quarterBeatsPerMeasure * pixelsPerBeat}px` }}
                   >
                     {mIdx < 0 ? mIdx : mIdx + 1}
                   </div>
                 );
               })}
             </div>

             {/* 2. Section Blocks Layer */}
             <div className="absolute top-6 bottom-4" style={{ left: '50vw', width: `${totalCanvasBeats * pixelsPerBeat}px` }}>

               {/* 🟡 Empty Offset Pre-Roll Lane */}
               {offsetBeats > 0 && (
                 <div
                   className="absolute top-1 bottom-1 rounded-md border border-white/5 opacity-40 bg-zinc-800/20"
                   style={{ left: `0px`, width: `${offsetBeats * pixelsPerBeat}px` }}
                 >
                   <div className="absolute top-1 right-2 font-black text-[9px] tracking-widest uppercase text-zinc-500 pointer-events-none">
                     PRE-ROLL
                   </div>
                 </div>
               )}

               {sections.map((sec, idx) => {
                 const startBeat = sectionStarts[idx] ?? 0;
                 const durationBeats = sectionDurations[idx] ?? 0;
                 if (durationBeats <= 0) return null;

                 const isSecActive = idx === activeSectionIndex;
                 const leftPx = (startBeat + offsetBeats) * pixelsPerBeat;
                 const widthPx = durationBeats * pixelsPerBeat;
                 const bgColor = getSectionColor(sec.section_name);

                 const lineCount = Math.max(1, songAst[idx]?.lines.length || 1);
                 const lineBeats = getLineBeats(sec.section_name, lineCount, durationBeats);
                 let accumPartPx = 0;

                 return (
                   <div
                     key={`track-sec-${idx}`}
                     className={`absolute top-1 bottom-1 rounded-md overflow-hidden transition-all duration-200 border border-white/10 ${
                       isSecActive ? 'opacity-100 z-20 shadow-[0_0_15px_rgba(255,255,255,0.15)] scale-y-[1.05] border-white/50' : `opacity-60 z-10 ${isMD ? 'hover:opacity-80 hover:border-white/30 cursor-pointer' : ''}`
                     } ${bgColor}`}
                     style={{
                       left: `${leftPx}px`,
                       width: `${Math.max(4, widthPx - 1)}px`,
                       backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.3))'
                     }}
                   >
                     {Array.from({ length: lineCount - 1 }).map((_, lIdx) => {
                       accumPartPx += lineBeats[lIdx] * pixelsPerBeat;
                       return (
                         <div
                           key={`line-part-${lIdx}`}
                           className="absolute top-0 bottom-0 border-l border-white/30 pointer-events-none shadow-[1px_0_3px_rgba(0,0,0,0.2)]"
                           style={{ left: `${accumPartPx}px` }}
                         />
                       );
                     })}

                     <div className="absolute top-1 left-2 font-black text-[10px] tracking-widest uppercase text-white drop-shadow-md whitespace-nowrap overflow-hidden pointer-events-none">
                       {sec.section_name}
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
        </div>
      </div>

      {/* ✅ ZOOM CONTROLS */}
      <div className="absolute right-4 bottom-[27vh] z-50 flex flex-col gap-1 bg-[#18181b]/80 backdrop-blur-md border border-white/10 p-1 rounded-lg shadow-xl">
        <button onClick={() => setPixelsPerBeat(p => Math.min(Math.max(200, (containerRef.current?.clientWidth || 0) / Math.max(1, totalCanvasBeats)), p + 10))} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 rounded cursor-pointer transition-colors"><span className="material-symbols-outlined text-[18px]">add</span></button>
        <button onClick={() => setPixelsPerBeat(p => Math.max((containerRef.current?.clientWidth || 0) / Math.max(1, totalCanvasBeats), p - 10))} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 rounded cursor-pointer transition-colors"><span className="material-symbols-outlined text-[18px]">remove</span></button>
      </div>

      <div className="h-[25vh] min-h-[120px] bg-[#09090b] shrink-0" />
    </div>
  );
}