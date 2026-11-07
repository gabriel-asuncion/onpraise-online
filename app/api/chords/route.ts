import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "../../../lib/server/api-access";

interface GitHubCodeResult {
  url?: string;
  html_url?: string;
  path?: string;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() || "";
  const artist = searchParams.get("artist")?.trim() || "";
  if (!title || title.length > 120 || artist.length > 120) {
    return NextResponse.json(
      { error: "A title of at most 120 characters and artist of at most 120 characters are required." },
      { status: 400 },
    );
  }

  const access = await requireRateLimitedUser("chord-search", 15);
  if (!access.ok) return access.response;

  try {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error("Chord search is not configured.");
      return NextResponse.json({ error: "Chord search is temporarily unavailable." }, { status: 503 });
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    const safeArtist = artist.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (!safeTitle) {
      return NextResponse.json({ error: "The title must contain searchable characters." }, { status: 400 });
    }

    const extensions = "extension:cho OR extension:pro OR extension:crd OR extension:onsong OR extension:opensong OR extension:xml";
    const searchStrategies: string[] = [];
    if (safeArtist) {
      searchStrategies.push(`"${safeTitle}" "${safeArtist}" ${extensions}`);
      searchStrategies.push(`"${safeTitle}" ${safeArtist} ${extensions}`);
    }
    searchStrategies.push(`"${safeTitle}" ${extensions}`);

    let bestMatchFile: GitHubCodeResult | null = null;
    const upstreamSignal = AbortSignal.timeout(10_000);
    for (const query of searchStrategies) {
      const searchRes = await fetch(
        `https://api.github.com/search/code?q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent": "OnStage-App-Chord-Engine",
            Accept: "application/vnd.github.v3+json",
            Authorization: `Bearer ${githubToken}`,
          },
          signal: upstreamSignal,
          cache: "no-store",
        },
      );

      if (searchRes.status === 401 || searchRes.status === 403 || searchRes.status === 429) {
        console.error("GitHub code search rejected the request.", { status: searchRes.status });
        return NextResponse.json({ error: "Chord search provider is unavailable." }, { status: 502 });
      }
      if (!searchRes.ok) {
        console.warn("GitHub code search attempt failed.", { status: searchRes.status });
        continue;
      }

      const searchData = await searchRes.json() as { items?: GitHubCodeResult[] };
      bestMatchFile = searchData.items?.[0] || null;
      if (bestMatchFile) break;
    }

    if (!bestMatchFile?.url || !bestMatchFile.path || !bestMatchFile.html_url) {
      return NextResponse.json({ error: "No chord files were found." }, { status: 404 });
    }

    const rawUrl = new URL(bestMatchFile.url);
    if (rawUrl.protocol !== "https:" || rawUrl.hostname !== "api.github.com") {
      return NextResponse.json({ error: "Chord search provider returned an invalid result." }, { status: 502 });
    }

    const rawRes = await fetch(rawUrl, {
      headers: {
        "User-Agent": "OnStage-App-Chord-Engine",
        Accept: "application/vnd.github.v3.raw",
        Authorization: `Bearer ${githubToken}`,
      },
      signal: upstreamSignal,
      cache: "no-store",
    });
    if (!rawRes.ok) {
      console.error("GitHub chord file download failed.", { status: rawRes.status });
      return NextResponse.json({ error: "The chord file could not be downloaded." }, { status: 502 });
    }

    const rawText = await readLimitedText(rawRes, 512 * 1024);
    if (rawText === null) {
      return NextResponse.json({ error: "The chord file is too large to process." }, { status: 502 });
    }

    const extension = bestMatchFile.path.split(".").pop()?.toUpperCase() || "UNKNOWN";
    return NextResponse.json({
      source: `Open Database (${extension})`,
      url: bestMatchFile.html_url,
      rawText,
    });
  } catch (error) {
    console.error("Chord search failed.", error);
    return NextResponse.json({ error: "Chord search could not be completed." }, { status: 502 });
  } finally {
    await access.release();
  }
}
