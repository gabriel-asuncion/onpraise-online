export function scalePitchBend(lsb: number, msb: number): number {
  return Math.round((((msb & 127) << 7) | (lsb & 127)) * 127 / 16383);
}

export function parsePitchBend(data: Uint8Array): { channel: number; value: number } | null {
  if (data.length < 3 || (data[0] & 0xf0) !== 0xe0) return null;
  return { channel: data[0] & 0x0f, value: scalePitchBend(data[1], data[2]) };
}

export function decodeMcuVpot(value: number): number {
  if (value >= 1 && value <= 15) return value;
  if (value >= 65 && value <= 79) return -(value - 64);
  return 0;
}

export const MCU_REC_PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7]] as const;

export function createMcuBeatControls() {
  return MCU_REC_PAIRS.flatMap((pair, beat) =>
    pair.map((noteOrCcNumber) => ({ control: { type: "note" as const, channel: 0, noteOrCcNumber }, beat })));
}

export function createMcuPreset(): Partial<Record<MidiActionId, MidiBinding>> {
  const bindings: Partial<Record<MidiActionId, MidiBinding>> = {};
  const assignNote = (actionId: MidiActionId, noteOrCcNumber: number) => {
    bindings[actionId] = { actionId, type: "note", channel: 0, noteOrCcNumber, mode: "trigger" };
  };
  assignNote("PLAY_PAUSE", 94);
  assignNote("STOP_RETURN", 93);
  assignNote("OPEN_ADD_SECTION", 95);
  assignNote("MODAL_INSERT_BEFORE", 18);
  assignNote("MODAL_INSERT_AFTER", 10);
  assignNote("MODAL_CANCEL", 2);
  assignNote("MODAL_ADD_NEW_OR_CYCLE", 26);
  const knobs: MidiActionId[] = [
    "JOG_SCRUB", "LANE_SCRUB", "ADJUST_SECTION_MEASURES", "ADJUST_SECTION_BEATS",
    "ADJUST_SECTION_REPEATS", "ADJUST_LINE_MEASURES", "ADJUST_YOUTUBE_OFFSET", "TIMELINE_ZOOM",
  ];
  knobs.forEach((actionId, index) => {
    bindings[actionId] = {
      actionId, type: "cc", channel: 0, noteOrCcNumber: 16 + index,
      mode: "relative_cw", relativeEncoding: "mcu_vpot",
    };
  });
  (["BACKING_TRACK_VOLUME", "CLICK_VOLUME"] as const).forEach((actionId, channel) => {
    bindings[actionId] = { actionId, type: "pitchbend", channel, noteOrCcNumber: channel, mode: "absolute" };
  });
  return bindings;
}
import type { MidiActionId, MidiBinding } from "./useMidiLearn";
