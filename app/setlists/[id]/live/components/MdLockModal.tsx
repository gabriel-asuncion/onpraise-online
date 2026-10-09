import React from "react";

interface MdLockModalProps {
  isMdLockModalOpen: boolean;
  setIsMdLockModalOpen: (val: boolean) => void;
  activeMDConnection: any;
  handleToggleMusicDirectorMode?: () => void;
  handleRequestMusicDirector?: () => void; // ✅ Added Request Prop
}

export function MdLockModal({ isMdLockModalOpen, setIsMdLockModalOpen, activeMDConnection, handleToggleMusicDirectorMode, handleRequestMusicDirector }: MdLockModalProps) {
  if (!isMdLockModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[300000] flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-white border border-zinc-200 rounded-[1rem] shadow-2xl p-6 md:p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-100 text-center relative">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mt-2 mb-4 shadow-inner">
          <span className="text-3xl">🔒</span>
        </div>
        
        <div className="space-y-1.5">
          <h3 className="text-xl font-black text-zinc-900 tracking-tight">Playback Locked</h3>
          <p className="text-xs font-bold text-zinc-400">Only the Music Director can start the setlist.</p>
        </div>

        {activeMDConnection ? (
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-left shadow-inner">
             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2.5">Current Music Director:</p>
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full shadow-sm shrink-0 flex items-center justify-center overflow-hidden bg-zinc-200 relative">
                 {activeMDConnection.avatar ? (
                   <img src={activeMDConnection.avatar} alt="" className="w-full h-full object-cover" />
                 ) : (
                   <div className={`w-full h-full ${activeMDConnection.bg || 'bg-blue-600'} text-white font-mono font-black text-sm flex items-center justify-center`}>
                     {activeMDConnection.initials}
                   </div>
                 )}
               </div>
               <div className="flex flex-col min-w-0">
                 <span className="text-sm font-black text-zinc-900 truncate">{activeMDConnection.name}</span>
                 <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                   <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Has Control
                 </span>
               </div>
             </div>
          </div>
        ) : (
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-inner">
            <p className="text-[11px] font-bold text-zinc-500 leading-relaxed">
              No one is currently driving. You can take over as the Music Director to unlock global playback controls.
            </p>
          </div>
        )}

        <div className="pt-2 flex flex-col gap-2">
          {/* ✅ SURGICAL FIX: Switches to "Request" if an MD exists, preventing hostile takeovers */}
          <button 
            type="button" 
            onClick={() => { 
              if (activeMDConnection && handleRequestMusicDirector) handleRequestMusicDirector();
              else if (handleToggleMusicDirectorMode) handleToggleMusicDirectorMode();
              setIsMdLockModalOpen(false); 
            }} 
            className={`w-full flex flex-col items-center justify-center rounded-xl shadow-md cursor-pointer transition-colors py-3.5 ${activeMDConnection ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            <span className="text-white font-black text-xs uppercase tracking-widest">
              {activeMDConnection ? "Request MD Control" : "Takeover as MD"}
            </span>
          </button>

          <button 
            type="button" 
            onClick={() => { setIsMdLockModalOpen(false); }} 
            className="w-full py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-black text-xs uppercase tracking-widest rounded-xl text-center cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}