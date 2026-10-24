"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TimelineSection {
  id: string;
  type: string;
  label: string;
  content: string;
  repetitions: number;
}

export type TimelineSnap = "eighth" | "sixteenth" | "thirtysecond";

export interface TimelineLyricPreview {
  sectionType: string;
  sectionLabel: string;
  rawText: string;
  lineIndex: number;
  lineCount: number;
}

interface TimelineArrangementProps {
  sections: TimelineSection[];
  lineDurationsBySectionId: Record<string, number[]>;
  storageKey: string;
  durationOverrides: Record<string, number>;
  gapOverrides: Record<string, number>;
  defaultDurationForType: (type: string) => number;
  meterNumerator: number;
  meterDenominator: number;
  snap: TimelineSnap;
  tempo: number;
  downbeatOffsetMs: number;
  playheadTime: number;
  isPlaying: boolean;
  lyricPreview: TimelineLyricPreview | null;
  onAddSection: (type: string, insertionIndex: number) => void;
  onOpenAddSectionModal: () => void;
  onReorder: (sectionId: string, insertionIndex: number, gapBeforeBeats: number, consumedSpacerId?: string) => void;
  hasCutSection: boolean;
  onCut: (sectionId: string) => void;
  onPaste: () => void;
  onResize: (sectionId: string, durationBeats: number) => void;
  onRemove: (sectionId: string) => void;
  onMeterChange: (numerator: number, denominator: number) => void;
  onSnapChange: (snap: TimelineSnap) => void;
  onDownbeatOffsetChange: (offsetMs: number) => void;
  onSeekTime: (time: number) => void;
  canUndo: boolean;
  onUndo: () => void;
}

type Gesture =
  | { kind: "move-pending"; pointerId: number; sectionId: string; startX: number; startY: number; grabOffsetBeats: number }
  | { kind: "move"; pointerId: number; sectionId: string; grabOffsetBeats: number }
  | { kind: "resize"; pointerId: number; sectionId: string; startBeat: number; durationBeats: number }
  | { kind: "insert-pending"; pointerId: number; sectionType: string };

interface MovePreview {
  sectionId: string;
  insertionIndex: number;
  gapBeforeBeats: number;
  consumedSpacerId?: string;
}

const SNAP_BEATS: Record<TimelineSnap, number> = {
  eighth: 0.5,
  sixteenth: 0.25,
  thirtysecond: 0.125,
};

const CLIP_COLORS = [
  "border-sky-300 bg-sky-600 text-white",
  "border-amber-300 bg-amber-600 text-white",
  "border-emerald-300 bg-emerald-600 text-white",
  "border-violet-300 bg-violet-600 text-white",
  "border-rose-300 bg-rose-600 text-white",
  "border-cyan-300 bg-cyan-600 text-white",
  "border-orange-300 bg-orange-600 text-white",
  "border-indigo-300 bg-indigo-600 text-white",
];

const snapBeat = (beat: number, step: number) => Math.max(0, Math.round(beat / step) * step);

export default function TimelineArrangement({
  sections,
  lineDurationsBySectionId,
  storageKey,
  durationOverrides,
  gapOverrides,
  defaultDurationForType,
  meterNumerator,
  meterDenominator,
  snap,
  tempo,
  downbeatOffsetMs,
  playheadTime,
  isPlaying,
  lyricPreview,
  onAddSection,
  onOpenAddSectionModal,
  onReorder,
  hasCutSection,
  onCut,
  onPaste,
  onResize,
  onRemove,
  onMeterChange,
  onSnapChange,
  onDownbeatOffsetChange,
  onSeekTime,
  canUndo,
  onUndo,
}: TimelineArrangementProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const insertHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggedJustFinishedRef = useRef(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedLaneType, setSelectedLaneType] = useState<string | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [insertionLaneType, setInsertionLaneType] = useState<string | null>(null);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [laneNamesCollapsed, setLaneNamesCollapsed] = useState(false);
  const [laneStateLoaded, setLaneStateLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [followPlayhead, setFollowPlayhead] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSequenceOpen, setIsSequenceOpen] = useState(false);
  const [resizePreview, setResizePreview] = useState<{ id: string; duration: number } | null>(null);
  const [offsetDraft, setOffsetDraft] = useState((downbeatOffsetMs / 1000).toFixed(2));
  const [isSectionDetailsOpen, setIsSectionDetailsOpen] = useState(false);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    let isCollapsed = false;
    try {
      isCollapsed = window.localStorage.getItem(`song-timeline-lanes-collapsed:${storageKey}`) === "true";
    } catch (error) {
      console.error("Failed to restore timeline lane display state.", error);
    }
    const frameId = window.requestAnimationFrame(() => {
      setLaneNamesCollapsed(isCollapsed);
      setLaneStateLoaded(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [storageKey]);

  useEffect(() => {
    if (!laneStateLoaded) return;
    try {
      window.localStorage.setItem(`song-timeline-lanes-collapsed:${storageKey}`, String(laneNamesCollapsed));
    } catch (error) {
      console.error("Failed to save timeline lane display state.", error);
    }
  }, [laneNamesCollapsed, laneStateLoaded, storageKey]);

  const snapStep = SNAP_BEATS[snap];
  const quarterBeatsPerBar = meterNumerator * (4 / meterDenominator);
  const pixelsPerBeat = 18 * zoom;
  const durations = useMemo(
    () => sections.map((section) => Math.max(0.001, resizePreview?.id === section.id
      ? resizePreview.duration
      : durationOverrides[section.id] ?? defaultDurationForType(section.type))),
    [defaultDurationForType, durationOverrides, resizePreview, sections],
  );
  const starts = useMemo(
    () => durations.map((_, index) => sections.slice(0, index).reduce(
      (total, section, sectionIndex) => total + (gapOverrides[section.id] ?? 0) + durations[sectionIndex],
      0,
    ) + (gapOverrides[sections[index].id] ?? 0)),
    [durations, gapOverrides, sections],
  );
  const totalBeats = sections.reduce((total, section, index) => total + (gapOverrides[section.id] ?? 0) + durations[index], 0);
  const laneTypes = Array.from(new Set(sections.map((section) => section.type)));
  if (movePreview && movePreview.gapBeforeBeats > 0 && !laneTypes.includes("Spacer")) laneTypes.push("Spacer");
  const playheadBeat = ((playheadTime - downbeatOffsetMs / 1000) * Math.max(1, tempo)) / 60;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateWidth = () => setViewportWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => () => {
    if (insertHoldTimerRef.current) clearTimeout(insertHoldTimerRef.current);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!followPlayhead || !isPlaying || !viewport || playheadBeat < 0) return;
    viewport.scrollTo({
      left: Math.max(0, playheadBeat * pixelsPerBeat - 16),
      behavior: "auto",
    });
  }, [followPlayhead, isPlaying, pixelsPerBeat, playheadBeat]);

  const getBeatAtX = (clientX: number) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return 0;
    return Math.max(0, (clientX - canvasRect.left) / pixelsPerBeat);
  };

  const getInsertionIndex = (beat: number, skippedSectionId?: string) => {
    let index = 0;
    let position = 0;
    for (const section of sections) {
      if (section.id === skippedSectionId) continue;
      const duration = Math.max(0.001, durationOverrides[section.id] ?? defaultDurationForType(section.type));
      const gap = gapOverrides[section.id] ?? 0;
      if (beat < position + gap + duration) return index;
      position += gap + duration;
      index += 1;
    }
    return index;
  };

  const getMovePreview = (sectionId: string, targetStartBeat: number): MovePreview => {
    const remainingSections = sections.filter((section) => section.id !== sectionId);
    let cursorBeat = 0;
    for (let index = 0; index < remainingSections.length; index += 1) {
      const section = remainingSections[index];
      const duration = Math.max(0.001, durationOverrides[section.id] ?? defaultDurationForType(section.type));
      const start = cursorBeat + (gapOverrides[section.id] ?? 0);
      if (section.type.startsWith("Spacer") && targetStartBeat >= start && targetStartBeat < start + duration) {
        return {
          sectionId,
          insertionIndex: index,
          gapBeforeBeats: 0,
          consumedSpacerId: section.id,
        };
      }
      cursorBeat = start + duration;
    }
    const insertionIndex = Math.max(0, Math.min(getInsertionIndex(targetStartBeat, sectionId), remainingSections.length));
    const precedingEnd = remainingSections.slice(0, insertionIndex).reduce(
      (total, section) => total + (gapOverrides[section.id] ?? 0) + Math.max(0.001, durationOverrides[section.id] ?? defaultDurationForType(section.type)),
      0,
    );
    const gapBeforeBeats = snapBeat(Math.max(0, targetStartBeat - precedingEnd), snapStep);
    return { sectionId, insertionIndex, gapBeforeBeats };
  };

  const layout = useMemo(() => {
    if (!movePreview || movePreview.sectionId !== draggingSectionId) {
      return {
        starts,
        gaps: gapOverrides,
        totalBeats,
      };
    }

    const sectionToMove = sections.find((section) => section.id === movePreview.sectionId);
    if (!sectionToMove) return { starts, gaps: gapOverrides, totalBeats };
    const orderedSections = sections.filter((section) => section.id !== movePreview.sectionId && section.id !== movePreview.consumedSpacerId);
    orderedSections.splice(movePreview.insertionIndex, 0, sectionToMove);
    const previewGaps = { ...gapOverrides, [sectionToMove.id]: movePreview.gapBeforeBeats };
    if (movePreview.consumedSpacerId) delete previewGaps[movePreview.consumedSpacerId];
    let beatCursor = 0;
    const previewStarts: number[] = [];
    for (const section of orderedSections) {
      beatCursor += previewGaps[section.id] ?? 0;
      previewStarts.push(beatCursor);
      beatCursor += Math.max(0.001, resizePreview?.id === section.id
        ? resizePreview.duration
        : durationOverrides[section.id] ?? defaultDurationForType(section.type));
    }
    const startsById = new Map(orderedSections.map((section, index) => [section.id, previewStarts[index]]));
    return {
      starts: sections.map((section) => startsById.get(section.id) ?? 0),
      gaps: previewGaps,
      totalBeats: beatCursor,
    };
  }, [defaultDurationForType, draggingSectionId, durationOverrides, gapOverrides, movePreview, resizePreview, sections, starts, totalBeats]);
  const canvasBeats = Math.max(quarterBeatsPerBar * 16, layout.totalBeats + quarterBeatsPerBar * 16);
  const canvasWidth = Math.max(320, canvasBeats * pixelsPerBeat + 36);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const sectionId = target.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId;
    const resizeHandle = target.closest<HTMLElement>("[data-resize-section]")?.dataset.resizeSection;
    const moveHandle = target.closest<HTMLElement>("[data-move-section]")?.dataset.moveSection;

    if (resizeHandle) {
      const sectionIndex = sections.findIndex((section) => section.id === resizeHandle);
      if (sectionIndex < 0) return;
      event.preventDefault();
      setSelectedSectionId(resizeHandle);
      gestureRef.current = {
        kind: "resize",
        pointerId: event.pointerId,
        sectionId: resizeHandle,
        startBeat: starts[sectionIndex],
        durationBeats: durations[sectionIndex],
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (sectionId) {
      if (moveHandle !== sectionId || selectedSectionId !== sectionId) return;
      event.preventDefault();
      const sectionIndex = sections.findIndex((section) => section.id === sectionId);
      const grabOffsetBeats = sectionIndex < 0 ? 0 : getBeatAtX(event.clientX) - starts[sectionIndex];
      gestureRef.current = {
        kind: "move-pending",
        pointerId: event.pointerId,
        sectionId,
        startX: event.clientX,
        startY: event.clientY,
        grabOffsetBeats,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const laneType = target.closest<HTMLElement>("[data-lane-canvas]")?.dataset.laneType;
    if (!laneType) return;
    gestureRef.current = { kind: "insert-pending", pointerId: event.pointerId, sectionType: laneType };
    const insertionStartBeat = snapBeat(getBeatAtX(event.clientX), snapStep);
    if (insertHoldTimerRef.current) clearTimeout(insertHoldTimerRef.current);
    insertHoldTimerRef.current = setTimeout(() => {
      if (gestureRef.current?.kind !== "insert-pending") return;
      setInsertionLaneType(laneType);
      setInsertionIndex(getInsertionIndex(insertionStartBeat));
    }, 450);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (insertHoldTimerRef.current) clearTimeout(insertHoldTimerRef.current);

    if (gesture.kind === "move-pending") {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5) return;
      gestureRef.current = { kind: "move", pointerId: gesture.pointerId, sectionId: gesture.sectionId, grabOffsetBeats: gesture.grabOffsetBeats };
      setDraggingSectionId(gesture.sectionId);
      setSelectedSectionId(gesture.sectionId);
      const movedSection = sections.find((section) => section.id === gesture.sectionId);
      if (movedSection) setSelectedLaneType(movedSection.type);
      const targetStart = snapBeat(getBeatAtX(event.clientX) - gesture.grabOffsetBeats, snapStep);
      const nextPreview = getMovePreview(gesture.sectionId, targetStart);
      setMovePreview(nextPreview);
      setInsertionIndex(nextPreview.insertionIndex);
    } else if (gesture.kind === "move") {
      const targetStart = snapBeat(getBeatAtX(event.clientX) - gesture.grabOffsetBeats, snapStep);
      const nextPreview = getMovePreview(gesture.sectionId, targetStart);
      setMovePreview(nextPreview);
      setInsertionIndex(nextPreview.insertionIndex);
    } else if (gesture.kind === "resize") {
      const duration = Math.max(snapStep, snapBeat(getBeatAtX(event.clientX) - gesture.startBeat, snapStep));
      setResizePreview({ id: gesture.sectionId, duration });
    } else if (gesture.kind === "insert-pending") {
      const targetBeat = snapBeat(getBeatAtX(event.clientX), snapStep);
      setInsertionIndex(getInsertionIndex(targetBeat));
    }
  };

  const finishGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (insertHoldTimerRef.current) clearTimeout(insertHoldTimerRef.current);

    if (gesture.kind === "move") {
      draggedJustFinishedRef.current = true;
      const targetStart = snapBeat(getBeatAtX(event.clientX) - gesture.grabOffsetBeats, snapStep);
      const dropPreview = getMovePreview(gesture.sectionId, targetStart);
      onReorder(gesture.sectionId, dropPreview.insertionIndex, dropPreview.gapBeforeBeats, dropPreview.consumedSpacerId);
    } else if (gesture.kind === "resize") {
      const duration = resizePreview?.id === gesture.sectionId
        ? resizePreview.duration
        : gesture.durationBeats;
      if (duration !== gesture.durationBeats) onResize(gesture.sectionId, duration);
    } else if (gesture.kind === "insert-pending" && insertionLaneType) {
      const targetBeat = snapBeat(getBeatAtX(event.clientX), snapStep);
      onAddSection(gesture.sectionType, getInsertionIndex(targetBeat));
    }

    gestureRef.current = null;
    setDraggingSectionId(null);
    setMovePreview(null);
    setInsertionLaneType(null);
    setInsertionIndex(null);
    setResizePreview(null);
  };

  const cancelGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    if (insertHoldTimerRef.current) clearTimeout(insertHoldTimerRef.current);
    gestureRef.current = null;
    setDraggingSectionId(null);
    setMovePreview(null);
    setInsertionLaneType(null);
    setInsertionIndex(null);
    setResizePreview(null);
  };

  const playheadVisible = playheadBeat >= 0 && playheadBeat <= canvasBeats;
  const selectedSection = sections.find((section) => section.id === selectedSectionId);
  const draggingSectionType = sections.find((section) => section.id === draggingSectionId)?.type;
  const insertionGuideType = insertionLaneType ?? draggingSectionType;
  const insertionGuideBeat = insertionIndex === null
    ? null
    : draggingSectionId
      ? layout.starts[sections.findIndex((section) => section.id === draggingSectionId)]
      : sections
        .slice(0, insertionIndex)
        .reduce((total, section) => total + (layout.gaps[section.id] ?? 0) + Math.max(0.001, durationOverrides[section.id] ?? defaultDurationForType(section.type)), 0);
  const laneColumnWidth = laneNamesCollapsed ? 24 : 144;
  const abbreviateLane = (type: string) => type
    .split(/[\s-]+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 3);
  const colorForSection = (type: string) => {
    const hash = Array.from(type).reduce((total, character) => total + character.charCodeAt(0), 0);
    return CLIP_COLORS[hash % CLIP_COLORS.length];
  };
  const timelineToolbar = (
    <div className="mb-2 flex h-9 items-center justify-between gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-low px-2">
      <div className="flex items-center gap-2">
        <button type="button" data-timeline-overlay onClick={onUndo} disabled={!canUndo} aria-label="Undo timeline change" title="Undo timeline change" className="flex h-7 w-7 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container-high text-on-surface hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-40">
          <span className="material-symbols-outlined !text-[18px]">undo</span>
        </button>
        {hasCutSection && (
          <button type="button" data-timeline-overlay onClick={onPaste} aria-label="Paste cut section at end" title="Paste section at end" className="flex h-7 items-center gap-1 rounded-md border border-outline-variant/30 bg-surface-container-high px-2 text-[10px] font-bold text-on-surface hover:bg-surface-bright">
            <span className="material-symbols-outlined !text-[17px]">content_paste</span>
            Paste
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Timeline</span>
        <button
          type="button"
          data-timeline-overlay
          onClick={() => setFollowPlayhead((following) => !following)}
          aria-label={followPlayhead ? "Disable follow playhead" : "Follow playhead"}
          aria-pressed={followPlayhead}
          title={followPlayhead ? "Disable follow playhead" : "Follow playhead"}
          className={`flex h-7 w-7 items-center justify-center rounded-md border border-outline-variant/30 ${followPlayhead ? "bg-primary/20 text-primary" : "bg-surface-container-high text-on-surface"} hover:bg-surface-bright`}
        >
          <span className="material-symbols-outlined !text-[18px]">my_location</span>
        </button>
      </div>
      <div data-timeline-overlay className="flex items-center gap-1 rounded-lg border border-outline-variant/30 bg-surface-container-high p-0.5">
        <button type="button" onClick={() => setZoom((current) => Math.max(0.1, Number((current - 0.1).toFixed(2))))} disabled={zoom <= 0.1} aria-label="Zoom out" title="Zoom out" className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface hover:bg-surface-bright disabled:opacity-40">
          <span className="material-symbols-outlined !text-[18px]">remove</span>
        </button>
        <span className="w-10 text-center font-mono text-[9px] font-bold text-on-surface-variant">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((current) => Math.min(3, Number((current + 0.1).toFixed(2))))} disabled={zoom >= 3} aria-label="Zoom in" title="Zoom in" className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface hover:bg-surface-bright disabled:opacity-40">
          <span className="material-symbols-outlined !text-[18px]">add</span>
        </button>
      </div>
    </div>
  );
  const movingSectionIndex = draggingSectionId
    ? sections.findIndex((section) => section.id === draggingSectionId)
    : -1;
  const movingSectionStartBeat = movingSectionIndex >= 0 ? layout.starts[movingSectionIndex] : null;
  const movingSectionBar = movingSectionStartBeat === null ? null : Math.floor(movingSectionStartBeat / quarterBeatsPerBar) + 1;
  const beatWithinBar = movingSectionStartBeat === null ? null : movingSectionStartBeat % quarterBeatsPerBar;
  const meterBeatUnit = 4 / meterDenominator;
  const beatNumber = beatWithinBar === null ? null : Math.floor(beatWithinBar / meterBeatUnit) + 1;
  const beatSubdivision = beatWithinBar === null ? 0 : (beatWithinBar % meterBeatUnit) / meterBeatUnit;
  const subdivisionNumerator = Math.round(beatSubdivision * 8);
  const subdivisionGcd = (left: number, right: number): number => right ? subdivisionGcd(right, left % right) : left;
  const subdivisionDivisor = subdivisionNumerator > 0 ? subdivisionGcd(subdivisionNumerator, 8) : 1;
  const beatSubdivisionLabel = subdivisionNumerator > 0
    ? `+ ${subdivisionNumerator / subdivisionDivisor}/${8 / subdivisionDivisor}`
    : "";
  const movingTime = movingSectionStartBeat === null
    ? null
    : Math.max(0, downbeatOffsetMs / 1000 + movingSectionStartBeat * 60 / Math.max(1, tempo));
  const movingTimeLabel = movingTime === null
    ? null
    : `${Math.floor(movingTime / 60).toString().padStart(2, "0")}:${(movingTime % 60).toFixed(2).padStart(5, "0")}`;
  const movingLaneIndex = movingSectionIndex >= 0
    ? laneTypes.indexOf(sections[movingSectionIndex].type)
    : -1;
  const snapGridWidth = Math.min(1, Math.max(0.5, snapStep * pixelsPerBeat * 0.18));
  const meterBeatWidth = (4 / meterDenominator) * pixelsPerBeat;
  const meterBeatGridWidth = Math.min(1, Math.max(0.5, meterBeatWidth * 0.12));
  const barGridWidth = Math.min(1.5, Math.max(0.75, quarterBeatsPerBar * pixelsPerBeat * 0.025));

  return (
    <section
      className="relative min-h-[calc(100vh-13rem)] w-full min-w-0 max-w-full animate-in fade-in"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-timeline-overlay]")) return;
        const laneType = (event.target as HTMLElement).closest<HTMLElement>("[data-lane-type]")?.dataset.laneType;
        if (laneType) {
          setSelectedLaneType(laneType);
          setSelectedSectionId(null);
          setIsSectionDetailsOpen(false);
        } else if (!(event.target as HTMLElement).closest("[data-section-id]")) {
          setSelectedSectionId(null);
          setSelectedLaneType(null);
          setIsSectionDetailsOpen(false);
        }
      }}
    >
      <div className="sticky top-0 z-40 -mx-1 mb-2 space-y-2 border-b border-outline-variant/30 bg-surface/95 px-1 pb-2 pt-1 shadow-sm backdrop-blur">
        {timelineToolbar}
        <div className="flex min-h-14 items-center gap-3 rounded-xl border border-outline-variant/30 border-l-4 border-l-primary bg-surface-container-low px-4 py-2 shadow-sm" aria-live="polite">
        {lyricPreview ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="mb-1 truncate text-[9px] font-black uppercase tracking-widest text-primary">
                {lyricPreview.sectionLabel} · Line {lyricPreview.lineIndex + 1}/{lyricPreview.lineCount}
              </div>
              <div className="flex min-h-7 items-end gap-3 overflow-hidden">
                {Array.from(lyricPreview.rawText.matchAll(/(?:\[([^\]]+)\])?([^\[]*)/g))
                  .filter((match) => match[1] || match[2])
                  .map((match, index) => (
                    <span key={`${index}-${match[1] ?? ""}`} className="flex shrink-0 flex-col justify-end">
                      <span className="min-h-3 text-[10px] font-bold leading-none text-sky-400">{match[1] ?? ""}</span>
                      <span className="whitespace-pre text-sm font-semibold leading-tight text-on-surface">{match[2] || " "}</span>
                    </span>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <span className="text-xs font-medium text-on-surface-variant">No lyric at the current playback position.</span>
        )}
        </div>
      </div>
      <div
        ref={viewportRef}
        className="relative h-[calc(100vh-14rem)] min-h-[360px] w-full min-w-0 max-w-full overflow-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-inner"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
      >
        <div className="flex min-h-full w-max min-w-full">
          <aside
            className="sticky left-0 z-30 h-fit self-start shrink-0 border-r border-outline-variant/30 bg-surface-container-low shadow-[4px_0_10px_rgba(0,0,0,0.12)] transition-[width] duration-200"
            style={{ width: `${laneColumnWidth}px` }}
          >
            <button
              type="button"
              onClick={() => setLaneNamesCollapsed((collapsed) => !collapsed)}
              aria-label={laneNamesCollapsed ? "Expand section lane names" : "Collapse section lane names"}
              title={laneNamesCollapsed ? "Expand lanes" : "Collapse lanes"}
              className="flex h-9 w-full items-center justify-center gap-1 border-b border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined !text-[17px]">{laneNamesCollapsed ? "chevron_right" : "chevron_left"}</span>
              
            </button>
            {/* <div className="flex h-8 items-center justify-center border-b border-outline-variant/30 text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
              {laneNamesCollapsed ? "Lane" : "Section"}
            </div> */}
            {laneTypes.map((type) => (
              <button
                key={type}
                type="button"
                data-lane-type={type}
                onClick={(event) => { event.stopPropagation(); setSelectedLaneType(type); setSelectedSectionId(null); }}
                title={type}
                className={`flex h-10 w-full items-center border-b border-outline-variant/20 text-xs font-black uppercase tracking-wide text-on-surface transition-[padding,background-color] duration-200 ${laneNamesCollapsed ? "justify-center px-1" : "px-3"} ${selectedLaneType === type ? "bg-primary/20 text-primary ring-1 ring-inset ring-primary/50" : "hover:bg-surface-container-high"}`}
              >
                {laneNamesCollapsed ? abbreviateLane(type) : <span className="truncate">{type}</span>}
              </button>
            ))}
            {laneTypes.length === 0 && (
              <div className="flex h-16 items-center justify-center px-2 text-center text-[10px] font-semibold text-on-surface-variant">
                {laneNamesCollapsed ? "+" : "Add a section to start"}
              </div>
            )}
          </aside>
          <div ref={canvasRef} className="relative shrink-0" style={{ width: `${canvasWidth}px` }}>
            {/* <div aria-hidden="true" className="h-9 border-b border-outline-variant/30 bg-surface-container-low" /> */}
            <div
              className="relative h-8 border-b border-outline-variant/30 bg-surface-container-low"
              aria-label="Timeline bar ruler"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const beat = Math.max(0, (event.clientX - rect.left) / pixelsPerBeat);
                onSeekTime(Math.max(0, downbeatOffsetMs / 1000 + beat * 60 / Math.max(1, tempo)));
              }}
            >
              {Array.from({ length: Math.ceil(canvasBeats / quarterBeatsPerBar) + 1 }, (_, index) => (
                <div key={index} className="absolute inset-y-0" style={{ left: `${index * quarterBeatsPerBar * pixelsPerBeat}px`, width: `${quarterBeatsPerBar * pixelsPerBeat}px` }}>
                  <span className="absolute inset-y-0 left-0 border-l border-outline-variant/60 pl-1.5 pt-1 text-[9px] font-mono font-bold text-on-surface-variant">
                    {index + 1}
                  </span>
                  {Array.from({ length: meterNumerator }, (_, beatIndex) => (
                    <span
                      key={beatIndex}
                      aria-hidden="true"
                      className="absolute bottom-0 top-0 border-l border-outline-variant/30"
                      style={{ left: `${beatIndex * meterBeatWidth}px` }}
                    >
                      {meterBeatWidth >= 24 && (
                        <span className="absolute bottom-0.5 left-1 text-[8px] font-mono font-medium text-on-surface-variant/70">{beatIndex + 1}</span>
                      )}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            {laneTypes.map((type, laneIndex) => (
              <div
                key={type}
                data-lane-type={type}
                data-lane-canvas
                className={`relative h-10 border-b border-outline-variant/30 transition-colors ${laneIndex % 2 === 1 ? "bg-[#252529]" : "bg-[#111113]"} ${selectedLaneType === type ? "!bg-primary/15 ring-2 ring-inset ring-primary/70" : ""}`}
                style={{
                  touchAction: "none",
                  backgroundColor: laneIndex % 2 === 1 ? "#252529" : "#111113",
                  backgroundImage: [
                    `repeating-linear-gradient(to right, transparent 0, transparent ${Math.max(0, snapStep * pixelsPerBeat - snapGridWidth)}px, rgba(220,220,230,0.18) ${Math.max(0, snapStep * pixelsPerBeat - snapGridWidth)}px, rgba(220,220,230,0.18) ${snapStep * pixelsPerBeat}px)`,
                    `repeating-linear-gradient(to right, transparent 0, transparent ${Math.max(0, meterBeatWidth - meterBeatGridWidth)}px, rgba(220,220,230,0.38) ${Math.max(0, meterBeatWidth - meterBeatGridWidth)}px, rgba(220,220,230,0.38) ${meterBeatWidth}px)`,
                    `repeating-linear-gradient(to right, transparent 0, transparent ${Math.max(0, quarterBeatsPerBar * pixelsPerBeat - barGridWidth)}px, rgba(255,255,255,0.68) ${Math.max(0, quarterBeatsPerBar * pixelsPerBeat - barGridWidth)}px, rgba(255,255,255,0.68) ${quarterBeatsPerBar * pixelsPerBeat}px)`,
                  ].join(", "),
                }}
              >
                {sections.map((section, index) => {
                  if (section.type !== type) return null;
                  if (movePreview?.consumedSpacerId === section.id) return null;
                  const isSelected = selectedSectionId === section.id;
                  const isDragging = draggingSectionId === section.id;
                  const clipColor = colorForSection(section.type);
                  const gapBefore = movePreview?.sectionId === section.id ? 0 : layout.gaps[section.id] ?? 0;
                  const clipLabel = section.type.startsWith("Spacer")
                    ? `Spacer · ${durations[index]} beats`
                    : section.label;
                  const lineDurations = lineDurationsBySectionId[section.id] ?? [];
                  const totalLineDuration = lineDurations.reduce((total, lineDuration) => total + lineDuration, 0);
                  let partitionCursor = 0;
                  return (
                    <div key={section.id}>
                      {gapBefore > 0 && (
                        <div
                          className={`absolute top-1 h-8 border-y border-dashed border-primary/60 ${movePreview?.sectionId === section.id ? "bg-primary/20" : "bg-primary/10"}`}
                          title={`${gapBefore} beat spacer`}
                          style={{ left: `${(layout.starts[index] - gapBefore) * pixelsPerBeat}px`, width: `${gapBefore * pixelsPerBeat}px` }}
                        />
                      )}
                      <div
                        id={`timeline-clip-${section.id}`}
                        data-section-id={section.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (draggedJustFinishedRef.current) {
                            draggedJustFinishedRef.current = false;
                            return;
                          }
                          setSelectedSectionId(section.id);
                          setSelectedLaneType(section.type);
                          setIsSectionDetailsOpen(false);
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setSelectedSectionId(section.id);
                          setSelectedLaneType(section.type);
                          setIsSectionDetailsOpen(true);
                        }}
                        title={`${clipLabel} · ${((durations[index] / quarterBeatsPerBar)).toFixed(2)} bars`}
                        className={`absolute top-1 flex h-8 select-none items-center rounded-md border px-2 shadow-sm ${isDragging ? "z-20 opacity-85 shadow-xl" : "transition-[left,width,background-color] duration-200 ease-out"} ${clipColor} ${isSelected ? "ring-2 ring-white ring-offset-1 ring-offset-primary" : "hover:brightness-110"} cursor-pointer`}
                        style={{
                          left: `${layout.starts[index] * pixelsPerBeat + 2}px`,
                          width: `${Math.max(20, durations[index] * pixelsPerBeat - 4)}px`,
                          touchAction: "none",
                          transition: isDragging ? "none" : undefined,
                        }}
                      >
                        {isSelected && !section.type.startsWith("Spacer") && (
                          <button
                            type="button"
                            data-move-section={section.id}
                            aria-label={`Drag to move ${section.label}`}
                            title="Drag to move"
                            onClick={(event) => event.stopPropagation()}
                            className="absolute -left-1 top-0 z-20 flex h-full w-4 cursor-grab touch-none items-center justify-center rounded-l-md bg-black/30 text-white/80 hover:bg-black/50 active:cursor-grabbing"
                          >
                            <span className="material-symbols-outlined !text-[13px]">drag_indicator</span>
                          </button>
                        )}
                        <span className="min-w-0 truncate text-[10px] font-black">{clipLabel}</span>
                        {totalLineDuration > 0 && (
                          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
                            {lineDurations.slice(0, -1).map((lineDuration, lineIndex) => {
                              partitionCursor += lineDuration;
                              return (
                                <span
                                  key={`${section.id}-line-partition-${lineIndex}`}
                                  title={`Line ${lineIndex + 1} · ${lineDuration} beats`}
                                  className="absolute bottom-0 top-0 border-l border-white/80 shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                                  style={{ left: `${(partitionCursor / totalLineDuration) * 100}%` }}
                                />
                              );
                            })}
                          </div>
                        )}
                        {isSelected && (
                          <div
                            data-resize-section={section.id}
                            className="absolute -right-1 top-0 z-20 flex h-full w-4 cursor-col-resize items-center justify-center"
                            aria-label={`Resize ${section.label}`}
                          >
                            <span className="h-5 w-1 rounded-full bg-primary" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {type === "Spacer" && movePreview && movePreview.gapBeforeBeats > 0 && (
                  <div
                    aria-label={`Spacer preview, ${movePreview.gapBeforeBeats} beats`}
                    className="pointer-events-none absolute top-1 flex h-8 items-center justify-center rounded border border-dashed border-sky-300 bg-sky-400/20 text-[9px] font-black text-sky-100 shadow-inner"
                    style={{
                      left: `${(layout.starts[sections.findIndex((section) => section.id === movePreview.sectionId)] - movePreview.gapBeforeBeats) * pixelsPerBeat}px`,
                      width: `${movePreview.gapBeforeBeats * pixelsPerBeat}px`,
                    }}
                  >
                    {movePreview.gapBeforeBeats >= snapStep ? `${movePreview.gapBeforeBeats} beat${movePreview.gapBeforeBeats === 1 ? "" : "s"}` : ""}
                  </div>
                )}
                {insertionGuideType === type && insertionIndex !== null && (
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-primary shadow-[0_0_8px_rgba(59,130,246,0.8)] transition-[left] duration-150 ease-out"
                    style={{
                      left: `${(insertionGuideBeat ?? totalBeats) * pixelsPerBeat}px`,
                    }}
                  />
                )}
              </div>
            ))}
            <div
              data-timeline-overlay
              className="sticky z-40 flex h-16 items-center justify-center"
              style={{
                left: `${laneColumnWidth}px`,
                width: `${Math.max(0, viewportWidth - laneColumnWidth)}px`,
              }}
            >
              <button
                type="button"
                onClick={onOpenAddSectionModal}
                aria-label="Add section after the last lane"
                title="Add section after the last lane"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-xl ring-4 ring-surface-container-lowest/80 transition-transform hover:scale-105 active:scale-95"
              >
                <span className="material-symbols-outlined !text-[25px]">add</span>
              </button>
            </div>
            <div aria-hidden="true" className="h-14" />
            {movingSectionStartBeat !== null && movingLaneIndex >= 0 && (
              <div
                data-timeline-overlay
                className="pointer-events-none absolute z-30 -translate-y-full whitespace-nowrap rounded-md border border-primary/60 bg-surface-container-highest px-2 py-1 text-[10px] font-black text-on-surface shadow-lg"
                style={{
                  left: `${movingSectionStartBeat * pixelsPerBeat + 2}px`,
                  top: `${68 + movingLaneIndex * 40 - 3}px`,
                }}
              >
                {movingTimeLabel} · Bar {movingSectionBar} · Beat {beatNumber} {beatSubdivisionLabel}
              </div>
            )}
            {playheadVisible && (
              <div
                className="pointer-events-none absolute bottom-0 top-[2rem] z-10 w-0.75 bg-error"
                style={{ left: `${playheadBeat * pixelsPerBeat}px` }}
                aria-label="Audio playhead"
              />
            )}
          </div>
        </div>
      </div>

      {portalTarget && createPortal(
        <>
          {selectedSection && isSectionDetailsOpen && (
            <div data-timeline-overlay data-section-id={selectedSection.id} className="fixed left-1/2 top-20 z-[250001] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/30 bg-surface-container-highest/95 px-3 py-1.5 shadow-lg backdrop-blur">
              <span className="max-w-36 truncate text-[10px] font-black text-on-surface">{selectedSection.label}</span>
              <span className="font-mono text-[10px] text-on-surface-variant">
                {(durations[sections.findIndex((section) => section.id === selectedSection.id)] / quarterBeatsPerBar).toFixed(2)} bars
              </span>
              <button
                type="button"
                aria-label={`Cut ${selectedSection.label}`}
                title="Cut section"
                onClick={() => onCut(selectedSection.id)}
                className="flex h-7 items-center gap-1 rounded-full px-2 text-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined !text-[16px]">content_cut</span>
                <span className="text-[9px] font-black uppercase">Cut</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${selectedSection.label}`}
                title="Remove section"
                onClick={() => onRemove(selectedSection.id)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-error hover:bg-error/10"
              >
                <span className="material-symbols-outlined !text-[16px]">close</span>
              </button>
            </div>
          )}

          <div data-timeline-overlay className="fixed right-3 top-1/2 z-[250001] flex -translate-y-1/2 flex-col gap-2">
            <button
              type="button"
              onClick={() => setIsSequenceOpen(true)}
              aria-label="Show timeline sequence"
              title="Timeline sequence"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/40 bg-surface-container-highest/95 text-on-surface shadow-lg backdrop-blur hover:bg-surface-bright ${isSequenceOpen ? "ring-2 ring-primary" : ""}`}
            >
              <span className="material-symbols-outlined !text-[21px]">view_agenda</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOffsetDraft((downbeatOffsetMs / 1000).toFixed(2));
                setIsSettingsOpen(true);
              }}
              aria-label="Timeline settings"
              title="Timeline settings"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/40 bg-surface-container-highest/95 text-on-surface shadow-lg backdrop-blur hover:bg-surface-bright"
            >
              <span className="material-symbols-outlined !text-[21px]">tune</span>
            </button>
          </div>

          {isSequenceOpen && (
            <div data-timeline-overlay className="fixed inset-0 z-[250000] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsSequenceOpen(false);
            }}>
              <aside className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-outline-variant/30 bg-surface-container shadow-2xl animate-in slide-in-from-bottom-full duration-300 md:rounded-3xl md:animate-in md:zoom-in-95">
                <div className="flex items-center justify-between border-b border-outline-variant/30 p-5">
                  <div>
                    <h3 className="text-base font-black text-on-surface">Timeline sequence</h3>
                    <p className="mt-1 text-[10px] font-semibold text-on-surface-variant">{sections.length} sections · arrangement order</p>
                  </div>
                  <button type="button" onClick={() => setIsSequenceOpen(false)} aria-label="Close timeline sequence" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-bright">
                    <span className="material-symbols-outlined !text-[18px]">close</span>
                  </button>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto p-3">
                  {sections.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs font-semibold text-on-surface-variant">Add a section to see the sequence.</p>
                  ) : sections.map((section, index) => (
                    <button
                      key={section.id}
                      type="button"
                      data-section-id={section.id}
                      onClick={() => {
                        setSelectedSectionId(section.id);
                        setSelectedLaneType(section.type);
                        document.getElementById(`timeline-clip-${section.id}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                          inline: "center",
                        });
                        setIsSequenceOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${selectedSectionId === section.id ? "border-primary/50 bg-primary/10" : "border-transparent bg-surface-container-lowest hover:bg-surface-container-high"}`}
                    >
                      <span className="w-7 shrink-0 text-right font-mono text-[10px] font-bold text-on-surface-variant">{String(index + 1).padStart(2, "0")}</span>
                      <span className={`h-3 w-3 shrink-0 rounded-sm ${colorForSection(section.type).split(" ").find((className) => className.startsWith("bg-")) ?? "bg-primary"}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-black text-on-surface">{section.label}</span>
                      <span className="shrink-0 font-mono text-[10px] text-on-surface-variant">
                        {(durations[index] / quarterBeatsPerBar).toFixed(1)} bars
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {isSettingsOpen && (
            <div
              data-timeline-overlay
              className="fixed inset-0 z-[250000] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsSettingsOpen(false);
              }}
            >
              <div role="dialog" aria-modal="true" aria-labelledby="timeline-settings-title" className="w-full max-w-sm space-y-5 rounded-t-3xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-2xl animate-in slide-in-from-bottom-full duration-300 md:rounded-2xl md:animate-in md:zoom-in-95">
                <div className="flex items-center justify-between">
                  <h3 id="timeline-settings-title" className="text-sm font-black text-on-surface">Timeline settings</h3>
                  <button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="Close timeline settings" className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high">
                    <span className="material-symbols-outlined !text-[19px]">close</span>
                  </button>
                </div>
                <label className="flex items-center justify-between gap-4 text-xs font-bold text-on-surface">
                  Time signature
                  <span className="flex items-center gap-1">
                    <select aria-label="Time signature numerator" value={meterNumerator} onChange={(event) => onMeterChange(Number(event.target.value), meterDenominator)} className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-2">
                      {[2, 3, 4, 5, 6, 7, 9, 12].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <span>/</span>
                    <select aria-label="Time signature denominator" value={meterDenominator} onChange={(event) => onMeterChange(meterNumerator, Number(event.target.value))} className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-2">
                      {[2, 4, 8, 16].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </span>
                </label>
                <label className="flex items-center justify-between gap-4 text-xs font-bold text-on-surface">
                  Snap subdivision
                  <select aria-label="Timeline snap" value={snap} onChange={(event) => onSnapChange(event.target.value as TimelineSnap)} className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-2">
                    <option value="eighth">1/8 note</option>
                    <option value="sixteenth">1/16 note</option>
                    <option value="thirtysecond">1/32 note</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-bold text-on-surface">
                  Downbeat offset (seconds)
                  <input aria-label="Downbeat offset in seconds" type="number" step="0.01" value={offsetDraft} onChange={(event) => setOffsetDraft(event.target.value)} className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2" />
                </label>
                <button type="button" onClick={() => {
                  onDownbeatOffsetChange(Math.round((Number(offsetDraft) || 0) * 1000));
                  setIsSettingsOpen(false);
                }} className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-on-primary hover:bg-primary/90">
                  Done
                </button>
              </div>
            </div>
          )}
        </>,
        portalTarget
      )}
    </section>
  );
}
