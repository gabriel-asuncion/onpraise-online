export interface FeedbackControl {
  type: "note" | "cc";
  channel: number;
  noteOrCcNumber: number;
}

export interface FeedbackOutput {
  state: string;
  name: string | null;
  send(data: number[]): void;
}

export type FeedbackScene = Map<string, { control: FeedbackControl; active: boolean }>;

export function getMidiOutputs<T extends Pick<FeedbackOutput, "state" | "name">>(
  access: { outputs: { values(): IterableIterator<T> } },
  pairedDeviceName: string | null,
): T[] {
  const outputs = [...access.outputs.values()].filter((output) => output.state !== "disconnected");
  if (!pairedDeviceName) return outputs;
  const keyword = pairedDeviceName.toLowerCase()
    .replace(/midiin\d*|midiout\d*|\(in\)|\(out\)|input|output/g, "")
    .trim();
  const matched = outputs.filter((output) => {
    const name = output.name?.toLowerCase() ?? "";
    return (keyword.length > 2 && name.includes(keyword)) || name.includes("smc");
  });
  return matched.length ? matched : outputs;
}

export function syncFeedbackOutputs<T extends FeedbackOutput>(
  outputs: T[],
  scene: FeedbackScene,
  previous: Map<T, FeedbackScene>,
): unknown[] {
  const errors: unknown[] = [];
  for (const [output, oldScene] of previous) {
    if (outputs.includes(output)) continue;
    if (output.state !== "disconnected") {
      for (const { control, active } of oldScene.values()) {
        if (!active) continue;
        try {
          output.send([(control.type === "note" ? 0x90 : 0xb0) | (control.channel < 0 ? 0 : control.channel), control.noteOrCcNumber, 0]);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    previous.delete(output);
  }
  for (const output of outputs) {
    const sent = previous.get(output) ?? new Map();
    const desired = new Map(scene);
    for (const [key, value] of sent) {
      if (!desired.has(key)) desired.set(key, { control: value.control, active: false });
    }
    for (const [key, value] of desired) {
      if (sent.get(key)?.active === value.active) continue;
      const { control, active } = value;
      try {
        output.send([(control.type === "note" ? 0x90 : 0xb0) | (control.channel < 0 ? 0 : control.channel), control.noteOrCcNumber, active ? 127 : 0]);
        sent.set(key, value);
      } catch (error) {
        errors.push(error);
      }
    }
    previous.set(output, sent);
  }
  return errors;
}

export function feedbackKey(control: FeedbackControl): string {
  return `${control.type}:${control.channel < 0 ? 0 : control.channel}:${control.noteOrCcNumber}`;
}

export function createBeatControls(
  firstNote: number,
  channel: number,
  count: number,
): Array<{ control: FeedbackControl; beat: number }> {
  if (!Number.isInteger(firstNote) || firstNote < 0 || firstNote > 127 ||
      !Number.isInteger(channel) || channel < 0 || channel > 15 ||
      !Number.isInteger(count) || count < 4 || count % 4 !== 0 || firstNote + count > 128) {
    return [];
  }
  const notesPerBeat = count / 4;
  return Array.from({ length: count }, (_, index) => ({
    control: { type: "note", channel, noteOrCcNumber: firstNote + index },
    beat: Math.floor(index / notesPerBeat),
  }));
}

export function parseBeatLightSettings(value: unknown): { firstNote: number; channel: number; count: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { firstNote, channel, count } = record;
  return typeof firstNote === "number" && typeof channel === "number" && typeof count === "number" &&
    createBeatControls(firstNote, channel, count).length > 0 ? { firstNote, channel, count } : null;
}

export function getConfiguredBeatControls(
  bindings: Record<string, unknown>, count: number | undefined,
): Array<{ control: FeedbackControl; beat: number }> {
  const getControls = (value: unknown): FeedbackControl[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if ((item.type !== "note" && item.type !== "cc") || item.mode !== "trigger" ||
      typeof item.channel !== "number" || !Number.isInteger(item.channel) || item.channel < -1 || item.channel > 15 ||
      typeof item.noteOrCcNumber !== "number" || !Number.isInteger(item.noteOrCcNumber) ||
      item.noteOrCcNumber < 0 || item.noteOrCcNumber > 127) return [];
    return [{ type: item.type, channel: item.channel, noteOrCcNumber: item.noteOrCcNumber }];
  };
  if (count !== undefined) {
    const first = getControls(bindings.BEAT_LIGHT_1)[0];
    return first?.type === "note" ? createBeatControls(first.noteOrCcNumber, Math.max(first.channel, 0), count) : [];
  }
  return [1, 2, 3, 4].flatMap((number) => {
    const binding = bindings[`BEAT_LIGHT_${number}`];
    const alternatives = binding && typeof binding === "object" && "alternatives" in binding && Array.isArray(binding.alternatives)
      ? binding.alternatives : [];
    return [binding, ...alternatives].flatMap((item) =>
      getControls(item).map((control) => ({ control, beat: number - 1 })));
  });
}

export function isShortcutLightActive(
  actionId: string,
  group: string,
  enabled: boolean,
  placementOpen: boolean,
  catalogOpen: boolean,
): boolean {
  if (!enabled) return false;
  if (!placementOpen && !catalogOpen) {
    return group !== "Modal Navigation" || actionId === "MODAL_OPEN_ADD_SECTION";
  }
  if (actionId === "PLAY_PAUSE") return catalogOpen;
  if (group !== "Modal Navigation" || actionId === "MODAL_OPEN_ADD_SECTION") return false;
  if (actionId === "MODAL_INSERT_BEFORE" || actionId === "MODAL_INSERT_AFTER") return placementOpen;
  if (actionId === "MODAL_CANCEL" || actionId === "MODAL_ADD_NEW_OR_CYCLE" || actionId === "MODAL_ADD_EXISTING_OR_CYCLE") return true;
  return actionId === "MODAL_CONFIRM" && catalogOpen;
}

export function buildFeedbackScene(
  shortcuts: Array<{ control: FeedbackControl; active: boolean }>,
  beatControls: Array<{ control: FeedbackControl; beat: number }>,
  playingBeat: number | null,
): Map<string, { control: FeedbackControl; active: boolean }> {
  const scene = new Map<string, { control: FeedbackControl; active: boolean }>();
  for (const { control, active } of shortcuts) {
    const key = feedbackKey(control);
    scene.set(key, { control, active: active || (scene.get(key)?.active ?? false) });
  }
  if (playingBeat !== null) {
    for (const { control } of beatControls) {
      const key = feedbackKey(control);
      const existing = scene.get(key);
      const isBeatControl = beatControls.some((item) => item.beat === playingBeat && feedbackKey(item.control) === key);
      scene.set(key, { control: existing?.control ?? control, active: isBeatControl || (existing?.active ?? false) });
    }
  } else {
    for (const { control } of beatControls) {
      const key = feedbackKey(control);
      if (!scene.has(key)) scene.set(key, { control, active: false });
    }
  }
  return scene;
}

export interface FaderFeedbackItem {
  key: string;
  messageType: "pitchbend" | "cc";
  channel: number;
  number: number;
  value: number;
}

export function syncFaderFeedbackOutputs<T extends FeedbackOutput>(
  outputs: T[],
  faders: readonly FaderFeedbackItem[],
  previous: Map<T, Map<string, number>>,
): unknown[] {
  const errors: unknown[] = [];
  for (const output of [...previous.keys()]) {
    if (!outputs.includes(output)) previous.delete(output);
  }
  for (const output of outputs) {
    if (output.state === "disconnected") continue;
    const sent = previous.get(output) ?? new Map<string, number>();
    for (const fader of faders) {
      const clamped = Math.max(0, Math.min(1, Number.isFinite(fader.value) ? fader.value : 0));
      const channel = Math.max(0, Math.min(15, fader.channel));
      const quantized = fader.messageType === "pitchbend"
        ? Math.round(clamped * 16383)
        : Math.round(clamped * 127);
      if (sent.get(fader.key) === quantized) continue;
      try {
        if (fader.messageType === "pitchbend") {
          output.send([0xe0 | channel, quantized & 0x7f, (quantized >> 7) & 0x7f]);
        } else {
          output.send([0xb0 | channel, fader.number & 0x7f, quantized]);
        }
        sent.set(fader.key, quantized);
      } catch (error) {
        errors.push(error);
      }
    }
    previous.set(output, sent);
  }
  return errors;
}
