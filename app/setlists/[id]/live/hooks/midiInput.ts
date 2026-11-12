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
  return !eqActive || [
    "toggleEqMode", "cycleLightShowPreset", "jogScrub", "clickOffset",
    "clickVolume", "guideVolume", "youtubeVolume", "transpose", "timelineZoom", "clickSound",
  ].includes(actionId);
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
