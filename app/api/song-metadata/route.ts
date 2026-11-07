import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { requireRateLimitedUser } from "../../../lib/server/api-access";

interface SongBpmResult {
  title: string;
  artist: string;
  bpm: number;
  key: string;
  relevance: number;
}

const searchTokens = (value: string) => new Set(
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((token) => token && !["the", "a", "an", "of", "and"].includes(token)),
);

export async function POST(request: Request) {
  let body: { title?: unknown; artist?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const artist = typeof body.artist === "string" ? body.artist.trim().slice(0, 160) : "";
  if (!title || !artist) {
    return NextResponse.json({ error: "Enter both a song title and artist." }, { status: 400 });
  }

  const access = await requireRateLimitedUser("lyrics", 20);
  if (!access.ok) return access.response;

  try {
    const response = await fetch("https://songbpm.com/searches", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "OnPraise-Song-Metadata/1.0",
        Accept: "text/html",
      },
      body: new URLSearchParams({ query: `${title} ${artist}` }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("SongBPM search failed.", { status: response.status });
      return NextResponse.json({ error: "SongBPM could not complete the search." }, { status: 502 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SongBpmResult[] = [];
    const titleTokens = searchTokens(title);
    const artistTokens = searchTokens(artist);

    $('a[href^="/@"]').toArray().forEach((element) => {
      const card = $(element);
      const textFields = card.find("p");
      const resultTitle = textFields.eq(1).text().trim();
      const resultArtist = textFields.eq(0).text().trim();
      const matchedTitleTokens = [...searchTokens(resultTitle)].filter((token) => titleTokens.has(token)).length;
      if (matchedTitleTokens === 0) return;
      const matchedArtistTokens = [...searchTokens(resultArtist)].filter((token) => artistTokens.has(token)).length;
      let key = "";
      let bpm = 0;

      card.find("span").toArray().forEach((span) => {
        const label = $(span).text().trim().toLowerCase();
        const value = $(span).next("span").text().trim();
        if (label === "key") key = value;
        if (label === "bpm") bpm = Number.parseInt(value, 10);
      });

      const normalizedKey = key.replaceAll("♯", "#").replaceAll("♭", "b").split("/")[0].trim();
      if (
        resultTitle &&
        resultArtist &&
        Number.isInteger(bpm) &&
        bpm >= 30 &&
        bpm <= 300 &&
        /^[A-G](?:#|b)?(?:m| minor)?$/i.test(normalizedKey)
      ) {
        results.push({
          title: resultTitle,
          artist: resultArtist,
          bpm,
          key: normalizedKey.replace(/\s+minor$/i, "m"),
          relevance: matchedArtistTokens * 10 + matchedTitleTokens / Math.max(1, titleTokens.size),
        });
      }
    });

    results.sort((left, right) => right.relevance - left.relevance);
    return NextResponse.json({
      results: results.slice(0, 12).map((result) => ({
        title: result.title,
        artist: result.artist,
        bpm: result.bpm,
        key: result.key,
      })),
      source: "SongBPM",
    });
  } catch (error) {
    console.error("SongBPM lookup failed.", error);
    return NextResponse.json({ error: "Could not reach SongBPM. Please try again." }, { status: 502 });
  } finally {
    await access.release();
  }
}
