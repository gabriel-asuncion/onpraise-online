"use client";

import React, { useState, useRef, useEffect } from "react";

interface VolumeMixerModalProps {
  isOpen: boolean;
  onClose: () => void;
  localClickVolume: number;
  setLocalClickVolume: (val: number) => void;
  youtubeVolume: number;
  setYoutubeVolume: (val: number) => void;
}

export function VolumeMixerModal({
  isOpen, onClose, localClickVolume, setLocalClickVolume,
  youtubeVolume, setYoutubeVolume
}: VolumeMixerModalProps) {
  
  // --- FLUID DISMISS ENGINE ---
  const [dragY, setDragY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const startY = useRef(0);

  // Trigger the fluid exit animation before unmounting
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setDragY(0);
      onClose();
    }, 250); // Matches the CSS transition duration
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0) setDragY(diff); // Only allow dragging downwards
  };

  const handleTouchEnd = () => {
    if (dragY > 100) {
      handleClose(); // Threshold met, trigger animated close
    } else {
      setDragY(0); // Snap back if threshold not met
    }
  };

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

  // Reusable Fader Component
  const FaderChannel = ({ 
    id, label, val, setVal 
  }: { 
    id: 'click' | 'yt' | 'guide', label: string, val: number, setVal: (v: number) => void 
  }) => {
    const isMuted = mutes[id];
    const isSoloed = solos[id];

    return (
      <div className="flex flex-col items-center bg-[#333336] p-2 sm:p-3 rounded-lg border border-[#222] shadow-xl w-[90px] sm:w-[100px] shrink-0">
        <div className="h-48 relative flex justify-center items-center my-3 w-full">
          <div className="absolute left-1 top-0 bottom-0 flex flex-col justify-between text-[8px] text-zinc-500 font-mono h-full py-2 select-none pointer-events-none">
            <span>12</span><span>6</span><span>0</span><span>-5</span><span>-10</span><span>-24</span>
          </div>
          
          {/* ✅ EXACT CODEPEN SPEC: Pure native CSS. No Tailwind interference. Signature Blue. */}
          <input 
            type="range" min="0" max="1" step="0.2" value={val} 
            onChange={(e) => setVal(parseFloat(e.target.value))}
            style={{ 
              WebkitAppearance: 'slider-vertical',
              appearance: 'slider-vertical',
              width: '100%', 
              height: '100%',
              background: 'transparent',
              outline: 'none',
              margin: 0,
              accentColor: '#2563eb' // Signature blue-600
            } as any} 
            className="cursor-pointer z-10" 
          />
          
          <div className="absolute right-1 top-0 bottom-0 flex flex-col justify-between h-full py-2 opacity-80 select-none pointer-events-none">
            {[...Array(6)].map((_, i) => {
              const isLightOn = val >= (1 - (i * 0.2)) - 0.01 && !isMuted && (!anySoloActive || isSoloed);
              return (
                <div key={i} className={`w-1.5 h-1.5 rounded-sm ${isLightOn ? 'bg-green-400 shadow-[0_0_5px_#4ade80]' : 'bg-[#1a1a1a]'}`} />
              );
            })}
          </div>
        </div>

        <div className="flex gap-1.5 mt-2 w-full justify-center">
          <button 
            onClick={() => setMutes(prev => ({ ...prev, [id]: !prev[id] }))}
            className={`w-8 h-8 rounded text-xs font-black shadow-sm transition-all active:scale-95 ${isMuted ? 'bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-[#444] text-zinc-300 border-b-2 border-[#222] hover:bg-[#555]'}`}
          >
            M
          </button>
          <button 
            onClick={() => setSolos(prev => ({ ...prev, [id]: !prev[id] }))}
            className={`w-8 h-8 rounded text-xs font-black shadow-sm transition-all active:scale-95 ${isSoloed ? 'bg-amber-400 text-white shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'bg-[#444] text-zinc-300 border-b-2 border-[#222] hover:bg-[#555]'}`}
          >
            S
          </button>
        </div>
        <div className="mt-4 text-[9px] text-zinc-400 font-black tracking-widest uppercase text-center w-full truncate border-t border-[#444] pt-2">
          {label}
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 z-[500000] flex items-end justify-center sm:items-center transition-opacity duration-250 ${isClosing ? "opacity-0" : "animate-in fade-in"}`}>
      {/* Clickable Backdrop */}
      <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm" onClick={handleClose} />
      
      {/* Sheet Modal */}
      <div 
        // ✅ SURGICAL FIX: Added animate-in and slide-in-from-bottom-full
        className="w-full sm:max-w-md bg-[#2b2b2b] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#444] overflow-hidden flex flex-col pb-safe relative z-10 animate-in slide-in-from-bottom-full duration-300"
        style={{ 
          // ✅ SURGICAL FIX: Only apply inline transforms when dragging or closing, allowing CSS animations to play on mount!
          transform: isClosing ? 'translateY(100vh)' : (dragY > 0 ? `translateY(${dragY}px)` : undefined), 
          transition: isClosing || dragY === 0 ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none' 
        }}
      >
        <div 
          className="p-4 flex items-center justify-between border-b border-[#333] cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex flex-col flex-1 items-center sm:items-start pl-8 sm:pl-0">
            <div className="w-10 h-1 bg-[#555] rounded-full mb-3 sm:hidden" /> 
            <h3 className="text-sm font-black tracking-wider uppercase text-zinc-200">Stage Mixer</h3>
          </div>
          <button onClick={handleClose} className="w-8 h-8 bg-[#444] hover:bg-[#555] text-zinc-300 rounded-full flex items-center justify-center font-bold transition-colors shrink-0">✕</button>
        </div>

        <div className="p-6 bg-[#222] flex items-center justify-center gap-2 sm:gap-4 overflow-x-auto">
          <FaderChannel id="click" label="Click" val={sliderVals.click} setVal={(v) => setSliderVals(p => ({...p, click: v}))} />
          <FaderChannel id="guide" label="Guides" val={sliderVals.guide} setVal={(v) => setSliderVals(p => ({...p, guide: v}))} />
          <FaderChannel id="yt" label="YT Sync" val={sliderVals.yt} setVal={(v) => setSliderVals(p => ({...p, yt: v}))} />
        </div>
      </div>
    </div>
  );
}