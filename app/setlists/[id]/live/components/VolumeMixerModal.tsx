"use client";

import React, { useState, useRef, useEffect } from "react";

interface VolumeMixerModalProps {
  isOpen: boolean;
  onClose: () => void;
  localClickVolume: number;
  setLocalClickVolume: (val: number) => void;
  youtubeVolume: number;
  setYoutubeVolume: (val: number) => void;
  // ✅ SURGICAL FIX: Match the strict types here too
  metronomeSoundType: "blip" | "bell" | "block" | "glass";
  setMetronomeSoundType: (val: "blip" | "bell" | "block" | "glass") => void;
}

// --- REUSABLE CUSTOM FADER COMPONENT ---
interface FaderChannelProps {
  id: 'click' | 'yt' | 'guide';
  label: string;
  val: number;
  setVal: (v: number) => void;
  isMuted: boolean;
  isSoloed: boolean;
  anySoloActive: boolean;
  toggleMute: () => void;
  toggleSolo: () => void;
}

const FaderChannel = ({ 
  id, label, val, setVal, isMuted, isSoloed, anySoloActive, toggleMute, toggleSolo
}: FaderChannelProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateValueFromPointer = (clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    
    let newY = clientY - rect.top;
    
    if (newY < 0) newY = 0;
    if (newY > rect.height) newY = rect.height;
    
    const percent = 1 - (newY / rect.height);
    setVal(percent);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateValueFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col items-center bg-[#333336] p-2 sm:p-3 rounded-lg border border-[#222] shadow-xl w-[90px] sm:w-[100px] shrink-0 select-none touch-none">
      <div className="h-48 relative flex justify-center items-center my-3 w-full">
        {/* Left Decibel Markers */}
        <div className="absolute left-1 top-0 bottom-0 flex flex-col justify-between text-[8px] text-zinc-500 font-mono h-full py-2 pointer-events-none">
          <span>12</span><span>6</span><span>0</span><span>-5</span><span>-10</span><span>-24</span>
        </div>
        
        {/* CUSTOM FADER UI */}
        <div 
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-12 flex justify-center touch-none cursor-pointer z-10"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div ref={trackRef} className="relative w-2 h-full bg-zinc-100 rounded-full shadow-inner pointer-events-none">
            <div className="absolute bottom-0 left-0 w-full bg-blue-600 rounded-full transition-none" style={{ height: `${val * 100}%` }} />
            <div className="absolute left-1/2 -translate-x-1/2 w-5 h-5 bg-blue-600 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition-none" style={{ bottom: `${val * 100}%`, transform: 'translateY(50%)' }} />
          </div>
        </div>
        
        {/* Right LED Lights */}
        <div className="absolute right-1 top-0 bottom-0 flex flex-col justify-between h-full py-2 opacity-80 pointer-events-none">
          {[...Array(6)].map((_, i) => {
            const isLightOn = val >= (1 - (i * 0.2)) - 0.01 && !isMuted && (!anySoloActive || isSoloed);
            return (
              <div key={i} className={`w-1.5 h-1.5 rounded-sm ${isLightOn ? 'bg-green-400 shadow-[0_0_5px_#4ade80]' : 'bg-[#1a1a1a]'}`} />
            );
          })}
        </div>
      </div>

      <div className="flex gap-1.5 mt-2 w-full justify-center">
        <button onClick={toggleMute} className={`w-8 h-8 rounded text-xs font-black shadow-sm transition-all active:scale-95 ${isMuted ? 'bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-[#444] text-zinc-300 border-b-2 border-[#222] hover:bg-[#555]'}`}>M</button>
        <button onClick={toggleSolo} className={`w-8 h-8 rounded text-xs font-black shadow-sm transition-all active:scale-95 ${isSoloed ? 'bg-amber-400 text-white shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'bg-[#444] text-zinc-300 border-b-2 border-[#222] hover:bg-[#555]'}`}>S</button>
      </div>
      <div className="mt-4 text-[9px] text-zinc-400 font-black tracking-widest uppercase text-center w-full truncate border-t border-[#444] pt-2">
        {label}
      </div>
    </div>
  );
};


export function VolumeMixerModal({
  isOpen, onClose, localClickVolume, setLocalClickVolume,
  youtubeVolume, setYoutubeVolume, metronomeSoundType, setMetronomeSoundType // ✅ Destructured new props
}: VolumeMixerModalProps) {
  
  // --- FLUID DISMISS ENGINE ---
  const [dragY, setDragY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const startY = useRef(0);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); setDragY(0); onClose(); }, 250); 
  };

  const handleTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) setDragY(diff); 
  };
  const handleTouchEnd = () => { dragY > 100 ? handleClose() : setDragY(0); };

  // --- MUTE & SOLO ENGINE ---
  const [mutes, setMutes] = useState({ click: false, yt: false, guide: false });
  const [solos, setSolos] = useState({ click: false, yt: false, guide: false });
  const [sliderVals, setSliderVals] = useState({ click: localClickVolume, yt: youtubeVolume, guide: 0.8 });
  const anySoloActive = solos.click || solos.yt || solos.guide;

  useEffect(() => {
    const calcOutput = (id: 'click' | 'yt' | 'guide', rawVol: number) => {
      if (mutes[id]) return 0;
      if (anySoloActive && !solos[id]) return 0;
      return rawVol;
    };
    setLocalClickVolume(calcOutput('click', sliderVals.click));
    setYoutubeVolume(calcOutput('yt', sliderVals.yt));
  }, [mutes, solos, sliderVals, setLocalClickVolume, setYoutubeVolume]);

  if (!isOpen) return null;

  // ✅ SURGICAL FIX: Strictly type the array so the onClick handler is happy
  const SOUND_OPTIONS: ("blip" | "bell" | "block" | "glass")[] = ['blip', 'bell', 'block', 'glass'];

  return (
    <div className={`fixed inset-0 z-[500000] flex items-end justify-center sm:items-center transition-opacity duration-250 ${isClosing ? "opacity-0" : "animate-in fade-in"}`}>
      <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div 
        className="w-full sm:max-w-md bg-[#2b2b2b] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#444] overflow-hidden flex flex-col pb-safe relative z-10 animate-in slide-in-from-bottom-full duration-300"
        style={{ transform: isClosing ? 'translateY(100vh)' : (dragY > 0 ? `translateY(${dragY}px)` : undefined), transition: isClosing || dragY === 0 ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none' }}
      >
        <div className="p-4 flex items-center justify-between border-b border-[#333] cursor-grab active:cursor-grabbing touch-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="flex flex-col flex-1 items-center sm:items-start pl-8 sm:pl-0">
            <div className="w-10 h-1 bg-[#555] rounded-full mb-3 sm:hidden" /> 
            <h3 className="text-sm font-black tracking-wider uppercase text-zinc-200">Stage Mixer</h3>
          </div>
          <button onClick={handleClose} className="w-8 h-8 bg-[#444] hover:bg-[#555] text-zinc-300 rounded-full flex items-center justify-center font-bold transition-colors shrink-0">✕</button>
        </div>

        <div className="p-6 bg-[#222] flex items-stretch justify-center gap-2 sm:gap-4 overflow-x-auto">
          
          {/* ✅ NEW: Metronome Sound Selector Sidebar */}
          <div className="flex flex-col justify-between py-2 pr-4 sm:pr-6 border-r border-[#333] shrink-0">
            {SOUND_OPTIONS.map((sound) => {
              const isActive = metronomeSoundType === sound;
              return (
                <button
                  key={sound}
                  onClick={() => setMetronomeSoundType(sound)}
                  className="flex flex-col items-center gap-1.5 group outline-none transition-all active:scale-95"
                >
                  <div className={`w-5 h-5 rounded-full border-[3px] transition-all flex items-center justify-center ${isActive ? 'border-blue-500' : 'border-[#444] group-hover:border-[#555]'}`}>
                     {isActive && <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_5px_#3b82f6]" />}
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest transition-colors ${isActive ? 'text-blue-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                    {sound}
                  </span>
                </button>
              );
            })}
          </div>

          <FaderChannel 
            id="click" label="Click" val={sliderVals.click} setVal={(v) => setSliderVals(p => ({...p, click: v}))}
            isMuted={mutes.click} isSoloed={solos.click} anySoloActive={anySoloActive}
            toggleMute={() => setMutes(p => ({...p, click: !p.click}))} toggleSolo={() => setSolos(p => ({...p, click: !p.click}))}
          />
          <FaderChannel 
            id="guide" label="Guides" val={sliderVals.guide} setVal={(v) => setSliderVals(p => ({...p, guide: v}))}
            isMuted={mutes.guide} isSoloed={solos.guide} anySoloActive={anySoloActive}
            toggleMute={() => setMutes(p => ({...p, guide: !p.guide}))} toggleSolo={() => setSolos(p => ({...p, guide: !p.guide}))}
          />
          <FaderChannel 
            id="yt" label="YT Sync" val={sliderVals.yt} setVal={(v) => setSliderVals(p => ({...p, yt: v}))}
            isMuted={mutes.yt} isSoloed={solos.yt} anySoloActive={anySoloActive}
            toggleMute={() => setMutes(p => ({...p, yt: !p.yt}))} toggleSolo={() => setSolos(p => ({...p, yt: !p.yt}))}
          />
        </div>
      </div>
    </div>
  );
}