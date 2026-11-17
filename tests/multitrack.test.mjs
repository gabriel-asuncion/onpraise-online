import assert from "node:assert/strict";
import test from "node:test";
import { MultitrackEngine } from "../lib/multitrack-engine.ts";

function fakeContext() {
  const starts = [];
  const gains = [];
  const makeNode = () => ({ connect() {}, disconnect() {} });
  const context = {
    currentTime: 10,
    state: "running",
    destination: makeNode(),
    createGain() {
      const node = { ...makeNode(), gain: { value: 1 } };
      gains.push(node);
      return node;
    },
    createAnalyser() {
      return { ...makeNode(), fftSize: 0, frequencyBinCount: 128, getByteFrequencyData(data) { data.fill(128); } };
    },
    createBufferSource() {
      return { ...makeNode(), playbackRate: { value: 1 }, start(at, offset) { starts.push({ at, offset }); }, stop() {} };
    },
  };
  return { context, starts, gains };
}

test("multitrack sources share the same scheduled clock and seek offset", () => {
  const { context, starts } = fakeContext();
  const engine = new MultitrackEngine(context);
  engine.setStems([
    { id: "drums", buffer: { duration: 30 }, volume: 1, muted: false, solo: false },
    { id: "bass", buffer: { duration: 20 }, volume: 1, muted: false, solo: false },
  ]);
  engine.play(3);
  assert.deepEqual(starts, [{ at: 10.03, offset: 3 }, { at: 10.03, offset: 3 }]);
  context.currentTime = 12.03;
  assert.ok(Math.abs(engine.currentTimeSeconds - 5) < 0.00001);
  engine.seek(7);
  assert.equal(starts.at(-1).at, starts.at(-2).at);
  assert.ok(Math.abs(starts.at(-1).at - 12.06) < 0.000001);
  assert.equal(starts.at(-1).offset, 7);
  engine.pause();
  assert.equal(engine.currentTimeSeconds, 7);
  engine.stop();
  assert.equal(engine.currentTimeSeconds, 0);
});

test("stem mute and solo route through independent gains", () => {
  const { context, gains } = fakeContext();
  const engine = new MultitrackEngine(context);
  engine.setStems([
    { id: "a", buffer: { duration: 10 }, volume: 0.8, muted: false, solo: false },
    { id: "b", buffer: { duration: 10 }, volume: 0.6, muted: false, solo: false },
  ]);
  engine.play();
  engine.setStemMix("a", { solo: true });
  assert.equal(gains[1].gain.value, 0.8);
  assert.equal(gains[2].gain.value, 0);
  engine.setStemMix("a", { muted: true });
  assert.equal(gains[1].gain.value, 0);
  assert.ok(engine.getFrequencyBands().every((value) => Math.abs(value - 128 / 255) < 0.001));
});

test("indexed stem faders target the currently loaded stem order", () => {
  const { context, gains } = fakeContext();
  const engine = new MultitrackEngine(context);
  engine.setStems([
    { id: "drums", buffer: { duration: 10 }, volume: 1, muted: false, solo: false },
    { id: "bass", buffer: { duration: 10 }, volume: 1, muted: false, solo: false },
  ]);
  engine.play();
  assert.equal(engine.setStemVolumeAtIndex(1, 0.25), true);
  assert.equal(gains[1].gain.value, 1);
  assert.equal(gains[2].gain.value, 0.25);
  assert.equal(engine.setStemVolumeAtIndex(5, 0.5), false);
  assert.throws(() => engine.setStemVolumeAtIndex(-1, 0.5), /Invalid/);
  assert.throws(() => engine.setStemVolumeAtIndex(0, NaN), /Invalid/);
  engine.setStems([{ id: "new", buffer: { duration: 10 }, volume: 1, muted: false, solo: false }]);
  engine.play();
  assert.equal(engine.setStemVolumeAtIndex(0, 0.4), true);
  assert.equal(gains.at(-1).gain.value, 0.4);
});

test("paused replacement preserves position and never interrupts active playback", () => {
  const { context } = fakeContext();
  const engine = new MultitrackEngine(context);
  const stem = { id: "drums", buffer: { duration: 30 }, volume: 0.8, muted: false, solo: false };
  engine.setStems([stem]);
  engine.seek(7);
  engine.replaceStemsWhilePaused([{ ...stem, id: "bass" }]);
  assert.equal(engine.currentTimeSeconds, 7);
  assert.deepEqual(engine.getStemMixes(), [{ id: "bass", volume: 0.8, muted: false, solo: false }]);
  engine.play();
  assert.throws(() => engine.replaceStemsWhilePaused([]), /Pause local playback/);
  assert.equal(engine.isPlaying, true);
  assert.equal(engine.getStemMixes()[0].id, "bass");
  const snapshot = engine.getStemMixes();
  snapshot[0].volume = 0;
  assert.equal(engine.getStemMixes()[0].volume, 0.8);
});

test("mixer snapshots expose the loaded file version", () => {
  const { context } = fakeContext();
  const engine = new MultitrackEngine(context);
  engine.setStems([{ id: "drums", buffer: { duration: 10 }, volume: 1, muted: false, solo: false, sourceVersion: "version-1" }]);
  assert.equal(engine.getStemMixes()[0].sourceVersion, "version-1");
  engine.replaceStemsWhilePaused([{ id: "drums", buffer: { duration: 10 }, volume: 1, muted: false, solo: false, sourceVersion: "version-2" }]);
  assert.equal(engine.getStemMixes()[0].sourceVersion, "version-2");
});
