"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../../../utils/supabase/client";
import {
  createMidiControllerProfile,
  EMPTY_MIDI_PROFILES,
  parseMidiProfiles,
  type MidiProfilesDocument,
} from "../../../setlists/[id]/live/hooks/midiProfiles";

export type MidiActionId =
  | "PLAY_PAUSE" | "STOP_RETURN" | "LOOP_ACTIVE_SECTION"
  | "JOG_SCRUB" | "NUDGE_MEASURE_PREV" | "NUDGE_MEASURE_NEXT" | "SELECT_SECTION_AT_PLAYHEAD"
  | "PREV_SECTION" | "NEXT_SECTION" | "PREV_LINE" | "NEXT_LINE"
  | "ADJUST_SECTION_MEASURES" | "ADJUST_SECTION_BEATS" | "ADJUST_SECTION_REPEATS"
  | "ADJUST_LINE_MEASURES" | "TAP_TO_SPLIT_LINE"
  | "ADJUST_YOUTUBE_OFFSET" | "ADJUST_TEMPO_BPM"
  | "BACKING_TRACK_VOLUME" | "CLICK_VOLUME" | "CLICK_MUTE_TOGGLE" | "TIMELINE_ZOOM"
  | "SAVE_STRUCTURE" | "UNDO_CHANGES" | "DELETE_ACTIVE_SECTION" | "OPEN_ADD_SECTION"
  | "MODAL_INSERT_BEFORE" | "MODAL_INSERT_AFTER" | "MODAL_CANCEL"
  | "MODAL_ADD_NEW_OR_CYCLE" | "MODAL_CONFIRM";

export type MidiBindingMode = "trigger" | "absolute" | "relative_cw";
export type MidiInputType = "note" | "cc";
export type MidiRelativeEncoding = "two_complement" | "sign_magnitude" | "m_vave_cw";

export interface MidiBinding {
  actionId: MidiActionId;
  type: MidiInputType;
  channel: number;
  noteOrCcNumber: number;
  mode: MidiBindingMode;
  relativeEncoding?: MidiRelativeEncoding;
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
  { id: "ADJUST_LINE_MEASURES", group: "Timing Adjustments", label: "Line Measures", description: "Adjust the focused lyric line by one measure per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "TAP_TO_SPLIT_LINE", group: "Timing Adjustments", label: "Tap Line Partition", description: "Drop a line partition at the current playhead beat.", modes: ["trigger"] },
  { id: "ADJUST_YOUTUBE_OFFSET", group: "Sync & Tempo", label: "YouTube Offset", description: "Adjust YouTube offset by 25 ms per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "ADJUST_TEMPO_BPM", group: "Sync & Tempo", label: "Tempo", description: "Adjust tempo by one BPM per increment.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "BACKING_TRACK_VOLUME", group: "Audio/Canvas", label: "Backing Track Volume", description: "Set YouTube volume from 0 to 100%.", modes: ["absolute", "trigger"] },
  { id: "CLICK_VOLUME", group: "Audio/Canvas", label: "Click Volume", description: "Set click volume from 0 to 100%.", modes: ["absolute", "trigger"] },
  { id: "CLICK_MUTE_TOGGLE", group: "Audio/Canvas", label: "Click Mute", description: "Toggle metronome mute.", modes: ["trigger"] },
  { id: "TIMELINE_ZOOM", group: "Audio/Canvas", label: "Timeline Zoom", description: "Set scale from 0.1 to 200 pixels per beat.", modes: ["relative_cw", "absolute", "trigger"] },
  { id: "SAVE_STRUCTURE", group: "Structure", label: "Save Structure", description: "Persist the current structure and timing.", modes: ["trigger"] },
  { id: "UNDO_CHANGES", group: "Structure", label: "Undo", description: "Revert the latest timeline change.", modes: ["trigger"] },
  { id: "DELETE_ACTIVE_SECTION", group: "Structure", label: "Delete Active Section", description: "Remove the focused arrangement section.", modes: ["trigger"] },
  { id: "OPEN_ADD_SECTION", group: "Structure", label: "Open Section Insertion", description: "Open the section placement flow at the playhead.", modes: ["trigger"] },
  { id: "MODAL_INSERT_BEFORE", group: "Modal Navigation", label: "Modal: Insert Before", description: "Place the pending section before the anchor.", modes: ["trigger"] },
  { id: "MODAL_INSERT_AFTER", group: "Modal Navigation", label: "Modal: Insert After", description: "Place the pending section after the anchor.", modes: ["trigger"] },
  { id: "MODAL_CANCEL", group: "Modal Navigation", label: "Modal: Cancel / Dismiss", description: "Cancel the active section dialog.", modes: ["trigger"] },
  { id: "MODAL_ADD_NEW_OR_CYCLE", group: "Modal Navigation", label: "Modal: Add New / Cycle Catalog", description: "Open the section catalog or cycle its selection.", modes: ["trigger"] },
  { id: "MODAL_CONFIRM", group: "Modal Navigation", label: "Modal: Confirm Selection", description: "Confirm the selected section in the catalog.", modes: ["trigger"] },
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
        (binding.type !== "note" && binding.type !== "cc") ||
        !Number.isInteger(binding.channel) ||
        (binding.channel !== -1 && (binding.channel! < 0 || binding.channel! > 15)) ||
        !Number.isInteger(binding.noteOrCcNumber) ||
        binding.noteOrCcNumber! < 0 || binding.noteOrCcNumber! > 127 ||
        !isMode(binding.mode)
      ) return [];
      return [[key, {
        actionId: key,
        type: binding.type,
        channel: binding.channel!,
        noteOrCcNumber: binding.noteOrCcNumber!,
        mode: binding.mode,
        relativeEncoding: binding.relativeEncoding === "sign_magnitude" || binding.relativeEncoding === "m_vave_cw"
          ? binding.relativeEncoding
          : "two_complement",
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
    if (binding?.mode === "relative_cw" && binding.relativeEncoding === "two_complement") {
      changed = true;
      return [actionId, { ...binding, relativeEncoding: "m_vave_cw" }];
    }
    return [actionId, binding];
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
      const number = data[1];
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const type: MidiInputType | "other" =
        command === 0x80 || command === 0x90 ? "note" :
          command === 0xb0 ? "cc" : "other";
      if (type !== "other" && data.length < 3) return;
      const value = data[2] ?? 0;
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
        const binding: MidiBinding = {
          actionId,
          type,
          channel,
          noteOrCcNumber: number,
          mode: type === "note" ? "trigger" : learnModeRef.current,
          relativeEncoding: "m_vave_cw",
        };
        persist({ ...bindingsRef.current, [actionId]: binding });
        learningActionIdRef.current = null;
        setLearningActionId(null);
        return;
      }
      if (setupOpenRef.current) return;

      for (const binding of Object.values(bindingsRef.current)) {
        if (!binding || binding.type !== type || binding.noteOrCcNumber !== number ||
          (binding.channel !== -1 && binding.channel !== channel)) continue;
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
          if (binding.relativeEncoding === "m_vave_cw") {
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

  const startListening = useCallback((actionId: MidiActionId, mode: MidiBindingMode) => {
    learnModeRef.current = mode;
    learningActionIdRef.current = actionId;
    setLearningActionId(actionId);
  }, []);
  const stopListening = useCallback(() => {
    learningActionIdRef.current = null;
    setLearningActionId(null);
  }, []);
  const clearBinding = useCallback((actionId: MidiActionId) => {
    const next = { ...bindingsRef.current };
    delete next[actionId];
    persist(next);
  }, [persist]);
  const updateBinding = useCallback((
    actionId: MidiActionId,
    update: Partial<Pick<MidiBinding, "mode" | "channel" | "relativeEncoding">>,
  ) => {
    const binding = bindingsRef.current[actionId];
    if (binding) persist({ ...bindingsRef.current, [actionId]: { ...binding, ...update } });
  }, [persist]);
  const resetAllBindings = useCallback(() => persist({}), [persist]);
  const scanMidiDevices = useCallback(() => rescanRef.current(), []);
  const sendRawMidiFeedback = useCallback((
    type: MidiInputType,
    number: number,
    value: number,
    channel = 0,
  ) => {
    const status = (type === "note" ? 0x90 : 0xb0) | (channel & 0x0f);
    for (const output of outputsRef.current) {
      if (output.state !== "connected") continue;
      try {
        output.send([status, number & 0x7f, Math.max(0, Math.min(127, Math.round(value)))]);
      } catch (error) {
        console.error(`Could not send MIDI feedback to ${output.name || "MIDI output"}.`, error);
      }
    }
  }, []);
  const sendMidiFeedback = useCallback((actionId: MidiActionId, state: boolean) => {
    const binding = bindingsRef.current[actionId];
    if (!binding) return;
    sendRawMidiFeedback(binding.type, binding.noteOrCcNumber, state ? 127 : 0, binding.channel < 0 ? 0 : binding.channel);
  }, [sendRawMidiFeedback]);
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
    resetAllBindings, profileDocument, activeProfileId, isProfileLoading, isProfileSaving,
    selectProfile, createProfile, renameProfile, deleteProfile, pairDevice, scanMidiDevices,
    sendMidiFeedback, sendRawMidiFeedback,
    setBindingMode: (id: MidiActionId, mode: MidiBindingMode) => updateBinding(id, { mode }),
    setBindingChannel: (id: MidiActionId, channel: number) => updateBinding(id, { channel }),
    setRelativeEncoding: (id: MidiActionId, relativeEncoding: MidiRelativeEncoding) => updateBinding(id, { relativeEncoding }),
  };
}