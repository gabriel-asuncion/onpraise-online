import { NextResponse } from "next/server";
import { extractYouTubeVideoId, getCanonicalYouTubeUrl } from "../../../../lib/youtube-import";
import { requireRateLimitedUser } from "../../../../lib/server/api-access";
import { createClient } from "../../../../utils/supabase/server";

interface DuplicateLookupResult {
  duplicate_found: boolean;
  accessible_song_id: string | null;
  accessible_title: string | null;
  accessible_visibility_scope: "workspace" | "global" | null;
}

function isDuplicateLookupResult(value: unknown): value is DuplicateLookupResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return typeof result.duplicate_found === "boolean" &&
    (result.accessible_song_id === null || typeof result.accessible_song_id === "string") &&
    (result.accessible_title === null || typeof result.accessible_title === "string") &&
    (result.accessible_visibility_scope === null ||
      result.accessible_visibility_scope === "workspace" ||
      result.accessible_visibility_scope === "global");
}

export async function POST(request: Request) {
  let body: { url?: unknown; excludeSongId?: unknown; duplicateOnly?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const inputUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!inputUrl || inputUrl.length > 2048) {
    return NextResponse.json({ error: "Enter a YouTube URL no longer than 2048 characters." }, { status: 400 });
  }
  const videoId = extractYouTubeVideoId(inputUrl);
  if (!videoId) {
    return NextResponse.json({ error: "Enter a valid YouTube video URL." }, { status: 400 });
  }

  const access = await requireRateLimitedUser("youtube-search", 20);
  if (!access.ok) return access.response;

  try {
    const supabase = await createClient();
    const bodyExcludeSongId = typeof body.excludeSongId === "string" ? body.excludeSongId : null;
    if (bodyExcludeSongId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bodyExcludeSongId)) {
      return NextResponse.json({ error: "The excluded song ID is invalid." }, { status: 400 });
    }
    const { data: duplicateData, error: duplicateError } = await supabase.rpc(
      "find_other_songs_by_youtube_video_id",
      { p_video_id: videoId, p_exclude_song_id: bodyExcludeSongId },
    );
    if (duplicateError) {
      if (duplicateError.code === "P0001") {
        return NextResponse.json({ error: "Too many duplicate checks. Please wait a moment and try again." }, { status: 429 });
      }
      console.error("Could not check the imported YouTube video for duplicate songs.", {
        code: duplicateError.code,
        message: duplicateError.message,
      });
      return NextResponse.json({ error: "The duplicate check could not be completed. Please try again." }, { status: 503 });
    }

    const duplicateRows: unknown = duplicateData;
    if (!Array.isArray(duplicateRows) || !duplicateRows.every(isDuplicateLookupResult)) {
      console.error("YouTube duplicate check returned an unexpected response.");
      return NextResponse.json({ error: "The duplicate check returned an invalid response." }, { status: 502 });
    }

    const duplicate = duplicateRows[0];
    if (body.duplicateOnly === true) {
      return NextResponse.json({
        duplicate: duplicate?.duplicate_found ?? false,
        existingSongId: duplicate?.accessible_song_id ?? null,
        existingSongTitle: duplicate?.accessible_title ?? null,
        existingSongVisibility: duplicate?.accessible_visibility_scope ?? null,
      });
    }

    const canonicalUrl = getCanonicalYouTubeUrl(videoId);
    const metadataResponse = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`,
      { signal: AbortSignal.timeout(8_000), cache: "no-store" },
    );
    if (!metadataResponse.ok) {
      return NextResponse.json({ error: "YouTube video details could not be loaded." }, { status: 502 });
    }

    const metadata = await metadataResponse.json() as {
      title?: unknown;
      thumbnail_url?: unknown;
      error?: unknown;
    };
    if (metadata.error || typeof metadata.title !== "string" || !metadata.title.trim()) {
      return NextResponse.json({ error: "YouTube did not return usable video details." }, { status: 502 });
    }

    return NextResponse.json({
      duplicate: duplicate?.duplicate_found ?? false,
      existingSongId: duplicate?.accessible_song_id ?? null,
      existingSongTitle: duplicate?.accessible_title ?? null,
      existingSongVisibility: duplicate?.accessible_visibility_scope ?? null,
      videoId,
      youtubeUrl: canonicalUrl,
      videoTitle: metadata.title.trim().slice(0, 300),
      thumbnailUrl: typeof metadata.thumbnail_url === "string" ? metadata.thumbnail_url : null,
    });
  } catch (error) {
    console.error("YouTube import inspection failed.", error);
    return NextResponse.json({ error: "The YouTube video could not be inspected. Please try again." }, { status: 502 });
  } finally {
    await access.release();
  }
}
