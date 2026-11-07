import { NextResponse } from 'next/server';
import { requireRateLimitedUser } from "../../../../lib/server/api-access";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || "";

  if (!query || query.length > 150) {
    return NextResponse.json({ error: 'Search query must be between 1 and 150 characters.' }, { status: 400 });
  }

  const access = await requireRateLimitedUser("youtube-search", 30);
  if (!access.ok) return access.response;

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error("YouTube search is not configured.");
      return NextResponse.json({ error: 'YouTube search is temporarily unavailable.' }, { status: 503 });
    }

    try {
      // Queries the YouTube Data API v3 for the top 5 video results
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
          query
        )}&type=video&videoEmbeddable=true&maxResults=5&key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(10_000), cache: "no-store" },
      );
      if (!response.ok) {
        console.error("YouTube search request failed.", { status: response.status });
        return NextResponse.json({ error: 'YouTube search provider is unavailable.' }, { status: 502 });
      }

      const data = await response.json() as { items?: unknown[] };
      return NextResponse.json(data.items || []);
    } catch (error) {
      console.error("YouTube search failed.", error);
      return NextResponse.json({ error: 'YouTube search could not be completed.' }, { status: 502 });
    }
  } finally {
    await access.release();
  }
}