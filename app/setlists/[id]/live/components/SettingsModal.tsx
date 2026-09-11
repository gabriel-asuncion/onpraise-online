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
  const isMDActive = localPresenceUser?.isMD;

  // Active state colors based on dark mode design
  const btnActive = "bg-[#2563eb] text-white shadow-md font-bold";
  const btnInactive = "text-on-surface-variant hover:text-on-surface font-semibold";

  return (
    <div className={`fixed inset-0 z-[200000] flex items-end sm:items-center justify-center select-none transition-opacity duration-250 ${isClosing ? "opacity-0" : "animate-in fade-in"} bg-surface text-on-surface font-sans`}>
      {/* Clickable Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={triggerClose} />
      
      <div 
        className="bg-surface-container-low w-full sm:max-w-md max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-bottom-full duration-300 border border-outline-variant/30"
        style={{ 
          transform: isClosing ? 'translateY(100vh)' : (dragY > 0 ? `translateY(${dragY}px)` : undefined), 
          transition: isClosing || dragY === 0 ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none' 
        }}
      >
        {/* DRAGGABLE HEADER */}
        <div 
          className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 touch-none cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-surface-container-highest rounded-full sm:hidden" />
          <button type="button" onClick={triggerClose} className="absolute left-4 w-8 h-8 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center hover:bg-surface-bright transition-colors cursor-pointer border border-outline-variant/30">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
          
          <h2 className="text-[18px] font-extrabold text-on-surface tracking-tight">Preferences</h2>

          {props.isRecording && (
            <div className={`absolute right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm ${props.isPaused ? 'bg-amber-900/40 border-amber-500/50' : 'bg-error/20 border-error/50'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${props.isPaused ? 'bg-amber-500' : 'bg-error animate-pulse shadow-[0_0_8px_rgba(255,180,171,0.6)]'}`} />
              <span className={`text-[10px] font-mono font-black tabular-nums tracking-tight ${props.isPaused ? 'text-amber-400' : 'text-error'}`}>{elapsedStr}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar pb-12">
          
          {/* ======================================= */}
          {/* PERFORMANCE AUTHORIZATION & MIXER       */}
          {/* ======================================= */}
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-extrabold text-on-surface tracking-tight">Performance Authorization</span>
            <div className="w-full bg-surface-container rounded-xl p-3 flex flex-col gap-3 shadow-sm border border-outline-variant/20">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMDActive ? 'bg-primary-container text-primary' : alternateMD ? 'bg-surface-container-highest text-on-surface-variant' : 'bg-surface-container-high text-secondary'}`}>
                    <span className="material-symbols-outlined text-[20px]">{isMDActive ? "verified_user" : alternateMD ? "lock" : "stop_circle"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] text-on-surface font-bold">{isMDActive ? "You are Music Director" : alternateMD ? `MD Mode Active (${alternateMD.name})` : "Take MD Control"}</span>
                    <span className="text-[11px] text-on-surface-variant">Master tempo & cue override</span>
                  </div>
                </div>
                
                {/* Toggle Switch */}
                <button 
                  onClick={handleToggleMusicDirectorMode} 
                  disabled={!!alternateMD}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isMDActive ? 'bg-[#2563eb]' : 'bg-surface-container-highest'}`} 
                  type="button"
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm ${isMDActive ? 'translate-x-5' : 'translate-x-0 bg-outline'}`}></span>
                </button>
              </div>

              <button 
                type="button" 
                onClick={() => setIsMixerOpen(true)}
                className="w-full py-3 px-3 bg-surface-container-high hover:bg-surface-bright active:scale-[0.98] transition-all rounded-lg flex items-center justify-between shadow-inner border border-outline-variant/30 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-secondary">tune</span>
                  <span className="text-[10px] uppercase tracking-widest font-black text-on-surface">Open Stage Mixer</span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
              </button>
            </div>
          </div>

          {/* ======================================= */}
          {/* DISPLAY OPTIONS                         */}
          {/* ======================================= */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-extrabold text-on-surface tracking-tight">Display Options</span>
              <span className="text-[11px] font-bold text-secondary flex items-center gap-1.5 bg-secondary-container/10 px-2 py-0.5 rounded-md border border-secondary/20 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span> Glance Opt
              </span>
            </div>
            
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant">Chord Notation</label>
                <div className="grid grid-cols-2 p-1 bg-surface-container rounded-lg gap-1 border border-outline-variant/20">
                  <button onClick={() => setShowChords(true)} className={`py-2 rounded-md text-[12px] transition-all ${showChords ? btnActive : btnInactive}`}>Show</button>
                  <button onClick={() => setShowChords(false)} className={`py-2 rounded-md text-[12px] transition-all ${!showChords ? btnActive : btnInactive}`}>Hide</button>
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-on-surface-variant">Chord Format</label>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-secondary/15 text-secondary uppercase tracking-widest">Experimental</span>
                </div>
                <div className="grid grid-cols-2 p-1 bg-surface-container rounded-lg gap-1 border border-outline-variant/20">
                  <button onClick={() => setChordFormat("Key")} className={`py-2 rounded-md text-[12px] transition-all ${chordFormat === "Key" ? btnActive : btnInactive}`}>Key</button>
                  <button onClick={() => setChordFormat("Numbers")} className={`py-2 rounded-md text-[12px] transition-all ${chordFormat === "Numbers" ? btnActive : btnInactive}`}>Numbers</button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-on-surface-variant">View Mode</label>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-tertiary/15 text-tertiary uppercase tracking-widest">Experimental</span>
                </div>
                <div className="grid grid-cols-3 p-1 bg-surface-container rounded-lg gap-1 border border-outline-variant/20">
                  <button onClick={() => { setIsZenMode(false); setIsSimplifiedMode(false); }} className={`py-2 rounded-md text-[12px] transition-all ${!isSimplifiedMode && !isZenMode ? btnActive : btnInactive}`}>Sheet</button>
                  <button onClick={() => { setIsZenMode(false); setIsSimplifiedMode(true); }} className={`py-2 rounded-md text-[12px] transition-all ${isSimplifiedMode && !isZenMode ? btnActive : btnInactive}`}>Stack</button>
                  <button onClick={() => { triggerClose(); setIsZenMode(true); }} className={`py-2 rounded-md text-[12px] transition-all ${isZenMode ? btnActive : btnInactive}`}>Zen</button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant">Line Spacing</label>
                <div className="grid grid-cols-3 p-1 bg-surface-container rounded-lg gap-1 border border-outline-variant/20">
                  {([ { label: "Compact", spacing: 16 }, { label: "Comfort", spacing: 24 }, { label: "Spacious", spacing: 32 } ]).map((preset) => (
                    <button key={preset.label} onClick={() => setLineSpacing(preset.spacing)} className={`py-2 rounded-md text-[12px] transition-all ${lineSpacing === preset.spacing ? btnActive : btnInactive}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant">Lyrics Size</label>
                <div className="grid grid-cols-4 p-1 bg-surface-container rounded-lg gap-1 border border-outline-variant/20">
                  {([ { label: "Small", size: 14 }, { label: "Medium", size: 16 }, { label: "Large", size: 20 }, { label: "Huge", size: 24 } ]).map((preset) => (
                    <button key={preset.label} onClick={() => setLyricsFontSize(preset.size)} className={`py-2 rounded-md text-[11px] transition-all ${lyricsFontSize === preset.size ? btnActive : btnInactive}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ======================================= */}
          {/* STAGE AUTOMATION & SYNC                 */}
          {/* ======================================= */}
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-extrabold text-on-surface tracking-tight">Stage Automation & Sync</span>
            <div className="w-full bg-surface-container rounded-xl p-3 flex flex-col gap-3 shadow-sm border border-outline-variant/20">
              
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-secondary">motion_photos_auto</span>
                  <div className="flex flex-col">
                    <span className="text-[13px] text-on-surface font-bold">Auto-scroll with Metronome</span>
                    <span className="text-[11px] text-on-surface-variant">Sync sheet to active beat</span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMetronomeSoundEnabled(!isMetronomeSoundEnabled)} 
                  className={`relative inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors focus:outline-none cursor-pointer ${isMetronomeSoundEnabled ? 'bg-[#2563eb]' : 'bg-surface-container-highest'}`} 
                  type="button"
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm ${isMetronomeSoundEnabled ? 'translate-x-5' : 'translate-x-0 bg-outline'}`}></span>
                </button>
              </div>

              {activeSong?.youtube_url && activeSong?.youtube_sync_offset_ms !== undefined && (
                <div className="flex items-center justify-between px-1 pt-2 border-t border-outline-variant/10">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-primary">smart_display</span>
                    <div className="flex flex-col">
                      <span className="text-[13px] text-on-surface font-bold">YouTube Telemetry Sync</span>
                      <span className="text-[11px] text-on-surface-variant">Lock stage clock to backing track</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsYoutubeSyncEnabled(!isYoutubeSyncEnabled)} 
                    className={`relative inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors focus:outline-none cursor-pointer ${isYoutubeSyncEnabled ? 'bg-[#2563eb]' : 'bg-surface-container-highest'}`} 
                    type="button"
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm ${isYoutubeSyncEnabled ? 'translate-x-5' : 'translate-x-0 bg-outline'}`}></span>
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* ======================================= */}
          {/* ACTIONS & EDITING                       */}
          {/* ======================================= */}
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-extrabold text-on-surface tracking-tight">Setlist Actions</span>
            <div className="bg-surface-container border border-outline-variant/20 rounded-xl overflow-hidden shadow-sm divide-y divide-outline-variant/10">
              
              {setIsRecordModalOpen && (
                <button disabled={isPlayingFlow} onClick={() => { triggerClose(); setIsRecordModalOpen(true); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-surface-container-high transition-colors disabled:opacity-40 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-error">mic</span>
                    <span className="text-[13px] font-bold text-on-surface">Rehearsal Telemetry</span>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
                </button>
              )}

              {canEditSong && activeSong && (
                <button type="button" disabled={isPlayingFlow} onClick={() => { triggerClose(); router.push(`/songs/${activeSong.id}/edit`); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-surface-container-high transition-colors disabled:opacity-40 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-primary">edit_document</span>
                    <span className="text-[13px] font-bold text-on-surface">Edit Song</span>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
                </button>
              )}
              <button disabled={isPlayingFlow} onClick={() => { triggerClose(); handleOpenTransposerModal(); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-surface-container-high transition-colors disabled:opacity-40 cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-primary">piano</span>
                  <span className="text-[13px] font-bold text-on-surface">Transpose Key</span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
              </button>
              <button disabled={isPlayingFlow} onClick={() => { triggerClose(); setIsStructureModalOpen(true); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-surface-container-high transition-colors disabled:opacity-40 cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-primary">view_stream</span>
                  <span className="text-[13px] font-bold text-on-surface">Edit Structure</span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button onClick={triggerClose} className="w-full py-3.5 px-4 bg-[#2563eb] hover:bg-blue-700 active:scale-[0.98] rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-all cursor-pointer border border-blue-500" type="button">
              <span className="material-symbols-outlined text-[20px] text-white">check_circle</span>
              <span className="text-[15px] text-white font-extrabold tracking-tight">Apply to Rehearsal Sheet</span>
            </button>
            <p className="text-center font-label-sm text-[10px] text-on-surface-variant">Presets save automatically to your current worship roster profile.</p>
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
        metronomeSoundType={metronomeSoundType}
        setMetronomeSoundType={setMetronomeSoundType}
      />
    </div>
  );
}