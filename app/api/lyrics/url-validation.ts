const GENIUS_HOSTS = new Set(["genius.com", "www.genius.com"]);
const GENIUS_SONG_PATH = /^\/[a-z0-9][a-z0-9-]*-lyrics\/?$/i;

export function parseAllowedGeniusSongUrl(value: string): URL | null {
  if (value.length > 2048) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !GENIUS_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !GENIUS_SONG_PATH.test(url.pathname)
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export function resolveAllowedGeniusRedirect(location: string, currentUrl: URL): URL | null {
  try {
    return parseAllowedGeniusSongUrl(new URL(location, currentUrl).toString());
  } catch {
    return null;
  }
}
