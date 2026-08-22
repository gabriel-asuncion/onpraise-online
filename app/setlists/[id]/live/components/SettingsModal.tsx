import React from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SongRecord } from "../types/setlist";

// ✅ Import the Mixer Component
import { VolumeMixerModal } from "./VolumeMixerModal";

interface SettingsModalProps {
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (val: boolean) => void;
  localPresenceUser: any;
  onlineUsers: any[];
  handleToggleMusicDirectorMode: () => void;
  showChords: boolean;
  setShowChords: (val: boolean) => void;
  chordFormat: "Key" | "Numbers";
  setChordFormat: (val: "Key" | "Numbers") => void;
  isSimplifiedMode: boolean;
  setIsSimplifiedMode: (val: boolean) => void;
  isZenMode: boolean;
  setIsZenMode: (val: boolean) => void;
  lineSpacing: number;
  setLineSpacing: (val: number) => void;
  lyricsFontSize: number;
  setLyricsFontSize: (val: number) => void;
  isMetronomeSoundEnabled: boolean;
  setIsMetronomeSoundEnabled: (val: boolean) => void;
  isDoubleMetronomeEnabled: boolean;
  setIsDoubleMetronomeEnabled: (val: boolean) => void;
  localClickVolume: number;
  setLocalClickVolume: (val: number) => void;
  audioLatencyOffsetMs: number;
  setAudioLatencyOffsetMs: (val: number) => void;
  isTestingSync: boolean;
  setIsTestingSync: (val: boolean) => void;
  testVisualBeat: number;
  activeSong: SongRecord | null;
  isYoutubeSyncEnabled: boolean;
  setIsYoutubeSyncEnabled: (val: boolean) => void;
  youtubeVolume: number;
  setYoutubeVolume: (val: number) => void;
  canEditSong: boolean;
  isPlayingFlow: boolean;
  router: AppRouterInstance;
  handleOpenTransposerModal: () => void;
  setIsStructureModalOpen: (val: boolean) => void;
  isRecording: boolean;
  setIsRecordModalOpen: (val: boolean) => void;
  recordingStartTime?: number | null;
  isPaused?: boolean;
  recordingAccumulatedMs?: number;
  metronomeSoundType: "blip" | "bell" | "block" | "glass";
  setMetronomeSoundType: (val: "blip" | "bell" | "block" | "glass") => void;
}

export function SettingsModal(props: SettingsModalProps) {
  const [elapsedStr, setElapsedStr] = React.useState("00:00:00");
  const [isMixerOpen, setIsMixerOpen] = React.useState(false);

  // --- FLUID DISMISS ENGINE ---
  const [dragY, setDragY] = React.useState(0);
  const [isClosing, setIsClosing] = React.useState(false);
  const startY = React.useRef(0);

  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setDragY(0);
      props.setIsSettingsModalOpen(false);
    }, 250);
  };

  const handleTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) setDragY(diff);
  };
  const handleTouchEnd = () => {
    if (dragY > 100) triggerClose();
    else setDragY(0);
  };

  const timerStateRef = React.useRef({
    isRecording: props.isRecording,
    isPaused: props.isPaused,
    accumulatedMs: props.recordingAccumulatedMs || 0,
    startTime: props.recordingStartTime || Date.now()
  });

  React.useEffect(() => {
    timerStateRef.current = {
      isRecording: props.isRecording,
      isPaused: props.isPaused,
      accumulatedMs: props.recordingAccumulatedMs || 0,
      startTime: props.recordingStartTime || Date.now()
    };
  }, [props.isRecording, props.isPaused, props.recordingAccumulatedMs, props.recordingStartTime]);

  React.useEffect(() => {
    const formatTime = (ms: number) => {
      const diff = Math.floor(ms / 1000);
      const hrs = Math.floor(diff / 3600).toString().padStart(2, '0');
      const mins = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const secs = (diff % 60).toString().padStart(2, '0');
      return hrs !== "00" ? `${hrs}:${mins}:${secs}` : `${mins}:${secs}`;
    };

    const interval = setInterval(() => {
      const state = timerStateRef.current;
      if (!state.isRecording) {
        setElapsedStr("00:00:00");
        return;
      }
      if (state.isPaused) {
        setElapsedStr(formatTime(state.accumulatedMs));
      } else {
        setElapsedStr(formatTime(state.accumulatedMs + (Date.now() - state.startTime)));
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  if (!props.isSettingsModalOpen) return null;

  const {
    localPresenceUser, onlineUsers, handleToggleMusicDirectorMode,
    showChords, setShowChords, chordFormat, setChordFormat, isSimplifiedMode, setIsSimplifiedMode,
    isZenMode, setIsZenMode, 
    lineSpacing, setLineSpacing, lyricsFontSize, setLyricsFontSize,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled,
    metronomeSoundType, setMetronomeSoundType, 
    localClickVolume, setLocalClickVolume, audioLatencyOffsetMs, setAudioLatencyOffsetMs,
    isTestingSync, setIsTestingSync, testVisualBeat, activeSong,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled,
    youtubeVolume, setYoutubeVolume, canEditSong, isPlayingFlow, router, handleOpenTransposerModal, setIsStructureModalOpen,
    isRecording, setIsRecordModalOpen 
  } = props;

  const alternateMD = onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id);

  return (
    <div className={`fixed inset-0 z-[200000] flex items-end sm:items-center justify-center select-none transition-opacity duration-250 ${isClosing ? "opacity-0" : "animate-in fade-in"}`}>
      {/* Clickable Backdrop */}
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={triggerClose} />
      
      <div 
        // ✅ SURGICAL FIX: Added animate-in and slide-in-from-bottom-full
        className="bg-white w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-bottom-full duration-300"
        style={{ 
          // ✅ SURGICAL FIX: Cleared resting transform to allow mount animation
          transform: isClosing ? 'translateY(100vh)' : (dragY > 0 ? `translateY(${dragY}px)` : undefined), 
          transition: isClosing || dragY === 0 ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none' 
        }}
      >
        {/* DRAGGABLE HEADER */}
        <div 
          className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 border-b border-zinc-100 touch-none cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
          <button type="button" onClick={triggerClose} className="absolute left-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors">✕</button>
          
          <h3 className="text-base font-bold text-zinc-900 tracking-tight">Preferences</h3>

          {props.isRecording && (
            <div className={`absolute right-5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm ${props.isPaused ? 'bg-amber-50/80 border-amber-100' : 'bg-red-50/80 border-red-100'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${props.isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
              <span className={`text-[10px] font-mono font-black tabular-nums tracking-tight ${props.isPaused ? 'text-amber-600' : 'text-red-600'}`}>{elapsedStr}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-7 custom-scrollbar pb-12">
          
          {/* Performance Authorization & Stage Mixer */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-900 block">Performance Authorization</label>
            <div className="bg-zinc-50/50 border border-zinc-100 rounded-2xl overflow-hidden p-2">
              <button type="button" onClick={handleToggleMusicDirectorMode} className="w-full py-4 px-4 flex justify-between items-center hover:bg-white rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${localPresenceUser?.isMD ? "bg-blue-100 text-blue-600" : alternateMD ? "bg-zinc-200 text-zinc-500" : "bg-zinc-100 text-zinc-600"}`}>
                    {localPresenceUser?.isMD ? "👑" : alternateMD ? "🔒" : "🎧"}
                  </span>
                  <span className="text-sm font-bold text-zinc-700">
                    {localPresenceUser?.isMD ? "You are Music Director" : alternateMD ? `MD Mode Active (${alternateMD?.name})` : "Take MD Control"}
                  </span>
                </div>
                <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${localPresenceUser?.isMD ? 'bg-blue-500' : 'bg-zinc-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${localPresenceUser?.isMD ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>
              
              <div className="pb-2 mt-1">
                <button 
                  type="button" 
                  onClick={() => setIsMixerOpen(true)}
                  className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-[11px] font-black tracking-widest uppercase flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 22v-6M4 8V2M12 22v-10M12 4V2M20 22v-4M20 12V2M2 16h4M10 8h4M18 18h4"/></svg>
                  Open Stage Mixer
                </button>
              </div>
            </div>
          </div>

          {/* Display Options */}
          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-900 block">Display Options</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Chord Notation</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button onClick={() => setShowChords(true)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${showChords ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Show</button>
                  <button onClick={() => setShowChords(false)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${!showChords ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Hide</button>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Chord Format</span>
                <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded ml-1">Experimental</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button onClick={() => setChordFormat("Key")} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${chordFormat === "Key" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Key</button>
                  <button onClick={() => setChordFormat("Numbers")} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${chordFormat === "Numbers" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Numbers</button>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">View Mode</span>
                <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded ml-1">Experimental</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button onClick={() => { setIsZenMode(false); setIsSimplifiedMode(false); }} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${!isSimplifiedMode && !isZenMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Sheet</button>
                  <button onClick={() => { setIsZenMode(false); setIsSimplifiedMode(true); }} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${isSimplifiedMode && !isZenMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Stack</button>
                  <button onClick={() => { triggerClose(); setIsZenMode(true); }} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${isZenMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Zen</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Line Spacing</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {([ { label: "Compact", spacing: 16 }, { label: "Comfort", spacing: 24 }, { label: "Spacious", spacing: 32 } ]).map((preset) => (
                    <button key={preset.label} onClick={() => setLineSpacing(preset.spacing)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${lineSpacing === preset.spacing ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Lyrics Size</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {([ { label: "Small", size: 14 }, { label: "Medium", size: 16 }, { label: "Large", size: 20 }, { label: "Huge", size: 24 } ]).map((preset) => (
                    <button key={preset.label} onClick={() => setLyricsFontSize(preset.size)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${lyricsFontSize === preset.size ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Routing */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-900 block">Timing Configuration</label>
            <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-4 border-b border-zinc-200/60 pb-4">
                <span className="text-[11px] font-bold text-zinc-600">Bluetooth Sync Offset</span>
                <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg px-2 py-1 shadow-sm">
                  <input type="number" min={0} max={2000} value={audioLatencyOffsetMs} onChange={(e) => setAudioLatencyOffsetMs(parseInt(e.target.value) || 0)} className="w-10 bg-transparent text-center font-bold text-xs text-zinc-900 outline-none" />
                  <span className="text-[10px] font-bold text-zinc-400">ms</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-zinc-200 shadow-inner flex-1 justify-center">
                  {[1, 2, 3, 4].map((beatNum) => (
                    <div key={`test-${beatNum}`} className={`w-6 h-6 flex items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none ${isTestingSync && testVisualBeat === beatNum ? (beatNum === 4 ? "bg-amber-400 text-white border-amber-500" : "bg-blue-500 text-white border-blue-600") : "bg-zinc-50 text-zinc-300 border-transparent"}`}>{beatNum}</div>
                  ))}
                </div>
                <button onClick={() => setIsTestingSync(!isTestingSync)} className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all w-24 ${isTestingSync ? "bg-red-50 text-red-600 border border-red-200" : "bg-white border border-zinc-200 text-zinc-700 shadow-sm hover:bg-zinc-50"}`}>
                  {isTestingSync ? "STOP" : "TEST SYNC"}
                </button>
              </div>
            </div>
            
            {activeSong?.youtube_url && activeSong?.youtube_sync_offset_ms !== undefined && (
              <div className="mt-5 border-t border-zinc-200/60 pt-4 animate-in fade-in space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5"><span className="text-red-600 text-sm">▶</span> YouTube Sync Engine</span>
                    <span className="text-[9px] font-bold text-zinc-400 mt-0.5">Lock stage metronome to the backing track</span>
                  </div>
                  <button type="button" onClick={() => setIsYoutubeSyncEnabled(!isYoutubeSyncEnabled)} className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner ${isYoutubeSyncEnabled ? 'bg-red-500' : 'bg-zinc-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isYoutubeSyncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-900 block">Actions</label>
            <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-zinc-50">
              
              {setIsRecordModalOpen && (
                <button disabled={isPlayingFlow} onClick={() => { triggerClose(); setIsRecordModalOpen(true); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40 border-b border-zinc-50">
                  <div className="flex items-center gap-3">
                    <span className={isRecording ? "text-red-500 animate-pulse" : "text-blue-500"}>🎙️</span>
                    <span className="text-sm font-bold text-zinc-700">Rehearsal Telemetry</span>
                  </div>
                  <span className="text-zinc-300 font-bold">›</span>
                </button>
              )}

              {canEditSong && activeSong && (
                <button type="button" disabled={isPlayingFlow} onClick={() => { triggerClose(); router.push(`/songs/${activeSong.id}/edit`); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                  <div className="flex items-center gap-3"><span className="text-blue-500">📝</span><span className="text-sm font-bold text-zinc-700">Edit Song</span></div><span className="text-zinc-300 font-bold">›</span>
                </button>
              )}
              <button disabled={isPlayingFlow} onClick={() => { triggerClose(); handleOpenTransposerModal(); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                <div className="flex items-center gap-3"><span className="text-blue-500">🎹</span><span className="text-sm font-bold text-zinc-700">Transpose Key</span></div><span className="text-zinc-300 font-bold">›</span>
              </button>
              <button disabled={isPlayingFlow} onClick={() => { triggerClose(); setIsStructureModalOpen(true); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                <div className="flex items-center gap-3"><span className="text-blue-500">🧱</span><span className="text-sm font-bold text-zinc-700">Edit Structure</span></div><span className="text-zinc-300 font-bold">›</span>
              </button>
            </div>
          </div>
          
        </div>
      </div>

      <VolumeMixerModal
        isOpen={isMixerOpen} 
        onClose={() => setIsMixerOpen(false)}
        localClickVolume={localClickVolume} 
        setLocalClickVolume={setLocalClickVolume}
        youtubeVolume={youtubeVolume} 
        setYoutubeVolume={setYoutubeVolume}
        // ✅ ADD THESE TWO LINES:
        metronomeSoundType={metronomeSoundType}
        setMetronomeSoundType={setMetronomeSoundType}
      />
    </div>
  );
}