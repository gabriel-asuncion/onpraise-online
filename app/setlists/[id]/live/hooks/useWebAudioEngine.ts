import { normalizeSectionNameToAudioFile } from "../utils/setlist-helpers";

// Bypasses React state completely for zero-latency hardware access
let globalAudioContext: AudioContext | null = null;
const audioBufferCache: Record<string, AudioBuffer> = {};
let isHardPanRightEnabled = false;
let guideCueVolume = 0.8;
const activePanners = new Set<StereoPannerNode>();

// ✅ SURGICAL FIX: Track scheduled nodes so we can kill ghost beats & in-flight callouts on jumps
let scheduledNodes: { source: AudioBufferSourceNode; time: number; endTime: number }[] = [];

export const setAudioPanRight = (enabled: boolean) => {
  isHardPanRightEnabled = enabled;
  activePanners.forEach((panner) => {
    panner.pan.value = enabled ? 1 : 0;
  });
};

export const setGuideCueVolume = (volume: number) => {
  guideCueVolume = Math.max(0, Math.min(1, volume));
};

export const initAudioContext = () => {
  if (typeof window !== "undefined" && !globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (globalAudioContext && globalAudioContext.state === "suspended") {
    globalAudioContext.resume();
  }
};

export const fetchAndDecodeAudio = async (url: string, key: string) => {
  if (audioBufferCache[key]) return;
  initAudioContext();
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    if (globalAudioContext) {
      const audioBuffer = await globalAudioContext.decodeAudioData(arrayBuffer);
      audioBufferCache[key] = audioBuffer;
    }
  } catch (err) {
    console.warn(`Failed to decode audio: ${url}`);
  }
};

export const playZeroLatencyAudio = (key: string, volume: number = 1.0, time: number = 0) => {
    const ctx = getAudioContext() || globalAudioContext; 

    if (!ctx || ctx.state === 'suspended' || !audioBufferCache[key]) {
      return null; 
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBufferCache[key];

    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    if (isHardPanRightEnabled) {
      const pannerNode = ctx.createStereoPanner();
      pannerNode.pan.value = 1;
      activePanners.add(pannerNode);
      source.onended = () => activePanners.delete(pannerNode);
      source.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(ctx.destination);
    } else {
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
    }

    // ✅ SURGICAL FIX: Clamp time to 0 to prevent RangeError crashes on deep section jumps
    const safeTime = Math.max(0, time);
    const effectiveStart = safeTime > 0 ? safeTime : ctx.currentTime;
    const duration = audioBufferCache[key]?.duration ?? 0;
    source.start(safeTime); 

    // Track the scheduled sound in memory
    scheduledNodes.push({ source, time: safeTime, endTime: effectiveStart + duration });
    
    // Memory cleanup: remove nodes that already finished playing
    scheduledNodes = scheduledNodes.filter(n => n.endTime >= ctx.currentTime - 0.25);

    return source;
};

export const playGuideCue = (rawSectionName: string) => {
  if (!rawSectionName) return;
  const cleanName = normalizeSectionNameToAudioFile(rawSectionName);
  if (cleanName) playZeroLatencyAudio(cleanName, guideCueVolume);
};

export const playScheduledGuideCue = (fileKey: string, time: number = 0) => {
  if (!fileKey) return;
  playZeroLatencyAudio(fileKey, guideCueVolume, time);
};

export const getAudioContext = () => globalAudioContext;

// ✅ SURGICAL FIX: Function to sweep and kill any clicks scheduled in the future
export const cancelFutureAudio = () => {
  const ctx = getAudioContext() || globalAudioContext;
  if (!ctx) return;
  const now = ctx.currentTime;
  scheduledNodes.forEach(node => {
      // Stop nodes scheduled in the future OR still actively playing (e.g. callouts)
      if (node.time >= now || node.endTime > now) {
          try { node.source.stop(); } catch(e) {}
      }
  });
  scheduledNodes = []; // Clear the array
};

export function useWebAudioEngine() {
  return { 
    initAudioContext, 
    fetchAndDecodeAudio, 
    playZeroLatencyAudio, 
    playGuideCue,
    playScheduledGuideCue,
    getAudioContext,
    setAudioPanRight,
    setGuideCueVolume,
    cancelFutureAudio // ✅ Exported for the Live Page to use
  };
}