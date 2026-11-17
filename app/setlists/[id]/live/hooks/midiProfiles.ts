export const STEM_MIDI_ACTION_GROUPS = [
  { slot: "drums", label: "Drums", vol: "STEM_DRUMS_VOL", mute: "STEM_DRUMS_MUTE", solo: "STEM_DRUMS_SOLO" },
  { slot: "bass", label: "Bass", vol: "STEM_BASS_VOL", mute: "STEM_BASS_MUTE", solo: "STEM_BASS_SOLO" },
  { slot: "keys", label: "Keys", vol: "STEM_KEYS_VOL", mute: "STEM_KEYS_MUTE", solo: "STEM_KEYS_SOLO" },
  { slot: "other", label: "Other", vol: "STEM_OTHER_VOL", mute: "STEM_OTHER_MUTE", solo: "STEM_OTHER_SOLO" },
  { slot: "guitars", label: "Guitar", vol: "STEM_GUITAR_VOL", mute: "STEM_GUITAR_MUTE", solo: "STEM_GUITAR_SOLO" },
  { slot: "vocals", label: "Vocals", vol: "STEM_VOCALS_VOL", mute: "STEM_VOCALS_MUTE", solo: "STEM_VOCALS_SOLO" },
] as const;

export type StemMidiActionId = typeof STEM_MIDI_ACTION_GROUPS[number]["vol" | "mute" | "solo"];

export interface StemMidiBindingTemplate {
  messageType: "pitchbend" | "note";
  channel: number;
  number: number;
}

// Attach the paired device ID and name before adding these templates to a profile.
export function buildSmcStrips3To8StemBindings(): Partial<Record<StemMidiActionId, StemMidiBindingTemplate>> {
  const bindings: Partial<Record<StemMidiActionId, StemMidiBindingTemplate>> = {};
  STEM_MIDI_ACTION_GROUPS.forEach((group, index) => {
    const channel = index + 2;
    bindings[group.vol] = { messageType: "pitchbend", channel, number: channel };
    bindings[group.mute] = { messageType: "note", channel: 0, number: index + 18 };
    bindings[group.solo] = { messageType: "note", channel: 0, number: index + 10 };
  });
  return bindings;
}

export interface MidiControllerProfile {
  id: string;
  name: string;
  pairedDeviceId: string | null;
  pairedDeviceName: string | null;
  liveSettings: Record<string, unknown>;
  editBindings: Record<string, unknown>;
  editProtocol?: "mcu";
  editBeatNoteCount?: number;
}

export interface MidiProfilesDocument {
  version: 1;
  activeProfileId: string | null;
  activeProfileIds?: Partial<Record<MidiProfilePage, string>>;
  profiles: MidiControllerProfile[];
}

export type MidiProfilePage = "edit" | "live" | "solo";

export function readLocalPageProfile(userId: string, page: MidiProfilePage): string | null {
  try {
    return window.localStorage.getItem(`onpraise:midi-profile:${userId}:${page}`);
  } catch (error) {
    console.error("Could not read the local MIDI profile selection.", error);
    return null;
  }
}

export function saveLocalPageProfile(userId: string, page: MidiProfilePage, profileId: string): void {
  window.localStorage.setItem(`onpraise:midi-profile:${userId}:${page}`, profileId);
}

export function getPageProfileId(document: MidiProfilesDocument, page: MidiProfilePage): string | null {
  const saved = document.activeProfileIds?.[page];
  return document.profiles.some((profile) => profile.id === saved)
    ? saved! : document.activeProfileId;
}

export function selectPageProfile(document: MidiProfilesDocument, page: MidiProfilePage, id: string): MidiProfilesDocument {
  return { ...document, activeProfileIds: { ...document.activeProfileIds, [page]: id } };
}

export function removePageProfileSelections(document: MidiProfilesDocument, removedId: string): MidiProfilesDocument {
  const selections = { ...document.activeProfileIds };
  for (const page of ["edit", "live", "solo"] as const) {
    if (selections[page] === removedId) delete selections[page];
  }
  return { ...document, activeProfileIds: selections };
}

export const EMPTY_MIDI_PROFILES: MidiProfilesDocument = {
  version: 1,
  activeProfileId: null,
  profiles: [],
};

export function parseMidiProfiles(value: unknown): MidiProfilesDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_MIDI_PROFILES;
  const record = value as Record<string, unknown>;
  const profiles = Array.isArray(record.profiles)
    ? record.profiles.flatMap((candidate): MidiControllerProfile[] => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const profile = candidate as Record<string, unknown>;
        if (typeof profile.id !== "string" || typeof profile.name !== "string" || !profile.name.trim()) return [];
        return [{
          id: profile.id,
          name: profile.name.trim(),
          pairedDeviceId: typeof profile.pairedDeviceId === "string" ? profile.pairedDeviceId : null,
          pairedDeviceName: typeof profile.pairedDeviceName === "string" ? profile.pairedDeviceName : null,
          liveSettings: profile.liveSettings && typeof profile.liveSettings === "object" && !Array.isArray(profile.liveSettings)
            ? profile.liveSettings as Record<string, unknown>
            : {},
          editBindings: profile.editBindings && typeof profile.editBindings === "object" && !Array.isArray(profile.editBindings)
            ? profile.editBindings as Record<string, unknown>
            : {},
          ...(profile.editProtocol === "mcu" ? { editProtocol: "mcu" as const } : {}),
          ...(typeof profile.editBeatNoteCount === "number" && Number.isInteger(profile.editBeatNoteCount) &&
            profile.editBeatNoteCount >= 4 && profile.editBeatNoteCount <= 128 && profile.editBeatNoteCount % 4 === 0
            ? { editBeatNoteCount: profile.editBeatNoteCount } : {}),
        }];
      })
    : [];
  const activeProfileId = typeof record.activeProfileId === "string" &&
    profiles.some((profile) => profile.id === record.activeProfileId)
    ? record.activeProfileId
    : profiles[0]?.id ?? null;
  const selections = record.activeProfileIds && typeof record.activeProfileIds === "object" && !Array.isArray(record.activeProfileIds)
    ? record.activeProfileIds as Record<string, unknown> : {};
  const activeProfileIds: MidiProfilesDocument["activeProfileIds"] = {};
  for (const page of ["edit", "live", "solo"] as const) {
    const id = selections[page];
    if (typeof id === "string" && profiles.some((profile) => profile.id === id)) activeProfileIds[page] = id;
  }
  return { version: 1, activeProfileId, profiles, activeProfileIds };
}

export function createMidiControllerProfile(name: string): MidiControllerProfile {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    pairedDeviceId: null,
    pairedDeviceName: null,
    liveSettings: {},
    editBindings: {},
  };
}
