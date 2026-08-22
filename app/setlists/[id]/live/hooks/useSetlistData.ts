import { useState, useEffect, useRef } from "react";
import { SongRecord, SetlistTrackItem, ArrangementSection } from "../types/setlist";

export function useSetlistData(setlistId: string, supabase: any) {
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing performance space...");
  const [setlistName, setNewSetlistName] = useState("Live Performance Setlist");
  
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

    async function initializeEnvironment() {
      if (!setlistId) {
        setLoadingStatus("Waiting for Next.js route parameters to hydrate...");
        return;
      }

      try {
        const { data: setlistRow } = await supabase.from("setlists").select("name").eq("id", setlistId).maybeSingle();
        if (setlistRow?.name) setNewSetlistName(setlistRow.name);

        const primaryResponse = await supabase
          .from("setlist_songs")
          .select("id, sequence_order, start_time, custom_key, custom_structure, group_name, group_color, songs (*)")
          .eq("setlist_id", setlistId)
          .order("sequence_order", { ascending: true });

        let rawQueryData: any[] | null = primaryResponse.data;
        if (primaryResponse.error) {
          const fallbackResponse = await supabase
            .from("setlist_songs")
            .select("id, sequence_order, start_time, custom_key, group_name, group_color, songs (*)")
            .eq("setlist_id", setlistId)
            .order("sequence_order", { ascending: true });
          rawQueryData = fallbackResponse.data;
        }

        if (rawQueryData && rawQueryData.length > 0) {
          const formattedTracks = await Promise.all(rawQueryData.map(async (t: any) => {
            const flattenedSongNode = Array.isArray(t.songs) ? t.songs[0] : t.songs;
            if (!flattenedSongNode) return null;

            let loadedStructure = t.custom_structure ? (t.custom_structure as unknown as ArrangementSection[]) : null;
            if (!loadedStructure) {
              const { data: sectionsData } = await supabase
                .from("song_sections")
                .select("id, section_name, content")
                .eq("song_id", flattenedSongNode.id)
                .order("sequence_order", { ascending: true });
              loadedStructure = sectionsData || [];
            }

            return {
              id: t.id,
              sequence_order: t.sequence_order,
              start_time: t.start_time,
              custom_key: t.custom_key || undefined,
              custom_structure: loadedStructure,
              songs: flattenedSongNode as unknown as SongRecord
            };
          }));

          const cleanTracks = formattedTracks.filter(t => t !== null) as SetlistTrackItem[];
          
          if (isCurrentActiveMount) {
            setTracksList(cleanTracks);
            if (cleanTracks.length > 0) {
              const firstItem = cleanTracks[0];
              if (firstItem && firstItem.songs) {
                setActiveSong(firstItem.songs);
                setCurrentTrackIndex(0);
                setActiveDisplayKey(firstItem.custom_key || firstItem.songs.original_key || "G");
                setSections(firstItem.custom_structure || []);
              }
            }
            setLoading(false);
          }
        } else {
          setLoadingStatus("Handshake clean, but this setlist has no songs added to it yet.");
        }
      } catch (err: any) {
        setLoadingStatus(`Critical Crash: ${err?.message || "Check connection parameters"}`);
      }
    }

    initializeEnvironment();
    return () => { isCurrentActiveMount = false; };
  }, [setlistId, supabase]);

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
    loading, loadingStatus, setlistName, tracksList, setTracksList, tracksListRef,
    currentTrackIndex, setCurrentTrackIndex, currentTrackIndexRef,
    activeSong, setActiveSong, activeSongRef,
    sections, setSections, sectionsRef,
    activeDisplayKey, setActiveDisplayKey,
    mountTargetSetlistTrackIndex
  };
}