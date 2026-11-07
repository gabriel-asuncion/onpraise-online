import type { createClient } from "../../../../../utils/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;
type SongSection = {
  id: string;
  song_id: string;
  section_name: string;
  content: string | null;
};

export async function loadSongSectionsBySongId(
  supabase: SupabaseClient,
  songIds: string[],
): Promise<Map<string, SongSection[]>> {
  const sectionsBySongId = new Map<string, SongSection[]>();
  const uniqueSongIds = [...new Set(songIds)];
  if (uniqueSongIds.length === 0) return sectionsBySongId;

  const { data, error } = await supabase
    .from("song_sections")
    .select("id, song_id, section_name, content")
    .in("song_id", uniqueSongIds)
    .order("sequence_order", { ascending: true });

  if (error) throw error;
  for (const section of data || []) {
    const songSections = sectionsBySongId.get(section.song_id) || [];
    songSections.push(section);
    sectionsBySongId.set(section.song_id, songSections);
  }
  return sectionsBySongId;
}
