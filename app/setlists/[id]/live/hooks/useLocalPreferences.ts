import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";

export const HARD_PAN_RIGHT_PREFERENCE_KEY = "wm_prefs_hardPanRight";
const HARD_PAN_RIGHT_CHANGE_EVENT = "onpraise:hard-pan-right-change";

function subscribeToHardPanRightPreference(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === HARD_PAN_RIGHT_PREFERENCE_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(HARD_PAN_RIGHT_CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HARD_PAN_RIGHT_CHANGE_EVENT, onChange);
  };
}

function getHardPanRightPreferenceSnapshot() {
  return typeof window !== "undefined" && localStorage.getItem(HARD_PAN_RIGHT_PREFERENCE_KEY) === "true";
}

export function useHardPanRightPreference() {
  const isHardPanRight = useSyncExternalStore(
    subscribeToHardPanRightPreference,
    getHardPanRightPreferenceSnapshot,
    () => false
  );
  const setIsHardPanRight = useCallback((enabled: boolean) => {
    localStorage.setItem(HARD_PAN_RIGHT_PREFERENCE_KEY, enabled.toString());
    window.dispatchEvent(new Event(HARD_PAN_RIGHT_CHANGE_EVENT));
  }, []);

  return [isHardPanRight, setIsHardPanRight] as const;
}

export function useLocalPreferences() {
  const [lyricsFontSize, setLyricsFontSize] = useState<number>(16);
  const [showChords, setShowChords] = useState<boolean>(true); 
  const [chordFormat, setChordFormat] = useState<"Key" | "Numbers">("Key");
  const [isSimplifiedMode, setIsSimplifiedMode] = useState<boolean>(false);
  const [lineSpacing, setLineSpacing] = useState<number>(16); 
  
  const [isMetronomeSoundEnabled, setIsMetronomeSoundEnabled] = useState<boolean>(false);
  const isMetronomeSoundEnabledRef = useRef<boolean>(false);

  const [isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled] = useState<boolean>(false);
  const isDoubleMetronomeEnabledRef = useRef<boolean>(false);

  const [localClickVolume, setLocalClickVolume] = useState<number>(1.0);
  const localClickVolumeRef = useRef<number>(1.0);

  const [youtubeVolume, setYoutubeVolume] = useState<number>(0.8);
  const youtubeVolumeRef = useRef<number>(0.8);

  const [isYoutubeSyncEnabled, setIsYoutubeSyncEnabled] = useState<boolean>(false); // ✅ Added
  const [isClickGuideHardPannedRight, setIsClickGuideHardPannedRight] = useHardPanRightPreference();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFontSize = localStorage.getItem("wm_prefs_fontSize");
      if (savedFontSize) setLyricsFontSize(Number(savedFontSize));
      const savedShowChords = localStorage.getItem("wm_prefs_showChords");
      if (savedShowChords) setShowChords(savedShowChords === "true");
      const savedChordFormat = localStorage.getItem("wm_prefs_chordFormat");
      if (savedChordFormat) setChordFormat(savedChordFormat as "Key" | "Numbers");
      const savedMode = localStorage.getItem("wm_prefs_simplifiedMode");
      if (savedMode) setIsSimplifiedMode(savedMode === "true");
      const savedSpacing = localStorage.getItem("wm_prefs_lineSpacing");
      if (savedSpacing) setLineSpacing(Number(savedSpacing));
      const savedVolume = localStorage.getItem("wm_prefs_clickVolume");
      if (savedVolume) setLocalClickVolume(Number(savedVolume));
      const savedYtVolume = localStorage.getItem("wm_prefs_ytVolume");
      if (savedYtVolume) setYoutubeVolume(Number(savedYtVolume));
      const savedDouble = localStorage.getItem("wm_prefs_doubleMetronome");
      if (savedDouble) setIsDoubleMetronomeEnabled(savedDouble === "true");
      const savedYtSync = localStorage.getItem("wm_prefs_youtubeSync");
      if (savedYtSync) setIsYoutubeSyncEnabled(savedYtSync === "true");
      const savedMetronome = localStorage.getItem("wm_prefs_metronome"); // ✅ SURGICAL FIX: Added
      if (savedMetronome) setIsMetronomeSoundEnabled(savedMetronome === "true"); // ✅ SURGICAL FIX: Added
    }
  }, []);

  useEffect(() => {
    isMetronomeSoundEnabledRef.current = isMetronomeSoundEnabled;
    isDoubleMetronomeEnabledRef.current = isDoubleMetronomeEnabled;
    localClickVolumeRef.current = localClickVolume;
    youtubeVolumeRef.current = youtubeVolume;

    if (typeof window !== "undefined") {
      localStorage.setItem("wm_prefs_fontSize", lyricsFontSize.toString());
      localStorage.setItem("wm_prefs_showChords", showChords.toString());
      localStorage.setItem("wm_prefs_chordFormat", chordFormat);
      localStorage.setItem("wm_prefs_simplifiedMode", isSimplifiedMode.toString());
      localStorage.setItem("wm_prefs_lineSpacing", lineSpacing.toString());
      localStorage.setItem("wm_prefs_clickVolume", localClickVolume.toString());
      localStorage.setItem("wm_prefs_ytVolume", youtubeVolume.toString());
      localStorage.setItem("wm_prefs_doubleMetronome", isDoubleMetronomeEnabled.toString());
      localStorage.setItem("wm_prefs_youtubeSync", isYoutubeSyncEnabled.toString());
      localStorage.setItem("wm_prefs_metronome", isMetronomeSoundEnabled.toString()); // ✅ SURGICAL FIX: Actually saves the click toggle!
    }
  }, [lyricsFontSize, showChords, chordFormat, isSimplifiedMode, lineSpacing, localClickVolume, youtubeVolume, isDoubleMetronomeEnabled, isMetronomeSoundEnabled, isYoutubeSyncEnabled]);

  return {
    lyricsFontSize, setLyricsFontSize,
    showChords, setShowChords,
    chordFormat, setChordFormat,
    isSimplifiedMode, setIsSimplifiedMode,
    lineSpacing, setLineSpacing,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isMetronomeSoundEnabledRef,
    isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled, isDoubleMetronomeEnabledRef,
    localClickVolume, setLocalClickVolume, localClickVolumeRef,
    youtubeVolume, setYoutubeVolume, youtubeVolumeRef,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled,
    isClickGuideHardPannedRight, setIsClickGuideHardPannedRight
  };
}