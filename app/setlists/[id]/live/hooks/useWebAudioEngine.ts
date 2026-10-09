import { normalizeSectionNameToAudioFile } from "../utils/setlist-helpers";

// Bypasses React state completely for zero-latency hardware access
let globalAudioContext: AudioContext | null = null;
const audioBufferCache: Record<string, AudioBuffer> = {};

// ✅ SURGICAL FIX: Track scheduled nodes so we can kill ghost beats on jumps
let scheduledNodes: { source: AudioBufferSourceNode; time: number }[] = [];

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

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // ✅ SURGICAL FIX: Clamp time to 0 to prevent RangeError crashes on deep section jumps
    const safeTime = Math.max(0, time);
    source.start(safeTime); 

    // Track the scheduled sound in memory
    scheduledNodes.push({ source, time: safeTime });
    
    // Memory cleanup: remove nodes that already finished playing
    scheduledNodes = scheduledNodes.filter(n => n.time >= ctx.currentTime - 0.5);

    return source;
};

export const playGuideCue = (rawSectionName: string) => {
  if (!rawSectionName) return;
  const cleanName = normalizeSectionNameToAudioFile(rawSectionName);
  if (cleanName) playZeroLatencyAudio(cleanName, 0.85);
};

export const getAudioContext = () => globalAudioContext;

// ✅ SURGICAL FIX: Function to sweep and kill any clicks scheduled in the future
export const cancelFutureAudio = () => {
  const ctx = getAudioContext() || globalAudioContext;
  if (!ctx) return;
  const now = ctx.currentTime;
  scheduledNodes.forEach(node => {
      // If the node is scheduled to play right now or in the future, stop it!
      if (node.time >= now) {
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
    getAudioContext,
    cancelFutureAudio // ✅ Exported for the Live Page to use
  };
}