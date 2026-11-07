import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { requireRateLimitedUser } from "../../../lib/server/api-access";
import { parseAllowedGeniusSongUrl, resolveAllowedGeniusRedirect } from "./url-validation";

const MAX_SEARCH_LENGTH = 160;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

interface GeniusSearchHit {
  result?: {
    title?: string;
    url?: string;
    song_art_image_thumbnail_url?: string;
    primary_artist?: { name?: string };
  };
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function fetchGeniusSongHtml(startUrl: URL): Promise<Response | null> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= 2; redirectCount++) {
    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "OnPraise-Worship-Matrix/1.0",
        Accept: "text/html",
      },
      redirect: "manual",
      signal,
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 2) return null;
      const nextUrl = resolveAllowedGeniusRedirect(location, currentUrl);
      if (!nextUrl) return null;
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
      return null;
    }
    return response;
  }

  return null;
}

function extractLyricsFromHtml(html: string): string {
  const $ = cheerio.load(html);
  let extracted = "";
  $('[data-lyrics-container="true"]').each((_index, element) => {
    $(element).find("br").replaceWith("\n");
    extracted += `${$(element).text()}\n\n`;
  });
  return extracted.trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "search";
  const query = searchParams.get("q")?.trim() || "";
  const targetUrlValue = searchParams.get("url") || "";

  if (action !== "search" && action !== "scrape") {
    return NextResponse.json({ error: "Invalid action parameter." }, { status: 400 });
  }
  if (action === "search" && (!query || query.length > MAX_SEARCH_LENGTH)) {
    return NextResponse.json({ error: "Search query must be between 1 and 160 characters." }, { status: 400 });
  }
  const targetUrl = action === "scrape" ? parseAllowedGeniusSongUrl(targetUrlValue) : null;
  if (action === "scrape" && !targetUrl) {
    return NextResponse.json({ error: "A valid Genius song URL is required." }, { status: 400 });
  }

  const access = await requireRateLimitedUser("lyrics", 20);
  if (!access.ok) return access.response;

  try {
    const token = process.env.GENIUS_ACCESS_TOKEN;
    if (!token) {
      console.error("Lyrics API is not configured.");
      return NextResponse.json({ error: "Lyrics search is temporarily unavailable." }, { status: 503 });
    }

    if (action === "search") {
    try {
      const response = await fetch(
        `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "OnPraise-Worship-Matrix/1.0",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        console.error("Genius search request failed.", { status: response.status });
        return NextResponse.json({ error: "Lyrics search provider is unavailable." }, { status: 502 });
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        return NextResponse.json({ error: "Lyrics search provider returned an invalid response." }, { status: 502 });
      }

      const body = await readLimitedText(response, MAX_RESPONSE_BYTES);
      if (!body) return NextResponse.json({ error: "Lyrics search provider returned an oversized response." }, { status: 502 });

      const data = JSON.parse(body) as { response?: { hits?: GeniusSearchHit[] } };
      const hits = data.response?.hits || [];
      const results = hits.flatMap(({ result }) => {
        if (!result?.title || !result.url) return [];
        return [{
          title: result.title,
          artist: result.primary_artist?.name || "Unknown Artist",
          url: result.url,
          thumbnail: result.song_art_image_thumbnail_url,
        }];
      });

      if (results.length === 0) {
        return NextResponse.json({ error: "No songs found on Genius." }, { status: 404 });
      }
      return NextResponse.json({ results });
    } catch (error) {
      console.error("Genius search failed.", error);
      return NextResponse.json({ error: "Lyrics search could not be completed." }, { status: 502 });
    }
    }

    try {
      const response = await fetchGeniusSongHtml(targetUrl!);
      if (!response) {
        return NextResponse.json({ error: "Genius did not return an allowed song page." }, { status: 502 });
      }
      const html = await readLimitedText(response, MAX_RESPONSE_BYTES);
      if (!html) {
        return NextResponse.json({ error: "Genius returned an oversized page." }, { status: 502 });
      }
      let rawLyrics = extractLyricsFromHtml(html);
      if (!rawLyrics) {
        return NextResponse.json({ error: "Lyrics were not found on that Genius page." }, { status: 404 });
      }

      const firstBracketIdx = rawLyrics.indexOf("[");
      if (firstBracketIdx !== -1) rawLyrics = rawLyrics.substring(firstBracketIdx);
      rawLyrics = rawLyrics.replace(/\d*Embed$/, "").replace(/\n{3,}/g, "\n\n").trim();

      const sectionCounts: Record<string, number> = {};
      const formattedLyrics = rawLyrics.replace(/\[(.*?)\]/g, (_match, rawName: string) => {
      const lowerName = rawName.toLowerCase();
      let mappedName = "UNKNOWN_SECTION";
      if (lowerName.includes("verse")) mappedName = "Verse";
      else if (lowerName.includes("pre-chorus") || lowerName.includes("pre chorus")) mappedName = "Pre-Chorus";
      else if (lowerName.includes("post-chorus") || lowerName.includes("post chorus")) mappedName = "Post-Chorus";
      else if (lowerName.includes("chorus")) mappedName = "Chorus";
      else if (lowerName.includes("bridge")) mappedName = "Bridge";
      else if (lowerName.includes("interlude")) mappedName = "Interlude";
      else if (lowerName.includes("instrumental") || lowerName.includes("solo")) mappedName = "Instrumental";
      else if (lowerName.includes("intro")) mappedName = "Intro";
      else if (lowerName.includes("outro")) mappedName = "Outro";
      else if (lowerName.includes("tag")) mappedName = "Tag";
      else if (lowerName.includes("refrain")) mappedName = "Refrain";
      else if (lowerName.includes("ad lib") || lowerName.includes("ad-lib")) mappedName = "Ad Lib";

        sectionCounts[mappedName] = (sectionCounts[mappedName] || 0) + 1;
        return `[${mappedName} ${sectionCounts[mappedName]}]`;
      });

      return NextResponse.json({ lyrics: formattedLyrics, source: targetUrl!.toString() });
    } catch (error) {
      console.error("Genius lyrics fetch failed.", error);
      return NextResponse.json({ error: "Lyrics could not be retrieved." }, { status: 502 });
    }
  } finally {
    await access.release();
  }
}
