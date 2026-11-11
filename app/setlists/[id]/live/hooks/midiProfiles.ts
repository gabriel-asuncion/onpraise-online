export interface MidiControllerProfile {
  id: string;
  name: string;
  pairedDeviceId: string | null;
  pairedDeviceName: string | null;
  liveSettings: Record<string, unknown>;
  editBindings: Record<string, unknown>;
}

export interface MidiProfilesDocument {
  version: 1;
  activeProfileId: string | null;
  profiles: MidiControllerProfile[];
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
        }];
      })
    : [];
  const activeProfileId = typeof record.activeProfileId === "string" &&
    profiles.some((profile) => profile.id === record.activeProfileId)
    ? record.activeProfileId
    : profiles[0]?.id ?? null;
  return { version: 1, activeProfileId, profiles };
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
