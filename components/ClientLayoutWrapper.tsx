"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import DevFab from "./DevFab";
import { useEngine } from "../app/context/EngineContext";

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSuperAdmin } = useEngine();

  const isFullscreenRoute = pathname === "/" || pathname === "/onboarding";

  if (isFullscreenRoute) {
    return (
      <main className="min-h-screen w-full relative">
        {children}
        {isSuperAdmin && <DevFab />} 
      </main>
    );
  }

  return (
    <div className="flex h-full w-full relative overflow-hidden bg-surface">
      <Sidebar />
      {/* 
        ✅ SURGICAL FIX: 
        Removed 'overflow-y-auto' and 'pb-20'. 
        Changed to 'overflow-hidden flex flex-col h-full' so it acts as a rigid frame.
        The child pages now control their own internal scrolling perfectly.
      */}
      <main className="flex-1 flex flex-col relative min-w-0 h-full overflow-hidden">
        {children}
      </main>
      
      {isSuperAdmin && <DevFab />}
    </div>
  );
}