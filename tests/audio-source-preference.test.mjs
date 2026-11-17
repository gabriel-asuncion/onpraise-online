import assert from "node:assert/strict";
import test from "node:test";
import { getSavedAudioSource, resolveEffectiveAudioSource, saveAudioSourcePreference } from "../lib/audio-source-preference.ts";

test("offline audio source preferences are account-scoped and marked for sync", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  try {
    await saveAudioSourcePreference("first", "local");
    await saveAudioSourcePreference("second", "youtube");
    assert.equal(getSavedAudioSource("first"), "local");
    assert.equal(getSavedAudioSource("second"), "youtube");
    assert.equal(getSavedAudioSource("third"), "youtube");
    assert.equal(getSavedAudioSource(null), "youtube");
    assert.equal(resolveEffectiveAudioSource("youtube", false), "local");
    assert.equal(resolveEffectiveAudioSource("youtube", true), "youtube");
    assert.equal(getSavedAudioSource("second"), "youtube");
    assert.ok(values.get("onpraise_audio_source_pending:first"));
    await assert.rejects(saveAudioSourcePreference("", "local"), /account/i);
    await assert.rejects(saveAudioSourcePreference("first", "invalid"), /invalid/i);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});
