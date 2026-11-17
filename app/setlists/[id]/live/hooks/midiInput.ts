export function matchesPairedMidiMapping(
  pairedDeviceId: string | null,
  inputId: string,
  mapping: { messageType: string; channel: number; number: number },
  messageType: string,
  channel: number,
  number: number,
): boolean {
  return pairedDeviceId !== null && pairedDeviceId === inputId &&
    mapping.messageType === messageType && mapping.channel === channel && mapping.number === number;
}

export function isMidiActionAllowedInEq(eqActive: boolean, actionId: string): boolean {
  return !eqActive || /^STEM_(DRUMS|BASS|KEYS|OTHER|GUITAR|VOCALS)_(VOL|MUTE|SOLO)$/.test(actionId) || [
    "toggleEqMode", "cycleLightShowPreset", "jogScrub", "clickOffset",
    "clickVolume", "guideVolume", "youtubeVolume", "transpose", "timelineZoom", "clickSound",
  ].includes(actionId);
}

export function getMidiFaderValue(messageType: string, data: Uint8Array): number | null {
  if (data.length < 3) return null;
  if (messageType === "pitchbend") return (((data[2] & 127) << 7) | (data[1] & 127)) / 16383;
  if (messageType === "cc" || messageType === "note") return (data[2] & 127) / 127;
  return null;
}

export function adjustLocalClickOffset(currentMs: number, delta: number): number {
  if (!Number.isFinite(currentMs) || !Number.isFinite(delta)) return currentMs;
  return Math.max(-1000, Math.min(1000, currentMs + delta * 10));
}

export function formatLocalClickOffset(offsetMs: number): string {
  return `${offsetMs > 0 ? "+" : ""}${offsetMs} ms`;
}

export function getOffsetMidiBeat(absoluteBeat: number, beatDurationMs: number, beatUnit: number, localOffsetMs: number, latencyOffsetMs: number): number {
  const clickBeat = absoluteBeat - (localOffsetMs - latencyOffsetMs) / beatDurationMs;
  const index = Math.floor((clickBeat + 0.000001) / beatUnit);
  return ((index % 4) + 4) % 4;
}

export function shouldTriggerMidiButton(actionId: string, isPressed: boolean, wasPressed: boolean): boolean {
  return isPressed && (actionId === "toggleEqMode" || !wasPressed);
}
