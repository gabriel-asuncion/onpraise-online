import React from "react";
import { ArrangementSection } from "../types/setlist";
import { getSectionAbbreviation, getSectionColorClass } from "../utils/setlist-helpers";

interface StructureEditorModalProps {
  isStructureModalOpen: boolean;
  setIsStructureModalOpen: (val: boolean) => void;
  isSavingStructure: boolean;
  sections: ArrangementSection[];
  originalStructure: ArrangementSection[];
  onReset: () => void;
  draggedSectionIndex: number | null;
  setDraggedSectionIndex: (idx: number | null) => void;
  dragOverIndex: number | null;
  setDragOverIndex: (idx: number | null) => void;
  handleModalSectionDrop: (idx: number) => void;
  handleModalSectionRemoveItem: (idx: number) => void;
  setIsAddBlockModalOpen: (val: boolean) => void;
  saveError: string | null;
}

export function StructureEditorModal({
  isStructureModalOpen, setIsStructureModalOpen, isSavingStructure, sections,
  originalStructure, onReset,
  draggedSectionIndex, setDraggedSectionIndex, dragOverIndex, setDragOverIndex,
  handleModalSectionDrop, handleModalSectionRemoveItem, setIsAddBlockModalOpen, saveError
}: StructureEditorModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const wasOpenRef = React.useRef(false);
  const canReset = JSON.stringify(sections) !== JSON.stringify(originalStructure);

  React.useEffect(() => {
    if (!isStructureModalOpen) {
      if (wasOpenRef.current) document.getElementById("open-structure-editor")?.focus();
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsStructureModalOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isStructureModalOpen, setIsStructureModalOpen]);

  if (!isStructureModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[250000] flex items-end sm:items-center justify-center select-none animate-in fade-in duration-200">
      <button type="button" aria-label="Close structure editor" className="absolute inset-0 cursor-default" onClick={() => setIsStructureModalOpen(false)} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="structure-editor-title" className="bg-[#f8f9fa] w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 border-b border-zinc-100 bg-white rounded-t-3xl sm:rounded-t-3xl z-10">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
          <button ref={closeButtonRef} type="button" onClick={() => setIsStructureModalOpen(false)} className="absolute left-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors cursor-pointer">✕</button>
          <h3 id="structure-editor-title" className="text-base font-bold text-zinc-900 tracking-tight">Edit Structure</h3>
          {isSavingStructure && <span className="absolute right-5 text-[10px] bg-blue-50 font-black text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full animate-pulse">Saving...</span>}
        </div>

        {/* Draggable List Body */}
        {saveError && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{saveError}</p>}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 custom-scrollbar pb-10">
          {sections.map((sec, sIdx) => {
            const isBeingDragged = draggedSectionIndex === sIdx;
            const isHoveredTarget = dragOverIndex === sIdx;
            
            return (
              <div
                key={sec.id}
                draggable
                onDragStart={() => setDraggedSectionIndex(sIdx)}
                onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== sIdx) setDragOverIndex(sIdx); }}
                onDragLeave={() => { if (dragOverIndex === sIdx) setDragOverIndex(null); }}
                onDragEnd={() => { setDraggedSectionIndex(null); setDragOverIndex(null); }}
                onDrop={() => handleModalSectionDrop(sIdx)}
                className={`flex items-center justify-between p-3.5 bg-white rounded-xl transition-all duration-150 ${
                  isBeingDragged ? "opacity-30 shadow-none border border-dashed border-zinc-400" : isHoveredTarget ? "border border-blue-500 scale-[1.02] shadow-md z-10" : "border border-transparent hover:border-zinc-200 shadow-sm"
                }`}
              >
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="cursor-grab active:cursor-grabbing text-zinc-300 pl-1 hover:text-zinc-500 transition-colors">
                    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor"><path d="M4.5 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-5 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-5 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
                  </div>
                  <div className={`w-9 h-9 rounded-full border-[1.5px] flex items-center justify-center text-xs font-black ${getSectionColorClass(sec.section_name)}`}>
                    {getSectionAbbreviation(sec.section_name)}
                  </div>
                  <span className="text-[15px] font-bold text-zinc-800">{sec.section_name}</span>
                </div>
                <button type="button" onClick={() => handleModalSectionRemoveItem(sIdx)} className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-red-500 transition-colors rounded-full hover:bg-red-50 cursor-pointer">✕</button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onReset}
            disabled={isSavingStructure || !canReset}
            className="w-full flex items-center gap-3 p-4 mt-2 text-zinc-600 hover:text-zinc-900 font-bold hover:bg-zinc-100 rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-xl">restart_alt</span>
            <span className="text-[15px]">Reset to Original Structure</span>
          </button>
          <button type="button" onClick={() => setIsAddBlockModalOpen(true)} className="w-full flex items-center gap-3 p-4 mt-2 text-blue-500 hover:text-blue-600 font-bold hover:bg-blue-50/50 rounded-xl transition-colors cursor-pointer">
            <span className="text-2xl leading-none font-light mb-1">+</span> 
            <span className="text-[15px]">Add New Structures</span>
          </button>
        </div>
      </div>
    </div>
  );
}