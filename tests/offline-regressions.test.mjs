import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { clearAuthSnapshot, getOfflineAuthSnapshot, isNetworkFailure, saveAuthSnapshot } from "../lib/offline-auth.ts";
import { captureOfflineGeneration, clearOfflineData, openOfflineDatabase, saveOfflineSong, saveOfflineSetlistBundle, saveSongIndex } from "../lib/offline-db.ts";

test("offline audio upgrade preserves version-one stores", async () => {
  let request;
  const created = [];
  globalThis.indexedDB = { open: (name, version) => {
    assert.equal(name, "onpraise_offline_v1");
    assert.equal(version, 2);
    request = {};
    return request;
  } };
  const promise = openOfflineDatabase();
  request.result = { createObjectStore(name) {
    created.push(name);
    return { createIndex(index, key) { assert.equal(index, "owner_song"); assert.deepEqual(key, ["ownerId", "songId"]); } };
  } };
  request.onupgradeneeded({ oldVersion: 1 });
  request.onsuccess();
  await promise;
  assert.deepEqual(created, ["audio_directory_handles", "song_audio_stems"]);
  delete globalThis.indexedDB;
});

test("offline authentication accepts a verified snapshot for an expired session but rejects a different user", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const snapshot = {
    userId: "user-1", email: null, activeRole: "musician", userTeamId: null,
    primaryTeamId: null, secondaryTeamIds: [], setupComplete: true, lastVerifiedAt: "2026-01-01",
  };
  const client = (id) => ({ auth: { getSession: async () => ({ data: { session: id ? { user: { id } } : null }, error: null }) } });
  assert.equal(await getOfflineAuthSnapshot(client("user-1")), null);
  saveAuthSnapshot(snapshot);
  assert.deepEqual(await getOfflineAuthSnapshot(client("user-1")), snapshot);
  assert.equal(await getOfflineAuthSnapshot(client("user-2")), null);
  assert.deepEqual(await getOfflineAuthSnapshot(client(null)), snapshot);
  assert.deepEqual(await getOfflineAuthSnapshot({ auth: { getSession: async () => ({ data: { session: null }, error: { name: "AuthRetryableFetchError" } }) } }), snapshot);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await getOfflineAuthSnapshot({ auth: { getSession: async () => { throw new Error("Failed to fetch"); } } }), snapshot);
  } finally {
    console.warn = originalWarn;
  }
  let release;
  const pending = getOfflineAuthSnapshot({ auth: { getSession: () => new Promise((resolve) => { release = resolve; }) } });
  clearAuthSnapshot();
  release({ data: { session: null }, error: null });
  assert.equal(await pending, null);
  assert.equal(await getOfflineAuthSnapshot(client("user-1")), null);
  delete globalThis.localStorage;
});

test("sign-out invalidates pending song, setlist, and index writes even if database opens late", async () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  localStorage.setItem("onpraise_offline_auth", JSON.stringify({ userId: "user" }));
  const opens = [];
  const writes = [];
  globalThis.indexedDB = { open: () => { const request = {}; opens.push(request); return request; } };
  const database = {
    close() {},
    transaction() {
      const tx = {
        objectStore: (name) => ({
          clear: () => { writes.push([name, "clear"]); return { result: undefined }; },
          put: (value) => { writes.push([name, "put"]); return { result: value.id }; },
          count: () => ({ result: 0 }),
        }),
      };
      queueMicrotask(() => tx.oncomplete());
      return tx;
    },
  };
  const generation = captureOfflineGeneration();
  const song = { id: "song", ownerId: "user", song_sections: [] };
  const setlist = { id: "setlist", ownerId: "user", tracks: [] };
  const pendingSong = saveOfflineSong(song, generation);
  const pendingSetlist = saveOfflineSetlistBundle(setlist, [song], generation);
  const pendingIndex = saveSongIndex([{ id: "song", ownerId: "user" }], generation);
  const cleanup = clearOfflineData();
  for (const request of opens) { request.result = database; request.onsuccess(); }
  assert.equal(await pendingSong, false);
  assert.equal(await pendingSetlist, false);
  await pendingIndex;
  await cleanup;
  assert.equal(writes.filter(([, operation]) => operation === "put").length, 0);
  assert.equal(writes.filter(([, operation]) => operation === "clear").length, 6);
  localStorage.removeItem("onpraise_offline_auth");
  assert.equal(await saveOfflineSong(song, captureOfflineGeneration()), false);
  delete globalThis.indexedDB;
  delete globalThis.localStorage;
});

test("a sign-out in another tab invalidates an already-started write", async () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  localStorage.setItem("onpraise_offline_auth", JSON.stringify({ userId: "user" }));
  let request;
  globalThis.indexedDB = { open: () => (request = {}) };
  const generation = captureOfflineGeneration();
  const pending = saveOfflineSong({ id: "song", ownerId: "user", song_sections: [] }, generation);
  localStorage.setItem("onpraise_offline_generation", "other-tab-signout");
  request.result = { close() {}, transaction() { throw new Error("stale write was attempted"); } };
  request.onsuccess();
  assert.equal(await pending, false);
  delete globalThis.indexedDB;
  delete globalThis.localStorage;
});

test("network failure classification distinguishes auth errors", () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  assert.equal(isNetworkFailure({ message: "Failed to fetch" }), true);
  assert.equal(isNetworkFailure({ name: "AuthRetryableFetchError" }), true);
  assert.equal(isNetworkFailure({ message: "Invalid token" }), false);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  assert.equal(isNetworkFailure(new Error("offline")), true);
});

test("service worker reports actual progress and caches CSS font dependencies", async () => {
  const listeners = {};
  const entries = new Map();
  const cache = {
    match: async (key) => entries.get(typeof key === "string" ? key : new URL(key.url).pathname)?.clone(),
    put: async (key, response) => entries.set(key, response.clone()),
  };
  const fetchMock = async (path) => {
    const url = typeof path === "string" ? path : new URL(path.url).pathname;
    if (url === "/songs/missing") return new Response("missing", { status: 404 });
    if (url.endsWith(".css")) return new Response('body{src:url("../media/font.woff2")}');
    if (["/login", "/songs", "/dashboard"].includes(url)) {
      return new Response('<link href="/_next/static/chunks/site.css">', { headers: { "content-type": "text/html" } });
    }
    return new Response("asset");
  };
  const worker = {
    location: { origin: "https://example.test" },
    clients: { claim() {} },
    skipWaiting() {},
    addEventListener(type, callback) { listeners[type] = callback; },
  };
  vm.runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: worker, fetch: fetchMock, caches: { open: async () => cache, match: cache.match },
    URL, Response, console,
  });
  const messages = [];
  let pending;
  listeners.message({
    data: { type: "PRECACHE_OFFLINE_SHELL" },
    ports: [{ postMessage: (message) => messages.push(message) }],
    waitUntil: (promise) => { pending = promise; },
  });
  await pending;
  const progress = messages.filter((message) => message.type === "PRECACHE_PROGRESS").map((message) => message.progress);
  assert.ok(progress.length > 1);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
  assert.equal(messages.at(-1).type, "PRECACHE_COMPLETE");
  assert.ok(entries.has("/_next/static/media/font.woff2"));
  assert.ok(entries.has("/sound_files/metronome_blip_1.wav"));
  messages.length = 0;
  listeners.message({
    data: { type: "CACHE_OFFLINE_ROUTES", paths: ["/songs/missing"] },
    ports: [{ postMessage: (message) => messages.push(message) }],
    waitUntil: (promise) => { pending = promise; },
  });
  await pending;
  assert.equal(messages.at(-1).type, "PRECACHE_ERROR");
  assert.ok(messages.at(-1).message.includes("/songs/missing"));
});
