"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../../../utils/supabase/client";
import { findMidiConflicts, updateMidiBinding } from "./midiBindings";
import { buildFeedbackScene, createBeatControls, getMidiOutputs, isShortcutLightActive, syncFeedbackOutputs, type FeedbackControl, type FeedbackScene } from "./midiFeedback";
import { createMcuBeatControls, createMcuPreset, decodeMcuVpot, parsePitchBend } from "./mcuProtocol";
import {
  createMidiControllerProfile,
  EMPTY_MIDI_PROFILES,
  parseMidiProfiles,
  type MidiProfilesDocument,
} from "../../../setlists/[id]/live/hooks/midiProfiles";

export type MidiActionId =
  | "PLAY_PAUSE" | "STOP_RETURN" | "LOOP_ACTIVE_SECTION"
  | "JOG_SCRUB" | "LANE_SCRUB" | "NUDGE_MEASURE_PREV" | "NUDGE_MEASURE_NEXT" | "SELECT_SECTION_AT_PLAYHEAD"
  | "PREV_SECTION" | "NEXT_SECTION" | "PREV_LINE" | "NEXT_LINE"
  | "ADJUST_SECTION_MEASURES" | "ADJUST_SECTION_BEATS" | "ADJUST_SECTION_REPEATS"
  | "ADJUST_LINE_MEASURES" | "TAP_TO_SPLIT_LINE"
  | "ADJUST_YOUTUBE_OFFSET" | "ADJUST_TEMPO_BPM"
  | "BACKING_TRACK_VOLUME" | "CLICK_VOLUME" | "CLICK_MUTE_TOGGLE" | "CLICK_SPEED_CYCLE" | "CLICK_PATTERN_CYCLE" | "TIMELINE_ZOOM"
  | "SAVE_STRUCTURE" | "UNDO_CHANGES" | "DELETE_ACTIVE_SECTION" | "OPEN_ADD_SECTION"
  | "MODAL_INSERT_BEFORE" | "MODAL_INSERT_AFTER" | "MODAL_CANCEL"
  | "MODAL_ADD_NEW_OR_CYCLE" | "MODAL_CONFIRM" | "MODAL_OPEN_ADD_SECTION"
  | "BEAT_LIGHT_1" | "BEAT_LIGHT_2" | "BEAT_LIGHT_3" | "BEAT_LIGHT_4";

export type MidiBindingMode = "trigger" | "absolute" | "relative_cw";
export type MidiInputType = "note" | "cc" | "pitchbend";
export type MidiRelativeEncoding = "two_complement" | "sign_magnitude" | "m_vave_cw" | "mcu_vpot";

export interface MidiBinding {
  actionId: MidiActionId;
  type: MidiInputType;
  channel: number;
  noteOrCcNumber: number;
  mode: MidiBindingMode;
  relativeEncoding?: MidiRelativeEncoding;
  alternatives?: MidiBinding[];
}

export interface MidiDeviceOption {
  id: string;
  name: string;
  state: string;
}

export interface MidiActionPayload {
  rawValue: number;
  delta?: number;
}

export interface MidiMonitorMessage {
  type: MidiInputType | "other";
  number: number;
  value: number;
  channel: number;
  deviceName: string;
}

export const MIDI_ACTIONS: Array<{
  id: MidiActionId;
  group: string;
  label: string;
  description: string;
  modes: MidiBindingMode[];
}> = [
  { id: "PLAY_PAUSE", group: "Transport", label: "Play / Pause", description: "Toggle timeline audio playback from the current playhead.", modes: ["trigger"] },
  { id: "STOP_RETURN", group: "Transport", label: "Stop & Return", description: "Stop playback and return to the active section start.", modes: ["trigger"] },
  { id: "LOOP_ACTIVE_SECTION", group: "Transport", label: "Loop Active Section", description: "Toggle looping the active section.", modes: ["trigger"] },
  { id: "JOG_SCRUB", group: "Navigation", label: "Jog Scrub", description: "Scrub by quarter-beat increments; absolute CC maps across the timeline.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "LANE_SCRUB", group: "Navigation", label: "Lane Scrub", description: "Select a timeline lane using a knob or button.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "NUDGE_MEASURE_PREV", group: "Navigation", label: "Nudge Measure Back", description: "Move the playhead backward by one measure.", modes: ["trigger"] },
  { id: "NUDGE_MEASURE_NEXT", group: "Navigation", label: "Nudge Measure Forward", description: "Move the playhead forward by one measure.", modes: ["trigger"] },
  { id: "SELECT_SECTION_AT_PLAYHEAD", group: "Navigation", label: "Select Section at Playhead", description: "Focus the section under the playhead.", modes: ["trigger"] },
  { id: "PREV_SECTION", group: "Navigation", label: "Previous Section", description: "Focus the previous section.", modes: ["trigger"] },
  { id: "NEXT_SECTION", group: "Navigation", label: "Next Section", description: "Focus the next section.", modes: ["trigger"] },
  { id: "PREV_LINE", group: "Navigation", label: "Previous Line", description: "Focus the previous lyric line.", modes: ["trigger"] },
  { id: "NEXT_LINE", group: "Navigation", label: "Next Line", description: "Focus the next lyric line.", modes: ["trigger"] },
  { id: "ADJUST_SECTION_MEASURES", group: "Timing Adjustments", label: "Section Measures", description: "Adjust active section measures by one per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "ADJUST_SECTION_BEATS", group: "Timing Adjustments", label: "Section Beats", description: "Adjust active section beats.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "ADJUST_SECTION_REPEATS", group: "Timing Adjustments", label: "Section Repeats", description: "Adjust section repeat passes.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "ADJUST_LINE_MEASURES", group: "Timing Adjustments", label: "Line Duration (Beats)", description: "Adjust the focused lyric line by one beat per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "TAP_TO_SPLIT_LINE", group: "Timing Adjustments", label: "Tap Line Partition", description: "Drop a line partition at the current playhead beat.", modes: ["trigger"] },
  { id: "ADJUST_YOUTUBE_OFFSET", group: "Sync & Tempo", label: "YouTube Offset", description: "Adjust YouTube offset by 25 ms per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "ADJUST_TEMPO_BPM", group: "Sync & Tempo", label: "Tempo", description: "Adjust tempo by one BPM per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "BACKING_TRACK_VOLUME", group: "Audio/Canvas", label: "Backing Track Volume", description: "Set YouTube volume from 0 to 100%.", modes: ["absolute", "trigger"] },
  { id: "CLICK_VOLUME", group: "Audio/Canvas", label: "Click Volume", description: "Set click volume from 0 to 100%.", modes: ["absolute", "trigger"] },
  { id: "CLICK_MUTE_TOGGLE", group: "Audio/Canvas", label: "Click Mute", description: "Toggle metronome mute.", modes: ["trigger"] },
  { id: "CLICK_SPEED_CYCLE", group: "Audio/Canvas", label: "Click Speed", description: "Cycle normal, double, and half speed.", modes: ["trigger"] },
  { id: "CLICK_PATTERN_CYCLE", group: "Audio/Canvas", label: "Click Pattern", description: "Cycle the metronome accent pattern.", modes: ["trigger"] },
  { id: "TIMELINE_ZOOM", group: "Audio/Canvas", label: "Timeline Zoom", description: "Set scale from 0.1 to 200 pixels per beat.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "SAVE_STRUCTURE", group: "Structure", label: "Save Structure", description: "Persist the current structure and timing.", modes: ["trigger"] },
  { id: "UNDO_CHANGES", group: "Structure", label: "Undo", description: "Revert the latest timeline change.", modes: ["trigger"] },
  { id: "DELETE_ACTIVE_SECTION", group: "Structure", label: "Delete Active Section", description: "Remove the focused arrangement section.", modes: ["trigger"] },
  { id: "OPEN_ADD_SECTION", group: "Structure", label: "Open Section Insertion", description: "Open the section placement flow at the playhead.", modes: ["trigger"] },
  { id: "MODAL_INSERT_BEFORE", group: "Modal Navigation", label: "Modal: Insert Before", description: "Place the pending section before the anchor.", modes: ["trigger"] },
  { id: "MODAL_INSERT_AFTER", group: "Modal Navigation", label: "Modal: Insert After", description: "Place the pending section after the anchor.", modes: ["trigger"] },
  { id: "MODAL_OPEN_ADD_SECTION", group: "Modal Navigation", label: "Open Timeline Add Section (+)", description: "Press the timeline add-section button using the current selection.", modes: ["trigger"] },
  { id: "MODAL_CANCEL", group: "Modal Navigation", label: "Modal: Cancel / Dismiss", description: "Cancel the active section dialog.", modes: ["trigger"] },
  { id: "MODAL_ADD_NEW_OR_CYCLE", group: "Modal Navigation", label: "Modal: Add New / Cycle Catalog", description: "Open the section catalog or cycle its selection.", modes: ["trigger"] },
  { id: "MODAL_CONFIRM", group: "Modal Navigation", label: "Modal: Confirm Selection", description: "Confirm the selected section in the catalog.", modes: ["trigger"] },
  { id: "BEAT_LIGHT_1", group: "Metronome Lights", label: "First beat note", description: "Learn the first note in the metronome light range.", modes: ["trigger"] },
  { id: "BEAT_LIGHT_2", group: "Metronome Lights", label: "Beat 2: Strip 8 S", description: "Learn the strip 8 S button for beat 2 feedback.", modes: ["trigger"] },
  { id: "BEAT_LIGHT_3", group: "Metronome Lights", label: "Beat 3: Strip 8 R", description: "Learn the strip 8 R button for beat 3 feedback.", modes: ["trigger"] },
  { id: "BEAT_LIGHT_4", group: "Metronome Lights", label: "Beat 4: Strip 8 Square", description: "Learn the strip 8 square button for beat 4 feedback.", modes: ["trigger"] },
];

type MidiInputLike = MIDIInput;
type MidiOutputLike = MIDIOutput;
type MidiAccessLike = MIDIAccess;
type MidiNavigatorLike = Navigator & {
  requestMIDIAccess?: (options: MIDIOptions) => Promise<MidiAccessLike>;
};

const STORAGE_KEY = "onpraise_midi_mappings_edit_v1";
const isActionId = (value: string): value is MidiActionId =>
  MIDI_ACTIONS.some((action) => action.id === value);
const isMode = (value: unknown): value is MidiBindingMode =>
  value === "trigger" || value === "absolute" || value === "relative_cw";

function readStoredBindings(value?: unknown): Partial<Record<MidiActionId, MidiBinding>> {
  if (value === undefined && typeof window === "undefined") return {};
  try {
    const stored = value === undefined ? window.localStorage.getItem(STORAGE_KEY) : value;
    if (!stored) return {};
    const parsed: unknown = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      if (!isActionId(key) || !value || typeof value !== "object") return [];
      const binding = value as Partial<MidiBinding>;
      if (
        binding.actionId !== key ||
        (binding.type !== "note" && binding.type !== "cc" && binding.type !== "pitchbend") ||
        !Number.isInteger(binding.channel) ||
        (binding.channel !== -1 && (binding.channel! < 0 || binding.channel! > 15)) ||
        !Number.isInteger(binding.noteOrCcNumber) ||
        binding.noteOrCcNumber! < 0 || binding.noteOrCcNumber! > 127 ||
        !isMode(binding.mode)
      ) return [];
      const readAlternative = (candidate: unknown): MidiBinding[] => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as Partial<MidiBinding>;
        if (item.actionId !== key || (item.type !== "note" && item.type !== "cc" && item.type !== "pitchbend") ||
          !Number.isInteger(item.channel) || item.channel! < -1 || item.channel! > 15 ||
          !Number.isInteger(item.noteOrCcNumber) || item.noteOrCcNumber! < 0 ||
          item.noteOrCcNumber! > 127 || !isMode(item.mode)) return [];
        return [{
          actionId: key, type: item.type, channel: item.channel!, noteOrCcNumber: item.noteOrCcNumber!,
          mode: item.mode,
          relativeEncoding: item.relativeEncoding === "sign_magnitude" || item.relativeEncoding === "m_vave_cw" || item.relativeEncoding === "mcu_vpot"
            ? item.relativeEncoding : "two_complement",
        }];
      };
      return [[key, {
        actionId: key,
        type: binding.type,
        channel: binding.channel!,
        noteOrCcNumber: binding.noteOrCcNumber!,
        mode: binding.mode,
        relativeEncoding: binding.relativeEncoding === "sign_magnitude" || binding.relativeEncoding === "m_vave_cw" || binding.relativeEncoding === "mcu_vpot"
          ? binding.relativeEncoding
          : "two_complement",
        alternatives: Array.isArray(binding.alternatives) ? binding.alternatives.flatMap(readAlternative) : [],
      }]];
    }));
  } catch (error) {
    console.error("Could not load MIDI mappings.", error);
    return {};
  }
}

function applySmcRelativeEncoding(
  bindings: Partial<Record<MidiActionId, MidiBinding>>,
  deviceName: string | null,
): Partial<Record<MidiActionId, MidiBinding>> {
  if (!deviceName || !/smc[\s-]*mixer/i.test(deviceName)) return bindings;
  let changed = false;
  const updated = Object.fromEntries(Object.entries(bindings).map(([actionId, binding]) => {
    if (!binding) return [actionId, binding];
    const convert = (item: MidiBinding): MidiBinding => {
      if (item.mode !== "relative_cw" || item.relativeEncoding !== "two_complement") return item;
      changed = true;
      return { ...item, relativeEncoding: "m_vave_cw" };
    };
    return [actionId, { ...convert(binding), alternatives: binding.alternatives?.map(convert) }];
  }));
  return changed ? updated : bindings;
}

export function useMidiLearn(
  onAction: (actionId: MidiActionId, payload?: MidiActionPayload) => void,
  supabase: ReturnType<typeof createClient>,
  isSetupOpen: boolean,
) {
  const [bindings, setBindings] = useState<Partial<Record<MidiActionId, MidiBinding>>>(readStoredBindings);
  const [isSupported, setIsSupported] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeDeviceName, setActiveDeviceName] = useState<string | null>(null);
  const [devices, setDevices] = useState<MidiDeviceOption[]>([]);
  const [learningActionId, setLearningActionId] = useState<MidiActionId | null>(null);
  const [latestMessage, setLatestMessage] = useState<MidiMonitorMessage | null>(null);
  const [recentMessages, setRecentMessages] = useState<MidiMonitorMessage[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [profileDocument, setProfileDocument] = useState<MidiProfilesDocument>(EMPTY_MIDI_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const learningActionIdRef = useRef<MidiActionId | null>(null);
  const learnModeRef = useRef<MidiBindingMode>("trigger");
  const learnIndexRef = useRef(0);
  const onActionRef = useRef(onAction);
  const bindingsRef = useRef(bindings);
  const setupOpenRef = useRef(isSetupOpen);
  const profileDocumentRef = useRef(profileDocument);
  const activeProfileIdRef = useRef(activeProfileId);
  const legacySettingsRef = useRef<Record<string, unknown>>({});
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef(new Map<MidiActionId, MidiActionPayload>());
  const pendingMonitorRef = useRef<MidiMonitorMessage[]>([]);
  const outputsRef = useRef<MidiOutputLike[]>([]);
  const [outputRevision, setOutputRevision] = useState(0);
  const feedbackStateRef = useRef<Map<MidiOutputLike, FeedbackScene>>(new Map());
  const rescanRef = useRef<() => void>(() => {});

  useEffect(() => { onActionRef.current = onAction; }, [onAction]);
  useEffect(() => { bindingsRef.current = bindings; }, [bindings]);
  useEffect(() => { setupOpenRef.current = isSetupOpen; }, [isSetupOpen]);
  useEffect(() => { profileDocumentRef.current = profileDocument; }, [profileDocument]);
  useEffect(() => { activeProfileIdRef.current = activeProfileId; }, [activeProfileId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) {
        setAccessError(authError?.message || "Sign in to save MIDI profiles to your account.");
        setIsProfileLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("user_control_preferences")
        .select("settings, midi_profiles")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setAccessError(`Could not load MIDI profiles: ${error.message}`);
        setIsProfileLoading(false);
        return;
      }
      legacySettingsRef.current = data?.settings && typeof data.settings === "object"
        ? data.settings as Record<string, unknown>
        : {};
      let document = parseMidiProfiles(data?.midi_profiles);
      if (document.profiles.length === 0) {
        const profile = createMidiControllerProfile("Default");
        profile.editBindings = readStoredBindings() as Record<string, unknown>;
        document = { version: 1, activeProfileId: profile.id, profiles: [profile] };
      }
      const selected = document.profiles.find((profile) => profile.id === document.activeProfileId) ?? document.profiles[0];
      document = { ...document, activeProfileId: selected.id };
      const storedBindings = readStoredBindings(selected.editBindings);
      const restored = applySmcRelativeEncoding(storedBindings, selected.pairedDeviceName);
      if (restored !== storedBindings) {
        document = {
          ...document,
          profiles: document.profiles.map((profile) => profile.id === selected.id
            ? { ...profile, editBindings: restored as Record<string, unknown> }
            : profile),
        };
      }
      bindingsRef.current = restored;
      setBindings(restored);
      setProfileDocument(document);
      profileDocumentRef.current = document;
      setActiveProfileId(selected.id);
      activeProfileIdRef.current = selected.id;
      setProfileUserId(auth.user.id);
      setIsProfileLoading(false);
    })().catch((error: unknown) => {
      if (!active) return;
      console.error("Could not initialize MIDI profiles.", error);
      setAccessError(error instanceof Error ? error.message : "Could not load MIDI profiles.");
      setIsProfileLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  const persist = useCallback((next: Partial<Record<MidiActionId, MidiBinding>>) => {
    setBindings(next);
    bindingsRef.current = next;
    const selectedId = activeProfileIdRef.current;
    if (selectedId) {
      setProfileDocument((current) => {
        const updated = {
          ...current,
          profiles: current.profiles.map((profile) => profile.id === selectedId
            ? { ...profile, editBindings: next as Record<string, unknown> }
            : profile),
        };
        profileDocumentRef.current = updated;
        return updated;
      });
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setAccessError(null);
    } catch (error) {
      console.error("Could not save MIDI mappings.", error);
      setAccessError("MIDI mappings changed but could not be saved in this browser.");
    }
  }, []);

  useEffect(() => {
    const midiNavigator = navigator as MidiNavigatorLike;
    if (typeof midiNavigator.requestMIDIAccess !== "function") return;
    let active = true;
    let access: MidiAccessLike | null = null;
    queueMicrotask(() => {
      if (active) setIsSupported(true);
    });

    const flush = () => {
      frameRef.current = null;
      if (pendingMonitorRef.current.length > 0) {
        const messages = pendingMonitorRef.current;
        pendingMonitorRef.current = [];
        setLatestMessage(messages[messages.length - 1]);
        setRecentMessages((current) => [...messages, ...current].slice(0, 8));
      }
      const pending = [...pendingRef.current.entries()];
      pendingRef.current.clear();
      pending.forEach(([actionId, payload]) => onActionRef.current(actionId, payload));
    };
    const scheduleFlush = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
    };
    const receive = (input: MidiInputLike, data: Uint8Array) => {
      if (!active || data.length < 2) return;
      const status = data[0];
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const type: MidiInputType | "other" =
        command === 0x80 || command === 0x90 ? "note" :
          command === 0xb0 ? "cc" : command === 0xe0 ? "pitchbend" : "other";
      if (type !== "other" && data.length < 3) return;
      const number = type === "pitchbend" ? channel : data[1];
      const pitchBend = type === "pitchbend" ? parsePitchBend(data) : null;
      if (type === "pitchbend" && !pitchBend) return;
      const value = pitchBend ? pitchBend.value : data[2] ?? 0;
      pendingMonitorRef.current.push({
        type, number, value, channel,
        deviceName: input.name?.trim() || "MIDI input",
      });
      scheduleFlush();
      if (type === "other") return;
      const noteOn = command === 0x90 && value > 0;
      const activeProfile = profileDocumentRef.current.profiles.find(
        (profile) => profile.id === activeProfileIdRef.current,
      );
      if (activeProfile?.pairedDeviceId && input.id !== activeProfile.pairedDeviceId) return;
      if (learningActionIdRef.current) {
        if (type === "note" && !noteOn) return;
        const actionId = learningActionIdRef.current;
        if (actionId === "BEAT_LIGHT_1") {
          if (type !== "note") {
            setAccessError("Press a MIDI note button to learn the first beat light.");
            return;
          }
          const count = activeProfile?.editBeatNoteCount ?? (activeProfile?.editProtocol === "mcu" ? 8 : 4);
          if (!createBeatControls(number, channel, count).length) {
            setAccessError(`The ${count}-note range starting at note ${number} exceeds MIDI note 127.`);
            return;
          }
        }
        if (type === "pitchbend" && !MIDI_ACTIONS.find((action) => action.id === actionId)?.modes.includes("absolute")) {
          setAccessError("This shortcut does not support absolute pitch-bend faders.");
          return;
        }
        const binding: MidiBinding = {
          actionId,
          type,
          channel,
          noteOrCcNumber: number,
          mode: type === "note" ? "trigger" : type === "pitchbend" ? "absolute" : learnModeRef.current,
          relativeEncoding: activeProfile?.editProtocol === "mcu" && type === "cc" && number >= 16 && number <= 23
            ? "mcu_vpot" : "m_vave_cw",
        };
        const conflicts = findMidiConflicts(
          Object.values(bindingsRef.current).flatMap((existing) =>
            existing ? [{ primary: existing, alternatives: existing.alternatives ?? [] }] : []),
          binding,
          learnIndexRef.current,
        );
        if (conflicts.length > 0) {
          const names = [...new Set(conflicts.map((item) =>
            MIDI_ACTIONS.find((action) => action.id === item.actionId)?.label ?? item.actionId))].join(", ");
          if (!window.confirm(`This MIDI control is already used by ${names}. Shared shortcuts may activate together; mapped lights remain on during the beat animation. Assign it anyway?`)) return;
        }
        const previous = bindingsRef.current[actionId];
        const updated = updateMidiBinding(previous, previous?.alternatives ?? [], binding, learnIndexRef.current);
        persist({ ...bindingsRef.current, [actionId]: { ...updated.primary, alternatives: updated.alternatives } });
        if (actionId === "BEAT_LIGHT_1" && activeProfile) {
          setProfileDocument((current) => {
            const next = {
              ...current,
              profiles: current.profiles.map((profile) => profile.id === activeProfile.id
                ? { ...profile, editBeatNoteCount: profile.editBeatNoteCount ?? (profile.editProtocol === "mcu" ? 8 : 4) }
                : profile),
            };
            profileDocumentRef.current = next;
            return next;
          });
        }
        learningActionIdRef.current = null;
        setLearningActionId(null);
        return;
      }
      if (setupOpenRef.current) return;

      for (const binding of Object.values(bindingsRef.current).flatMap((item) =>
        item ? [item, ...(item.alternatives ?? [])] : []
      )) {
        if (!binding || binding.type !== type || (type !== "pitchbend" && binding.noteOrCcNumber !== number) ||
          (binding.channel !== -1 && binding.channel !== channel)) continue;
        if (binding.actionId.startsWith("BEAT_LIGHT_")) continue;
        if (type === "pitchbend") {
          if (binding.mode === "absolute") pendingRef.current.set(binding.actionId, { rawValue: value });
          continue;
        }
        const activeValue = type === "note" ? noteOn : value > 0;
        if (binding.mode === "trigger") {
          if (activeValue) onActionRef.current(binding.actionId, { rawValue: value, delta: 1 });
          continue;
        }
        if (type !== "cc") continue;
        if (binding.mode === "absolute") {
          pendingRef.current.set(binding.actionId, { rawValue: value });
        } else {
          let delta = 0;
          if (binding.relativeEncoding === "mcu_vpot") {
            delta = decodeMcuVpot(value);
          } else if (binding.relativeEncoding === "m_vave_cw") {
            // M-Vave CubeSuite CW mode:
            // Counter-clockwise (Left): sends 0 (default) or 1
            // Clockwise (Right): sends 127 (default) or any value >= 64
            if (value === 0 || value === 1) {
              delta = -1;
            } else if (value >= 64 || value > 1) {
              delta = 1;
            }
          } else {
            delta = value >= 1 && value <= 63
              ? value
              : value >= 64 && binding.relativeEncoding === "sign_magnitude"
                ? -(value - 64)
                : value >= 64 ? -(128 - value) : 0;
          }

          if (!delta) continue;
          const existing = pendingRef.current.get(binding.actionId);
          pendingRef.current.set(binding.actionId, {
            rawValue: value,
            delta: (existing?.delta ?? 0) + delta,
          });
        }
      }
      if (pendingRef.current.size) scheduleFlush();
    };
    const attachedInputs = new Map<string, MidiInputLike>();
    const pendingActions = pendingRef.current;
    const pendingMonitor = pendingMonitorRef;
    const refreshInputs = () => {
      if (!active || !access) return;
      const inputs = [...access.inputs.values()].filter((input) => input.state !== "disconnected");
      outputsRef.current = [...access.outputs.values()].filter((output) => output.state !== "disconnected");
      setOutputRevision((revision) => revision + 1);
      const currentIds = new Set(inputs.map((input) => input.id));
      attachedInputs.forEach((input, id) => {
        if (!currentIds.has(id)) {
          input.onmidimessage = null;
          attachedInputs.delete(id);
        }
      });
      inputs.forEach((input) => {
        input.onmidimessage = (event) => {
          if (event.data) receive(input, event.data);
        };
        attachedInputs.set(input.id, input);
      });
      setIsConnected(inputs.length > 0);
      setActiveDeviceName(inputs.map((input) => input.name?.trim() || "MIDI input").join(", ") || null);
      setDevices(inputs.map((input) => ({
        id: input.id,
        name: input.name?.trim() || "MIDI input",
        state: input.state,
      })));
    };
    rescanRef.current = refreshInputs;

    const handleAccessError = (error: unknown) => {
      if (!active) return;
      console.error("Could not access Web MIDI.", error);
      setAccessError(error instanceof Error ? error.message : "MIDI permission was denied.");
    };
    try {
      void midiNavigator.requestMIDIAccess({ sysex: false }).then((result) => {
        if (!active) return;
        access = result;
        result.onstatechange = refreshInputs;
        refreshInputs();
      }).catch(handleAccessError);
    } catch (error) {
      handleAccessError(error);
    }
    return () => {
      active = false;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingActions.clear();
      pendingMonitor.current = [];
      if (access) {
        access.onstatechange = null;
        attachedInputs.forEach((input) => { input.onmidimessage = null; });
      }
      outputsRef.current = [];
      rescanRef.current = () => {};
    };
  }, [persist]);

  const startListening = useCallback((actionId: MidiActionId, mode: MidiBindingMode, index = 0) => {
    learnModeRef.current = mode;
    learnIndexRef.current = index;
    learningActionIdRef.current = actionId;
    setLearningActionId(actionId);
  }, []);
  const stopListening = useCallback(() => {
    learningActionIdRef.current = null;
    setLearningActionId(null);
  }, []);
  const clearBinding = useCallback((actionId: MidiActionId, index = 0) => {
    const next = { ...bindingsRef.current };
    const current = next[actionId];
    if (index > 0 && current) {
      next[actionId] = { ...current, alternatives: (current.alternatives ?? []).filter((_, i) => i !== index - 1) };
    } else if (current?.alternatives?.length) {
      const [primary, ...alternatives] = current.alternatives;
      next[actionId] = { ...primary, alternatives };
    } else {
      delete next[actionId];
    }
    persist(next);
  }, [persist]);
  const updateBinding = useCallback((
    actionId: MidiActionId,
    update: Partial<Pick<MidiBinding, "mode" | "channel" | "relativeEncoding">>,
    index = 0,
  ) => {
    const binding = bindingsRef.current[actionId];
    if (!binding) return;
    const target = index === 0 ? binding : binding.alternatives?.[index - 1];
    if (!target) return;
    if (update.channel !== undefined && update.channel !== target.channel) {
      const conflicts = findMidiConflicts(
        Object.values(bindingsRef.current).flatMap((existing) =>
          existing ? [{ primary: existing, alternatives: existing.alternatives ?? [] }] : []),
        { ...target, ...update },
        index,
      );
      if (conflicts.length) {
        const names = [...new Set(conflicts.map((item) =>
          MIDI_ACTIONS.find((action) => action.id === item.actionId)?.label ?? item.actionId))].join(", ");
        if (!window.confirm(`This MIDI control is already used by ${names}. Shared shortcuts may activate together; mapped lights remain on during the beat animation. Assign it anyway?`)) return;
      }
    }
    if (index === 0) {
      persist({ ...bindingsRef.current, [actionId]: { ...binding, ...update } });
    } else {
      const alternatives = [...(binding.alternatives ?? [])];
      if (!alternatives[index - 1]) return;
      alternatives[index - 1] = { ...alternatives[index - 1], ...update };
      persist({ ...bindingsRef.current, [actionId]: { ...binding, alternatives } });
    }
  }, [persist]);
  const resetAllBindings = useCallback(() => persist({}), [persist]);
  const setBeatNoteCount = useCallback((count: number): string | null => {
    const profileId = activeProfileIdRef.current;
    const profile = profileDocumentRef.current.profiles.find((item) => item.id === profileId);
    if (!profile) return "Select a MIDI profile first.";
    if (!Number.isInteger(count) || count < 4 || count > 128 || count % 4 !== 0) {
      return "Enter a whole number from 4 to 128 divisible by 4.";
    }
    const first = bindingsRef.current.BEAT_LIGHT_1;
    const firstNote = first?.type === "note" ? first.noteOrCcNumber : profile.editProtocol === "mcu" ? 0 : null;
    if (firstNote !== null && firstNote + count > 128) return "The selected range exceeds MIDI note 127.";
    setProfileDocument((current) => {
      const next = {
        ...current,
        profiles: current.profiles.map((item) => item.id === profileId ? { ...item, editBeatNoteCount: count } : item),
      };
      profileDocumentRef.current = next;
      return next;
    });
    return null;
  }, []);
  const applyMcuPreset = useCallback(() => {
    const profileId = activeProfileIdRef.current;
    if (!profileId) return;
    persist(createMcuPreset());
    setProfileDocument((current) => {
      const next = {
        ...current,
        profiles: current.profiles.map((profile) => profile.id === profileId
          ? { ...profile, editProtocol: "mcu" as const, editBeatNoteCount: 8 }
          : profile),
      };
      profileDocumentRef.current = next;
      return next;
    });
  }, [persist]);
  const scanMidiDevices = useCallback(() => rescanRef.current(), []);
  const sendFeedbackScene = useCallback((
    placementOpen: boolean, catalogOpen: boolean, beat: number | null, enabled: boolean,
  ) => {
    const profile = profileDocumentRef.current.profiles.find((item) => item.id === activeProfileIdRef.current);
    const outputs = profile ? getMidiOutputs({ outputs: outputsRef.current }, profile.pairedDeviceName) : [];
    const shortcutControls: Array<{ control: FeedbackControl; active: boolean }> = [];
    let beatControls: Array<{ control: FeedbackControl; beat: number }> = [];
    const firstBeat = bindingsRef.current.BEAT_LIGHT_1;
    const useRange = profile?.editBeatNoteCount !== undefined || profile?.editProtocol === "mcu";
    if (profile?.editProtocol === "mcu") {
      beatControls = createMcuBeatControls();
    } else if (useRange && firstBeat?.type === "note") {
      beatControls = createBeatControls(firstBeat.noteOrCcNumber, Math.max(0, firstBeat.channel), profile?.editBeatNoteCount ?? 4);
    }
    for (const action of MIDI_ACTIONS) {
      const binding = bindingsRef.current[action.id];
      if (!binding) continue;
      const beatNumber = /^BEAT_LIGHT_([1-4])$/.exec(action.id);
      if (useRange && beatNumber) continue;
      const active = isShortcutLightActive(action.id, action.group, enabled, placementOpen, catalogOpen);
      for (const item of [binding, ...(binding.alternatives ?? [])]) {
        if (item.mode !== "trigger" || item.type === "pitchbend") continue;
        const control: FeedbackControl = { type: item.type, channel: item.channel, noteOrCcNumber: item.noteOrCcNumber };
        if (beatNumber) beatControls.push({ control, beat: Number(beatNumber[1]) - 1 });
        else shortcutControls.push({
          control,
          active,
        });
      }
    }
    const scene = buildFeedbackScene(shortcutControls, beatControls, beat);
    const errors = syncFeedbackOutputs(outputs, scene, feedbackStateRef.current);
    if (errors.length) {
      console.error("Could not send MIDI light feedback.", errors);
      setAccessError("Could not send MIDI light feedback to one or more MIDI outputs.");
    } else if (profile?.pairedDeviceId && outputs.length === 0) {
      setAccessError("No MIDI output is connected. Connect an output to enable lights.");
    } else {
      setAccessError((current) =>
        current === "No MIDI output is connected. Connect an output to enable lights." ||
        current === "Could not send MIDI light feedback to one or more MIDI outputs." ? null : current);
    }
  }, []);
  useEffect(() => () => {
    const errors = syncFeedbackOutputs([], new Map(), feedbackStateRef.current);
    if (errors.length) console.error("Could not clear MIDI lights on exit.", errors);
  }, []);
  const pairDevice = useCallback((deviceId: string) => {
    const selected = devices.find((device) => device.id === deviceId);
    const updatedBindings = applySmcRelativeEncoding(bindingsRef.current, selected?.name ?? null);
    if (updatedBindings !== bindingsRef.current) persist(updatedBindings);
    setProfileDocument((current) => {
      const next = {
        ...current,
        profiles: current.profiles.map((profile) => profile.id === activeProfileId
          ? {
              ...profile,
              pairedDeviceId: selected?.id ?? null,
              pairedDeviceName: selected?.name ?? null,
              editBindings: updatedBindings as Record<string, unknown>,
            }
          : profile),
      };
      profileDocumentRef.current = next;
      return next;
    });
    stopListening();
  }, [activeProfileId, devices, persist, stopListening]);
  const selectProfile = useCallback((profileId: string) => {
    const profile = profileDocumentRef.current.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    setActiveProfileId(profileId);
    activeProfileIdRef.current = profileId;
    const nextDocument = { ...profileDocumentRef.current, activeProfileId: profileId };
    profileDocumentRef.current = nextDocument;
    setProfileDocument(nextDocument);
    const nextBindings = applySmcRelativeEncoding(
      readStoredBindings(profile.editBindings),
      profile.pairedDeviceName,
    );
    if (nextBindings !== bindingsRef.current) {
      persist(nextBindings);
    } else {
      bindingsRef.current = nextBindings;
      setBindings(nextBindings);
    }
    stopListening();
  }, [persist, stopListening]);
  const createProfile = useCallback((name: string) => {
    const profile = createMidiControllerProfile(name);
    const document = {
      ...profileDocumentRef.current,
      activeProfileId: profile.id,
      profiles: [...profileDocumentRef.current.profiles, profile],
    };
    profileDocumentRef.current = document;
    setProfileDocument(document);
    setActiveProfileId(profile.id);
    activeProfileIdRef.current = profile.id;
    bindingsRef.current = {};
    setBindings({});
    stopListening();
  }, [stopListening]);
  const renameProfile = useCallback((profileId: string, name: string) => {
    const document = {
      ...profileDocumentRef.current,
      profiles: profileDocumentRef.current.profiles.map((profile) =>
        profile.id === profileId ? { ...profile, name: name.trim() } : profile),
    };
    profileDocumentRef.current = document;
    setProfileDocument(document);
  }, []);
  const deleteProfile = useCallback((profileId: string) => {
    const remaining = profileDocumentRef.current.profiles.filter((profile) => profile.id !== profileId);
    if (remaining.length === 0) return;
    const activeId = activeProfileIdRef.current === profileId ? remaining[0].id : activeProfileIdRef.current;
    const document = { ...profileDocumentRef.current, profiles: remaining, activeProfileId: activeId };
    profileDocumentRef.current = document;
    setProfileDocument(document);
    if (activeProfileIdRef.current === profileId) {
      activeProfileIdRef.current = activeId;
      setActiveProfileId(activeId);
      const nextBindings = readStoredBindings(remaining[0].editBindings);
      bindingsRef.current = nextBindings;
      setBindings(nextBindings);
    }
    stopListening();
  }, [stopListening]);

  useEffect(() => {
    if (isProfileLoading || !profileUserId || profileDocument.profiles.length === 0) return;
    const timeout = window.setTimeout(() => {
      setIsProfileSaving(true);
      void supabase.from("user_control_preferences").upsert({
        user_id: profileUserId,
        settings: legacySettingsRef.current,
        midi_profiles: profileDocument,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }).then(({ error }) => {
        if (error) {
          console.error("Could not save MIDI profiles.", error);
          setAccessError(`Could not save MIDI profiles: ${error.message}`);
        } else {
          setAccessError(null);
        }
        setIsProfileSaving(false);
      }, (error: unknown) => {
        console.error("Could not save MIDI profiles.", error);
        setAccessError(error instanceof Error ? error.message : "Could not save MIDI profiles.");
        setIsProfileSaving(false);
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [isProfileLoading, profileDocument, profileUserId, supabase]);

  return {
    isSupported, isConnected, activeDeviceName, devices, learningActionId, bindings,
    latestMessage, recentMessages, accessError, startListening, stopListening, clearBinding,
    resetAllBindings, applyMcuPreset, setBeatNoteCount, profileDocument, activeProfileId, isProfileLoading, isProfileSaving,
    selectProfile, createProfile, renameProfile, deleteProfile, pairDevice, scanMidiDevices,
    sendFeedbackScene, outputRevision,
    setBindingMode: (id: MidiActionId, mode: MidiBindingMode, index = 0) => updateBinding(id, { mode }, index),
    setBindingChannel: (id: MidiActionId, channel: number, index = 0) => updateBinding(id, { channel }, index),
    setRelativeEncoding: (id: MidiActionId, relativeEncoding: MidiRelativeEncoding, index = 0) => updateBinding(id, { relativeEncoding }, index),
  };
}