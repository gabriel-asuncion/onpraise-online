import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSmcStrips3To8StemBindings,
  parseMidiProfiles,
  STEM_MIDI_ACTION_GROUPS,
} from "../app/setlists/[id]/live/hooks/midiProfiles.ts";
import { getMidiFaderValue, isMidiActionAllowedInEq, matchesPairedMidiMapping } from "../app/setlists/[id]/live/hooks/midiInput.ts";

test("SMC stem templates cover all 18 actions in slot order", () => {
  const bindings = buildSmcStrips3To8StemBindings();
  assert.equal(Object.keys(bindings).length, 18);
  assert.deepEqual(STEM_MIDI_ACTION_GROUPS.map(({ slot }) => slot), ["drums", "bass", "keys", "other", "guitars", "vocals"]);
  STEM_MIDI_ACTION_GROUPS.forEach((group, index) => {
    assert.deepEqual(bindings[group.vol], { messageType: "pitchbend", channel: index + 2, number: index + 2 });
    assert.deepEqual(bindings[group.mute], { messageType: "note", channel: 0, number: index + 18 });
    assert.deepEqual(bindings[group.solo], { messageType: "note", channel: 0, number: index + 10 });
    assert.ok(isMidiActionAllowedInEq(true, group.vol));
    assert.ok(isMidiActionAllowedInEq(true, group.mute));
    assert.ok(isMidiActionAllowedInEq(true, group.solo));
    assert.ok(matchesPairedMidiMapping("device", "device", bindings[group.vol], "pitchbend", index + 2, index + 2));
  });
  assert.equal(getMidiFaderValue("pitchbend", Uint8Array.of(0xe2, 1, 64)), 8193 / 16383);
  assert.equal(getMidiFaderValue("cc", Uint8Array.of(0xb0, 7, 64)), 64 / 127);
});

test("stem mappings remain in a persisted MIDI profile", () => {
  const mappings = Object.fromEntries(Object.entries(buildSmcStrips3To8StemBindings())
    .map(([id, mapping]) => [id, { ...mapping, deviceId: "device", deviceName: "SMC" }]));
  const document = { version: 1, activeProfileId: "p", profiles: [{
    id: "p", name: "SMC", pairedDeviceId: "device", pairedDeviceName: "SMC",
    liveSettings: { version: 1, pairedDeviceId: "device", pairedDeviceName: "SMC", mappings },
    editBindings: {},
  }] };
  const parsed = parseMidiProfiles(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(parsed.profiles[0].liveSettings.mappings, mappings);
});
