import { normalizeSectionNameToAudioFile } from "../utils/setlist-helpers";

// Bypasses React state completely for zero-latency hardware access
let globalAudioContext: AudioContext | null = null;
const audioBufferCache: Record<string, AudioBuffer> = {};

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
    // 1. Grab the context first
    const ctx = getAudioContext() || globalAudioContext; 

    // 2. Safety Check: Abort if no context, if autoplay is blocked, or if audio file is missing
    if (!ctx || ctx.state === 'suspended' || !audioBufferCache[key]) {
      return; 
    }

    // 3. Create the audio source and attach the memory buffer
    const source = ctx.createBufferSource();
    source.buffer = audioBufferCache[key];

    // 4. Create the volume control (GainNode)
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    // 5. Connect the wiring: Source -> Volume -> Speakers
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // 6. Fire the audio at the precise hardware time
    source.start(time); 
  };

export const playGuideCue = (rawSectionName: string) => {
  if (!rawSectionName) return;
  const cleanName = normalizeSectionNameToAudioFile(rawSectionName);
  if (cleanName) playZeroLatencyAudio(cleanName, 0.85);
};

export const getAudioContext = () => globalAudioContext;

export function useWebAudioEngine() {
  return { 
    initAudioContext, // ✅ Ensure this is exported!
    fetchAndDecodeAudio, 
    playZeroLatencyAudio, 
    playGuideCue, 
    getAudioContext 
  };
}