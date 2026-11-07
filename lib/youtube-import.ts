const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function extractYouTubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  let videoId: string | null = null;
  if (url.hostname.endsWith("youtu.be")) {
    videoId = url.pathname.split("/").filter(Boolean)[0] || null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    const pathMatch = url.pathname.match(/^\/(?:shorts|embed|live|v|u\/[^/]+)\/([^/]+)/);
    videoId = pathMatch?.[1] || null;
  }

  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function getCanonicalYouTubeUrl(videoId: string): string {
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

const NON_TITLE_LABELS = [
  "official music video",
  "official lyrics video",
  "official lyric video",
  "acoustic version",
  "official audio",
  "lyrics video",
  "lyric video",
  "worship cover",
  "live performance",
  "live version",
  "live worship",
  "bass boosted",
  "instrumental",
  "karaoke",
  "reupload",
  "official video",
  "cover",
  "lyrics",
  "live",
  "acoustic",
  "4k",
  "hd",
];

function stripDecorativeLabels(value: string): string {
  let cleaned = value.trim();
  for (const label of NON_TITLE_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned
      .replace(new RegExp(`\\s*[([]\\s*${escaped}\\s*[)\\]]`, "ig"), "")
      .replace(new RegExp(`\\s*[-|–—:]\\s*${escaped}\\s*$`, "ig"), "");
  }
  return cleaned
    .replace(/^\s*(?:official|lyrics?)\s*[:|–—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s|–—-]+|[\s|–—-]+$/g, "")
    .trim();
}

export interface YouTubeTitleSuggestion {
  title: string;
  artist: string;
  versionNote: string | null;
}

export function suggestSongFromYouTubeTitle(rawTitle: string): YouTubeTitleSuggestion {
  const raw = rawTitle.trim();
  const isCover = /\bcover\b/i.test(raw);
  const versionNote = /\blive\b/i.test(raw)
    ? "Live version"
    : /\bacoustic\b/i.test(raw)
      ? "Acoustic version"
      : isCover
        ? "Cover version"
        : null;

  let title = raw;
  let artist = "";
  const cleanedRaw = stripDecorativeLabels(raw);
  const coverMatch = raw.match(/^(.*?)\s*\(\s*(?:worship\s+)?cover\b.*?\)\s*$/i);
  if (coverMatch) {
    title = coverMatch[1];
  } else {
    const pipeParts = raw.split("|").map((part) => part.trim()).filter(Boolean);
    if (pipeParts.length >= 3 && /\b(?:live|worship|lyrics?|official|audio|video)\b/i.test(pipeParts.slice(2).join(" "))) {
      title = pipeParts[0];
      artist = isCover ? "" : pipeParts[1];
    } else {
      const hyphenParts = cleanedRaw.split(/\s+[-–—]\s+/);
      if (hyphenParts.length === 2) {
        artist = isCover ? "" : hyphenParts[0];
        title = hyphenParts[1];
      } else {
        title = cleanedRaw || raw;
      }
    }
  }

  title = stripDecorativeLabels(title) || raw;
  artist = stripDecorativeLabels(artist);

  return {
    title: title || raw,
    artist: artist || "Unknown Artist",
    versionNote,
  };
}
