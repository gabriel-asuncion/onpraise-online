import assert from "node:assert/strict";
import test from "node:test";
import { parseAllowedGeniusSongUrl, resolveAllowedGeniusRedirect } from "../app/api/lyrics/url-validation.ts";
import { compileTimelineBeatMap, getTimelineMeter, getYoutubeTimeForTimeline } from "../app/setlists/[id]/live/utils/timeline.ts";
import { startPlaybackWithSupplementaryAudio } from "../app/setlists/[id]/live/utils/playback-start.ts";
import { loadSongSectionsBySongId } from "../app/setlists/[id]/live/utils/load-song-sections.ts";
import { adjustMidiLineBeats, getMidiLaneIndex, getMidiScrubTime, getMidiSectionTimingValue } from "../app/songs/[id]/edit/midiTimeline.ts";
import { findMidiConflicts, updateMidiBinding } from "../app/songs/[id]/edit/midiBindings.ts";
import { buildFeedbackScene, createBeatControls, feedbackKey, getConfiguredBeatControls, getMidiOutputs, isShortcutLightActive, syncFeedbackOutputs } from "../app/songs/[id]/edit/midiFeedback.ts";
import { createMcuBeatControls, createMcuPreset, decodeMcuVpot, MCU_REC_PAIRS, parsePitchBend, scalePitchBend } from "../app/songs/[id]/edit/mcuProtocol.ts";
import { parseMidiProfiles } from "../app/setlists/[id]/live/hooks/midiProfiles.ts";
import { getMetronomePulse, getMetronomeStep, isClickVolumeMuted } from "../lib/metronome.ts";
import {
  getAccountLandingPath,
  hasProfileMembership,
  resolveAccountLandingDecision,
} from "../lib/account-routing.ts";
import { createInvitationUrl, getInvitationPath, normalizeJoinCode } from "../lib/invitations.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import {
  SERVICE_POSITIONS,
  formatCooldownDuration,
  getCooldownRemainingMs,
  normalizeServicePosition,
} from "../lib/positions.ts";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
  suggestSongFromYouTubeTitle,
} from "../lib/youtube-import.ts";

test("metronome speeds and patterns use the selected click grid", () => {
  assert.equal(isClickVolumeMuted(0), true);
  assert.equal(isClickVolumeMuted(0.99), true);
  assert.equal(isClickVolumeMuted(1), false);
  assert.deepEqual(["default", "double", "half"].map(getMetronomeStep), [1, 0.5, 2]);
  assert.deepEqual([0, 1, 2, 3].map((i) => getMetronomePulse(i, "default", "default", 4)), [1, 2, 2, 2]);
  assert.deepEqual([0, 1, 2, 3].map((i) => getMetronomePulse(i, "default", "no-downbeat", 4)), [2, 2, 2, 2]);
  assert.deepEqual([0, 1, 2, 3].map((i) => getMetronomePulse(i, "default", "backbeat", 4)), [null, 2, null, 2]);
  assert.deepEqual([0, 1, 2, 3].map((i) => getMetronomePulse(i, "default", "alternate", 4)), [1, 2, 1, 2]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => getMetronomePulse(i, "double", "backbeat", 4)), [null, null, 2, null, null]);
  assert.deepEqual([0, 1, 2].map((i) => getMetronomePulse(i, "half", "default", 4)), [1, 2, 1]);
  assert.deepEqual([0, 1, 2, 3].map((i) => getMetronomePulse(i, "default", "backbeat", 3)), [null, 2, null, null]);
});

test("live beat lights use saved editor ranges and legacy mappings", () => {
  const first = { type: "note", channel: 2, noteOrCcNumber: 40, mode: "trigger" };
  const second = { type: "note", channel: 2, noteOrCcNumber: 70, mode: "trigger" };
  const bindings = { BEAT_LIGHT_1: first, BEAT_LIGHT_2: second };
  const range = getConfiguredBeatControls(bindings, 8);
  assert.deepEqual(range.map(({ control, beat }) => [control.noteOrCcNumber, control.channel, beat]),
    [[40, 2, 0], [41, 2, 0], [42, 2, 1], [43, 2, 1], [44, 2, 2], [45, 2, 2], [46, 2, 3], [47, 2, 3]]);
  assert.deepEqual(getConfiguredBeatControls(bindings, undefined).map(({ control, beat }) => [control.noteOrCcNumber, beat]), [[40, 0], [70, 1]]);
  assert.deepEqual(getConfiguredBeatControls({ BEAT_LIGHT_1: { ...first, noteOrCcNumber: 126 } }, 8), []);
});

test("MIDI line duration changes by one beat per increment", () => {
  assert.equal(adjustMidiLineBeats(6, 0, 1), 7);
  assert.equal(adjustMidiLineBeats(6, 0, -1), 5);
  assert.equal(adjustMidiLineBeats(1, 0, -2), 0);
  assert.equal(adjustMidiLineBeats(6, 0), 0);
  assert.equal(adjustMidiLineBeats(6, 64), 32);
  assert.equal(adjustMidiLineBeats(6, 127), 64);
});

test("MIDI scrubbing accumulates pending seeks and clamps relative and absolute positions", () => {
  assert.equal(getMidiScrubTime(10, { time: 12, timestamp: 100 }, 200, 60, 2, 20, 30, 0, 2), 12.5);
  assert.equal(getMidiScrubTime(10, { time: 12, timestamp: 100 }, 500, 60, 2, 20, 30, 0, -1), 9.75);
  assert.equal(getMidiScrubTime(10, null, 0, 60, 2, 20, 15, 127), 15);
  assert.equal(getMidiScrubTime(0, null, 0, 60, 2, 20, 30, 0, -1), 0);
});

test("MIDI timing adjustment allows zero beats while retaining the measure minimum", () => {
  assert.equal(getMidiSectionTimingValue("beats", 1, 0, 4, -1), 0);
  assert.equal(getMidiSectionTimingValue("beats", 0, 0, 4, -1), 0);
  assert.equal(getMidiSectionTimingValue("measures", 1, 0, 4, -1), 1);
  assert.equal(getMidiSectionTimingValue("beats", 3, 0, 4), 0);
});

test("MIDI lane scrub maps absolute and relative inputs within available lanes", () => {
  assert.equal(getMidiLaneIndex(0, -1, 0, 1), -1);
  assert.equal(getMidiLaneIndex(4, -1, 0, 1), 1);
  assert.equal(getMidiLaneIndex(4, 0, 0, -1), 0);
  assert.equal(getMidiLaneIndex(4, 1, 0, 9), 3);
  assert.equal(getMidiLaneIndex(4, 0, 127), 3);
});

test("MIDI alternatives preserve the primary binding and can be relearned", () => {
  const primary = { actionId: "PLAY_PAUSE", type: "note", channel: 0, noteOrCcNumber: 40 };
  const alternative = { ...primary, noteOrCcNumber: 41 };
  const next = updateMidiBinding(primary, [], alternative, 1);
  assert.deepEqual(next, { primary, alternatives: [alternative] });
  const replacement = { ...alternative, noteOrCcNumber: 42 };
  assert.deepEqual(updateMidiBinding(next.primary, next.alternatives, replacement, 1), { primary, alternatives: [replacement] });
  assert.deepEqual(updateMidiBinding(primary, [alternative], replacement, 0), { primary: replacement, alternatives: [alternative] });
});

test("MIDI conflicts include other shortcuts, alternatives, and omni channels", () => {
  const primary = { actionId: "PLAY_PAUSE", type: "note", channel: -1, noteOrCcNumber: 40 };
  const alternative = { ...primary, channel: 2, noteOrCcNumber: 41 };
  const bindings = [{ primary, alternatives: [alternative] }];
  assert.deepEqual(findMidiConflicts(bindings, { ...primary, channel: 5, actionId: "SAVE_STRUCTURE" }, 0), [primary]);
  assert.deepEqual(findMidiConflicts(bindings, { ...alternative, actionId: "SAVE_STRUCTURE" }, 0), [alternative]);
  assert.deepEqual(findMidiConflicts(bindings, primary, 0), []);
  assert.deepEqual(findMidiConflicts(bindings, { ...alternative, channel: 3, actionId: "SAVE_STRUCTURE" }, 0), []);
});

test("MIDI beat lights preserve active shared shortcut lights during playback", () => {
  const mute = { type: "note", channel: 0, noteOrCcNumber: 40 };
  const solo = { type: "note", channel: 0, noteOrCcNumber: 41 };
  const shortcuts = [{ control: mute, active: true }];
  const beats = [{ control: mute, beat: 0 }, { control: solo, beat: 1 }];
  assert.equal(buildFeedbackScene(shortcuts, beats, null).get(feedbackKey(mute)).active, true);
  assert.equal(buildFeedbackScene(shortcuts, beats, 0).get(feedbackKey(mute)).active, true);
  const scene = buildFeedbackScene(shortcuts, beats, 1);
  assert.equal(scene.get(feedbackKey(mute)).active, true);
  assert.equal(scene.get(feedbackKey(solo)).active, true);
});

test("MCU pitch bend scales 14-bit fader values at endpoints and center", () => {
  assert.equal(scalePitchBend(0, 0), 0);
  assert.equal(scalePitchBend(0, 64), 64);
  assert.equal(scalePitchBend(127, 127), 127);
  assert.deepEqual(parsePitchBend(Uint8Array.from([0xe8, 127, 127])), { channel: 8, value: 127 });
  assert.deepEqual(parsePitchBend(Uint8Array.from([0xe1, 0, 0])), { channel: 1, value: 0 });
  assert.equal(parsePitchBend(Uint8Array.from([0xe0, 0])), null);
  assert.equal(parsePitchBend(Uint8Array.from([0xb0, 0, 0])), null);
});

test("MCU preset assigns transport, contextual controls, knobs, and faders", () => {
  const preset = createMcuPreset();
  assert.equal(preset.PLAY_PAUSE.noteOrCcNumber, 94);
  assert.equal(preset.STOP_RETURN.noteOrCcNumber, 93);
  assert.equal(preset.OPEN_ADD_SECTION.noteOrCcNumber, 95);
  assert.deepEqual(["MODAL_INSERT_BEFORE", "MODAL_INSERT_AFTER", "MODAL_CANCEL", "MODAL_ADD_NEW_OR_CYCLE"].map((id) => preset[id].noteOrCcNumber), [18, 10, 2, 26]);
  const knobs = ["JOG_SCRUB", "LANE_SCRUB", "ADJUST_SECTION_MEASURES", "ADJUST_SECTION_BEATS", "ADJUST_SECTION_REPEATS", "ADJUST_LINE_MEASURES", "ADJUST_YOUTUBE_OFFSET", "TIMELINE_ZOOM"];
  knobs.forEach((id, index) => {
    assert.equal(preset[id].noteOrCcNumber, 16 + index);
    assert.equal(preset[id].relativeEncoding, "mcu_vpot");
  });
  assert.deepEqual([preset.BACKING_TRACK_VOLUME.channel, preset.CLICK_VOLUME.channel], [0, 1]);
  assert.equal(preset.BACKING_TRACK_VOLUME.type, "pitchbend");
});

test("MCU V-Pot handles signed multi-step deltas and ignores unsupported values", () => {
  assert.equal(decodeMcuVpot(1), 1);
  assert.equal(decodeMcuVpot(15), 15);
  assert.equal(decodeMcuVpot(65), -1);
  assert.equal(decodeMcuVpot(79), -15);
  for (const value of [0, 16, 64, 80, 127]) assert.equal(decodeMcuVpot(value), 0);
});

test("MCU beat pairs preserve the shared cancel LED and clear when playback stops", () => {
  const controls = createMcuBeatControls();
  const cancel = { type: "note", channel: 0, noteOrCcNumber: 2 };
  const shortcuts = [{ control: cancel, active: true }];
  for (let beat = 0; beat < 4; beat++) {
    const scene = buildFeedbackScene(shortcuts, controls, beat);
    for (let note = 0; note < 8; note++) {
      assert.equal(scene.get(feedbackKey({ type: "note", channel: 0, noteOrCcNumber: note })).active, note === 2 || MCU_REC_PAIRS[beat].includes(note));
    }
  }
  const stopped = buildFeedbackScene([], controls, null);
  assert.equal([...stopped.values()].every((item) => !item.active), true);
  assert.equal(buildFeedbackScene(shortcuts, controls, null).get(feedbackKey(cancel)).active, true);
});

test("MIDI output selection matches Windows ports and falls back to connected outputs", () => {
  const outputs = [
    { name: "MIDIOUT2 (SMC-Mixer)", state: "connected" },
    { name: "Other output", state: "connected" },
    { name: "MIDIOUT3 (SMC-Mixer)", state: "disconnected" },
  ];
  assert.deepEqual(getMidiOutputs({ outputs }, "MIDIIN2 (SMC-Mixer)"), [outputs[0]]);
  assert.deepEqual(getMidiOutputs({ outputs }, null), outputs.slice(0, 2));
  assert.deepEqual(getMidiOutputs({ outputs: outputs.slice(1) }, "Unknown controller"), [outputs[1]]);
  assert.deepEqual(getMidiOutputs({ outputs: [] }, "MIDIIN2 (SMC-Mixer)"), []);
  assert.deepEqual(getMidiOutputs({ outputs: [outputs[1], { name: null, state: "connected" }] }, "Unknown controller").length, 2);
});

test("MIDI feedback synchronizes, retries and clears each output independently", () => {
  const messages1 = [], messages2 = [];
  let fail = true;
  const first = { name: "first", state: "connected", send: (message) => messages1.push(message) };
  const second = { name: "second", state: "connected", send: (message) => {
    if (fail) throw new Error("output failure");
    messages2.push(message);
  } };
  const control = { type: "note", channel: 0, noteOrCcNumber: 94 };
  const scene = buildFeedbackScene([{ control, active: true }], [], null);
  const previous = new Map();
  assert.equal(syncFeedbackOutputs([first, second], scene, previous).length, 1);
  assert.deepEqual(messages1, [[0x90, 94, 127]]);
  fail = false;
  assert.deepEqual(syncFeedbackOutputs([first, second], scene, previous), []);
  assert.deepEqual(messages1, [[0x90, 94, 127]]);
  assert.deepEqual(messages2, [[0x90, 94, 127]]);
  syncFeedbackOutputs([second], scene, previous);
  assert.deepEqual(messages1.at(-1), [0x90, 94, 0]);
  syncFeedbackOutputs([first, second], scene, previous);
  assert.deepEqual(messages1.at(-1), [0x90, 94, 127]);
  const replacement = { type: "note", channel: 1, noteOrCcNumber: 40 };
  syncFeedbackOutputs([first, second], buildFeedbackScene([{ control: replacement, active: true }], [], null), previous);
  assert.deepEqual(messages1.slice(-2), [[0x91, 40, 127], [0x90, 94, 0]]);
  second.state = "disconnected";
  syncFeedbackOutputs([], new Map(), previous);
  assert.deepEqual(messages1.at(-1), [0x91, 40, 0]);
  assert.deepEqual(messages2.at(-1), [0x90, 94, 0]);
  assert.equal(previous.size, 0);
});

test("Consecutive beat notes are distributed evenly and invalid ranges are rejected", () => {
  for (const count of [4, 8, 12]) {
    const lights = createBeatControls(10, 2, count);
    assert.equal(lights.length, count);
    lights.forEach((item, index) => {
      assert.equal(item.control.noteOrCcNumber, 10 + index);
      assert.equal(item.control.channel, 2);
      assert.equal(item.beat, Math.floor(index / (count / 4)));
    });
  }
  assert.equal(createBeatControls(126, 0, 4).length, 0);
  assert.equal(createBeatControls(0, 0, 5).length, 0);
  assert.equal(createBeatControls(0, 0, 0).length, 0);
});

test("Shortcut lights switch between timeline, placement, and catalog contexts", () => {
  assert.equal(isShortcutLightActive("OPEN_ADD_SECTION", "Structure", true, false, false), true);
  assert.equal(isShortcutLightActive("MODAL_CANCEL", "Modal Navigation", true, false, false), false);
  assert.equal(isShortcutLightActive("OPEN_ADD_SECTION", "Structure", true, true, false), false);
  assert.equal(isShortcutLightActive("MODAL_CANCEL", "Modal Navigation", true, true, false), true);
  assert.equal(isShortcutLightActive("MODAL_INSERT_AFTER", "Modal Navigation", true, false, true), false);
  assert.equal(isShortcutLightActive("PLAY_PAUSE", "Transport", true, false, true), true);
  assert.equal(isShortcutLightActive("MODAL_CANCEL", "Modal Navigation", false, true, false), false);
});

test("MCU profile protocol survives persistence without modifying legacy profiles", () => {
  const profile = { id: "p", name: "Mixer", editBindings: { test: 1 }, editProtocol: "mcu", editBeatNoteCount: 12 };
  const parsed = parseMidiProfiles({ profiles: [profile], activeProfileId: "p" }).profiles[0];
  assert.equal(parsed.editProtocol, "mcu");
  assert.equal(parsed.editBeatNoteCount, 12);
  assert.equal(parseMidiProfiles({ profiles: [{ ...profile, editProtocol: undefined }] }).profiles[0].editProtocol, undefined);
});

test("account routing recognizes existing team and ministry members without optional names", () => {
  assert.equal(getAccountLandingPath({ full_name: null, team_id: "team-1", secondary_team_ids: [], ministries: [] }), "/dashboard");
  assert.equal(getAccountLandingPath({ full_name: null, team_id: null, secondary_team_ids: [], ministries: ["Musician"] }), "/dashboard");
  assert.equal(getAccountLandingPath({ full_name: null, team_id: null, secondary_team_ids: [], ministries: [] }, true), "/dashboard");
  assert.equal(getAccountLandingPath({ full_name: "New User", team_id: null, secondary_team_ids: [], ministries: [] }), "/onboarding");
  assert.equal(getAccountLandingPath(null, true), "/onboarding");
  assert.equal(hasProfileMembership({ full_name: null, team_id: null, secondary_team_ids: ["team-2"], ministries: [] }), true);
});

test("account routing waits for delayed profile and team membership data", async () => {
  let resolveProfile;
  let resolveMembership;
  let profileLoaded = false;
  let membershipLoaded = false;

  const decisionPromise = resolveAccountLandingDecision(
    () => new Promise((resolve) => {
      resolveProfile = resolve;
    }).then((profile) => {
      profileLoaded = true;
      return profile;
    }),
    () => new Promise((resolve) => {
      resolveMembership = resolve;
    }).then((membership) => {
      membershipLoaded = true;
      return membership;
    }),
  );

  await Promise.resolve();
  assert.equal(profileLoaded, false);
  resolveProfile({ full_name: null, team_id: null, secondary_team_ids: [], ministries: [] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(profileLoaded, true);
  assert.equal(membershipLoaded, false);
  resolveMembership(true);

  const decision = await decisionPromise;
  assert.equal(membershipLoaded, true);
  assert.equal(decision.destination, "/dashboard");
});

test("account routing propagates profile or membership query failures", async () => {
  const failure = new Error("membership unavailable");
  await assert.rejects(
    resolveAccountLandingDecision(
      async () => ({ full_name: "Member", team_id: null, secondary_team_ids: [], ministries: [] }),
      async () => { throw failure; },
    ),
    failure,
  );
  await assert.rejects(
    resolveAccountLandingDecision(async () => { throw failure; }, async () => false),
    failure,
  );
});

test("invitation URLs normalize codes and preserve the existing root URL format", () => {
  assert.equal(normalizeJoinCode("abcd-12345"), "ABCD-12345");
  assert.equal(normalizeJoinCode("ABCD-12"), null);
  assert.equal(normalizeJoinCode("http://example.test/ABCD-12345"), null);
  assert.equal(createInvitationUrl("https://onpraise.example", "abcd-12345"), "https://onpraise.example/?invite=ABCD-12345");
  assert.equal(createInvitationUrl("https://onpraise.example", "invalid"), null);
  assert.equal(getInvitationPath("abcd-12345"), "/onboarding?invite=ABCD-12345");
  assert.throws(() => getInvitationPath("invalid"));
});

test("QR code component renders a real invitation URL locally", () => {
  const inviteUrl = createInvitationUrl("https://onpraise.example", "ABCD-12345");
  const markup = renderToStaticMarkup(
    React.createElement(QRCodeSVG, {
      value: inviteUrl,
      size: 144,
      level: "M",
      includeMargin: true,
      bgColor: "#ffffff",
      fgColor: "#000000",
    }),
  );

  assert.match(markup, /<svg/);
  assert.match(markup, /width="144"/);
  assert.match(markup, /<path/);
});

test("service positions remain separate from permission roles and cooldown display uses server timestamps", () => {
  assert.ok(SERVICE_POSITIONS.includes("Musician"));
  assert.equal(normalizeServicePosition("admin"), null);
  assert.equal(normalizeServicePosition("Music Leader"), "Music Leader");
  assert.equal(getCooldownRemainingMs("2026-11-07T10:00:00.000Z", Date.parse("2026-11-07T09:00:00.000Z")), 60 * 60 * 1000);
  assert.equal(getCooldownRemainingMs("2026-11-07T09:00:00.000Z", Date.parse("2026-11-07T10:00:00.000Z")), 0);
  assert.equal(formatCooldownDuration((49 * 60 + 1) * 60_000), "49h 1m");
});

test("YouTube import validates and normalizes supported video URL formats", () => {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=abcdefghijk&t=15"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://youtube.com/live/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://youtube.com/u/channel/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://example.com/watch?v=abcdefghijk"), null);
  assert.equal(extractYouTubeVideoId("javascript:alert(1)"), null);
  assert.equal(getCanonicalYouTubeUrl("abcdefghijk"), "https://www.youtube.com/watch?v=abcdefghijk");
});

test("YouTube title suggestions remove edition labels without assigning cover channels as artists", () => {
  assert.deepEqual(suggestSongFromYouTubeTitle("Artist Name - Song Title (Official Music Video)"), {
    title: "Song Title",
    artist: "Artist Name",
    versionNote: null,
  });
  assert.deepEqual(suggestSongFromYouTubeTitle("SONG TITLE | ARTIST NAME | LIVE WORSHIP"), {
    title: "SONG TITLE",
    artist: "ARTIST NAME",
    versionNote: "Live version",
  });
  assert.deepEqual(suggestSongFromYouTubeTitle("Song Title (Cover by Channel Name)"), {
    title: "Song Title",
    artist: "Unknown Artist",
    versionNote: "Cover version",
  });
  assert.deepEqual(suggestSongFromYouTubeTitle("ARTIST - SONG TITLE [LYRICS]"), {
    title: "SONG TITLE",
    artist: "ARTIST",
    versionNote: null,
  });
  assert.equal(suggestSongFromYouTubeTitle("Live Your Life").title, "Live Your Life");
  assert.deepEqual(suggestSongFromYouTubeTitle("Song Title - Live Performance"), {
    title: "Song Title",
    artist: "Unknown Artist",
    versionNote: "Live version",
  });
});

test("Genius scraping accepts only valid HTTPS Genius song URLs", () => {
  assert.equal(parseAllowedGeniusSongUrl("https://genius.com/example-song-lyrics")?.hostname, "genius.com");
  assert.equal(parseAllowedGeniusSongUrl("http://genius.com/example-song-lyrics"), null);
  assert.equal(parseAllowedGeniusSongUrl("https://genius.com.example.net/example-song-lyrics"), null);
  assert.equal(parseAllowedGeniusSongUrl("https://127.0.0.1/example-song-lyrics"), null);
  assert.equal(parseAllowedGeniusSongUrl("https://genius.com:8443/example-song-lyrics"), null);
  assert.equal(parseAllowedGeniusSongUrl("https://genius.com/example-song-lyrics?next=http://127.0.0.1"), null);
  assert.equal(parseAllowedGeniusSongUrl("not a URL"), null);
  const songUrl = new URL("https://genius.com/example-song-lyrics");
  assert.equal(resolveAllowedGeniusRedirect("/another-song-lyrics", songUrl)?.hostname, "genius.com");
  assert.equal(resolveAllowedGeniusRedirect("https://127.0.0.1/internal", songUrl), null);
  assert.equal(resolveAllowedGeniusRedirect("javascript:alert(1)", songUrl), null);
});

test("timeline meter and section progression include repeats and spacers", () => {
  const timings = {
    __timeline: { meterNumerator: 6, meterDenominator: 8 },
    Verse: { measures: 1, repeats: 1 },
  };
  assert.equal(getTimelineMeter(timings).quarterBeatsPerMeasure, 3);

  const beatMap = compileTimelineBeatMap(
    [
      { id: "verse", section_name: "Verse" },
      { id: "spacer", section_name: "Spacer" },
      { id: "chorus", section_name: "Chorus" },
    ],
    timings,
    [1, 0, 1],
    undefined,
    { spacer: 0.5 },
  );
  assert.deepEqual(beatMap.sectionStartBeats, [0, 6, 6.5]);
  assert.equal(beatMap.totalBeats, 18.5);
});

test("late YouTube alignment includes elapsed authoritative timeline time", () => {
  assert.equal(getYoutubeTimeForTimeline(4, 2_000, 120, 500), 4.5);
});

test("shared timeline starts synchronously when supplementary audio is disabled", () => {
  let timelineStarted = false;
  startPlaybackWithSupplementaryAudio(() => {
    timelineStarted = true;
  });
  assert.equal(timelineStarted, true);
});

test("shared timeline starts before supplementary playback and never waits for it", async () => {
  const order = [];
  let resolveAudio;
  startPlaybackWithSupplementaryAudio(
    () => order.push("timeline"),
    () => {
      order.push("audio");
      return new Promise((resolve) => {
        resolveAudio = resolve;
      });
    },
  );

  assert.deepEqual(order, ["timeline"]);
  await Promise.resolve();
  assert.deepEqual(order, ["timeline", "audio"]);
  assert.equal(typeof resolveAudio, "function");
  resolveAudio();
});

test("supplementary playback rejection does not undo the shared timeline", async () => {
  let timelineStarted = false;
  let reportedError;
  startPlaybackWithSupplementaryAudio(
    () => {
      timelineStarted = true;
    },
    () => Promise.reject(new Error("player rejected")),
    (error) => {
      reportedError = error;
    },
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timelineStarted, true);
  assert.equal(reportedError.message, "player rejected");
});

test("setlist loading requests all song sections once and preserves ordered grouping", async () => {
  const calls = [];
  const sections = [
    { id: "s1", song_id: "song-a", section_name: "Verse", content: "a" },
    { id: "s2", song_id: "song-b", section_name: "Chorus", content: "b" },
    { id: "s3", song_id: "song-a", section_name: "Chorus", content: "c" },
  ];
  const supabase = {
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns) {
          calls.push(["select", columns]);
          return {
            in(column, ids) {
              calls.push(["in", column, ids]);
              return {
                async order(columnName, options) {
                  calls.push(["order", columnName, options]);
                  return { data: sections, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const grouped = await loadSongSectionsBySongId(supabase, ["song-a", "song-b", "song-a"]);
  assert.equal(calls.filter(([kind]) => kind === "from").length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === "in"), ["in", "song_id", ["song-a", "song-b"]]);
  assert.deepEqual(grouped.get("song-a").map(({ id }) => id), ["s1", "s3"]);
  assert.deepEqual(grouped.get("song-b").map(({ id }) => id), ["s2"]);
  assert.equal(grouped.has("song-without-sections"), false);
});

test("empty setlists skip the sections query and query errors remain visible", async () => {
  let called = false;
  const supabase = {
    from() {
      called = true;
      throw new Error("should not query");
    },
  };
  assert.equal((await loadSongSectionsBySongId(supabase, [])).size, 0);
  assert.equal(called, false);

  const failure = new Error("database unavailable");
  const failingClient = {
    from: () => ({
      select: () => ({
        in: () => ({
          order: async () => ({ data: null, error: failure }),
        }),
      }),
    }),
  };
  await assert.rejects(loadSongSectionsBySongId(failingClient, ["song-a"]), failure);
});
