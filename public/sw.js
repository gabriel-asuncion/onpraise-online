const CACHE_NAME = "onpraise-offline-shell-v1";
const CORE_ROUTES = ["/login", "/songs", "/dashboard"];
const SOUND_FILES = [
  "Acapella", "Ad Lib", "Breakdown", "Bridge", "Chorus", "D_All In", "D_Bass",
  "D_Big Ending", "D_Break", "D_Build", "D_Drums In", "D_Drums", "D_Hits",
  "D_Hold", "D_Key Change Down", "D_Key Change Up", "D_Keys", "D_Last Time",
  "D_Slowly Build", "D_Softly", "D_Swell", "D_Worship Freely", "Instrumental",
  "Interlude", "Intro", "Outro", "Post Chorus", "Pre Chorus", "Refrain", "Solo",
  "Turnaround", "Verse 1", "Verse 2", "Verse 3", "Verse 4", "count_1", "count_2",
  "count_3", "count_4", "metronome_bell_1", "metronome_bell_2", "metronome_blip_1",
  "metronome_blip_2", "metronome_block_1", "metronome_block_2", "metronome_glass_1",
  "metronome_glass_2", "tag"
].map((name) => `/sound_files/${encodeURIComponent(name)}.wav`);

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function cacheRoute(cache, path) {
  const response = await fetch(path, { cache: "reload", credentials: "same-origin" });
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`Could not cache offline page ${path}.`);
  }
  const html = await response.clone().text();
  await cache.put(path, response);
  return [...html.matchAll(/\/_next\/static\/[^"'\s\\<>]+?\.(?:js|css)(?:\?[^"'\s\\<>]*)?/g)]
    .map((match) => match[0].replace(/&amp;/g, "&"));
}

async function cacheOfflineRoutes(paths, progress) {
  const cache = await caches.open(CACHE_NAME);
  const assets = new Set([...SOUND_FILES, "/manifest.webmanifest", "/icon-192x192.png", "/icon-512x512.png", "/assets/logo.svg"]);
  for (const path of paths) {
    const chunks = await cacheRoute(cache, path);
    chunks.forEach((chunk) => assets.add(chunk));
  }
  for (const asset of [...assets]) {
    if (!new URL(asset, self.location.origin).pathname.endsWith(".css")) continue;
    let response = await cache.match(asset);
    if (!response) {
      response = await fetch(asset, { cache: "reload", credentials: "same-origin" });
      if (!response.ok || response.redirected) throw new Error(`Could not cache offline asset ${asset}.`);
      await cache.put(asset, response.clone());
    }
    const css = await response.text();
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const url = new URL(match[1], new URL(asset, self.location.origin));
      if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
        assets.add(url.pathname + url.search);
      }
    }
  }
  let completed = 0;
  for (const asset of assets) {
    if (!await cache.match(asset)) {
      const response = await fetch(asset, { cache: "reload", credentials: "same-origin" });
      if (!response.ok || response.redirected) throw new Error(`Could not cache offline asset ${asset}.`);
      await cache.put(asset, response);
    }
    completed += 1;
    progress(Math.round(completed / assets.size * 100));
  }
}

self.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (!port) return;
  if (event.data?.type === "PRECACHE_OFFLINE_SHELL" || event.data?.type === "CACHE_OFFLINE_ROUTES") {
    const paths = event.data.type === "PRECACHE_OFFLINE_SHELL" ? CORE_ROUTES : event.data.paths;
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string" ||
      !/^\/(?:songs\/[a-zA-Z0-9-]+(?:\/edit)?|setlists\/[a-zA-Z0-9-]+\/live)$/.test(path)) &&
      event.data.type !== "PRECACHE_OFFLINE_SHELL") {
      port.postMessage({ type: "PRECACHE_ERROR", message: "Invalid offline route." });
      return;
    }
    event.waitUntil(cacheOfflineRoutes(paths, (progress) => port.postMessage({ type: "PRECACHE_PROGRESS", progress }))
      .then(() => port.postMessage({ type: "PRECACHE_COMPLETE" }))
      .catch((error) => port.postMessage({ type: "PRECACHE_ERROR", message: error.message })));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      if (url.pathname === "/") return Response.redirect(new URL("/songs", url.origin).href, 302);
      const cached = await caches.match(url.pathname);
      if (!cached && /^\/songs\/[^/]+\/edit$/.test(url.pathname)) {
        return Response.redirect(new URL("/songs?offline_edit=1", url.origin).href, 302);
      }
      return cached || new Response("This page is not available offline. Reconnect and download it first.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/sound_files/") || url.pathname === "/assets/logo.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
