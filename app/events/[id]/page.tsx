"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import GlobalLoader from '../../../components/GlobalLoader';
import { 
  getAllSongs 
} from "../../../utils/supabase/actions";

interface DBProfile { id: string; full_name: string; email: string; avatar_url?: string; ministries: string[]; unavailable_dates?: string[]; }
interface MemberRow { id: string; role: string; user_id: string; profiles: DBProfile | null; isNew?: boolean; }
interface SetlistSongItem { 
  id: string; 
  sequence_order: number; 
  start_time: string; 
  target_key?: string;
  parent_group?: string | null;
  group_name?: string | null; 
  parent_color?: string | null;
  group_color?: string | null;
  assigned_user_ids?: string[] | null; 
  songs: any | null; 
}

const Blob = ({ 
  color, w, hasEyes, animClass, delay, top, left, right, bottom 
}: { 
  color: string, w: string, hasEyes: boolean, animClass: string, delay: string, top?: string, left?: string, right?: string, bottom?: string 
}) => (
  <div className={`absolute z-0 opacity-70 ${animClass}`} style={{ animationDelay: delay, top, left, right, bottom, width: w }}>
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <path fill={color} d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.5,-41.1C85.9,-26.9,92.5,-12.4,90.4,1.4C88.4,15.2,77.7,28.3,67.6,40.4C57.5,52.5,48,63.6,35.5,70.5C23,77.4,7.5,80.1,-6.9,78C-21.3,75.9,-34.5,69.1,-46.8,60.8C-59.1,52.5,-70.5,42.7,-78.6,30.3C-86.7,17.9,-91.5,2.9,-88.4,-10.8C-85.3,-24.5,-74.3,-36.9,-62,-46.1C-49.7,-55.3,-36.1,-61.3,-23.1,-68.2C-10.1,-75.1,2.3,-82.9,16.4,-82.6C30.5,-82.3,46,-73.9,45.7,-76.3Z" transform="translate(100 100)" />
      {hasEyes && (
        <><circle cx="85" cy="90" r="8" fill="white" className="animate-blink" /><circle cx="115" cy="90" r="8" fill="white" className="animate-blink" /></>
      )}
    </svg>
  </div>
);

interface EventItem { id: string; title: string; event_date: string; description: string; service_type?: string; team_id?: string; }
interface SetlistMetaItem { id: string; name: string; event_id: string; }

const GRID_CARDS = ["VAST", "Pastor", "Dancer", "Musician", "Backup", "Music Leader"];
const ACTIVE_SERVICE_DATE = "2026-06-12";
const SERVICE_TYPE_PRESETS = ["Midweek Service", "Divine Service", "Camp", "Concert", "Fellowship"];

const COLOR_PALETTES = [
  { id: "zinc", border: "border-outline-variant/30", bg: "bg-surface-container", text: "text-on-surface-variant", dot: "bg-outline" },
  { id: "blue", border: "border-primary/30", bg: "bg-primary-container/20", text: "text-primary", dot: "bg-primary" },
  { id: "emerald", border: "border-[#10b981]/30", bg: "bg-[#10b981]/10", text: "text-[#10b981]", dot: "bg-[#10b981]" },
  { id: "purple", border: "border-[#8b5cf6]/30", bg: "bg-[#8b5cf6]/10", text: "text-[#8b5cf6]", dot: "bg-[#8b5cf6]" },
  { id: "amber", border: "border-[#f59e0b]/30", bg: "bg-[#f59e0b]/10", text: "text-[#f59e0b]", dot: "bg-[#f59e0b]" },
  { id: "rose", border: "border-[#f43f5e]/30", bg: "bg-[#f43f5e]/10", text: "text-[#f43f5e]", dot: "bg-[#f43f5e]" },
  { id: "indigo", border: "border-[#6366f1]/30", bg: "bg-[#6366f1]/10", text: "text-[#6366f1]", dot: "bg-[#6366f1]" },
  { id: "cyan", border: "border-secondary/30", bg: "bg-secondary-container/20", text: "text-secondary", dot: "bg-secondary" }
];

function formatTo12Hour(timeStr: string = "00:00") {
  if (!timeStr) return "09:00 AM";
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12; hour = hour ? hour : 12;
  return `${hour}:${minStr || '00'} ${ampm}`;
}

// YT Extractor Helper
function extractYouTubeID(url: string) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export default function EventCockpitPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const eventId = params?.id as string; 
  const { activeRole, userTeamId } = useEngine();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [team, setTeam] = useState<any>(null);
  
  const [roster, setRoster] = useState<MemberRow[]>([]);
  const [stagedRoster, setStagedRoster] = useState<MemberRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [eventSetlists, setEventSetlists] = useState<SetlistMetaItem[]>([]);
  const [allSetlistSongsMap, setAllSetlistSongsMap] = useState<Record<string, SetlistSongItem[]>>({});
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>("");

  const [setlistSongs, setSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [stagedSetlistSongs, setStagedSetlistSongs] = useState<SetlistSongItem[]>([]); 
  
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);

  const [viewSubScreen, setViewSubScreen] = useState<"matrix" | "setlists_list" | "songs_view">("setlists_list");
  const [isEditingSetlist, setIsEditingSetlist] = useState(false); 
  const [selectedNewSongId, setSelectedNewSongId] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [isSongDropdownOpen, setIsSongDropdownOpen] = useState(false);
  const [songSearchQuery, setSongSearchQuery] = useState("");

  const [draggedSongIndex, setDraggedSongIndex] = useState<number | null>(null);
  const [customGroupName, setCustomGroupName] = useState("");
  const [selectedGroupColor, setSelectedGroupColor] = useState("blue");

  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [matrixFilter, setMatrixFilter] = useState<string>("All");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDockOpen, setIsDockOpen] = useState(false); 

  const [isCreateSetlistOpen, setIsCreateSetlistOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState("");

  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editServiceType, setEditServiceType] = useState("Divine Service");
  const [editDesc, setEditDesc] = useState("");
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [copiedSetlistId, setCopiedSetlistId] = useState<string | null>(null);

  async function syncRosterUI(currentTeamId: string, allProfilesData: DBProfile[]) {
    const { data: rawRoster, error } = await supabase
      .from("event_rosters") 
      .select("id, role, user_id")
      .eq("event_id", eventId);

    if (error) return;
    const mappedRoster = (rawRoster || []).map(row => {
      const p = allProfilesData.find(profile => profile.id === row.user_id);
      return { ...row, profiles: p || null };
    });
    setRoster(mappedRoster as MemberRow[]);
    setStagedRoster(mappedRoster as MemberRow[]); 
    setHasChanges(false);
  }

  async function fetchEventSetlists(targetEventId: string) {
    const { data: setlists, error } = await supabase
      .from("setlists")
      .select("id, name, event_id")
      .eq("event_id", targetEventId);

    if (!error && setlists && setlists.length > 0) {
      setEventSetlists(setlists);
      const slIds = setlists.map(s => s.id);
      
      const { data: slSongs } = await supabase
        .from("setlist_songs")
        .select(`id, setlist_id, sequence_order, start_time, group_name, assigned_user_ids, group_color, parent_color, songs (*)`)
        .in("setlist_id", slIds)
        .order("sequence_order", { ascending: true });
        
      const grouped: Record<string, SetlistSongItem[]> = {};
      slIds.forEach(id => grouped[id] = []);
      
      (slSongs || []).forEach(row => {
        let rawGroup = row.group_name || null;
        let pName = null;
        let cName = rawGroup;
        if (rawGroup && rawGroup.includes(" >> ")) {
          const parts = row.group_name.split(" >> ");
          pName = parts[0]; cName = parts[1];
        }
        const item = {
          ...row, parent_group: pName, group_name: cName,
          parent_color: (row as any).parent_color || "zinc",
          group_color: (row as any).group_color || "zinc",
          assigned_user_ids: row.assigned_user_ids || []
        } as unknown as SetlistSongItem;
        
        if (grouped[row.setlist_id]) {
          grouped[row.setlist_id].push(item);
        }
      });
      
      setAllSetlistSongsMap(grouped);
      setSelectedSetlistId(setlists[0].id);
      setSetlistSongs(grouped[setlists[0].id] || []);
      setStagedSetlistSongs(grouped[setlists[0].id] || []);
    } else {
      setEventSetlists([]);
      setAllSetlistSongsMap({});
      setSelectedSetlistId("");
      setStagedSetlistSongs([]);
    }
  }

  async function loadData() {
    try {
      const { data: eventData } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      const activeWorkspaceId = eventData?.team_id || userTeamId;
      setTeam({ id: activeWorkspaceId });

      let combinedProfiles: DBProfile[] = [];
      if (activeWorkspaceId) {
        const { data: dbProfiles } = await supabase
          .from("profiles")
          .select("*")
          .or(`team_id.eq.${activeWorkspaceId},secondary_team_ids.cs.{${activeWorkspaceId}}`);

        const uniqueProfilesMap = new Map<string, DBProfile>();
        (dbProfiles as DBProfile[] || []).forEach(p => { if (!uniqueProfilesMap.has(p.id)) uniqueProfilesMap.set(p.id, p); });
        combinedProfiles = Array.from(uniqueProfilesMap.values());
      }
      setProfiles(combinedProfiles);

      if (eventData) {
        setActiveEvent({ 
          id: eventData.id, 
          title: eventData.title, 
          event_date: eventData.event_date || eventData.date, 
          service_type: eventData.service_type, 
          description: eventData.description,
          team_id: eventData.team_id
        } as any);
      } else {
        setActiveEvent({ id: eventId, title: "Sunday Worship Gathering", event_date: "2026-06-12", service_type: "Divine Service", description: "Operational block frame details." } as any);
      }

      await fetchEventSetlists(eventId);
      await syncRosterUI(activeWorkspaceId, combinedProfiles);
      setAllDatabaseSongs(await getAllSongs());
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function handleStartRehearsal() {
    if (!selectedSetlistId) return;
    router.push(`/setlists/${selectedSetlistId}/live`);
  }

  function handleOpenEditEventModal() {
    if (!activeEvent) return;
    setEditTitle(activeEvent.title);
    setEditDate(activeEvent.event_date ? activeEvent.event_date.split("T")[0] : "2026-06-12");
    setEditServiceType(activeEvent.service_type || "Divine Service"); 
    setEditDesc(activeEvent.description || "");
    setIsEditEventOpen(true);
  }

  function handleCloseEditModalRequest() {
    if (!activeEvent) return;
    const isDirty = 
      editTitle.trim() !== activeEvent.title ||
      editDate !== (activeEvent.event_date ? activeEvent.event_date.split("T")[0] : "2026-06-12") ||
      editServiceType !== (activeEvent.service_type || "Divine Service") ||
      editDesc.trim() !== (activeEvent.description || "");

    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      setIsEditEventOpen(false);
    }
  }

  function forceCloseDiscardingChanges() {
    setShowExitConfirm(false);
    setIsEditEventOpen(false);
  }

  async function handleUpdateEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setIsUpdatingEvent(true);

    try {
      const { data, error } = await supabase
        .from("events")
        .update({
          title: editTitle.trim(),
          event_date: editDate,
          service_type: editServiceType, 
          description: editDesc.trim()
        })
        .eq("id", eventId)
        .select(); 

      if (error) {
        alert(`Update Error: ${error.message}`);
      } else if (!data || data.length === 0) {
        alert("Update Blocked: Database Row Level Security (RLS) prevented the save.");
      } else {
        const updatedRecord = data[0];
        setActiveEvent(prev => prev ? { ...prev, title: updatedRecord.title, event_date: updatedRecord.event_date, service_type: updatedRecord.service_type, description: updatedRecord.description } : null);
        setIsEditEventOpen(false);
      }
    } catch (err: any) {
      console.error("Crash during update:", err);
    } finally {
      setIsUpdatingEvent(false);
    }
  }

  async function handleDeleteEvent() {
    if (activeRole !== "admin") return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
      router.push('/events');
    } catch (err: any) {
      alert(`Failed to delete event block: ${err.message}`);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  function handleLocalAddOrMove(userId: string, targetRole: string, sourceRole: string | null = null) {
    if (activeRole !== "admin") return;
    if (stagedRoster.some(r => r.user_id === userId && r.role === targetRole)) return; 
    let newRoster = [...stagedRoster];
    if (sourceRole && sourceRole !== targetRole) newRoster = newRoster.filter(r => !(r.user_id === userId && r.role === sourceRole));
    const p = profiles.find(x => x.id === userId);
    setStagedRoster([...newRoster, { id: `temp-${Date.now()}`, role: targetRole, user_id: userId, profiles: p || null, isNew: true }]);
    setHasChanges(true);
  }
  
  function handleOriginalLocalRemove(rowId: string) { if (activeRole !== "admin") return; setStagedRoster(prev => prev.filter(r => r.id !== rowId)); setHasChanges(true); }
  
  async function saveLineupChanges() { 
    if (activeRole !== "admin") return;
    setIsDeploying(true); 
    
    try {
      const removedIds = roster.filter(r => !stagedRoster.some(sr => sr.id === r.id)).map(r => r.id); 
      for (const id of removedIds) {
        await supabase.from("event_rosters").delete().eq("id", id);
      }

      const addedRows = stagedRoster.filter(sr => sr.isNew); 
      for (const row of addedRows) {
        const targetTeamId = activeEvent?.team_id || team?.id;
        const payload: any = { event_id: eventId, user_id: row.user_id, role: row.role };
        if (targetTeamId && targetTeamId !== "00000000-0000-0000-0000-000000000000") { payload.team_id = targetTeamId; }
        await supabase.from("event_rosters").insert(payload);
      }

      await syncRosterUI(eventId, profiles); 
      setHasChanges(false);
      setShowSuccessModal(true);
    } catch (err: any) {
      alert(`Runtime Exception: ${err.message || err}`);
    } finally {
      setIsDeploying(false); 
    }
  }

  async function handleCreateSetlistBlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetlistName.trim()) return;

    try {
      const payload: any = { event_id: eventId, name: newSetlistName.trim(), service_date: activeEvent?.event_date ? activeEvent.event_date.split("T")[0] : ACTIVE_SERVICE_DATE };
      if (team?.id && team.id !== "00000000-0000-0000-0000-000000000000") { payload.team_id = team.id; }

      const { data, error } = await supabase.from("setlists").insert(payload).select().maybeSingle();

      if (error) { alert(`Failed to build block: ${error.message}`); return; }
      if (data) {
        setEventSetlists(prev => [...prev, data]);
        setSelectedSetlistId(data.id);
        await fetchEventSetlists(eventId);
        setIsCreateSetlistOpen(false); 
        setNewSetlistName("");
        setViewSubScreen("songs_view");
      }
    } catch (err) { console.error(err); }
  }

  async function handleAddSongSubmit() {
    if (activeRole !== "admin" || !selectedNewSongId) return;
    const songToAdd = allDatabaseSongs.find(s => s.id === selectedNewSongId);
    if (!songToAdd) return;
    
    const newOrder = setlistSongs.length + 1;
    const optimisticItem: SetlistSongItem = { id: `temp-${Date.now()}`, sequence_order: newOrder, start_time: "08:30", assigned_user_ids: [], parent_group: null, group_name: null, songs: songToAdd };
    
    setSetlistSongs(prev => [...prev, optimisticItem]);
    setStagedSetlistSongs(prev => [...prev, optimisticItem]);
    setSelectedNewSongId(""); setSongSearchQuery(""); setIsSongDropdownOpen(false);

    await supabase.from('setlist_songs').insert({ 
      setlist_id: selectedSetlistId, song_id: songToAdd.id, sequence_order: newOrder, start_time: "08:30" 
    });
    
    await fetchEventSetlists(eventId);
  }

  function handleDragStart(index: number) { if (activeRole === "admin") setDraggedSongIndex(index); }
  
  function handleDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedSongIndex === null || draggedSongIndex === targetIndex || activeRole !== "admin") return;
    const reorderedSongs = [...stagedSetlistSongs];
    const [removed] = reorderedSongs.splice(draggedSongIndex, 1);
    reorderedSongs.splice(targetIndex, 0, removed);
    setStagedSetlistSongs(reorderedSongs.map((song, i) => ({ ...song, sequence_order: i + 1 })));
    setDraggedSongIndex(targetIndex);
  }

  async function handleDragEnd() {
    setDraggedSongIndex(null);
    if (activeRole !== "admin") return;
    
    const promises = stagedSetlistSongs
      .filter(s => !s.id.startsWith('temp-'))
      .map(song => supabase.from('setlist_songs').update({ sequence_order: song.sequence_order }).eq('id', song.id));
      
    await Promise.all(promises);
  }

  function handleToggleCheckboxSelect(id: string) { setSelectedForGroup(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  async function applyGroupTransformation() {
    if (selectedForGroup.length === 0 || activeRole !== "admin") return;
    const finalGroupName = customGroupName.trim() || null;
    const selectedIds = [...selectedForGroup];
    
    const updatedSongs = stagedSetlistSongs.map(song => selectedIds.includes(song.id) ? { ...song, group_name: finalGroupName, group_color: selectedGroupColor } : song);
    setStagedSetlistSongs(updatedSongs); 
    setSelectedForGroup([]); setCustomGroupName("");

    await supabase.from('setlist_songs')
      .update({ group_name: finalGroupName, group_color: selectedGroupColor })
      .in('id', selectedIds.filter(id => !id.startsWith('temp-')));
  }

  // ✅ ENHANCED SETLIST CLIPBOARD ENGINE (Extracts titles + Artist + YouTube Playlist URL only)
  const handleCopySetlist = async (e: React.MouseEvent, sl: SetlistMetaItem, songs: SetlistSongItem[]) => {
    e.stopPropagation();
    
    const dateStr = activeEvent?.event_date 
      ? new Date(activeEvent.event_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) 
      : "Upcoming Event";
    
    let text = `here's the lineup for ${sl.name}, ${dateStr}\n\n`;
    let currentGroup = "";
    const videoIds: string[] = [];
    
    songs.forEach((ss) => {
      const groupName = ss.group_name || ss.parent_group || "Main Set";
      if (groupName !== currentGroup) {
        if (currentGroup !== "") text += `\n`; 
        text += `${groupName}\n`;
        currentGroup = groupName;
      }
      
      // Append Song Title and Artist
      const title = ss.songs?.title || 'Unknown Song';
      const artist = ss.songs?.artist ? ` - ${ss.songs.artist}` : '';
      text += `${title}${artist}\n`;
      
      // Extract ID for the master playlist (Removed printing the individual URL here)
      if (ss.songs?.youtube_url) {
        const ytId = extractYouTubeID(ss.songs.youtube_url);
        if (ytId) videoIds.push(ytId);
      }
    });

    // Generate Master Playlist
    if (videoIds.length > 0) {
      const eventName = activeEvent?.title || "Event";
      // Passes the Title to YouTube
      const encodedTitle = encodeURIComponent(`${eventName}: ${sl.name} - ${dateStr}`);
      const playlistUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds.join(',')}&title=${encodedTitle}`;
      
      text += `\nPlaylist\n${playlistUrl}\n`;
    }
    
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopiedSetlistId(sl.id);
      setTimeout(() => setCopiedSetlistId(null), 2000);
    } catch (err) {
      console.error("Failed to copy setlist", err);
    }
  };

  const songFilteredDatabaseSongs = allDatabaseSongs.filter(s => s.title.toLowerCase().includes(songSearchQuery.toLowerCase()));
  const targetFilterDate = activeEvent?.event_date ? activeEvent.event_date.split("T")[0] : ACTIVE_SERVICE_DATE;
  
  const availablePool = profiles.filter(p => !stagedRoster.some(r => r.user_id === p.id) && !p.unavailable_dates?.includes(targetFilterDate));
  const unavailablePool = profiles.filter(p => !stagedRoster.some(r => r.user_id === p.id) && p.unavailable_dates?.includes(targetFilterDate));

  interface SetlistTreeBlock { parentGroup: string | null; parentColor: string; groups: { groupName: string | null; groupColor: string; items: { item: SetlistSongItem, globalIndex: number }[]; }[]; }
  const treeBlocks: SetlistTreeBlock[] = [];
  
  stagedSetlistSongs.forEach((item, index) => {
    const pName = item.parent_group || null; const cName = item.group_name || null;
    const pCol = item.parent_color || "zinc"; const cCol = item.group_color || "zinc";
    const lastParent = treeBlocks[treeBlocks.length - 1];
    if (lastParent && lastParent.parentGroup === pName) {
      const lastChild = lastParent.groups[lastParent.groups.length - 1];
      if (lastChild && lastChild.groupName === cName) lastChild.items.push({ item, globalIndex: index });
      else lastParent.groups.push({ groupName: cName, groupColor: cCol, items: [{ item, globalIndex: index }] });
    } else {
      treeBlocks.push({ parentGroup: pName, parentColor: pCol, groups: [{ groupName: cName, groupColor: cCol, items: [{ item, globalIndex: index }] }] });
    }
  });

  function parentBlockRowsRenderer(treeBlocks: any[], isEditingSetlist: boolean) {
    return treeBlocks.map((parentBlock: any, pIdx: number) => {
      const renderGroupBlock = (group: any, gIdx: number) => {
        const groupPalette = COLOR_PALETTES.find((c: any) => c.id === group.groupColor) || COLOR_PALETTES[0];
        
        if (!group.groupName && !parentBlock.parentGroup) {
          return <div key={`flat-g-${gIdx}`} className="space-y-3">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>;
        }
        
        return (
          <div key={`g-${gIdx}`} className={`border-l-4 ${groupPalette.border} ${groupPalette.bg} rounded-2xl p-4 shadow-sm`}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-outline-variant/10">
              <div className="flex items-center gap-2">
                <span className={`font-black text-[12px] uppercase tracking-widest ${groupPalette.text}`}>{group.groupName || "SECTION BLOCK"}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-md font-mono text-[9px] border shadow-sm bg-surface-container-highest border-outline-variant/30 ${groupPalette.text}`}>
                {group.items.length} {group.items.length === 1 ? 'Song' : 'Songs'}
              </span>
            </div>
            <div className="space-y-3">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>
          </div>
        );
      };

      const renderTrackRow = (item: SetlistSongItem, globalIndex: number) => (
        <div 
          key={item.id} 
          draggable={activeRole === "admin"}
          onDragStart={() => handleDragStart(globalIndex)}
          onDragOver={(e) => handleDragOver(e, globalIndex)}
          onDragEnd={() => setDraggedSongIndex(null)}
          onClick={() => { if (item.songs?.id) router.push(`/songs/${item.songs.id}`); }}
          className={`flex items-center justify-between rounded-xl p-3 md:p-4 bg-surface-container hover:bg-surface-container-high border shadow-sm transition-all duration-150 cursor-pointer ${
            draggedSongIndex === globalIndex ? "opacity-40 scale-95 border-primary border-dashed" : "border-outline-variant/30"
          }`}
        >
          <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              {activeRole === "admin" && (
                <input type="checkbox" className="w-4 h-4 rounded border-outline-variant bg-surface-container-highest checked:bg-primary cursor-pointer accent-primary" checked={selectedForGroup.includes(item.id)} onChange={() => handleToggleCheckboxSelect(item.id)} />
              )}
              {activeRole === "admin" && <div className="material-symbols-outlined text-outline text-[18px] select-none cursor-grab active:cursor-grabbing hover:text-on-surface transition-colors">drag_indicator</div>}
            </div>
            <div className="flex flex-col flex-1 min-w-0 select-none">
              <h4 className="font-bold text-[15px] md:text-[16px] text-on-surface leading-tight truncate">{item.songs?.title}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-1.5 py-0.5 rounded-md bg-secondary-container/20 text-secondary border border-secondary/20 text-[10px] font-black uppercase tracking-widest leading-none shadow-inner">
                  Key {item.target_key || item.songs?.original_key || "G"}
                </span>
                <span className="text-on-surface-variant text-[11px] font-bold tnum">{item.songs?.tempo || "70"} BPM</span>
              </div>
            </div>
          </div>
          <div className="ml-3 flex items-center shrink-0" onClick={e => e.stopPropagation()}>
            {activeRole === "admin" && ( 
              <button 
                onClick={async () => {
                  setStagedSetlistSongs(prev => prev.filter(s => s.id !== item.id));
                  setSetlistSongs(prev => prev.filter(s => s.id !== item.id)); 
                  
                  if (!item.id.startsWith('temp-')) {
                    const { error } = await supabase.from('setlist_songs').delete().eq('id', item.id);
                    if (error) console.error("Auto-save delete failed:", error.message);
                  }
                }} 
                className="w-8 h-8 rounded-full bg-error/10 text-error hover:bg-error/20 flex items-center justify-center transition-colors border border-error/20 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button> 
            )}
          </div>
        </div>
      );

      if (parentBlock.parentGroup) {
        return (
          <div key={`parent-${pIdx}`} className={`border border-outline-variant/30 bg-surface-container-low rounded-2xl p-4 md:p-5 space-y-4 mb-4 shadow-sm`}>
            <h4 className="text-[15px] font-extrabold text-on-surface uppercase tracking-wider">{parentBlock.parentGroup}</h4>
            <div className="space-y-4">{parentBlock.groups.map((group: any, gIdx: number) => renderGroupBlock(group, gIdx))}</div>
          </div>
        );
      }
      return <div key={`flat-parent-${pIdx}`} className="space-y-4 mb-4">{parentBlock.groups.map((group: any, gIdx: number) => renderGroupBlock(group, gIdx))}</div>;
    });
  }

  useEffect(() => { setHasMounted(true); loadData(); }, [eventId]);

  if (!hasMounted) return null;
  if (loading) {
    return <GlobalLoader message="LOADING EVENT DETAILS" />;
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col relative bg-surface font-sans text-on-surface">
      
      {/* FIXED TOP HEADER */}
      <header className="shrink-0 w-full z-50 bg-surface/85 backdrop-blur-xl border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push("/events")} 
              className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <div className="flex flex-col">
              <span className="font-headline-title-mobile text-[16px] text-on-surface tracking-tight leading-tight font-extrabold truncate max-w-[180px] sm:max-w-[300px]">
                {activeEvent?.title || "Event Details"}
              </span>
              <span className="font-label-sm text-[11px] text-secondary leading-tight flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                Rehearsal Active
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeRole === "admin" && (
              <button 
                onClick={handleOpenEditEventModal} 
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-bright transition-colors cursor-pointer border border-outline-variant/30 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
            )}
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('onpraise-open-account'))}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors cursor-pointer shadow-md overflow-hidden border border-primary/50"
            >
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </button>
          </div>
        </div>
      </header>

      {/* SINGLE ISOLATED SCROLL CANVAS */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative w-full p-4 md:p-6 pb-32 bg-surface custom-scrollbar">
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">

          {/* EVENT BANNER CARD - VIBRANT GLOW */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#1e1b4b] p-5 md:p-6 shadow-2xl">
            <div className="absolute -right-8 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>
            <div className="relative z-10 flex flex-col gap-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-badge-caps text-[10px] tracking-widest text-[#7bd0ff] uppercase font-black">Live Production Deck</span>
                <span className="material-symbols-outlined text-[#7bd0ff] text-[20px]">graphic_eq</span>
              </div>
              
              <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-tight text-white leading-tight mt-1">
                {activeEvent?.title || "Concert"}
              </h1>
              <p className="text-[13px] text-white/80 mt-1 max-w-lg">
                {activeEvent?.description || "Worship gathering event plan block."}
              </p>
              
              {/* <div className="flex flex-wrap items-center gap-4 text-[#7bd0ff] font-bold text-[12px] mt-4 pt-4 border-t border-white/10">
                <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">location_on</span>Main Sanctuary</span>
                <span className="text-white/30">•</span>
                <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">schedule</span>{formatTo12Hour(activeEvent?.event_date?.split('T')[1])} Call Time</span>
              </div> */}

              {/* Inside Hero Action */}
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] text-white/80">
                  <strong className="text-white text-[14px]">{stagedSetlistSongs.length}</strong> songs registered
                </div>
                <button 
                  onClick={handleStartRehearsal} 
                  disabled={stagedSetlistSongs.length === 0} 
                  className="bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-[13px] font-bold shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-[#10b981]/50"
                >
                  Start Rehearsal <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3-WAY VIEW TOGGLE - REORDERED: Setlist -> Tracks -> Band */}
          <div className="grid grid-cols-3 gap-2 bg-surface-container-low p-1.5 rounded-xl shadow-inner border border-outline-variant/20">
            <button 
              onClick={() => setViewSubScreen("setlists_list")} 
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold transition-all shadow-sm ${viewSubScreen === "setlists_list" ? "bg-primary-container text-on-primary-container" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer"}`}
            >
              <span className="material-symbols-outlined text-[18px]">queue_music</span>
              <span>Setlist</span>
            </button>
            <button 
              onClick={() => setViewSubScreen("songs_view")} 
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold transition-all shadow-sm ${viewSubScreen === "songs_view" ? "bg-primary-container text-on-primary-container" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer"}`}
            >
              <span className="material-symbols-outlined text-[18px]">graphic_eq</span>
              <span className="hidden sm:inline">Tracks ({stagedSetlistSongs.length})</span>
              <span className="sm:hidden">Tracks</span>
            </button>
            <button 
              onClick={() => setViewSubScreen("matrix")} 
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold transition-all shadow-sm ${viewSubScreen === "matrix" ? "bg-primary-container text-on-primary-container" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer"}`}
            >
              <span className="material-symbols-outlined text-[18px]">groups</span>
              <span className="hidden sm:inline">Band ({stagedRoster.length})</span>
              <span className="sm:hidden">Band</span>
            </button>
          </div>

          {/* ========================================= */}
          {/* SETLISTS LIST VIEW                        */}
          {/* ========================================= */}
          {viewSubScreen === "setlists_list" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col gap-1 pt-1 mb-2 px-1">
                <span className="font-badge-caps text-[10px] text-outline uppercase tracking-widest">Setlists Registered under this event</span>
              </div>
              
              <div className="flex flex-col gap-4">
                {eventSetlists.map((sl, idx) => {
                  const songs = allSetlistSongsMap[sl.id] || [];
                  const harmonicMap = songs.map(s => s.target_key || s.songs?.original_key || "G").join(" → ");
                  const estMins = songs.length * 5;
                  const isCopied = copiedSetlistId === sl.id;

                  return (
                    <div key={sl.id} className="relative rounded-2xl bg-surface-container-low p-5 shadow-md flex flex-col gap-4 overflow-hidden border border-outline-variant/30">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary"></div>
                      
                      <div className="flex items-start justify-between gap-3 pl-2">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary font-badge-caps text-[8px] tracking-wider uppercase border border-primary/20">SET BLOCK {String(idx + 1).padStart(2, '0')}</span>
                            <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                              Active Worship Set • {songs.length} Tracks
                            </span>
                          </div>
                          <h4 className="font-extrabold text-[18px] text-on-surface tracking-tight">{sl.name}</h4>
                        </div>

                        {/* ✅ CLIPBOARD COPY BUTTON: Icon only, confirms with checkmark */}
                        <button 
                          onClick={(e) => handleCopySetlist(e, sl, songs)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 border ${isCopied ? 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/50' : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:bg-surface-bright border-outline-variant/30'}`}
                          title="Copy Setlist & Playlist Link to Clipboard"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {isCopied ? 'check' : 'content_copy'}
                          </span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 pl-4">
                        <div className="flex flex-col">
                          <span className="font-badge-caps text-[9px] text-outline uppercase tracking-wider mb-0.5">Estimated Time</span>
                          <span className="font-bold text-[13px] text-secondary font-mono">{estMins}m 00s</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-badge-caps text-[9px] text-outline uppercase tracking-wider mb-0.5">Harmonic Map</span>
                          <span className="font-bold text-[12px] text-primary truncate">{harmonicMap || "--"}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pl-2">
                        <span className="font-badge-caps text-[9px] text-outline uppercase tracking-wider">Track Sequence & Pitch Keys</span>
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                          {songs.map((ss, sIdx) => (
                            <div key={ss.id} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-surface-container-high flex items-center gap-2 text-[11px] font-bold text-on-surface border border-outline-variant/30">
                              <span className="font-mono text-primary">{sIdx + 1}</span>
                              <span>{ss.songs?.title}</span>
                              <span className="px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container font-mono text-[9px] font-black">{ss.target_key || ss.songs?.original_key || "G"}</span>
                            </div>
                          ))}
                          {songs.length === 0 && <span className="text-[11px] text-on-surface-variant italic">No tracks assigned</span>}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 pl-2 border-t border-outline-variant/20 mt-1">
                        <span className="font-badge-caps text-[9px] text-outline uppercase tracking-widest">STEMS LOADED • CLICK READY</span>
                        <button 
                          onClick={() => { setSelectedSetlistId(sl.id); setSetlistSongs(songs); setStagedSetlistSongs(songs); setViewSubScreen("songs_view"); }}
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary-fixed font-bold group cursor-pointer transition-colors"
                        >
                          View Tracks Array
                          <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
                
                {activeRole === "admin" && (
                  <div 
                    onClick={() => setIsCreateSetlistOpen(true)}
                    className="p-4 rounded-xl border-2 border-dashed border-outline-variant/30 hover:border-primary hover:bg-primary-container/5 text-primary font-extrabold text-[12px] uppercase tracking-widest flex items-center justify-center min-h-[120px] transition-all cursor-pointer shadow-sm select-none"
                  >
                    ＋ Add Setlist Block
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================= */}
          {/* TRACKS / SONGS VIEW                       */}
          {/* ========================================= */}
          {viewSubScreen === "songs_view" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Add Song Input Field */}
              {activeRole === "admin" && (
                <div className="flex gap-2 items-stretch">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 shadow-inner relative z-50">
                    <span className="material-symbols-outlined text-[20px] text-outline">search</span>
                    <input 
                      type="text" 
                      placeholder="Type track name to add..." 
                      value={songSearchQuery}
                      onChange={(e) => { setSongSearchQuery(e.target.value); setIsSongDropdownOpen(true); }}
                      onClick={() => setIsSongDropdownOpen(true)}
                      className="bg-transparent border-none outline-none text-on-surface text-[13px] font-semibold placeholder:text-outline w-full"
                    />
                    
                    {/* Live Search Dropdown */}
                    {isSongDropdownOpen && songSearchQuery.trim() !== "" && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-high border border-outline-variant/50 rounded-2xl shadow-2xl z-[999999] max-h-48 overflow-y-auto custom-scrollbar">
                        {songFilteredDatabaseSongs.map(s => (
                          <div 
                            key={s.id} 
                            onClick={() => { setSelectedNewSongId(s.id); setSongSearchQuery(s.title); setIsSongDropdownOpen(false); }} 
                            className="px-5 py-3 hover:bg-surface-bright border-b border-outline-variant/10 last:border-0 cursor-pointer transition-colors flex flex-col justify-center"
                          >
                            <span className="text-[13px] font-bold text-on-surface leading-tight">🎵 {s.title}</span>
                            <span className="text-[10px] font-bold text-on-surface-variant mt-0.5 ml-5">
                              {s.artist || "Unknown Artist"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button 
                    type="button" 
                    onClick={handleAddSongSubmit} 
                    disabled={!selectedNewSongId} 
                    className="flex items-center gap-1.5 px-4 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-on-primary font-bold text-[12px] shadow-sm active:scale-95 transition-all cursor-pointer border border-primary/20 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span className="hidden sm:block">Add</span>
                  </button>
                </div>
              )}

              {/* Grouping Controller */}
              {selectedForGroup.length > 0 && activeRole === "admin" && (
                <div className="bg-surface-container-low p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-outline-variant/30 shadow-md animate-in zoom-in-95 duration-150">
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-primary">Section Grouping</h5>
                    <p className="text-[12px] font-bold text-on-surface">{selectedForGroup.length} song segments selected.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g., Fast Praise..." 
                      value={customGroupName}
                      onChange={e => setCustomGroupName(e.target.value)}
                      className="bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-[12px] text-on-surface placeholder-outline font-bold outline-none focus:border-primary shadow-inner"
                    />
                    <select 
                      value={selectedGroupColor} 
                      onChange={e => setSelectedGroupColor(e.target.value)}
                      className="bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-[12px] font-bold text-on-surface outline-none shadow-inner"
                    >
                      {COLOR_PALETTES.map(p => <option key={p.id} value={p.id}>{p.id.toUpperCase()}</option>)}
                    </select>
                    <button type="button" onClick={applyGroupTransformation} className="px-4 py-2 bg-primary text-on-primary font-bold text-[12px] rounded-lg shadow-sm cursor-pointer hover:bg-primary/90">Bundle</button>
                  </div>
                </div>
              )}

              {/* Flow Repertoire Header */}
              <div className="flex items-center justify-between px-2 pt-2 border-b border-outline-variant/20 pb-4">
                <span className="font-badge-caps text-[10px] uppercase tracking-widest text-outline">Flow Repertoire ({stagedSetlistSongs.length} Tracks)</span>
                <div className="flex items-center gap-1.5 text-secondary font-bold text-[11px] bg-secondary/10 px-2.5 py-1 rounded-md border border-secondary/20 shadow-sm">
                  <span className="material-symbols-outlined text-[14px]">timer</span>
                  <span>Est. ~{stagedSetlistSongs.length * 5} mins</span>
                </div>
              </div>
              
              {/* Songs List Rendering */}
              <div className="space-y-4 pb-12">
                {parentBlockRowsRenderer(treeBlocks, isEditingSetlist)}
                {stagedSetlistSongs.length === 0 && (
                  <div className="text-center p-8 border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest">
                    <span className="material-symbols-outlined text-[32px] text-outline mb-2">music_off</span>
                    <p className="text-[13px] font-bold text-on-surface">No tracks added to this setlist.</p>
                    <p className="text-[11px] text-on-surface-variant mt-1">Use the search bar above to add songs.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================= */}
          {/* BAND / MATRIX VIEW                        */}
          {/* ========================================= */}
          {viewSubScreen === "matrix" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between px-2">
                  <span className="font-section-heading text-[16px] text-on-surface font-extrabold tracking-tight">Band Roster & Positions</span>
                  <button className="font-label-sm text-[12px] text-primary hover:text-primary-fixed flex items-center gap-0.5 transition-colors cursor-pointer" type="button">
                    <span>Manage Roles</span>
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </div>
                <div className="flex items-center justify-between py-2 px-4 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant font-label-sm text-[12px] shadow-sm">
                  <span className="text-on-surface font-bold">6 Roles Defined</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">{stagedRoster.length} Assigned</span>
                  </div>
                </div>
              </div>

              {/* STRICT 3-ROW 2-COL MATRIX */}
              <div className="grid grid-cols-2 gap-3 content-start">
                {GRID_CARDS.map((cardRole) => {
                  const list = stagedRoster.filter(m => m.role === cardRole);
                  const loadedUser = loadedUserId ? profiles.find(p => p.id === loadedUserId) : null;
                  const isQualified = loadedUser ? (loadedUser.ministries || []).includes(cardRole) : true;
                  const isDisabledDrop = loadedUserId && !isQualified;

                  return (
                    <div 
                      key={cardRole} 
                      onClick={() => {
                        if (loadedUserId && activeRole === "admin" && isQualified) {
                          handleLocalAddOrMove(loadedUserId, cardRole);
                          setLoadedUserId(null); 
                          setIsDockOpen(false);
                        }
                      }}
                      className={`bg-surface-container-lowest p-4 rounded-xl border flex flex-col justify-between min-h-[90px] transition-all duration-300 ${
                        loadedUserId && activeRole === "admin" 
                          ? isQualified ? "hover:border-primary border-primary/50 cursor-pointer ring-2 ring-primary/20 bg-primary-container/5" : "opacity-40 grayscale cursor-not-allowed border-outline-variant/20"
                          : "border-outline-variant/30 hover:border-outline-variant/50 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                          <h5 className="font-extrabold text-[15px] text-on-surface leading-tight truncate">{cardRole}</h5>
                          <p className="text-[10px] font-bold text-on-surface-variant mt-0.5">{list.length} Assigned</p>
                        </div>
                        {activeRole === "admin" && ( 
                          <button 
                            type="button" 
                            disabled={!!isDisabledDrop}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (loadedUserId && isQualified) {
                                handleLocalAddOrMove(loadedUserId, cardRole);
                                setLoadedUserId(null);
                                setIsDockOpen(false); 
                              } else if (!loadedUserId) {
                                setIsDockOpen(true);
                                setMatrixFilter(cardRole);
                              }
                            }} 
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[18px] border transition-all duration-300 shrink-0 cursor-pointer ${
                              isDisabledDrop ? "bg-surface-container-highest text-outline-variant border-transparent" :
                              loadedUserId ? "bg-primary border-primary text-on-primary animate-pulse shadow-md" : "bg-surface-container hover:bg-surface-bright text-outline hover:text-on-surface border-outline-variant/30"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">{loadedUserId ? "arrow_downward" : "add"}</span>
                          </button> 
                        )}
                      </div>
                      
                      {list.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-3 overflow-hidden">
                          {list.map(m => (
                            <div key={m.id} className="relative group cursor-pointer" onClick={e => e.stopPropagation()}>
                              {m.profiles?.avatar_url ? (
                                <img src={m.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm border border-outline-variant/50" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-black flex items-center justify-center shadow-sm border border-secondary/20">{m.profiles?.full_name?.charAt(0) || "U"}</div>
                              )}
                              {activeRole === "admin" && ( 
                                <button type="button" onClick={() => handleOriginalLocalRemove(m.id)} className="absolute -top-1 -right-1 bg-error/90 text-on-error rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-black opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:scale-110 transition-all shadow-sm cursor-pointer">✕</button> 
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {activeRole === "admin" && isDockOpen && (
                <div className="bg-surface-container border border-outline-variant/30 p-4 rounded-2xl shadow-lg mt-2 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-200 mb-8 md:mb-0">
                  <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar flex-1 pr-4">
                      <button onClick={() => setMatrixFilter("All")} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${matrixFilter === "All" ? "bg-on-surface text-surface border-on-surface shadow-md" : "bg-transparent border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-highest"}`}>All Hands</button>
                      
                      {Array.from(new Set(availablePool.flatMap(p => p.ministries || []))).map(min => (
                        <button key={min} onClick={() => setMatrixFilter(min)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${matrixFilter === min ? "bg-primary text-on-primary border-primary shadow-md" : "bg-transparent border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-highest"}`}>{min}</button>
                      ))}

                      <button onClick={() => { setMatrixFilter("Unavailable"); setLoadedUserId(null); }} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ml-1 ${matrixFilter === "Unavailable" ? "bg-error text-on-error border-error shadow-md" : "bg-error/10 border-error/20 text-error hover:bg-error/20"}`}>
                        Unavailable ({unavailablePool.length})
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      {loadedUserId && (
                        <button onClick={() => setLoadedUserId(null)} className="text-[10px] font-black text-error hover:bg-error/10 px-3 py-1.5 rounded-full uppercase tracking-widest transition-colors shrink-0">Clear Selection</button>
                      )}
                      <button onClick={() => setIsDockOpen(false)} className="w-7 h-7 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center font-bold text-xs hover:text-on-surface transition-colors cursor-pointer">✕</button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 overflow-x-auto custom-scrollbar pb-2 pt-1 px-1">
                    {(matrixFilter === "Unavailable" ? unavailablePool : availablePool.filter(p => matrixFilter === "All" ? true : p.ministries?.includes(matrixFilter))).map(p => {
                      const isLoaded = loadedUserId === p.id;
                      const isBlocked = matrixFilter === "Unavailable";

                      return (
                        <button 
                          key={p.id} 
                          disabled={isBlocked}
                          onClick={() => setLoadedUserId(isLoaded ? null : p.id)}
                          className={`flex flex-col items-center gap-2 shrink-0 transition-all duration-300 ${isBlocked ? "opacity-40 cursor-not-allowed grayscale" : isLoaded ? "-translate-y-1 scale-105" : "hover:-translate-y-0.5 hover:scale-105 active:scale-95 cursor-pointer"}`}
                        >
                          <div className={`w-12 h-12 rounded-full relative items-center justify-center font-black text-sm shadow-sm transition-all duration-300 ${isBlocked ? "bg-surface-container-highest text-outline-variant ring-1 ring-outline-variant/30" : isLoaded ? "bg-primary text-on-primary ring-2 ring-primary ring-offset-2 ring-offset-surface shadow-md" : "bg-primary-container text-on-primary-container border border-primary/30"}`}>
                            {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="flex items-center justify-center w-full h-full">{isBlocked ? "🚫" : p.full_name?.charAt(0) || "U"}</span>}
                            {isLoaded && <div className="absolute -bottom-1 -right-1 bg-primary text-on-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm border-2 border-surface">✓</div>}
                          </div>
                          <span className={`text-[9px] font-black uppercase tracking-widest truncate w-16 text-center ${isBlocked ? "text-outline-variant" : isLoaded ? "text-primary" : "text-on-surface-variant"}`}>{p.full_name?.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FLOATING SAVE BAR FOR MATRIX */}
          <div className={`fixed bottom-24 left-4 right-4 md:left-auto md:right-8 bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant/40 p-4 flex items-center justify-between gap-4 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 z-[10000] ${hasChanges && activeRole === "admin" ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'}`}>
            <p className="text-[13px] font-extrabold text-on-surface">Unsaved Lineup changes staged</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setStagedRoster(roster); setHasChanges(false); }} className="px-3 py-2 text-[11px] font-bold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">Discard</button>
              <button type="button" onClick={saveLineupChanges} disabled={isDeploying} className="px-4 py-2 text-[11px] font-black text-on-primary bg-primary hover:bg-primary/90 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">{isDeploying ? 'Deploying...' : 'Save Lineup'}</button>
            </div>
          </div>

        </div>
      </main>

      {/* --- EDIT ACTIVE EVENT OVERLAY MODAL --- */}
      {isEditEventOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[140000] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={handleCloseEditModalRequest} 
        >
          <form 
            onSubmit={handleUpdateEventSubmit} 
            onClick={(e) => e.stopPropagation()} 
            className="bg-surface-container-low border border-outline-variant/30 rounded-[2rem] shadow-2xl w-full max-w-md p-6 relative flex flex-col space-y-4 animate-in zoom-in-95"
          >
            <button type="button" onClick={handleCloseEditModalRequest} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant font-bold text-xs flex items-center justify-center transition-colors border border-outline-variant/30 cursor-pointer">✕</button>
            <h3 className="text-xl font-black text-on-surface tracking-tight">Edit Event Block</h3>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase block tracking-wider">Event Title</label>
              <input type="text" required value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-[13px] font-semibold outline-none focus:border-secondary transition-colors text-on-surface shadow-inner" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase block tracking-wider">Type of Service Preset</label>
              <select value={editServiceType} onChange={(e) => setEditServiceType(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-[13px] font-semibold outline-none focus:border-secondary transition-colors cursor-pointer text-on-surface shadow-inner">
                {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase block tracking-wider">Event Date</label>
              <input type="date" required value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-[13px] font-semibold outline-none focus:border-secondary transition-colors text-on-surface shadow-inner" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase block tracking-wider">Summary Description</label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-[13px] font-semibold outline-none h-24 resize-none focus:border-secondary transition-colors custom-scrollbar text-on-surface shadow-inner" />
            </div>
            
            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowDeleteConfirm(true)}
                className="flex-1 bg-error/10 hover:bg-error/20 text-error font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 border border-error/20 cursor-pointer"
              >
                Delete
              </button>
              <button 
                type="submit" 
                disabled={isUpdatingEvent} 
                className="flex-[2] bg-primary hover:bg-primary/90 text-on-primary font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer border border-primary/20"
              >
                {isUpdatingEvent ? "Saving..." : "Commit Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EXIT CONFIRM MODAL */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-surface-container-low rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border border-outline-variant/30">
            <h3 className="text-[18px] font-black text-on-surface mb-2 tracking-tight">Discard changes?</h3>
            <p className="text-[12px] text-on-surface-variant font-medium mb-6">You have unsaved edits in your event block. Are you sure you want to close and lose this data?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowExitConfirm(false)} className="flex-1 py-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-bold text-[12px] rounded-xl transition-colors border border-outline-variant/30 cursor-pointer">Keep Editing</button>
              <button onClick={forceCloseDiscardingChanges} className="flex-1 py-2.5 bg-error text-on-error font-bold text-[12px] rounded-xl shadow-sm transition-colors cursor-pointer border border-error/20">Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-surface-container-low rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border border-outline-variant/30">
            <div className="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto text-[20px] shadow-inner border border-error/20 mb-4">⚠️</div>
            <h3 className="text-[18px] font-black text-on-surface mb-2 tracking-tight">Delete this event?</h3>
            <p className="text-[12px] text-on-surface-variant font-medium mb-6">This will permanently delete the event, its setlists, and all scheduled lineups. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} className="flex-1 py-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-bold text-[12px] rounded-xl transition-colors border border-outline-variant/30 cursor-pointer">Cancel</button>
              <button onClick={handleDeleteEvent} disabled={isDeleting} className="flex-1 py-2.5 bg-error hover:bg-error/90 text-on-error font-bold text-[12px] rounded-xl shadow-sm transition-colors cursor-pointer border border-error/20">{isDeleting ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SUB-SETLIST MODAL */}
      {isCreateSetlistOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[130000] flex items-center justify-center p-4">
          <form onSubmit={handleCreateSetlistBlockSubmit} className="bg-surface-container-low border border-outline-variant/30 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <h4 className="font-black text-[18px] tracking-tight text-on-surface">Create Setlist Block</h4>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block">Setlist Block Name</label>
              <input type="text" required placeholder="e.g., Sunday Morning Service Setlist" value={newSetlistName} onChange={e => setNewSetlistName(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/50 p-3 rounded-xl font-bold text-[13px] text-on-surface outline-none focus:border-secondary shadow-inner transition-colors" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setIsCreateSetlistOpen(false)} className="flex-1 py-2.5 bg-surface-container-high hover:bg-surface-bright border border-outline-variant/30 rounded-xl text-[12px] font-bold text-on-surface cursor-pointer transition-colors">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-on-primary border border-primary/20 rounded-xl text-[12px] font-black shadow-md uppercase tracking-wider cursor-pointer transition-colors">Build Block</button>
            </div>
          </form>
        </div>
      )}

      {/* SUCCESS CONFIRMATION MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 select-none">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes morph-squish { 0%, 100% { transform: scale(1) rotate(0deg); } 25% { transform: scale(1.2, 0.8) rotate(10deg); } 50% { transform: scale(0.9, 1.15) rotate(-5deg); } 75% { transform: scale(1.05, 0.95) rotate(15deg); } }
            @keyframes pulse-ghost { 0%, 100% { transform: scale(1); opacity: 0.7; } 30% { transform: scale(1.6); opacity: 0.1; } 40% { transform: scale(0.8); opacity: 0.9; } }
            .animate-morph-squish { animation: morph-squish 5s ease-in-out infinite; }
            .animate-pulse-ghost { animation: pulse-ghost 7s ease-in-out infinite; }
          `}} />

          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <Blob color="#10B981" w="110px" hasEyes animClass="animate-morph-squish" delay="0s" top="30%" right="30%" />
            <Blob color="#34D399" w="50px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" bottom="20%" left="20%" />
            <Blob color="#A7F3D0" w="80px" hasEyes={false} animClass="animate-morph-squish" delay="-2s" top="20%" left="30%" />
          </div>

          <div className="bg-surface-container-low border border-outline-variant/30 rounded-[2rem] shadow-2xl w-full max-w-sm p-8 text-center relative z-10 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-[#10b981]/10 text-[#10b981] rounded-full flex items-center justify-center mx-auto text-[32px] shadow-sm border border-[#10b981]/20 mb-6">
              <span className="font-black">✓</span>
            </div>
            <div>
              <h3 className="text-[20px] font-black text-on-surface tracking-tight">Success!</h3>
              <p className="text-[13px] font-bold text-on-surface-variant mt-2">Lineup successfully synchronized and saved to the database.</p>
            </div>
            <button 
              type="button" 
              onClick={() => setShowSuccessModal(false)} 
              className="w-full bg-primary hover:bg-primary/90 text-on-primary font-black py-3.5 rounded-xl text-[12px] uppercase tracking-widest shadow-md border border-primary/20 transition-all active:scale-95 mt-6 cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}

    </div>
  );
}