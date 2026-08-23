import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const artist = searchParams.get('artist') || '';

  if (!title) {
    return NextResponse.json({ error: 'Track title is required' }, { status: 400 });
  }

  if (!process.env.GITHUB_TOKEN) {
    console.error("FATAL: GITHUB_TOKEN is missing from .env.local");
    return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
  }

  try {
    const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const safeArtist = artist.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    
    // Remember: No parentheses around the extensions to prevent GitHub 422 errors!
    const extensions = 'extension:cho OR extension:pro OR extension:crd OR extension:onsong OR extension:opensong OR extension:xml';

    // 1. Build the Waterfall Array
    const searchStrategies: string[] = [];
    
    if (safeArtist) {
      searchStrategies.push(`"${safeTitle}" "${safeArtist}" ${extensions}`); // Tier 1: Strict
      searchStrategies.push(`"${safeTitle}" ${safeArtist} ${extensions}`);   // Tier 2: Loose
    }
    searchStrategies.push(`"${safeTitle}" ${extensions}`);                   // Tier 3: Broad (Title Only)

    let bestMatchFile = null;

    // 2. Execute the Waterfall Search
    for (const query of searchStrategies) {
      const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(query)}`;
      
      const searchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'OnStage-App-Chord-Engine',
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
        }
      });

      // If GitHub throws a syntax error (422), log it but keep trying the broader queries
      if (!searchRes.ok) {
        console.warn(`GitHub API Warning (${searchRes.status}): Query failed - ${query}`);
        continue; 
      }

      const searchData = await searchRes.json();
      
      // If we found items, lock in the top result and break the loop!
      if (searchData.items && searchData.items.length > 0) {
        bestMatchFile = searchData.items[0];
        console.log(`Match found using query: ${query}`);
        break; 
      }
    }

    // 3. Fallback if all tiers fail
    if (!bestMatchFile) {
      return NextResponse.json({ error: 'No chord files found across any format or query tier' }, { status: 404 });
    }

    // 4. Fetch the raw text of the winning file
    const rawRes = await fetch(bestMatchFile.url, {
      headers: {
        'User-Agent': 'OnStage-App-Chord-Engine',
        'Accept': 'application/vnd.github.v3.raw',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
      }
    });

    if (!rawRes.ok) throw new Error("Failed to download raw chord file");

    const rawText = await rawRes.text();

    return NextResponse.json({ 
      source: `Open Database (${bestMatchFile.path.split('.').pop()?.toUpperCase()})`,
      url: bestMatchFile.html_url,
      rawText: rawText 
    }, { status: 200 });

  } catch (error: any) {
    console.error("Open Database Fetch Error:", error.message);
    return NextResponse.json({ error: 'Failed to extract open source chart' }, { status: 404 });
  }
}