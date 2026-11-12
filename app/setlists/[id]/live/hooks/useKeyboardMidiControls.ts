import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../../../../utils/supabase/client";
import { decodeMcuVpot, parsePitchBend, createMcuBeatControls } from "../../../../songs/[id]/edit/mcuProtocol";
import { buildFeedbackScene, createBeatControls, getConfiguredBeatControls, getMidiOutputs, parseBeatLightSettings, syncFeedbackOutputs, type FeedbackScene } from "../../../../songs/[id]/edit/midiFeedback";
import { isMidiActionAllowedInEq, matchesPairedMidiMapping, shouldTriggerMidiButton } from "./midiInput";
import { clearEqualizerOutputs, clearQueuedMidiOutputs } from "./equalizer";
import { useLightShow, type LightShowPlayback } from "./useLightShow";
import { useControlFeedback } from "./useControlFeedback";
import { feedbackKey } from "../../../../songs/[id]/edit/midiFeedback";
import {
  createMidiControllerProfile,
  EMPTY_MIDI_PROFILES,
  parseMidiProfiles,
  getPageProfileId,
  selectPageProfile,
  removePageProfileSelections,
  readLocalPageProfile,
  saveLocalPageProfile,
  type MidiProfilePage,
  type MidiProfilesDocument,
} from "./midiProfiles";

export type ControlActionId =
  | "playStop"
  | "stopAndReturn"
  | "toggleEqMode"
  | "cycleLightShowPreset"
  | "transpose" | "resetTranspose" | "timelineZoom" | "clickSound"
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
  | "clickSpeed" | "clickPattern" | "jogScrub" | "clickOffset"
  | "guideVolume"
  | "youtubeVolume" | "beatLightFirst";

export type ControlCategory = "Playback" | "Audio" | "Display" | "Visuals / Hardware";
export type MidiMessageType = "note" | "cc" | "pitchbend";

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
  beatLights?: { firstNote: number; channel: number; count: number };
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
  { id: "stopAndReturn", label: "Stop and Return to 0:00", category: "Playback", shortcut: "MIDI learn" },
  { id: "toggleEqMode", label: "EQ / Light Show Mode", category: "Visuals / Hardware", shortcut: "MIDI learn" },
  { id: "cycleLightShowPreset", label: "Select Light Show Preset", category: "Visuals / Hardware", shortcut: "MCU encoder" },
  { id: "transpose", label: "Transpose", category: "Playback", shortcut: "MCU encoder" },
  { id: "resetTranspose", label: "Reset Transpose", category: "Playback", shortcut: "MIDI learn" },
  { id: "timelineZoom", label: "Timeline Zoom", category: "Display", shortcut: "MCU encoder" },
  { id: "clickSound", label: "Click Sound", category: "Audio", shortcut: "MCU encoder" },
  { id: "previousSong", label: "Previous Song", category: "Playback", shortcut: ", / <", },
  { id: "nextSong", label: "Next Song", category: "Playback", shortcut: ". / >", },
  { id: "previousSection", label: "Previous Section", category: "Playback", shortcut: "; / :" },
  { id: "nextSection", label: "Next Section", category: "Playback", shortcut: "' / \"" },
  { id: "previousLine", label: "Previous Line", category: "Playback", shortcut: "[ / {" },
  { id: "nextLine", label: "Next Line", category: "Playback", shortcut: "] / }" },
  { id: "mdTakeover", label: "MD Takeover", category: "Playback", shortcut: "D" },
  { id: "clickMute", label: "Click Mute", category: "Audio", shortcut: "1" },
  { id: "clickSpeed", label: "Click Speed", category: "Audio", shortcut: "MIDI learn" },
  { id: "clickPattern", label: "Click Pattern", category: "Audio", shortcut: "MIDI learn" },
  { id: "jogScrub", label: "Jog Scrub", category: "Playback", shortcut: "MCU encoder" },
  { id: "clickOffset", label: "Local Click Offset (10 ms)", category: "Playback", shortcut: "MCU encoder" },
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
  outputs: MIDIOutputMap;
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
      (mapping.messageType !== "note" && mapping.messageType !== "cc" && mapping.messageType !== "pitchbend") ||
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

  const beatLights = parseBeatLightSettings(record.beatLights);
  return {
    version: 1,
    pairedDeviceId: typeof record.pairedDeviceId === "string" ? record.pairedDeviceId : null,
    pairedDeviceName: typeof record.pairedDeviceName === "string" ? record.pairedDeviceName : null,
    mappings,
    ...(beatLights ? { beatLights } : {}),
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

export function useKeyboardMidiControls(supabase: ReturnType<typeof createClient>, actions: ControlActions, beat: number | null = null, page: Extract<MidiProfilePage, "live" | "solo"> = "live", playback: LightShowPlayback = { isPlaying: false, beat: 0, tempo: 75, quarterBeatsPerMeasure: 4, unitQuarterBeats: 1 }) {
  const [preferences, setPreferences] = useState(EMPTY_CONTROL_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MidiDeviceOption[]>([]);
  const [outputNames, setOutputNames] = useState<string[]>([]);
  const [isMidiSupported, setIsMidiSupported] = useState(true);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [lastMidiMessage, setLastMidiMessage] = useState<string | null>(null);
  const [learningAction, setLearningAction] = useState<ControlActionId | null>(null);
  const [beatNoteCount, setBeatNoteCountState] = useState(8);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileDocument, setProfileDocument] = useState<MidiProfilesDocument>(EMPTY_MIDI_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isEqModeActive, setIsEqModeActive] = useState(false);
  const eqModeRef = useRef(false);
  const eqSceneRef = useRef<FeedbackScene>(new Map());
  const previousEqModeRef = useRef(false);

  const actionsRef = useRef(actions);
  const preferencesRef = useRef(preferences);
  const accessRef = useRef<MidiAccessLike | null>(null);
  const learningActionRef = useRef<ControlActionId | null>(null);
  const pressedMidiInputsRef = useRef(new Set<string>());
  const loadedUserIdRef = useRef<string | null>(null);
  const profileDocumentRef = useRef(profileDocument);
  const activeProfileIdRef = useRef(activeProfileId);
  const setupOpenRef = useRef(isSetupOpen);
  const feedbackRef = useRef<Map<MIDIOutput, FeedbackScene>>(new Map());
  const [outputRevision, setOutputRevision] = useState(0);
  const portSnapshotRef = useRef("");
  const monitorTimeRef = useRef(0);
  const eqRetryAfterRef = useRef(0);

  const sendEqFrame = useCallback((frame: FeedbackScene) => {
    eqSceneRef.current = frame;
    const access = accessRef.current;
    if (!access || !eqModeRef.current || performance.now() < eqRetryAfterRef.current) return;
    const scene = new Map(frame);
    const toggle = preferencesRef.current.mappings.toggleEqMode;
    if (toggle?.messageType === "note" && (toggle.channel !== 0 || toggle.number > 31)) {
      const control = { type: "note" as const, channel: toggle.channel, noteOrCcNumber: toggle.number };
      scene.set(feedbackKey(control), { control, active: true });
    }
    const errors = syncFeedbackOutputs(getMidiOutputs(access, preferencesRef.current.pairedDeviceName), scene, feedbackRef.current);
    if (errors.length) {
      eqRetryAfterRef.current = performance.now() + 1000;
      console.error("Could not send EQ MIDI feedback.", errors);
      setMidiError("Could not send EQ MIDI feedback to one or more outputs.");
    }
  }, []);
  const lightShow = useLightShow(isEqModeActive, playback, sendEqFrame);
  const shuffleLightShow = lightShow.shuffle;
  const selectLightShow = lightShow.selectPreset;
  const lightShowFeedback = useControlFeedback();
  const showLightShowFeedback = lightShowFeedback.show;

  const toggleEq = useCallback(() => {
    const next = !eqModeRef.current;
    eqModeRef.current = next;
    if (!next && accessRef.current) {
      const outputs = getMidiOutputs(accessRef.current, preferencesRef.current.pairedDeviceName);
      const errors = [...clearQueuedMidiOutputs(outputs), ...clearEqualizerOutputs(outputs)];
      if (errors.length) {
        console.error("Could not clear light-show MIDI output.", errors);
        setMidiError("Could not clear light-show MIDI output.");
      }
    }
    setIsEqModeActive(next);
  }, []);

  useEffect(() => {
    actionsRef.current = actions;
    preferencesRef.current = preferences;
    learningActionRef.current = learningAction;
    profileDocumentRef.current = profileDocument;
    activeProfileIdRef.current = activeProfileId;
    setupOpenRef.current = isSetupOpen;
  }, [actions, activeProfileId, isSetupOpen, learningAction, preferences, profileDocument]);

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
        .select("settings, midi_profiles")
        .eq("user_id", authenticatedUserId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setPreferenceError(`Could not load controller preferences: ${error.message}`);
        setIsLoading(false);
        return;
      }
      let document = parseMidiProfiles(data?.midi_profiles);
      if (document.profiles.length === 0) {
        const profile = createMidiControllerProfile("Default");
        const legacyPreferences = parseStoredPreferences(data?.settings);
        profile.liveSettings = legacyPreferences as unknown as Record<string, unknown>;
        profile.pairedDeviceId = legacyPreferences.pairedDeviceId;
        profile.pairedDeviceName = legacyPreferences.pairedDeviceName;
        document = { version: 1, activeProfileId: profile.id, profiles: [profile] };
      }
      const localId = readLocalPageProfile(authenticatedUserId, page);
      const activeProfile = document.profiles.find((profile) => profile.id === localId) ??
        document.profiles.find((profile) => profile.id === getPageProfileId(document, page)) ?? document.profiles[0];
      if (localId === activeProfile.id) document = selectPageProfile(document, page, activeProfile.id);
      const settings = parseStoredPreferences(
        Object.keys(activeProfile.liveSettings).length > 0 ? activeProfile.liveSettings : data?.settings,
      );
      settings.pairedDeviceId = activeProfile.pairedDeviceId;
      settings.pairedDeviceName = activeProfile.pairedDeviceName;
      setPreferences(settings);
      setBeatNoteCountState(settings.beatLights?.count ?? 8);
      preferencesRef.current = settings;
      setProfileDocument(document);
      profileDocumentRef.current = document;
      setActiveProfileId(activeProfile.id);
      activeProfileIdRef.current = activeProfile.id;
      loadedUserIdRef.current = authenticatedUserId;
      setUserId(authenticatedUserId);
      setIsLoading(false);
    })();

    return () => { active = false; };
  }, [supabase, page]);

  useEffect(() => {
    if (isLoading || !userId || loadedUserIdRef.current !== userId) return;
    const timeout = window.setTimeout(() => {
      setIsSaving(true);
      void supabase
        .from("user_control_preferences")
        .upsert({
          user_id: userId,
          settings: preferences,
          midi_profiles: profileDocument,
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
  }, [isLoading, preferences, profileDocument, supabase, userId]);

  useEffect(() => {
    if (isLoading || !userId || loadedUserIdRef.current !== userId || !activeProfileId) return;
    setProfileDocument((current) => {
      const updated = {
        ...current,
        profiles: current.profiles.map((profile) => profile.id === activeProfileId
          ? {
              ...profile,
              pairedDeviceId: preferences.pairedDeviceId,
              pairedDeviceName: preferences.pairedDeviceName,
              liveSettings: preferences as unknown as Record<string, unknown>,
            }
          : profile),
      };
      profileDocumentRef.current = updated;
      return updated;
    });
  }, [activeProfileId, isLoading, preferences, userId]);

  const refreshDevices = useCallback((access: MidiAccessLike) => {
    const inputs = Array.from(access.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name?.trim() || "MIDI device",
      state: input.state,
    }));
    const outputs = [...access.outputs.values()].filter((output) => output.state !== "disconnected");
    const snapshot = JSON.stringify([inputs, outputs.map((output) => [output.id, output.name, output.state])]);
    if (snapshot === portSnapshotRef.current) return;
    portSnapshotRef.current = snapshot;
    setDevices(inputs);
    setOutputNames(outputs.map((output) => output.name?.trim() || "Unnamed MIDI output"));
    setOutputRevision((revision) => revision + 1);
  }, []);

  const scanMidiDevices = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    if (accessRef.current) {
      refreshDevices(accessRef.current);
      return;
    }
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
    let active = true;
    queueMicrotask(() => { if (active) void scanMidiDevices(); });
    return () => { active = false; };
  }, [scanMidiDevices]);

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
        const messageType = command === 0xe0 ? "pitchbend" : command === 0xb0
          ? "cc"
          : command === 0x90 || command === 0x80
            ? "note"
            : null;
        if (!messageType) return;
        if (setupOpenRef.current && performance.now() - monitorTimeRef.current >= 100) {
          monitorTimeRef.current = performance.now();
          setLastMidiMessage(`${input.name?.trim() || "MIDI input"}: ${messageType.toUpperCase()} ${messageType === "pitchbend" ? channel : number}, value ${velocity}, channel ${channel + 1}`);
        }

        const actionToLearn = eqModeRef.current ? null : learningActionRef.current;
        if (actionToLearn) {
          if (input.id !== preferencesRef.current.pairedDeviceId) return;
          if (messageType === "note" && (command === 0x80 || velocity === 0)) return;
          if (actionToLearn === "beatLightFirst") {
            if (messageType !== "note") { setMidiError("Press a MIDI note button for the first beat light."); return; }
            if (!createBeatControls(number, channel, beatNoteCount).length) {
              setMidiError(`The ${beatNoteCount}-note range exceeds MIDI note 127.`);
              return;
            }
            setPreferences((current) => ({ ...current, beatLights: { firstNote: number, channel, count: beatNoteCount } }));
            setMidiError(null);
            learningActionRef.current = null;
            setLearningAction(null);
            return;
          }
          const definition = CONTROL_ACTIONS.find((action) => action.id === actionToLearn);
          if (definition?.isFader && messageType !== "cc" && messageType !== "pitchbend") {
            setMidiError("Fader actions require a MIDI CC or pitch-bend message.");
            return;
          }
          if (["jogScrub", "clickOffset", "cycleLightShowPreset", "transpose", "timelineZoom", "clickSound"].includes(actionToLearn) && messageType !== "cc") {
            setMidiError("This action requires an MCU encoder (CC).");
            return;
          }
          if (messageType === "pitchbend" && !definition?.isFader) {
            setMidiError("This action requires a button or encoder.");
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
                number: messageType === "pitchbend" ? channel : number,
              },
            },
          }));
          setLearningAction(null);
          return;
        }

        const currentPreferences = preferencesRef.current;
        if (input.id !== currentPreferences.pairedDeviceId) return;
        const mapping = Object.entries(currentPreferences.mappings).find(([actionId, candidate]) =>
          isMidiActionAllowedInEq(eqModeRef.current, actionId) &&
          candidate && matchesPairedMidiMapping(currentPreferences.pairedDeviceId, input.id, candidate,
            messageType, channel, messageType === "pitchbend" ? channel : number)
        );
        if (!mapping) {
          if ((messageType === "note" && (command === 0x80 || velocity === 0)) ||
              (messageType === "cc" && velocity < 64)) pressedMidiInputsRef.current.delete(`${input.id}:${channel}:${messageType}:${number}`);
          return;
        }

        const actionId = mapping[0] as ControlActionId;
        if (setupOpenRef.current && !(eqModeRef.current &&
          (actionId === "toggleEqMode" || actionId === "cycleLightShowPreset"))) return;
        if (actionId === "cycleLightShowPreset" && messageType !== "cc") return;
        if (messageType === "note") {
          const isPressed = command === 0x90 && velocity > 0;
          const pressKey = `${input.id}:${channel}:${messageType}:${number}`;
          if (!isPressed) {
            pressedMidiInputsRef.current.delete(pressKey);
            return;
          }
          if (!shouldTriggerMidiButton(actionId, isPressed, pressedMidiInputsRef.current.has(pressKey))) return;
          if (actionId === "toggleEqMode") {
            toggleEq();
            return;
          }
          pressedMidiInputsRef.current.add(pressKey);
          if (actionId === "cycleLightShowPreset") shuffleLightShow();
          else actionsRef.current[actionId]?.();
        } else if (actionId === "clickVolume" || actionId === "guideVolume" || actionId === "youtubeVolume") {
          const value = messageType === "pitchbend" ? parsePitchBend(event.data)?.value : velocity;
          if (value !== undefined) actionsRef.current[actionId]?.(value / 127);
        } else if (["jogScrub", "clickOffset", "cycleLightShowPreset", "transpose", "timelineZoom", "clickSound"].includes(actionId) && messageType === "cc") {
          const delta = decodeMcuVpot(velocity);
          if (delta) {
            if (actionId === "cycleLightShowPreset") {
              const name = selectLightShow(delta);
              if (name) showLightShowFeedback("Light show preset", name);
            }
            else actionsRef.current[actionId]?.(delta);
          }
        } else {
          const pressKey = `${input.id}:${channel}:${messageType}:${number}`;
          const isPressed = velocity >= 64;
          if (!isPressed) {
            pressedMidiInputsRef.current.delete(pressKey);
            return;
          }
          if (!shouldTriggerMidiButton(actionId, isPressed, pressedMidiInputsRef.current.has(pressKey))) return;
          if (actionId === "toggleEqMode") {
            toggleEq();
            return;
          }
          pressedMidiInputsRef.current.add(pressKey);
          if (actionId === "cycleLightShowPreset") shuffleLightShow();
          else actionsRef.current[actionId]?.();
        }
      };
    });

    return () => {
      previousHandlers.forEach((handler, input) => {
        input.onmidimessage = handler;
      });
    };
  }, [devices, preferences, learningAction, beatNoteCount, toggleEq, shuffleLightShow, selectLightShow, showLightShowFeedback]);

  useEffect(() => {
    const access = accessRef.current;
    const profile = profileDocument.profiles.find((item) => item.id === activeProfileId);
    const outputs = access ? getMidiOutputs(access, preferences.pairedDeviceName) : [];
    if (isEqModeActive) {
      previousEqModeRef.current = true;
      sendEqFrame(eqSceneRef.current);
      return;
    }
    const shortcuts = Object.entries(preferences.mappings).flatMap(([actionId, mapping]) => {
      if (!mapping || mapping.messageType === "pitchbend" || ["jogScrub", "clickOffset", "cycleLightShowPreset", "transpose", "timelineZoom", "clickSound"].includes(actionId) ||
        CONTROL_ACTIONS.find((action) => action.id === actionId)?.isFader) return [];
      return [{ control: { type: mapping.messageType, channel: mapping.channel, noteOrCcNumber: mapping.number }, active: !isSetupOpen && actionId !== "toggleEqMode" }];
    });
    const beatControls = preferences.beatLights
      ? createBeatControls(preferences.beatLights.firstNote, preferences.beatLights.channel, preferences.beatLights.count)
      : profile?.editProtocol === "mcu" ? createMcuBeatControls() :
      profile ? getConfiguredBeatControls(profile.editBindings, profile.editBeatNoteCount) : [];
    const matrixErrors = previousEqModeRef.current
      ? syncFeedbackOutputs([], new Map(), feedbackRef.current) : [];
    previousEqModeRef.current = false;
    eqSceneRef.current = new Map();
    const errors = [...matrixErrors, ...syncFeedbackOutputs(outputs, buildFeedbackScene(shortcuts, beatControls, beat), feedbackRef.current)];
    if (errors.length) {
      console.error("Could not send live MIDI light feedback.", errors);
      setMidiError("Could not send MIDI light feedback to one or more outputs.");
    }
  }, [preferences, profileDocument, activeProfileId, isSetupOpen, beat, outputRevision, isEqModeActive, sendEqFrame]);

  useEffect(() => () => {
    const outputs = [...feedbackRef.current.keys()];
    const errors = [
      ...(eqModeRef.current ? [...clearQueuedMidiOutputs(outputs), ...clearEqualizerOutputs(outputs)] : []),
      ...syncFeedbackOutputs([], new Map(), feedbackRef.current),
    ];
    if (errors.length) console.error("Could not clear live MIDI lights.", errors);
  }, []);

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
    learningActionRef.current = actionId;
    setLearningAction(actionId);
  }, []);

  const setBeatNoteCount = useCallback((count: number): string | null => {
    if (!Number.isInteger(count) || count < 4 || count > 128 || count % 4 !== 0) return "Enter a whole number from 4 to 128 divisible by 4.";
    const lights = preferencesRef.current.beatLights;
    if (lights && !createBeatControls(lights.firstNote, lights.channel, count).length) return "The selected range exceeds MIDI note 127.";
    setBeatNoteCountState(count);
    if (lights) setPreferences((current) => ({ ...current, beatLights: current.beatLights ? { ...current.beatLights, count } : undefined }));
    return null;
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

  const selectMidiProfile = useCallback((profileId: string) => {
    const profile = profileDocumentRef.current.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    if (userId) {
      try { saveLocalPageProfile(userId, page, profileId); }
      catch (error) { console.error("Could not save local MIDI profile selection.", error); setPreferenceError("Could not save the selected MIDI profile in this browser."); }
    }
    const nextDocument = selectPageProfile(profileDocumentRef.current, page, profileId);
    profileDocumentRef.current = nextDocument;
    setProfileDocument(nextDocument);
    setActiveProfileId(profileId);
    activeProfileIdRef.current = profileId;
    const nextPreferences = { ...parseStoredPreferences(profile.liveSettings), pairedDeviceId: profile.pairedDeviceId, pairedDeviceName: profile.pairedDeviceName };
    setBeatNoteCountState(nextPreferences.beatLights?.count ?? 8);
    setPreferences(nextPreferences);
    preferencesRef.current = nextPreferences;
    setLearningAction(null);
  }, [page, userId]);

  const createMidiProfile = useCallback((name: string) => {
    const profile = createMidiControllerProfile(name);
    if (userId) {
      try { saveLocalPageProfile(userId, page, profile.id); }
      catch (error) { console.error("Could not save local MIDI profile selection.", error); setPreferenceError("Could not save the selected MIDI profile in this browser."); }
    }
    profile.liveSettings = EMPTY_CONTROL_PREFERENCES as unknown as Record<string, unknown>;
    const nextDocument = selectPageProfile({
      ...profileDocumentRef.current,
      profiles: [...profileDocumentRef.current.profiles, profile],
    }, page, profile.id);
    profileDocumentRef.current = nextDocument;
    setProfileDocument(nextDocument);
    setActiveProfileId(profile.id);
    activeProfileIdRef.current = profile.id;
    setPreferences(EMPTY_CONTROL_PREFERENCES);
    setBeatNoteCountState(8);
    preferencesRef.current = EMPTY_CONTROL_PREFERENCES;
    setLearningAction(null);
  }, [page, userId]);

  const renameMidiProfile = useCallback((profileId: string, name: string) => {
    const nextDocument = {
      ...profileDocumentRef.current,
      profiles: profileDocumentRef.current.profiles.map((profile) =>
        profile.id === profileId ? { ...profile, name: name.trim() } : profile),
    };
    profileDocumentRef.current = nextDocument;
    setProfileDocument(nextDocument);
  }, []);

  const deleteMidiProfile = useCallback((profileId: string) => {
    const profiles = profileDocumentRef.current.profiles.filter((profile) => profile.id !== profileId);
    if (profiles.length === 0) return;
    const nextActiveId = activeProfileIdRef.current === profileId ? profiles[0].id : activeProfileIdRef.current;
    const nextDocument = removePageProfileSelections({
      ...profileDocumentRef.current, profiles,
      activeProfileId: profileDocumentRef.current.activeProfileId === profileId ? profiles[0].id : profileDocumentRef.current.activeProfileId,
    }, profileId);
    profileDocumentRef.current = nextDocument;
    setProfileDocument(nextDocument);
    if (activeProfileIdRef.current === profileId) {
      activeProfileIdRef.current = nextActiveId;
      setActiveProfileId(nextActiveId);
      const nextPreferences = { ...parseStoredPreferences(profiles[0].liveSettings), pairedDeviceId: profiles[0].pairedDeviceId, pairedDeviceName: profiles[0].pairedDeviceName };
      setBeatNoteCountState(nextPreferences.beatLights?.count ?? 8);
      preferencesRef.current = nextPreferences;
      setPreferences(nextPreferences);
    }
    setLearningAction(null);
  }, []);

  return {
    preferences,
    profileDocument,
    activeProfileId,
    selectMidiProfile,
    createMidiProfile,
    renameMidiProfile,
    deleteMidiProfile,
    isSetupOpen,
    isEqModeActive,
    toggleEqMode: toggleEq,
    ...lightShow,
    lightShowFeedback: lightShowFeedback.feedback,
    setSetupOpen: (open: boolean) => setIsSetupOpen(open),
    isLoading,
    isSaving,
    preferenceError,
    devices,
    outputNames,
    lastMidiMessage,
    beatNoteCount,
    setBeatNoteCount,
    isMidiSupported,
    midiError,
    learningAction,
    scanMidiDevices,
    pairDevice,
    learnMidiAction,
    clearMidiMapping,
    clearAllMidiMappings,
    cancelMidiLearn: () => { learningActionRef.current = null; setLearningAction(null); },
  };
}
