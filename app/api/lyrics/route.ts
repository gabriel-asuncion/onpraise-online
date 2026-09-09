import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'search';
  const query = searchParams.get('q');
  const targetUrl = searchParams.get('url');

  if (!process.env.GENIUS_ACCESS_TOKEN) {
    console.error("🚨 CRITICAL: Missing GENIUS_ACCESS_TOKEN in .env.local");
    return NextResponse.json({ error: "Server missing Genius API token." }, { status: 500 });
  }

  try {
    // ============================================================================
    // STEP 1: SEARCH PHASE
    // ============================================================================
    if (action === 'search') {
      if (!query) return NextResponse.json({ error: "Missing search query" }, { status: 400 });

      const searchRes = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
        headers: { 
          'Authorization': `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`,
          'User-Agent': 'OnPraise-Worship-Matrix/1.0', 
          'Accept': 'application/json'
        }
      });

      if (!searchRes.ok) return NextResponse.json({ error: `Genius API rejected request: ${searchRes.status}` }, { status: 500 });

      const searchData = await searchRes.json();
      const hits = searchData.response?.hits || [];

      if (hits.length === 0) return NextResponse.json({ error: "No songs found on Genius database." }, { status: 404 });

      const results = hits.map((hit: any) => ({
        title: hit.result.title,
        artist: hit.result.primary_artist?.name || "Unknown Artist",
        url: hit.result.url,
        thumbnail: hit.result.song_art_image_thumbnail_url
      }));

      return NextResponse.json({ results });
    }

    // ============================================================================
    // STEP 2: SCRAPE PHASE (WITH PROXY FALLBACK)
    // ============================================================================
    if (action === 'scrape') {
      if (!targetUrl) return NextResponse.json({ error: "Missing URL to scrape" }, { status: 400 });

      // Helper function to fetch HTML, with a toggle to route through a proxy
      const fetchLyricsHtml = async (url: string, useProxy = false) => {
        const fetchUrl = useProxy ? `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` : url;
        const res = await fetch(fetchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        });
        return await res.text();
      };

      // Helper function to parse HTML into plain text
      const extractLyricsFromHtml = (html: string) => {
        const $ = cheerio.load(html);
        let extracted = "";
        $('[data-lyrics-container="true"]').each((i, el) => {
          $(el).find('br').replaceWith('\n');
          extracted += $(el).text() + '\n\n';
        });
        return extracted.trim();
      };

      // 1. Attempt Direct Fetch
      let html = await fetchLyricsHtml(targetUrl, false);
      let rawLyrics = extractLyricsFromHtml(html);

      // 2. Fallback to Proxy if Direct Fetch was blocked by Cloudflare (empty result)
      if (!rawLyrics) {
        console.log("⚠️ Direct scrape blocked by Cloudflare. Attempting proxy fetch...");
        html = await fetchLyricsHtml(targetUrl, true);
        rawLyrics = extractLyricsFromHtml(html);
      }

      // 3. Fatal Error if both fail
      if (!rawLyrics) {
        console.error("🚨 Scraping Failed entirely. Proxy and Direct both blocked.");
        return NextResponse.json({ error: "Found the song, but Cloudflare completely blocked the scraper." }, { status: 500 });
      }

      // ============================================================================
      // STEP 3: METADATA SANITIZER & FORMATTER
      // ============================================================================
      const firstBracketIdx = rawLyrics.indexOf('[');
      if (firstBracketIdx !== -1) rawLyrics = rawLyrics.substring(firstBracketIdx);

      rawLyrics = rawLyrics.replace(/\d*Embed$/, '');
      rawLyrics = rawLyrics.replace(/\n{3,}/g, '\n\n').trim();

      const sectionCounts: Record<string, number> = {};
      
      let formattedLyrics = rawLyrics.replace(/\[(.*?)\]/g, (match, rawName) => {
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

      return NextResponse.json({ lyrics: formattedLyrics, source: targetUrl });
    }

    return NextResponse.json({ error: "Invalid action parameter" }, { status: 400 });

  } catch (err) {
    console.error("🚨 Lyrics Engine Fatal Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}