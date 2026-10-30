import React, { useEffect, useState } from "react";

interface HistoryItem {
  timestamp: number;
  title: string;
  label: string;
}

interface RecordRehearsalModalProps {
  isRecordModalOpen: boolean;
  setIsRecordModalOpen: (val: boolean) => void;
  isMD: boolean;
  isRecording: boolean;
  isPaused: boolean;
  recordingStartTime: number | null;
  recordingAccumulatedMs: number;
  history: HistoryItem[];
  saveError?: string | null;
  getGlobalTime?: () => number;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onStopRecording: () => void;
}

export function RecordRehearsalModal({
  isRecordModalOpen, setIsRecordModalOpen, isMD, isRecording, isPaused, recordingStartTime, recordingAccumulatedMs, history, saveError, getGlobalTime, onStartRecording, onPauseRecording, onStopRecording
}: RecordRehearsalModalProps) {

const [elapsedStr, setElapsedStr] = useState("00:00:00");

  // ✅ SURGICAL FIX: The Indestructible Ref-Timer
  const timerStateRef = React.useRef({
    isRecording, isPaused, accumulatedMs: recordingAccumulatedMs, startTime: recordingStartTime || 0
  });

  useEffect(() => {
    timerStateRef.current = {
      isRecording,
      isPaused,
      accumulatedMs: recordingAccumulatedMs,
      startTime: recordingStartTime || getGlobalTime?.() || Date.now()
    };
  }, [isRecording, isPaused, recordingAccumulatedMs, recordingStartTime, getGlobalTime]);

  useEffect(() => {
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
        setElapsedStr(formatTime(state.accumulatedMs + ((getGlobalTime?.() ?? Date.now()) - state.startTime)));
      }
    }, 250);

    return () => clearInterval(interval);
  }, [getGlobalTime]);

  if (!isRecordModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[300000] flex items-end sm:items-center justify-center select-none animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={() => setIsRecordModalOpen(false)} />
      <div className="bg-white w-full sm:max-w-md max-h-[90vh] h-[80vh] sm:h-[600px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300 overflow-hidden">
        
        <div className="flex-shrink-0 relative flex items-center justify-between pt-5 pb-4 px-5 border-b border-zinc-100 bg-white z-10">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
          <h3 className="text-base font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <span className={isRecording && !isPaused ? "text-red-500 animate-pulse" : isPaused ? "text-amber-500" : "text-zinc-400"}>🎙️</span> 
            Rehearsal Telemetry
          </h3>
          <button type="button" onClick={() => setIsRecordModalOpen(false)} className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors">✕</button>
        </div>

        {saveError && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{saveError}</p>}

        <div className="p-5 flex flex-col items-center justify-center border-b border-zinc-100 bg-zinc-50 shrink-0">
          <span className={`font-mono text-5xl font-black tracking-tighter tabular-nums mb-4 transition-colors ${isRecording && !isPaused ? 'text-red-600 drop-shadow-sm' : isPaused ? 'text-amber-600' : 'text-zinc-300'}`}>
            {elapsedStr}
          </span>
          
          {isMD ? (
            <div className="flex items-center gap-3 w-full px-4">
              {!isRecording ? (
                <button onClick={onStartRecording} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95">
                  Start Recording
                </button>
              ) : (
                <>
                  <button onClick={isPaused ? onStartRecording : onPauseRecording} className={`flex-1 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95 ${isPaused ? "bg-red-600 hover:bg-red-700 text-white" : "bg-amber-100 hover:bg-amber-200 text-amber-700"}`}>
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                  <button onClick={onStopRecording} className="flex-1 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95">
                    Stop & End
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-200/50 px-3 py-1.5 rounded-lg">
              {isRecording && !isPaused ? "Recording in progress (MD Control)" : isPaused ? "Recording Paused (MD Control)" : "Waiting for MD to start"}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-white custom-scrollbar p-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3 ml-2 mt-1">Session Log</h4>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center opacity-50 mt-10">
              <span className="text-2xl mb-2">📜</span>
              <p className="text-[11px] font-bold text-zinc-500">No events logged yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-6">
              {history.map((item, idx) => {
                const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <div key={idx} className="flex gap-3 bg-zinc-50 border border-zinc-100 rounded-xl p-3 animate-in slide-in-from-left-2 duration-300">
                    <div className="text-[9px] font-mono font-bold text-zinc-400 pt-0.5 shrink-0">{time}</div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-black text-zinc-900 truncate">{item.title}</span>
                      <span className="text-[10px] font-bold text-zinc-500 mt-0.5 truncate">{item.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}