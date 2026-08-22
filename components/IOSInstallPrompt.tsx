"use client";

import React, { useState } from 'react';

function getPromptState() {
  if (typeof window === 'undefined') {
    return { isIOS: false, isStandalone: false, isDismissed: true };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
  const isInstalled =
    ('standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)) ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isDismissed = localStorage.getItem('ios_install_prompt_dismissed') === 'true';

  return { isIOS: isIOSDevice, isStandalone: isInstalled, isDismissed };
}

export default function IOSInstallPrompt() {
  const { isIOS, isStandalone, isDismissed } = useState(getPromptState)[0];
  const [, setDismissed] = useState(isDismissed);

  // If it's not iOS, or it's already installed, or they dismissed it, render absolutely nothing.
  if (!isIOS || isStandalone || isDismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('ios_install_prompt_dismissed', 'true');
  };

  return (
    <div className="fixed bottom-0 left-0 w-full z-[300000] p-4 pointer-events-none flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-500">
      
      {/* The Floating Card */}
      <div className="bg-white/95 backdrop-blur-xl border border-zinc-200 shadow-2xl rounded-2xl p-4 w-full max-w-sm pointer-events-auto relative">
        
        {/* Close Button */}
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors"
        >
          ✕
        </button>

        <div className="flex flex-col items-center text-center gap-3 mt-2">
          
          {/* App Icon Mockup (Uses your new manifest icon) */}
          <img src="/icon-192x192.png" alt="Matrix App Icon" className="w-14 h-14 rounded-xl shadow-sm border border-zinc-100" />
          
          <div>
            <h3 className="text-[15px] font-black text-zinc-900 tracking-tight">Install Worship Matrix</h3>
            <p className="text-[11px] font-bold text-zinc-500 mt-0.5 leading-relaxed">
              Install this application on your home screen for quick and easy access when you're offline.
            </p>
          </div>

          {/* iOS Instructions Box */}
          <div className="w-full bg-zinc-50 rounded-xl p-3 border border-zinc-100 mt-1 flex items-center justify-center gap-3 text-xs font-semibold text-zinc-600">
            <span>Tap</span>
            
            {/* iOS Share Icon SVG */}
            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>

            <span>then</span>
            
            {/* Add to Home Screen Plus Icon SVG */}
            <div className="w-5 h-5 rounded border-2 border-zinc-400 flex items-center justify-center">
              <span className="text-zinc-400 text-[14px] leading-none font-bold block translate-y-[-1px]">+</span>
            </div>

            <span className="truncate">Add to Home Screen</span>
          </div>

        </div>
      </div>
    </div>
  );
}