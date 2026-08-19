import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) return NextResponse.json({ error: "Missing search query" }, { status: 400 });

  if (!process.env.GENIUS_ACCESS_TOKEN) {
    console.error("🚨 CRITICAL: Missing GENIUS_ACCESS_TOKEN in .env.local");
    return NextResponse.json({ error: "Server missing Genius API token." }, { status: 500 });
  }

  try {
    // 1. Ping the official Genius API
    const searchRes = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
      headers: { 
        'Authorization': `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`,
        'User-Agent': 'OnPraise-Worship-Matrix/1.0', 
        'Accept': 'application/json'
      }
    });

    if (!searchRes.ok) return NextResponse.json({ error: `Genius API rejected request: ${searchRes.status}` }, { status: 500 });

    const searchData = await searchRes.json();
    const firstHit = searchData.response?.hits?.[0]?.result;

    if (!firstHit) return NextResponse.json({ error: "No song found on Genius database." }, { status: 404 });

    // 2. Fetch the raw HTML of the actual lyrics page
    const pageRes = await fetch(firstHit.url);
    const html = await pageRes.text();
    const $ = cheerio.load(html);

    let rawLyrics = "";
    
    // 3. Extract text from the Genius containers
    $('[data-lyrics-container="true"]').each((i, el) => {
      $(el).find('br').replaceWith('\n');
      rawLyrics += $(el).text() + '\n\n';
    });

    if (!rawLyrics.trim()) return NextResponse.json({ error: "Found the song, but failed to scrape the lyrics text." }, { status: 500 });

    // ============================================================================
    // ✅ SURGICAL ADDITION: THE METADATA SANITIZER & FORMATTER PIPELINE
    // ============================================================================
    
    // A. Strip prepended Genius cruft (e.g. "10 ContributorsWASHED Lyrics")
    const firstBracketIdx = rawLyrics.indexOf('[');
    if (firstBracketIdx !== -1) {
      rawLyrics = rawLyrics.substring(firstBracketIdx);
    }

    // B. Strip trailing Genius cruft (e.g. "14Embed")
    rawLyrics = rawLyrics.replace(/\d*Embed$/, '');

    // C. Condense extreme line breaks into a single blank line between sections
    rawLyrics = rawLyrics.replace(/\n{3,}/g, '\n\n').trim();

    // D. Section Standardization & Auto-Numbering Engine
    const sectionCounts: Record<string, number> = {};
    
    let formattedLyrics = rawLyrics.replace(/\[(.*?)\]/g, (match, rawName) => {
      const lowerName = rawName.toLowerCase();
      let mappedName = "UNKNOWN_SECTION";

      // Match against the OnPraise SECTION_BASE_CATALOG
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

      // Increment the counter for this specific mapped section type
      sectionCounts[mappedName] = (sectionCounts[mappedName] || 0) + 1;
      
      // ✅ SURGICAL FIX: Return JUST the tag. 
      // Do not hardcode (M: 4...) here, or it will overwrite existing songs!
      return `[${mappedName} ${sectionCounts[mappedName]}]`;
    });

    // 4. Return the beautifully formatted text to the frontend
    return NextResponse.json({ lyrics: formattedLyrics, source: firstHit.url });
    
  } catch (err) {
    console.error("🚨 Lyrics Engine Fatal Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}