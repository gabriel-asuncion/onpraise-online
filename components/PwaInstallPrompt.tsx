"use client";

import { useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { useOnlineStatus } from "../app/context/NetworkContext";

export default function PwaInstallPrompt({ installedOnly = false }: { installedOnly?: boolean }) {
  const { isIOS, isInApp, standalone, installed, prompt, stage, progress, error, prepare, install, close } = usePwaInstall();
  const { isOnline, openNoConnectionModal } = useOnlineStatus();
  const [showOpenHelp, setShowOpenHelp] = useState(false);

  if ((standalone && installedOnly) || (installedOnly && !installed)) return null;
  return (
    <div className="w-full max-w-sm space-y-2 text-center">
      {isIOS && isInApp && <p className="rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-900">To install OnPraise, open this page in Safari using your browser menu.</p>}
      {standalone ? (
        <button type="button" onClick={() => !isOnline ? openNoConnectionModal("Preparing offline files") : void prepare()} className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white">Prepare Offline Files</button>
      ) : installed ? (
        isIOS ? <button type="button" onClick={() => setShowOpenHelp(true)} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Open App</button> :
          <a href="web+onpraise://open" className="block rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Open App</a>
      ) : (
        <button type="button" onClick={() => !isOnline ? openNoConnectionModal("Preparing the app for installation") : void prepare()} className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white">
          Install App
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      {showOpenHelp && <div className="fixed inset-0 z-[500000] flex items-center justify-center bg-black/70 p-4 text-left">
        <div role="dialog" aria-modal="true" aria-labelledby="open-app-title" className="w-full max-w-sm rounded-3xl bg-white p-6 text-zinc-900 shadow-xl">
          <h2 id="open-app-title" className="text-xl font-black">Open App</h2>
          <p className="mt-4 text-sm">Open OnPraise from its icon on your Home Screen. Safari cannot launch the installed app automatically.</p>
          <button type="button" onClick={() => setShowOpenHelp(false)} className="mt-4 w-full rounded-xl bg-zinc-100 p-3 font-bold">Got it</button>
        </div>
      </div>}
      {stage !== "idle" && (
        <div className="fixed inset-0 z-[500000] flex items-center justify-center bg-black/70 p-4 text-left">
          <div role="dialog" aria-modal="true" aria-labelledby="install-title" className="w-full max-w-sm rounded-3xl bg-white p-6 text-zinc-900 shadow-xl">
            <h2 id="install-title" className="text-xl font-black">Install OnPraise</h2>
            {stage === "preparing" && <div className="mt-4"><p role="status" className="mb-2 text-sm">Preparing offline files: {progress}%</p><progress max={100} value={progress} className="w-full" /></div>}
            {stage === "ready" && <div className="mt-4 space-y-4"><p className="text-sm">{standalone ? "Offline files are ready. Download songs and setlists before going offline." : "Offline files are ready. Continue to open your browser's install prompt."}</p>{!standalone && <button type="button" onClick={() => void install()} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white">{prompt ? "Continue install" : "Show install instructions"}</button>}</div>}
            {stage === "ios" && <div className="mt-4 space-y-3 text-sm"><p>1. Tap the Share icon in Safari.</p><p>2. Tap <strong>Add to Home Screen</strong>.</p><p>Open the installed app while online and prepare your downloads there; iOS may keep Safari and the app&apos;s storage separate.</p></div>}
            {stage !== "preparing" && <button type="button" onClick={close} className="mt-4 w-full rounded-xl bg-zinc-100 p-3 font-bold">Close</button>}
          </div>
        </div>
      )}
    </div>
  );
}
