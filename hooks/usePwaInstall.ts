"use client";

import { useEffect, useState } from "react";
import { cacheOfflineRoutes } from "../lib/offline-shell";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __onPraiseDeferredInstallPrompt?: BeforeInstallPromptEvent;
  }
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInApp, setIsInApp] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [stage, setStage] = useState<"idle" | "preparing" | "ready" | "ios">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent;
    let active = true;
    const mode = window.matchMedia("(display-mode: standalone)");
    const updateMode = () => {
      const active = mode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setStandalone(active);
      if (active) localStorage.setItem("onpraise_pwa_installed", "true");
      setInstalled(active || localStorage.getItem("onpraise_pwa_installed") === "true");
    };
    queueMicrotask(() => {
      if (!active) return;
      setIsIOS(/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
      setIsInApp(/FBAN|FBAV|FB_IAB|Instagram|Line\/|Viber|Messenger/i.test(ua));
      updateMode();
      if (window.__onPraiseDeferredInstallPrompt) setPrompt(window.__onPraiseDeferredInstallPrompt);
    });
    mode.addEventListener("change", updateMode);
    const capture = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      window.__onPraiseDeferredInstallPrompt = installEvent;
      setPrompt(installEvent);
    };
    const markInstalled = () => {
      localStorage.setItem("onpraise_pwa_installed", "true");
      window.__onPraiseDeferredInstallPrompt = undefined;
      setPrompt(null);
      setInstalled(true);
      setStage("idle");
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", markInstalled);
    const related = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<Array<{ id?: string; url?: string }>> };
    if (related.getInstalledRelatedApps) {
      void related.getInstalledRelatedApps().then((apps) => {
        if (apps.length) setInstalled(true);
      }).catch((failure: unknown) => console.warn("Could not check installed apps.", failure));
    }
    return () => {
      active = false;
      mode.removeEventListener("change", updateMode);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const prepare = async () => {
    setError("");
    setStage("preparing");
    setProgress(0);
    try {
      await cacheOfflineRoutes([], setProgress);
      setStage(isIOS && !standalone ? "ios" : "ready");
    } catch (failure) {
      console.error("Could not prepare the offline app.", failure);
      setError(failure instanceof Error ? failure.message : "Could not prepare the offline app.");
      setStage("idle");
    }
  };

  const install = async () => {
    if (!prompt) {
      setError("Your browser did not provide an install prompt. Use its menu to install the app.");
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      window.__onPraiseDeferredInstallPrompt = undefined;
      setPrompt(null);
      setStage("idle");
      if (choice.outcome === "dismissed") setError("Installation was cancelled.");
    } catch (failure) {
      console.error("Could not open the installation prompt.", failure);
      setError("Could not open the install prompt. Try again from your browser menu.");
      setStage("idle");
    }
  };

  return { isIOS, isInApp, standalone, installed, prompt, stage, progress, error, prepare, install, close: () => setStage("idle") };
}
