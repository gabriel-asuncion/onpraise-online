export async function cacheOfflineRoutes(
  paths: string[],
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (!("serviceWorker" in navigator)) throw new Error("Offline storage is not supported by this browser.");
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("The offline service worker did not start. Reload and try again.")), 15_000);
    }),
  ]);
  const worker = registration.active || navigator.serviceWorker.controller;
  if (!worker) throw new Error("The offline service worker is not active yet. Reload and try again.");
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("Preparing offline files timed out. Check your connection and try again."));
    }, 120_000);
    channel.port1.onmessage = (event: MessageEvent<{ type: string; progress?: number; message?: string }>) => {
      if (event.data.type === "PRECACHE_PROGRESS" && typeof event.data.progress === "number") {
        onProgress?.(event.data.progress);
      } else if (event.data.type === "PRECACHE_COMPLETE") {
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve();
      } else if (event.data.type === "PRECACHE_ERROR") {
        window.clearTimeout(timeout);
        channel.port1.close();
        reject(new Error(event.data.message || "Could not prepare offline files."));
      }
    };
    worker.postMessage(
      paths.length ? { type: "CACHE_OFFLINE_ROUTES", paths } : { type: "PRECACHE_OFFLINE_SHELL" },
      [channel.port2],
    );
  });
}
