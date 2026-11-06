import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../../../../utils/supabase/client";

export type ControlActionId =
  | "playStop"
  | "previousSong"
  | "nextSong"
  | "previousSection"
  | "nextSection"
  | "previousLine"
  | "nextLine"
  | "viewMode"
  | "chordNotation"
  | "chordFormat"
  | "lineSpacing"
  | "lyricsSize"
  | "youtubeSync"
  | "clickMute"
  | "clickSolo"
  | "guideMute"
  | "guideSolo"
  | "youtubeMute"
  | "youtubeSolo"
  | "mdTakeover"
  | "clickVolume"
  | "guideVolume"
  | "youtubeVolume";

export type ControlCategory = "Playback" | "Audio" | "Display";
export type MidiMessageType = "note" | "cc";

export interface MidiControlMapping {
  deviceId: string;
  deviceName: string;
  messageType: MidiMessageType;
  channel: number;
  number: number;
}

export interface UserControlPreferences {
  version: 1;
  pairedDeviceId: string | null;
  pairedDeviceName: string | null;
  mappings: Partial<Record<ControlActionId, MidiControlMapping>>;
}

export interface MidiDeviceOption {
  id: string;
  name: string;
  state: string;
}

export interface ControlActionDefinition {
  id: ControlActionId;
  label: string;
  category: ControlCategory;
  shortcut: string;
  isFader?: boolean;
}

export const CONTROL_ACTIONS: ControlActionDefinition[] = [
  { id: "playStop", label: "Play / Stop", category: "Playback", shortcut: "Space" },
  { id: "previousSong", label: "Previous Song", category: "Playback", shortcut: ", / <", },
  { id: "nextSong", label: "Next Song", category: "Playback", shortcut: ". / >", },
  { id: "previousSection", label: "Previous Section", category: "Playback", shortcut: "; / :" },
  { id: "nextSection", label: "Next Section", category: "Playback", shortcut: "' / \"" },
  { id: "previousLine", label: "Previous Line", category: "Playback", shortcut: "[ / {" },
  { id: "nextLine", label: "Next Line", category: "Playback", shortcut: "] / }" },
  { id: "mdTakeover", label: "MD Takeover", category: "Playback", shortcut: "D" },
  { id: "clickMute", label: "Click Mute", category: "Audio", shortcut: "1" },
  { id: "clickSolo", label: "Click Solo", category: "Audio", shortcut: "Shift + 1" },
  { id: "guideMute", label: "Guide Mute", category: "Audio", shortcut: "2" },
  { id: "guideSolo", label: "Guide Solo", category: "Audio", shortcut: "Shift + 2" },
  { id: "youtubeMute", label: "YouTube Mute", category: "Audio", shortcut: "3" },
  { id: "youtubeSolo", label: "YouTube Solo", category: "Audio", shortcut: "Shift + 3" },
  { id: "youtubeSync", label: "YouTube Sync", category: "Audio", shortcut: "Y" },
  { id: "clickVolume", label: "Click Level", category: "Audio", shortcut: "MIDI fader", isFader: true },
  { id: "guideVolume", label: "Guide Level", category: "Audio", shortcut: "MIDI fader", isFader: true },
  { id: "youtubeVolume", label: "YouTube Level", category: "Audio", shortcut: "MIDI fader", isFader: true },
  { id: "viewMode", label: "View Mode", category: "Display", shortcut: "V" },
  { id: "chordNotation", label: "Chord Notation", category: "Display", shortcut: "C" },
  { id: "chordFormat", label: "Chord Format", category: "Display", shortcut: "F" },
  { id: "lineSpacing", label: "Line Spacing", category: "Display", shortcut: "S" },
  { id: "lyricsSize", label: "Lyrics Size", category: "Display", shortcut: "A" },
];

export const EMPTY_CONTROL_PREFERENCES: UserControlPreferences = {
  version: 1,
  pairedDeviceId: null,
  pairedDeviceName: null,
  mappings: {},
};

interface MidiInputLike {
  id: string;
  name?: string | null;
  state: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
}

interface MidiAccessLike {
  inputs: {
    values: () => IterableIterator<MidiInputLike>;
    forEach: (callback: (input: MidiInputLike) => void) => void;
  };
  onstatechange: (() => void) | null;
}

export type ControlActions = Partial<Record<ControlActionId, (value?: number) => void>>;

function isControlActionId(value: string): value is ControlActionId {
  return CONTROL_ACTIONS.some((action) => action.id === value);
}

function parseStoredPreferences(value: unknown): UserControlPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_CONTROL_PREFERENCES;
  const record = value as Record<string, unknown>;
  const rawMappings = record.mappings && typeof record.mappings === "object" && !Array.isArray(record.mappings)
    ? record.mappings as Record<string, unknown>
    : {};
  const mappings: UserControlPreferences["mappings"] = {};

  for (const [actionId, rawMapping] of Object.entries(rawMappings)) {
    if (!isControlActionId(actionId) || !rawMapping || typeof rawMapping !== "object") continue;
    const mapping = rawMapping as Record<string, unknown>;
    if (
      typeof mapping.deviceId !== "string" ||
      typeof mapping.deviceName !== "string" ||
      (mapping.messageType !== "note" && mapping.messageType !== "cc") ||
      typeof mapping.channel !== "number" ||
      !Number.isInteger(mapping.channel) ||
      mapping.channel < 0 ||
      mapping.channel > 15 ||
      typeof mapping.number !== "number" ||
      !Number.isInteger(mapping.number) ||
      mapping.number < 0 ||
      mapping.number > 127
    ) continue;
    mappings[actionId] = {
      deviceId: mapping.deviceId,
      deviceName: mapping.deviceName,
      messageType: mapping.messageType,
      channel: mapping.channel,
      number: mapping.number,
    };
  }

  return {
    version: 1,
    pairedDeviceId: typeof record.pairedDeviceId === "string" ? record.pairedDeviceId : null,
    pairedDeviceName: typeof record.pairedDeviceName === "string" ? record.pairedDeviceName : null,
    mappings,
  };
}

function keyboardActionForEvent(event: KeyboardEvent): ControlActionId | null {
  if (event.code === "Space" && !event.shiftKey) return "playStop";
  if (event.shiftKey && event.code === "Digit1") return "clickSolo";
  if (event.shiftKey && event.code === "Digit2") return "guideSolo";
  if (event.shiftKey && event.code === "Digit3") return "youtubeSolo";
  if (
    event.shiftKey &&
    !["Comma", "Period", "Semicolon", "Quote", "BracketLeft", "BracketRight"].includes(event.code)
  ) return null;

  const keys: Record<string, ControlActionId> = {
    Comma: "previousSong",
    Period: "nextSong",
    Semicolon: "previousSection",
    Quote: "nextSection",
    BracketLeft: "previousLine",
    BracketRight: "nextLine",
    KeyV: "viewMode",
    KeyC: "chordNotation",
    KeyF: "chordFormat",
    KeyS: "lineSpacing",
    KeyA: "lyricsSize",
    KeyY: "youtubeSync",
    Digit1: "clickMute",
    Digit2: "guideMute",
    Digit3: "youtubeMute",
    KeyD: "mdTakeover",
  };
  return keys[event.code] ?? null;
}

export function useKeyboardMidiControls(supabase: ReturnType<typeof createClient>, actions: ControlActions) {
  const [preferences, setPreferences] = useState(EMPTY_CONTROL_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MidiDeviceOption[]>([]);
  const [isMidiSupported, setIsMidiSupported] = useState(true);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [learningAction, setLearningAction] = useState<ControlActionId | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const actionsRef = useRef(actions);
  const preferencesRef = useRef(preferences);
  const accessRef = useRef<MidiAccessLike | null>(null);
  const learningActionRef = useRef<ControlActionId | null>(null);
  const pressedMidiInputsRef = useRef(new Set<string>());
  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    actionsRef.current = actions;
    preferencesRef.current = preferences;
    learningActionRef.current = learningAction;
  }, [actions, learningAction, preferences]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        setPreferenceError(authError?.message || "Sign in to save MIDI preferences to your account.");
        setIsLoading(false);
        return;
      }

      const authenticatedUserId = authData.user.id;
      const { data, error } = await supabase
        .from("user_control_preferences")
        .select("settings")
        .eq("user_id", authenticatedUserId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setPreferenceError(`Could not load controller preferences: ${error.message}`);
        setIsLoading(false);
        return;
      }
      const settings = parseStoredPreferences(data?.settings);
      setPreferences(settings);
      preferencesRef.current = settings;
      loadedUserIdRef.current = authenticatedUserId;
      setUserId(authenticatedUserId);
      setIsLoading(false);
    })();

    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (isLoading || !userId || loadedUserIdRef.current !== userId) return;
    const timeout = window.setTimeout(() => {
      setIsSaving(true);
      void supabase
        .from("user_control_preferences")
        .upsert({
          user_id: userId,
          settings: preferences,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        .then(({ error }) => {
          if (error) setPreferenceError(`Could not save controller preferences: ${error.message}`);
          else setPreferenceError(null);
          setIsSaving(false);
        }, (error: unknown) => {
          setPreferenceError(`Could not save controller preferences: ${error instanceof Error ? error.message : String(error)}`);
          setIsSaving(false);
        })
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [isLoading, preferences, supabase, userId]);

  const refreshDevices = useCallback((access: MidiAccessLike) => {
    setDevices(Array.from(access.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name?.trim() || "MIDI device",
      state: input.state,
    })));
  }, []);

  const scanMidiDevices = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const midiNavigator = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MidiAccessLike>;
    };
    if (!midiNavigator.requestMIDIAccess) {
      setIsMidiSupported(false);
      setMidiError("Web MIDI is not supported in this browser. Try a supported desktop browser over HTTPS.");
      return;
    }

    try {
      const access = await midiNavigator.requestMIDIAccess() as unknown as MidiAccessLike;
      accessRef.current = access;
      setIsMidiSupported(true);
      setMidiError(null);
      refreshDevices(access);
      access.onstatechange = () => refreshDevices(access);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : "MIDI access was denied.");
    }
  }, [refreshDevices]);

  useEffect(() => {
    const access = accessRef.current;
    if (!access) return;
    const previousHandlers = new Map<MidiInputLike, MidiInputLike["onmidimessage"]>();

    access.inputs.forEach((input) => {
      previousHandlers.set(input, input.onmidimessage);
      input.onmidimessage = (event) => {
        const [status, number, velocity = 0] = event.data;
        if (status === undefined || number === undefined) return;
        const command = status & 0xf0;
        const channel = status & 0x0f;
        const messageType = command === 0xb0
          ? "cc"
          : command === 0x90 || command === 0x80
            ? "note"
            : null;
        if (!messageType) return;

        const actionToLearn = learningActionRef.current;
        if (actionToLearn) {
          if (input.id !== preferencesRef.current.pairedDeviceId) return;
          if (messageType === "note" && (command === 0x80 || velocity === 0)) return;
          const definition = CONTROL_ACTIONS.find((action) => action.id === actionToLearn);
          if (definition?.isFader && messageType !== "cc") {
            setMidiError("Fader actions require a MIDI Control Change (CC) message.");
            return;
          }
          setPreferences((current) => ({
            ...current,
            mappings: {
              ...current.mappings,
              [actionToLearn]: {
                deviceId: input.id,
                deviceName: input.name?.trim() || "MIDI device",
                messageType,
                channel,
                number,
              },
            },
          }));
          setLearningAction(null);
          return;
        }

        const currentPreferences = preferencesRef.current;
        if (input.id !== currentPreferences.pairedDeviceId) return;
        const mapping = Object.entries(currentPreferences.mappings).find(([, candidate]) =>
          candidate?.deviceId === input.id &&
          candidate.messageType === messageType &&
          candidate.channel === channel &&
          candidate.number === number
        );
        if (!mapping) return;

        const actionId = mapping[0] as ControlActionId;
        if (messageType === "note") {
          const isPressed = command === 0x90 && velocity > 0;
          const pressKey = `${input.id}:${channel}:${messageType}:${number}`;
          if (!isPressed) {
            pressedMidiInputsRef.current.delete(pressKey);
            return;
          }
          if (pressedMidiInputsRef.current.has(pressKey)) return;
          pressedMidiInputsRef.current.add(pressKey);
          actionsRef.current[actionId]?.();
        } else if (actionId === "clickVolume" || actionId === "guideVolume" || actionId === "youtubeVolume") {
          actionsRef.current[actionId]?.(velocity / 127);
        } else {
          const pressKey = `${input.id}:${channel}:${messageType}:${number}`;
          const isPressed = velocity >= 64;
          if (!isPressed) {
            pressedMidiInputsRef.current.delete(pressKey);
            return;
          }
          if (pressedMidiInputsRef.current.has(pressKey)) return;
          pressedMidiInputsRef.current.add(pressKey);
          actionsRef.current[actionId]?.();
        }
      };
    });

    return () => {
      previousHandlers.forEach((handler, input) => {
        input.onmidimessage = handler;
      });
    };
  }, [devices, preferences, learningAction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const isEditable = target.isContentEditable ||
          target.closest("input, textarea, select, button, [role='button'], [role='switch'], [contenteditable='true'], [role='textbox'], [data-shortcuts-disabled='true']");
        if (isEditable) return;
      }

      const actionId = keyboardActionForEvent(event);
      if (!actionId || !actionsRef.current[actionId]) return;
      event.preventDefault();
      actionsRef.current[actionId]?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pairDevice = useCallback((deviceId: string) => {
    const selected = devices.find((device) => device.id === deviceId);
    setPreferences((current) => ({
      ...current,
      pairedDeviceId: selected?.id ?? null,
      pairedDeviceName: selected?.name ?? null,
    }));
    setLearningAction(null);
  }, [devices]);

  const learnMidiAction = useCallback((actionId: ControlActionId) => {
    if (!preferencesRef.current.pairedDeviceId) {
      setMidiError("Scan and pair a MIDI controller before learning controls.");
      return;
    }
    setMidiError(null);
    setLearningAction(actionId);
  }, []);

  const clearMidiMapping = useCallback((actionId: ControlActionId) => {
    setPreferences((current) => {
      const mappings = { ...current.mappings };
      delete mappings[actionId];
      return { ...current, mappings };
    });
    setLearningAction(null);
  }, []);

  const clearAllMidiMappings = useCallback(() => {
    setPreferences((current) => ({ ...current, mappings: {} }));
    setLearningAction(null);
  }, []);

  return {
    preferences,
    isLoading,
    isSaving,
    preferenceError,
    devices,
    isMidiSupported,
    midiError,
    learningAction,
    scanMidiDevices,
    pairDevice,
    learnMidiAction,
    clearMidiMapping,
    clearAllMidiMappings,
    cancelMidiLearn: () => setLearningAction(null),
  };
}
