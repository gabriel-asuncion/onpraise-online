import assert from "node:assert/strict";
import test from "node:test";
import { parseAllowedGeniusSongUrl, resolveAllowedGeniusRedirect } from "../app/api/lyrics/url-validation.ts";
import { compileTimelineBeatMap, getTimelineMeter, getYoutubeTimeForTimeline } from "../app/setlists/[id]/live/utils/timeline.ts";
import { startPlaybackWithSupplementaryAudio } from "../app/setlists/[id]/live/utils/playback-start.ts";
import { loadSongSectionsBySongId } from "../app/setlists/[id]/live/utils/load-song-sections.ts";
import {
  getAccountLandingPath,
  hasProfileMembership,
  resolveAccountLandingDecision,
} from "../lib/account-routing.ts";
import { createInvitationUrl, getInvitationPath, normalizeJoinCode } from "../lib/invitations.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

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
