"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface NetworkContextValue {
  isOnline: boolean;
  isNetworkReady: boolean;
  openNoConnectionModal: (featureName?: string) => void;
  reportConnectionFailure: () => void;
  reportConnectionRestored: () => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isNetworkReady, setIsNetworkReady] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState<string | null>(null);
  const openNoConnectionModal = useCallback((featureName?: string) => {
    setBlockedFeature(featureName || "This feature");
  }, []);
  const reportConnectionFailure = useCallback(() => setIsOnline(false), []);
  const reportConnectionRestored = useCallback(() => setIsOnline(navigator.onLine), []);

  useEffect(() => {
    const update = () => { setIsOnline(navigator.onLine); setIsNetworkReady(true); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, isNetworkReady, openNoConnectionModal, reportConnectionFailure, reportConnectionRestored }}>
      {children}
      {blockedFeature && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/70 p-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="no-connection-title" className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#18181c] p-6 text-white shadow-2xl">
            <h2 id="no-connection-title" className="text-xl font-black">No connection</h2>
            <p className="mt-3 text-sm text-zinc-400">{blockedFeature} requires an active internet connection. Please reconnect and try again.</p>
            <button type="button" onClick={() => setBlockedFeature(null)} className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-900">Got it</button>
          </div>
        </div>
      )}
    </NetworkContext.Provider>
  );
}

export function useOnlineStatus() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error("useOnlineStatus must be used within NetworkProvider");
  return context;
}
