import { useState, useEffect, useRef } from "react";
import { SongRecord, SetlistTrackItem, ArrangementSection } from "../types/setlist";
import { createClient } from "../../../../../utils/supabase/client";

type SetlistSongRow = {
  id: string;
  sequence_order: number;
  start_time: string;
  custom_key: string | null;
  custom_structure?: ArrangementSection[] | null;
  songs: SongRecord | SongRecord[] | null;
};

type SetlistLoadState = "loading" | "ready" | "empty" | "error";

export function useSetlistData(setlistId: string, supabase: ReturnType<typeof createClient>) {
  const [loadState, setLoadState] = useState<SetlistLoadState>("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [loadedSetlistId, setLoadedSetlistId] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState("Initializing performance space...");
  const [setlistName, setNewSetlistName] = useState("Live Performance Setlist");
  const [setlistEventName, setSetlistEventName] = useState("Event");
  const [setlistTeamId, setSetlistTeamId] = useState<string | null>(null);
  const [setlistTrackTitles, setSetlistTrackTitles] = useState<string[]>([]);
  
  const [tracksList, setTracksList] = useState<SetlistTrackItem[]>([]);
  const tracksListRef = useRef<SetlistTrackItem[]>([]);
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const currentTrackIndexRef = useRef<number>(0);
  
  const [activeSong, setActiveSong] = useState<SongRecord | null>(null);
  const activeSongRef = useRef<SongRecord | null>(null);
  
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const sectionsRef = useRef<ArrangementSection[]>([]);
  
  const [activeDisplayKey, setActiveDisplayKey] = useState<string>("G");

  // Keep refs perfectly synced for the hardware clock
  useEffect(() => { tracksListRef.current = tracksList; }, [tracksList]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { activeSongRef.current = activeSong; }, [activeSong]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  useEffect(() => {
    let isCurrentActiveMount = true;
    setLoadState("loading");
    setLoadingStatus("Initializing performance space...");
    setLoadedSetlistId(null);
    setNewSetlistName("Live Performance Setlist");
    setSetlistTeamId(null);
    setSetlistEventName("Event");
    setSetlistTrackTitles([]);
    setTracksList([]);
    tracksListRef.current = [];
    setCurrentTrackIndex(0);
    currentTrackIndexRef.current = 0;
    setActiveSong(null);
    activeSongRef.current = null;
    setSections([]);
    sectionsRef.current = [];
    setActiveDisplayKey("G");

    async function initializeEnvironment() {
      if (!setlistId) {
        setLoadingStatus("Waiting for Next.js route parameters to hydrate...");
        return;
      }

      try {
        const { data: setlistRow } = await supabase.from("setlists").select("name, event_id").eq("id", setlistId).maybeSingle();
        if (!isCurrentActiveMount) return;
        if (setlistRow?.name) setNewSetlistName(setlistRow.name);
        if (setlistRow?.event_id) {
          const { data: eventRow } = await supabase.from("events").select("team_id, title").eq("id", setlistRow.event_id).maybeSingle();
          if (isCurrentActiveMount && eventRow) {
            if (eventRow.team_id) setSetlistTeamId(eventRow.team_id);
            if (eventRow.title) setSetlistEventName(eventRow.title);
          }
        }

        const primaryResponse = await supabase
          .from("setlist_songs")
          .select("id, sequence_order, start_time, custom_key, custom_structure, group_name, group_color, songs (*)")
          .eq("setlist_id", setlistId)
          .order("sequence_order", { ascending: true });

        let rawQueryData = primaryResponse.data as SetlistSongRow[] | null;
        if (primaryResponse.error) {
          const fallbackResponse = await supabase
            .from("setlist_songs")
            .select("id, sequence_order, start_time, custom_key, group_name, group_color, songs (*)")
            .eq("setlist_id", setlistId)
            .order("sequence_order", { ascending: true });
          if (fallbackResponse.error) throw fallbackResponse.error;
          rawQueryData = fallbackResponse.data as SetlistSongRow[] | null;
        }

        if (rawQueryData && rawQueryData.length > 0) {
          const trackTitles = rawQueryData.flatMap((row) => {
            const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
            return song?.title ? [song.title] : [];
          });
          const formattedTracks = await Promise.all(rawQueryData.map(async (t) => {
            const flattenedSongNode = Array.isArray(t.songs) ? t.songs[0] : t.songs;
            if (!flattenedSongNode) return null;

            const { data: sectionsData, error: sectionsError } = await supabase
              .from("song_sections")
              .select("id, section_name, content")
              .eq("song_id", flattenedSongNode.id)
              .order("sequence_order", { ascending: true });
            if (sectionsError) throw sectionsError;

            const songSections = sectionsData || [];
            const defaultStructure = Array.isArray(flattenedSongNode.default_structure)
              ? flattenedSongNode.default_structure
              : [];
            const originalStructure = defaultStructure.length > 0
              ? defaultStructure.map((section, index) => {
                  const matchingSection = songSections.find(
                    (item) => item.section_name === section.section_name
                  );
                  return {
                    id: section.id || matchingSection?.id || `default-${index}`,
                    section_name: section.section_name,
                    content: section.content || matchingSection?.content || "",
                  };
                })
              : songSections.map((section) => ({
                  id: section.id,
                  section_name: section.section_name,
                  content: section.content || "",
                }));
            const loadedStructure = t.custom_structure ?? originalStructure;

            return {
              id: t.id,
              sequence_order: t.sequence_order,
              start_time: t.start_time,
              custom_key: t.custom_key || undefined,
              custom_structure: loadedStructure,
              original_structure: originalStructure,
              songs: flattenedSongNode as unknown as SongRecord
            };
          }));

          const cleanTracks = formattedTracks.filter(t => t !== null) as SetlistTrackItem[];
          
          if (isCurrentActiveMount) {
            setLoadedSetlistId(setlistId);
            setSetlistTrackTitles(trackTitles);
            setTracksList(cleanTracks);
            tracksListRef.current = cleanTracks;
            const firstItem = cleanTracks[0];
            const firstSong = firstItem?.songs;
            if (firstItem && firstSong) {
              setActiveSong(firstSong);
              activeSongRef.current = firstSong;
              setCurrentTrackIndex(0);
              currentTrackIndexRef.current = 0;
              setActiveDisplayKey(firstItem.custom_key || firstSong.original_key || "G");
              const initialSections = firstItem.custom_structure || [];
              setSections(initialSections);
              sectionsRef.current = initialSections;
              setLoadState("ready");
            } else {
              setLoadingStatus("No songs are available for this setlist.");
              setLoadState("empty");
            }
          }
        } else {
          if (isCurrentActiveMount) {
            setLoadingStatus("This setlist has no songs yet.");
            setLoadedSetlistId(setlistId);
            setLoadState("empty");
          }
        }
      } catch (err: any) {
        if (isCurrentActiveMount) {
          setLoadingStatus(err instanceof Error ? err.message : "Unable to load this setlist. Check your connection and try again.");
          setLoadedSetlistId(setlistId);
          setLoadState("error");
        }
      }
    }

    initializeEnvironment();
    return () => { isCurrentActiveMount = false; };
  }, [setlistId, retryCount, supabase]);

  // ✅ SURGICAL FIX: Return the newly mounted sections directly so the caller doesn't have to wait for React state!
  const mountTargetSetlistTrackIndex = (trackIndex: number) => {
    const targetTrackItem = tracksListRef.current[trackIndex];
    if (!targetTrackItem || !targetTrackItem.songs) return null;

    setActiveSong(targetTrackItem.songs);
    activeSongRef.current = targetTrackItem.songs; 

    setCurrentTrackIndex(trackIndex);
    currentTrackIndexRef.current = trackIndex; 

    setActiveDisplayKey(targetTrackItem.custom_key || targetTrackItem.songs.original_key || "G");

    const newSections = targetTrackItem.custom_structure || [];
    setSections(newSections);
    sectionsRef.current = newSections; 

    return newSections; 
  };

  return {
    loading: loadState === "loading" || loadedSetlistId !== setlistId,
    loadState,
    loadingStatus,
    retryLoad: () => setRetryCount((count) => count + 1),
    setlistName,
    setlistEventName,
    setlistTeamId,
    setlistTrackTitles,
    tracksList,
    setTracksList,
    tracksListRef,
    currentTrackIndex, setCurrentTrackIndex, currentTrackIndexRef,
    activeSong, setActiveSong, activeSongRef,
    sections, setSections, sectionsRef,
    activeDisplayKey, setActiveDisplayKey,
    mountTargetSetlistTrackIndex
  };
}