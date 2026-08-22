import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  const API_KEY = process.env.YOUTUBE_API_KEY;

  try {
    // Queries the YouTube Data API v3 for the top 5 video results
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        query
      )}&type=video&videoEmbeddable=true&maxResults=5&key=${API_KEY}`
    );
    
    const data = await res.json();
    return NextResponse.json(data.items || []);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch from YouTube' }, { status: 500 });
  }
}