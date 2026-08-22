"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import GlobalLoader from '../../../components/GlobalLoader';
import { 
  getUserTeam, getAllProfiles, addTeamMember, removeTeamMember, 
  getAuthUserProfile, getAllSongs, getSongChordChart
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

// ============================================================================
// ✅ SURGICAL ADDITION: REUSABLE BLOB COMPONENT
// ============================================================================
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
const MAX_AVATARS = 6;
const ACTIVE_SERVICE_DATE = "2026-06-12";
const SERVICE_TYPE_PRESETS = ["Midweek Service", "Divine Service", "Camp", "Concert", "Fellowship"];

const COLOR_PALETTES = [
  { id: "zinc", border: "border-zinc-200", bg: "bg-zinc-50/40", text: "text-zinc-700", dot: "bg-zinc-400" },
  { id: "blue", border: "border-blue-200", bg: "bg-blue-50/60", text: "text-blue-700", dot: "bg-blue-500" },
  { id: "emerald", border: "border-emerald-200", bg: "bg-emerald-50/60", text: "text-emerald-700", dot: "bg-emerald-500" },
  { id: "purple", border: "border-purple-200", bg: "bg-purple-50/60", text: "text-purple-700", dot: "bg-purple-500" },
  { id: "amber", border: "border-amber-200", bg: "bg-amber-50/60", text: "text-amber-700", dot: "bg-amber-500" },
  { id: "rose", border: "border-rose-200", bg: "bg-rose-50/60", text: "text-rose-700", dot: "bg-rose-500" },
  { id: "indigo", border: "border-indigo-200", bg: "bg-indigo-50/60", text: "text-indigo-700", dot: "bg-indigo-500" },
  { id: "cyan", border: "border-cyan-200", bg: "bg-cyan-50/60", text: "text-cyan-700", dot: "bg-cyan-500" }
];

function formatTo12Hour(timeStr: string = "00:00") {
  if (!timeStr) return "12:00 AM";
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12; hour = hour ? hour : 12;
  return `${hour}:${minStr} ${ampm}`;
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
  
  // Roster Management States
  const [roster, setRoster] = useState<MemberRow[]>([]);
  const [stagedRoster, setStagedRoster] = useState<MemberRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Event & Setlist Framework States
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [eventSetlists, setEventSetlists] = useState<SetlistMetaItem[]>([]);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>("");

  // Track Stack States
  const [setlistSongs, setSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [stagedSetlistSongs, setStagedSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [hasSetlistChanges, setHasSetlistChanges] = useState(false);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);

  // Subview Layout Toggles
  const [viewSubScreen, setViewSubScreen] = useState<"matrix" | "setlists_list" | "songs_view">("matrix");
  const [isEditingSetlist, setIsEditingSetlist] = useState(false); 
  const [selectedNewSongId, setSelectedNewSongId] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [isSongDropdownOpen, setIsSongDropdownOpen] = useState(false);
  const [songSearchQuery, setSongSearchQuery] = useState("");

  // Reordering & Grouping States
  const [draggedSongIndex, setDraggedSongIndex] = useState<number | null>(null);
  const [customGroupName, setCustomGroupName] = useState("");
  const [selectedGroupColor, setSelectedGroupColor] = useState("blue");

  // "Load & Shoot" Matrix Interaction States
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

  // ✅ SURGICAL FIX: New UX Safeguard States
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [timePickerTargetItemId, setTimePickerTargetItemId] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState("08");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedPeriod, setSelectedPeriod] = useState("AM");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // ==========================================
  // --- DATA PIPELINE INTEGRATION ------------
  // ==========================================

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
    const { data, error } = await supabase
      .from("setlists")
      .select("id, name, event_id")
      .eq("event_id", targetEventId);

    if (!error && data && data.length > 0) {
      setEventSetlists(data);
      setSelectedSetlistId(data[0].id);
      await fetchLiveSetlistTracks(data[0].id);
    } else {
      setEventSetlists([]);
      setSelectedSetlistId("");
      setStagedSetlistSongs([]);
    }
  }

  async function fetchLiveSetlistTracks(setlistId: string) {
    if (!setlistId) return;
    const { data } = await supabase
      .from("setlist_songs")
      .select(`id, sequence_order, start_time, group_name, assigned_user_ids, group_color, parent_color, songs (*)`)
      .eq("setlist_id", setlistId)
      .order("sequence_order", { ascending: true });
    
    const formattedData = (data || []).map(row => {
      let rawGroup = row.group_name || null;
      let pName = null;
      let cName = rawGroup;
      if (rawGroup && rawGroup.includes(" >> ")) {
        const parts = row.group_name.split(" >> ");
        pName = parts[0]; cName = parts[1];
      }
      return {
        ...row, parent_group: pName, group_name: cName,
        parent_color: (row as any).parent_color || "zinc",
        group_color: (row as any).group_color || "zinc",
        assigned_user_ids: row.assigned_user_ids || []
      };
    }) as unknown as SetlistSongItem[];
    setSetlistSongs(formattedData); 
    setStagedSetlistSongs(formattedData);
    setHasSetlistChanges(false);
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
        setActiveEvent({ id: eventId, title: "June Week#3 2026", event_date: "2026-06-12", service_type: "Divine Service", description: "Operational block frame details." } as any);
      }

      await fetchEventSetlists(eventId);
      await syncRosterUI(activeWorkspaceId, combinedProfiles);
      setAllDatabaseSongs(await getAllSongs());
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // ==========================================
  // --- INTERACTION HANDLERS -----------------
  // ==========================================

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

  // ✅ SURGICAL FIX: Unsaved Warning Checks for Edit Modal
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
        alert("Update Blocked: Database Row Level Security (RLS) prevented the save. Please check your Supabase policies for the 'events' table.");
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

  // ✅ SURGICAL FIX: Delete Event Handler
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
        const { error: delError } = await supabase.from("event_rosters").delete().eq("id", id);
        if (delError) { alert(`Deletion Error: ${delError.message}`); setIsDeploying(false); return; }
      }

      const addedRows = stagedRoster.filter(sr => sr.isNew); 
      for (const row of addedRows) {
        const targetTeamId = activeEvent?.team_id || team?.id;
        const payload: any = { event_id: eventId, user_id: row.user_id, role: row.role };
        if (targetTeamId && targetTeamId !== "00000000-0000-0000-0000-000000000000") { payload.team_id = targetTeamId; }
        
        const { error: insError } = await supabase.from("event_rosters").insert(payload);
        if (insError) { alert(`Database Write Rejected: ${insError.message}`); setIsDeploying(false); return; }
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
        await fetchLiveSetlistTracks(data.id);
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
    // 1. Optimistic UI Update
    const optimisticItem: SetlistSongItem = { id: `temp-${Date.now()}`, sequence_order: newOrder, start_time: "08:30", assigned_user_ids: [], parent_group: null, group_name: null, songs: songToAdd };
    setSetlistSongs(prev => [...prev, optimisticItem]);
    setSelectedNewSongId(""); setSongSearchQuery(""); setIsSongDropdownOpen(false);

    // 2. Background Auto-Save
    await supabase.from('setlist_songs').insert({ 
      setlist_id: selectedSetlistId, song_id: songToAdd.id, sequence_order: newOrder, start_time: "08:30" 
    });
    // 3. Re-fetch to replace the temp ID with the real database UUID
    await fetchLiveSetlistTracks(selectedSetlistId); 
  }

  async function saveSetlistChanges() {
    if (activeRole !== "admin") return;
    setIsDeploying(true);
    let hasErrors = false;
    const removedIds = setlistSongs.filter(s => !stagedSetlistSongs.some(st => st.id === s.id)).map(r => r.id);
    if (removedIds.length > 0) {
      const { error } = await supabase.from('setlist_songs').delete().in('id', removedIds);
      if (error) hasErrors = true;
    }
    for (const item of stagedSetlistSongs) {
      const dbGroupName = item.parent_group ? `${item.parent_group} >> ${item.group_name}` : item.group_name || null;
      const payload = { sequence_order: item.sequence_order, group_name: dbGroupName, assigned_user_ids: item.assigned_user_ids || [], start_time: item.start_time || "08:30", group_color: item.group_color || "zinc", parent_color: item.parent_color || "zinc" };
      if (item.id.startsWith('temp-')) {
        await supabase.from('setlist_songs').insert({ setlist_id: selectedSetlistId, song_id: item.songs.id, ...payload });
      } else {
        await supabase.from('setlist_songs').update(payload).eq('id', item.id);
      }
    }
    if (!hasErrors) await fetchLiveSetlistTracks(selectedSetlistId);
    setIsDeploying(false);
  }

  async function handleSaveTimeSelection() {
    if (!timePickerTargetItemId) return;
    let finalHour = parseInt(selectedHour, 10);
    if (selectedPeriod === "PM" && finalHour !== 12) finalHour += 12;
    if (selectedPeriod === "AM" && finalHour === 12) finalHour = 0;
    const formatted24hTime = `${String(finalHour).padStart(2, "0")}:${selectedMinute}`;
    
    // 1. Optimistic UI Update
    setSetlistSongs(prev => prev.map(s => s.id === timePickerTargetItemId ? { ...s, start_time: formatted24hTime } : s));
    const targetId = timePickerTargetItemId;
    setIsTimePickerOpen(false); setTimePickerTargetItemId(null);

    // 2. Background Auto-Save
    if (!targetId.startsWith('temp-')) {
      await supabase.from('setlist_songs').update({ start_time: formatted24hTime }).eq('id', targetId);
    }
  }

  // Drag and drop sequencing
  function handleDragStart(index: number) { if (activeRole === "admin") setDraggedSongIndex(index); }
  
  function handleDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedSongIndex === null || draggedSongIndex === targetIndex || activeRole !== "admin") return;
    const reorderedSongs = [...setlistSongs];
    const [removed] = reorderedSongs.splice(draggedSongIndex, 1);
    reorderedSongs.splice(targetIndex, 0, removed);
    // Optimistic UI Update (Fires continuously while dragging)
    setSetlistSongs(reorderedSongs.map((song, i) => ({ ...song, sequence_order: i + 1 })));
    setDraggedSongIndex(targetIndex);
  }

  async function handleDragEnd() {
    setDraggedSongIndex(null);
    if (activeRole !== "admin") return;
    
    // Background Auto-Save (Fires concurrent updates for the new sequence)
    const promises = setlistSongs
      .filter(s => !s.id.startsWith('temp-'))
      .map(song => supabase.from('setlist_songs').update({ sequence_order: song.sequence_order }).eq('id', song.id));
      
    await Promise.all(promises);
  }

  function handleToggleCheckboxSelect(id: string) { setSelectedForGroup(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  async function applyGroupTransformation() {
    if (selectedForGroup.length === 0 || activeRole !== "admin") return;
    const finalGroupName = customGroupName.trim() || null;
    const selectedIds = [...selectedForGroup];
    
    // 1. Optimistic UI Update
    const updatedSongs = setlistSongs.map(song => selectedIds.includes(song.id) ? { ...song, group_name: finalGroupName, group_color: selectedGroupColor } : song);
    setSetlistSongs(updatedSongs); 
    setSelectedForGroup([]); setCustomGroupName("");

    // 2. Background Auto-Save
    await supabase.from('setlist_songs')
      .update({ group_name: finalGroupName, group_color: selectedGroupColor })
      .in('id', selectedIds.filter(id => !id.startsWith('temp-')));
  }

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
          return <div key={`flat-g-${gIdx}`} className="space-y-2.5">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>;
        }
        return (
          <div key={`g-${gIdx}`} className={`border-2 ${groupPalette.border} ${groupPalette.bg} rounded-[1rem] p-4 space-y-3 shadow-sm`}>
            <div className="flex justify-between items-center pb-2 border-b border-zinc-200/40">
              <h5 className={`font-black text-[12px] uppercase tracking-widest ${groupPalette.text}`}>{group.groupName || "SECTION BLOCK"}</h5>
            </div>
            <div className="space-y-2.5">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>
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
          className={`flex items-center justify-between rounded-2xl p-3 md:p-4 bg-white border shadow-sm min-h-[64px] transition-all duration-150 ${
            draggedSongIndex === globalIndex ? "opacity-40 scale-95 border-blue-400 border-dashed" : "hover:bg-zinc-50/50 cursor-grab active:cursor-grabbing"
          }`}
        >
          <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              {activeRole === "admin" && (
                <input type="checkbox" className="w-4 h-4 rounded border-zinc-300 checked:bg-blue-600 cursor-pointer" checked={selectedForGroup.includes(item.id)} onChange={() => handleToggleCheckboxSelect(item.id)} />
              )}
              {activeRole === "admin" && <div className="text-zinc-300 text-lg font-bold select-none cursor-grab px-1">☰</div>}
            </div>
            <div className="flex flex-col flex-1 min-w-0 select-none pl-1 md:pl-2">
              <div className="flex items-center gap-1.5 mb-1 shrink-0">
                <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center text-[9px] md:text-[10px] font-black uppercase tracking-tight">{item.target_key || item.songs?.original_key || "G"}</span>
                <span className="bg-zinc-100/80 text-zinc-500 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black tracking-tight whitespace-nowrap">{item.songs?.tempo || "70"} BPM</span>
              </div>
              <h4 className="font-bold text-[15px] md:text-[16px] text-zinc-900 leading-tight truncate">{item.songs?.title}</h4>
            </div>
          </div>
          <div className="ml-3 flex items-center shrink-0" onClick={e => e.stopPropagation()}>
            {activeRole === "admin" && ( 
              <button 
                onClick={async () => {
                  // 1. Optimistic UI Update: Instantly remove it from the visual lists
                  setStagedSetlistSongs(prev => prev.filter(s => s.id !== item.id));
                  setSetlistSongs(prev => prev.filter(s => s.id !== item.id)); // Sync the base state
                  
                  // 2. Background Auto-Save: Instantly delete it from Supabase
                  if (!item.id.startsWith('temp-')) {
                    const { error } = await supabase.from('setlist_songs').delete().eq('id', item.id);
                    if (error) {
                      console.error("Auto-save delete failed:", error.message);
                      // Optional: You could fetchLiveSetlistTracks here to revert the UI on failure
                    }
                  }
                }} 
                className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
              >
                ✕
              </button> 
            )}
          </div>
        </div>
      );

      if (parentBlock.parentGroup) {
        return (
          <div key={`parent-${pIdx}`} className={`border-2 border-zinc-200 bg-zinc-50/40 rounded-3xl p-5 space-y-4 mb-4 shadow-sm`}>
            <h4 className="text-[17px] font-extrabold text-zinc-900 px-1">{parentBlock.parentGroup}</h4>
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
    <div className="p-4 md:p-8 w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      
      {/* 🔴 STREAMLINED RESPONSIVE HERO BANNER 🔴 */}
      <div className="bg-[#2b6eff] text-white p-4 md:p-6 rounded-2xl shadow-sm overflow-hidden shrink-0">
        <div className="flex justify-between items-start gap-2">
          <div className="space-y-1">
            <button onClick={() => router.push("/events")} className="text-xs font-bold text-blue-100 hover:underline block mb-2">‹ Back to Events List</button>
          </div>
          
          {activeRole === "admin" && (
            <button onClick={handleOpenEditEventModal} className="px-3 md:px-4 py-2 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-black text-xs rounded-xl shadow-md backdrop-blur-md transition-all active:scale-95 uppercase tracking-wider flex items-center gap-2 shrink-0">
              <span>✏️</span> <span className="hidden sm:inline">Edit</span>
            </button>
          )}
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-1 leading-tight">{activeEvent?.title || "June Week#3 2026"}</h1>
      </div>

      {/* VIEW PANEL SELECTION TABS */}
      <div className="bg-white p-1 rounded-2xl border grid grid-cols-3 gap-1 text-center text-xs font-black uppercase tracking-wider shadow-sm mt-6">
        <button onClick={() => setViewSubScreen("matrix")} className={`py-3.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${viewSubScreen === "matrix" ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-black shadow-inner" : "bg-white text-zinc-400 border-transparent"}`}>
          <img src="/assets/participants.svg" className="w-4 h-4 object-contain" alt="" />
          Positions
        </button>
        <button onClick={() => setViewSubScreen("setlists_list")} className={`py-3.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${viewSubScreen === "setlists_list" ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-black shadow-inner" : "bg-white text-zinc-400 border-transparent"}`}>
          <img src="/assets/setlist.svg" className="w-4 h-4 object-contain" alt="" />
          Setlist
        </button>
        <button onClick={() => setViewSubScreen("songs_view")} className={`py-3.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${viewSubScreen === "songs_view" ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-black shadow-inner" : "bg-white text-zinc-400 border-transparent"}`} disabled={!selectedSetlistId}>
          <img src="/assets/music.svg" className="w-4 h-4 object-contain" alt="" />
          Tracks ({stagedSetlistSongs.length})
        </button>
      </div>

      {/* FIXED POSITION BAR: Persistent Inserter Engine */}
      {viewSubScreen === "songs_view" && activeRole === "admin" && (
        <div className="bg-white p-3 rounded-2xl border shadow-sm space-y-3">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Song Database</label>
          <div className="flex gap-3 relative overflow-visible">
            <div className="relative flex-1 overflow-visible">
              <input 
                type="text" 
                placeholder="Type track name to look up..." 
                value={songSearchQuery}
                onChange={(e) => { setSongSearchQuery(e.target.value); setIsSongDropdownOpen(true); }}
                onClick={() => setIsSongDropdownOpen(true)}
                className="w-full bg-zinc-50 border rounded-2xl px-5 py-3.5 text-sm font-bold text-zinc-800 focus:border-blue-500 focus:bg-white outline-none transition-all shadow-inner"
              />
              {isSongDropdownOpen && songSearchQuery.trim() !== "" && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-2xl z-[999999] max-h-48 overflow-y-auto custom-scrollbar divide-y">
                  {songFilteredDatabaseSongs.map(s => (
                    <div 
                      key={s.id} 
                      onClick={() => { setSelectedNewSongId(s.id); setSongSearchQuery(s.title); setIsSongDropdownOpen(false); }} 
                      className="px-5 py-3 hover:bg-blue-50 cursor-pointer transition-colors flex flex-col justify-center"
                    >
                      <span className="text-[13px] font-bold text-zinc-800 leading-tight">🎵 {s.title}</span>
                      {/* ✅ SURGICAL ADDITION: Show the artist right below the title! */}
                      <span className="text-[10px] font-bold text-zinc-400 mt-0.5 ml-5">
                        {s.artist || "Unknown Artist"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={handleAddSongSubmit} disabled={!selectedNewSongId} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black text-xs px-8 rounded-2xl uppercase tracking-widest transition-all shadow-md">Add to Setlist</button>
          </div>
        </div>
      )}

      {/* VIEW SCENARIOS RENDERING NODES */}
      {viewSubScreen === "matrix" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 content-start">
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
                  className={`bg-white p-3 rounded-[1rem] border shadow-sm flex flex-col min-h-[80px] transition-all duration-300 ${
                    loadedUserId && activeRole === "admin" 
                      ? isQualified ? "hover:border-blue-500 hover:bg-blue-50/30 cursor-pointer ring-4 ring-blue-500/10" : "opacity-40 grayscale cursor-not-allowed border-zinc-200"
                      : "hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-start justify-between relative">
                    <div>
                      <h5 className="font-extrabold text-sm md:text-base text-zinc-900 tracking-tight leading-tight">{cardRole}</h5>
                      <p className="text-[10px] md:text-[11px] font-bold text-zinc-400 mt-0.5">{list.length} Assigned</p>
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
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border transition-all duration-300 shrink-0 ${
                          isDisabledDrop ? "bg-zinc-100 text-zinc-300 border-zinc-100" :
                          loadedUserId ? "bg-blue-600 border-blue-600 text-white animate-pulse shadow-md" : "hover:bg-zinc-50"
                        }`}
                      >
                        {loadedUserId ? "↓" : "＋"}
                      </button> 
                    )}
                  </div>

                  <div className="flex-1 mt-3">
                    <div className="flex flex-wrap gap-2">
                      {list.map(m => (
                        <div key={m.id} className="flex flex-col items-center gap-1 group p-1 rounded-xl w-[3.5rem] relative" onClick={e => e.stopPropagation()}>
                          <div className="relative">
                            {m.profiles?.avatar_url ? (
                              <img src={m.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border shadow-sm" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shadow-sm border border-blue-700/20">{m.profiles?.full_name?.charAt(0) || "U"}</div>
                            )}
                            {activeRole === "admin" && ( 
                              <button type="button" onClick={() => handleOriginalLocalRemove(m.id)} className="absolute -top-1 -right-1 bg-red-100 text-red-600 rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-bold opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm">✕</button> 
                            )}
                          </div>
                          <span className="text-[9px] font-bold text-zinc-600 tracking-tight text-center truncate w-full">{m.profiles?.full_name?.split(' ')[0] || "User"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeRole === "admin" && isDockOpen && (
            <div className="bg-zinc-50/80 border border-zinc-200 p-4 rounded-[1rem] shadow-inner mt-2 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-200 mb-20 md:mb-0">
              <div className="flex items-center justify-between border-b border-zinc-200/60 pb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar no-scrollbar flex-1 pr-4">
                  <button onClick={() => setMatrixFilter("All")} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${matrixFilter === "All" ? "bg-zinc-900 text-white shadow-md scale-105" : "bg-white border text-zinc-500 hover:bg-zinc-100"}`}>All Hands</button>
                  
                  {Array.from(new Set(availablePool.flatMap(p => p.ministries || []))).map(min => (
                    <button key={min} onClick={() => setMatrixFilter(min)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${matrixFilter === min ? "bg-blue-600 text-white shadow-md scale-105" : "bg-white border text-zinc-500 hover:bg-zinc-100"}`}>{min}</button>
                  ))}

                  <button onClick={() => { setMatrixFilter("Unavailable"); setLoadedUserId(null); }} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ml-2 ${matrixFilter === "Unavailable" ? "bg-red-600 text-white shadow-md scale-105" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
                    Unavailable ({unavailablePool.length})
                  </button>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 pl-2">
                  {loadedUserId && (
                    <button onClick={() => setLoadedUserId(null)} className="text-[10px] font-black text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-full uppercase tracking-widest transition-colors shrink-0">Clear Selection</button>
                  )}
                  <button onClick={() => setIsDockOpen(false)} className="w-7 h-7 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center font-bold text-xs hover:bg-zinc-300 transition-colors">✕</button>
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
                      className={`flex flex-col items-center gap-2 shrink-0 transition-all duration-300 ${isBlocked ? "opacity-50 cursor-not-allowed grayscale" : isLoaded ? "-translate-y-2 scale-110" : "hover:-translate-y-1 hover:scale-105 active:scale-95"}`}
                    >
                      <div className={`w-12 h-12 rounded-full relative items-center justify-center font-black text-sm shadow-sm transition-all duration-300 ${isBlocked ? "bg-zinc-200 text-zinc-500 ring-1 ring-zinc-300" : isLoaded ? "bg-blue-600 text-white ring-4 ring-blue-500 ring-offset-2 shadow-lg" : "bg-blue-600 text-white ring-1 ring-zinc-200 border-2 border-white"}`}>
                        {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="flex items-center justify-center w-full h-full">{isBlocked ? "🚫" : p.full_name?.charAt(0) || "U"}</span>}
                        {isLoaded && <div className="absolute -bottom-1 -right-1 bg-blue-500 border-2 border-white text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm">✓</div>}
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest truncate w-16 text-center ${isBlocked ? "text-zinc-400" : isLoaded ? "text-blue-600" : "text-zinc-500"}`}>{p.full_name?.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`fixed bottom-20 md:bottom-8 left-4 right-4 md:left-auto md:right-8 bg-zinc-950 text-white border border-zinc-800 p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-4 rounded-2xl shadow-2xl transition-all duration-300 z-[10000] ${hasChanges && activeRole === "admin" ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'}`}>
            <p className="text-sm font-extrabold text-center md:text-left">Unsaved Lineup changes staged locally</p>
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
              <button type="button" onClick={() => { setStagedRoster(roster); setHasChanges(false); }} className="flex-1 md:flex-none px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 md:bg-transparent rounded-xl md:rounded-none transition-colors">Discard</button>
              <button type="button" onClick={saveLineupChanges} disabled={isDeploying} className="flex-[2] md:flex-none px-5 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all active:scale-95">{isDeploying ? 'Deploying...' : 'Save Lineup'}</button>
            </div>
          </div>
        </div>
      )}

      {viewSubScreen === "setlists_list" && (
        <div className="bg-white p-3 rounded-[1rem] border shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b pb-3">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Setlists Registered under this operational frame</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {eventSetlists.map((sl) => {
              const isTarget = selectedSetlistId === sl.id;
              return (
                <div key={sl.id} onClick={async () => { setSelectedSetlistId(sl.id); await fetchLiveSetlistTracks(sl.id); setViewSubScreen("songs_view"); }} className={`p-3 rounded-[1rem] border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[120px] group ${isTarget ? "border-blue-600 bg-blue-50/20 shadow-md" : "border-zinc-100 bg-zinc-50/40 hover:border-zinc-300 shadow-sm"}`}>
                  <h5 className="font-extrabold text-lg text-zinc-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">{sl.name}</h5>
                  <span className="text-xs font-black text-blue-600 self-end">View Tracks Array ›</span>
                </div>
              );
            })}
            {activeRole === "admin" && (
              <div 
                onClick={() => setIsCreateSetlistOpen(true)}
                className="p-3 rounded-[1rem] border-2 border-dashed border-zinc-200 hover:border-blue-500 hover:bg-blue-50/10 text-blue-600 font-extrabold text-xs uppercase tracking-widest flex items-center justify-center min-h-[120px] transition-all cursor-pointer shadow-sm select-none"
              >
                ＋ Add Setlist Block
              </div>
            )}
          </div>
        </div>
      )}

      {viewSubScreen === "songs_view" && (
        <div className="space-y-4">
          
          {selectedForGroup.length > 0 && activeRole === "admin" && (
            <div className="bg-zinc-900 text-white p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="space-y-1">
                <h5 className="text-xs font-black uppercase tracking-widest text-zinc-400">Section Grouping Controller</h5>
                <p className="text-sm font-bold text-white">{selectedForGroup.length} song segments checked across staging view matrix.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="text" 
                  placeholder="e.g., Fast Praise Praise Set, Worship Block..." 
                  value={customGroupName}
                  onChange={e => setCustomGroupName(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 font-bold outline-none focus:border-blue-500"
                />
                <select 
                  value={selectedGroupColor} 
                  onChange={e => setSelectedGroupColor(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs font-bold text-white outline-none"
                >
                  {COLOR_PALETTES.map(p => <option key={p.id} value={p.id}>{p.id.toUpperCase()}</option>)}
                </select>
                <button type="button" onClick={applyGroupTransformation} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md uppercase tracking-wider">Bundle Group</button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-[1rem] shadow-sm overflow-hidden flex flex-col">
            <div className="px-3 py-3 flex items-center justify-between border-b bg-white z-20 relative">
              <div className="space-y-0.5">
                <h3 className="font-extrabold text-zinc-950 text-lg tracking-tight">{eventSetlists.find(s => s.id === selectedSetlistId)?.name}</h3>
                <p className="text-xs font-semibold text-zinc-400">Drag handle corridors or skills lists to modify execution structures.</p>
              </div>
              <button type="button" onClick={handleStartRehearsal} disabled={stagedSetlistSongs.length === 0} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 font-black text-white text-xs uppercase tracking-widest shadow-md rounded-xl disabled:opacity-40">🚀 Start Rehearsal</button>
            </div>
            
            <div className="p-3 bg-zinc-50/50 space-y-4 overflow-y-auto custom-scrollbar">
              {parentBlockRowsRenderer(treeBlocks, isEditingSetlist)}
            </div>

            
          </div>
        </div>
      )}

      {/* --- EDIT ACTIVE EVENT OVERLAY MODAL --- */}
      {isEditEventOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[140000] flex items-center justify-center p-4"
          onClick={handleCloseEditModalRequest} // ✅ SURGICAL FIX: Backdrop triggers unsaved check
        >
          <form 
            onSubmit={handleUpdateEventSubmit} 
            onClick={(e) => e.stopPropagation()} // Prevents closing when clicking inside form
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 relative flex flex-col space-y-4 animate-in zoom-in-95"
          >
            <button type="button" onClick={handleCloseEditModalRequest} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-bold text-xs flex items-center justify-center transition-colors">✕</button>
            <h3 className="text-xl font-black text-zinc-900 tracking-tight">Edit Event Block</h3>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Event Title</label>
              <input type="text" required value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Type of Service Preset</label>
              <select value={editServiceType} onChange={(e) => setEditServiceType(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-colors cursor-pointer">
                {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Event Date</label>
              <input type="date" required value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">Summary Description</label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none h-24 resize-none focus:border-blue-500 focus:bg-white transition-colors custom-scrollbar" />
            </div>
            
            {/* ✅ SURGICAL FIX: Delete button placed alongside Commit Changes */}
            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowDeleteConfirm(true)}
                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 border border-red-200"
              >
                Delete
              </button>
              <button 
                type="submit" 
                disabled={isUpdatingEvent} 
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-95"
              >
                {isUpdatingEvent ? "Saving..." : "Commit Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ✅ SURGICAL FIX: Unsaved Changes Warning Modal (For Edit Overlay) */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border border-zinc-200">
            <h3 className="text-lg font-black text-zinc-900 mb-2 tracking-tight">Discard changes?</h3>
            <p className="text-xs text-zinc-500 font-medium mb-6">You have unsaved edits in your event block. Are you sure you want to close and lose this data?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowExitConfirm(false)} className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors">Keep Editing</button>
              <button onClick={forceCloseDiscardingChanges} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors">Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ SURGICAL FIX: Delete Event Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border border-zinc-200">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner border border-red-200 mb-4">⚠️</div>
            <h3 className="text-lg font-black text-zinc-900 mb-2 tracking-tight">Delete this event?</h3>
            <p className="text-xs text-zinc-500 font-medium mb-6">This will permanently delete the event, its setlists, and all scheduled lineups. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors">Cancel</button>
              <button onClick={handleDeleteEvent} disabled={isDeleting} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors">{isDeleting ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SUB-SETLIST MODAL BLOCK OVERLAY */}
      {isCreateSetlistOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[130000] flex items-center justify-center p-4">
          <form onSubmit={handleCreateSetlistBlockSubmit} className="bg-white rounded-[2rem] p-6 w-full max-w-sm border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <h4 className="font-black text-lg tracking-tight text-zinc-900">Create Setlist Block</h4>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 block">Setlist Block Name</label>
              <input type="text" required placeholder="e.g., Sunday Morning Service Setlist" value={newSetlistName} onChange={e => setNewSetlistName(e.target.value)} className="w-full bg-zinc-50 border p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setIsCreateSetlistOpen(false)} className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-xs font-bold text-zinc-500">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-blue-600 rounded-xl text-xs font-black text-white shadow-md uppercase tracking-wider">Build Block</button>
            </div>
          </form>
        </div>
      )}

      {/* TIME PICKER POPUP */}
      {isTimePickerOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[120000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-6 w-full max-w-xs shadow-2xl border space-y-4">
            <h4 className="font-black text-sm text-zinc-900">Set Execution Time</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <select value={selectedHour} onChange={e => setSelectedHour(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(h => <option key={h} value={h}>{h}</option>)}</select>
              </div>
              <div>
                <select value={selectedMinute} onChange={e => setSelectedMinute(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <div>
                <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm"><option value="AM">AM</option><option value="PM">PM</option></select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsTimePickerOpen(false)} className="flex-1 py-2 bg-zinc-100 rounded-xl text-xs font-bold text-zinc-500">Cancel</button>
              <button type="button" onClick={handleSaveTimeSelection} className="flex-1 py-2 bg-blue-600 rounded-xl text-xs font-black text-white">Apply</button>
            </div>
          </div>
        </div>
      )}
      
      {/* ======================================================= */}
      {/* ✅ SURGICAL REPLACEMENT: SUCCESS CONFIRMATION MODAL       */}
      {/* ======================================================= */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 select-none">
          
          {/* Keyframes for the blobs */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes morph-squish { 0%, 100% { transform: scale(1) rotate(0deg); } 25% { transform: scale(1.2, 0.8) rotate(10deg); } 50% { transform: scale(0.9, 1.15) rotate(-5deg); } 75% { transform: scale(1.05, 0.95) rotate(15deg); } }
            @keyframes pulse-ghost { 0%, 100% { transform: scale(1); opacity: 0.7; } 30% { transform: scale(1.6); opacity: 0.1; } 40% { transform: scale(0.8); opacity: 0.9; } }
            @keyframes blink { 0%, 96%, 100% { transform: scaleY(1); opacity: 1; } 98% { transform: scaleY(0.1); opacity: 0; } }
            
            .animate-morph-squish { animation: morph-squish 5s ease-in-out infinite; }
            .animate-pulse-ghost { animation: pulse-ghost 7s ease-in-out infinite; }
            .animate-blink { animation: blink 4s infinite; transform-origin: center; }
          `}} />

          {/* Dynamic Background Blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <Blob color="#10B981" w="110px" hasEyes animClass="animate-morph-squish" delay="0s" top="30%" right="30%" />
            <Blob color="#34D399" w="50px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" bottom="20%" left="20%" />
            <Blob color="#A7F3D0" w="80px" hasEyes={false} animClass="animate-morph-squish" delay="-2s" top="20%" left="30%" />
          </div>

          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 text-center relative z-10 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm border border-emerald-200 mb-6">
              <span className="font-black">✓</span>
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-900 tracking-tight">Success!</h3>
              <p className="text-[13px] font-bold text-zinc-500 mt-2">Lineup successfully synchronized and saved to the database.</p>
            </div>
            <button 
              type="button" 
              onClick={() => setShowSuccessModal(false)} 
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 mt-6"
            >
              Continue
            </button>
          </div>
        </div>
      )}

    </div>
  );
}