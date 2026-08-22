"use client";

import { useState, useEffect } from "react";
import { useEngine, type RoleType } from "../app/context/EngineContext";
import { createClient } from "../utils/supabase/client";

interface DBProfileRow {
  id: string;
  team_id?: string; 
  role: string; // ✅ ADDED: Role property
  full_name: string;
  email: string;
  avatar_url?: string;
  ministries: string[];
  unavailable_dates: string[];
  secondary_team_ids: string[]; 
}

const AVAILABLE_MINISTRY_POSITIONS = ["VAST", "Pastor", "Dancer", "Musician", "Backup", "Music Leader"];

export default function DevFab() {
  const supabase = createClient();
  const { simulatedRole, setSimulatedRole } = useEngine();
  
  // Viewport Draggable Drag and Drop States
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // Master Global User Directory Management Modals
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);
  const [globalProfiles, setGlobalProfiles] = useState<DBProfileRow[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  
  // ✅ ADDED: Search Filter State
  const [searchQuery, setSearchQuery] = useState("");

  // Active editing profile focus nodes
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formMinistries, setFormMinistries] = useState<string[]>([]);
  const [formDates, setFormDates] = useState<string[]>([]);
  const [formSecondaryTeams, setFormSecondaryTeams] = useState<string[]>([]); 
  const [stagedNewBlockoutDate, setStagedNewBlockoutDate] = useState("2026-06-14");
  const [isSavingData, setIsSavingData] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      setPosition({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
    }
  }, []);

  async function syncGlobalDatabaseProfiles() {
    setLoadingProfiles(true);
    
    // ✅ Fetch Profiles WITH secondary teams AND role
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, team_id, role, full_name, email, avatar_url, ministries, unavailable_dates, secondary_team_ids")
      .order("full_name", { ascending: true });
    
    // ✅ Fetch all teams to populate the multi-select dropdown
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name");
      
    if (profilesData) setGlobalProfiles(profilesData as DBProfileRow[]);
    if (teamsData) setAvailableTeams(teamsData);
    
    setLoadingProfiles(false);
  }

  useEffect(() => {
    if (isGlobalModalOpen) {
      syncGlobalDatabaseProfiles();
      setEditingProfileId(null);
      setSearchQuery(""); // Reset search when opening
    }
  }, [isGlobalModalOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      setPosition(prev => ({
        x: Math.min(Math.max(16, prev.x), window.innerWidth - 70),
        y: Math.min(Math.max(16, prev.y), window.innerHeight - 70)
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = position.x;
    const initialY = position.y;
    let dragTriggered = false;

    const targetButton = e.currentTarget;
    targetButton.setPointerCapture(e.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        dragTriggered = true;
        setIsDragging(true);
      }

      setPosition({
        x: Math.min(Math.max(16, initialX + deltaX), dimensions.width - 64),
        y: Math.min(Math.max(16, initialY + deltaY), dimensions.height - 64)
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      targetButton.releasePointerCapture(upEvent.pointerId);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);

      if (!dragTriggered) {
        setIsOpen(prev => !prev);
      }
      setTimeout(() => setIsDragging(false), 40);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  function handleTriggerTargetedEditMode(profile: DBProfileRow) {
    setEditingProfileId(profile.id);
    setFormName(profile.full_name || "");
    setFormMinistries(profile.ministries || []);
    setFormDates(profile.unavailable_dates || []);
    setFormSecondaryTeams(profile.secondary_team_ids || []); 
  }

  function handleToggleFormMinistrySelection(tag: string) {
    setFormMinistries(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }
  
  function handleToggleFormTeamSelection(teamId: string) {
    setFormSecondaryTeams(prev => prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId]);
  }

  function handleAppendFormBlockoutDate() {
    if (!stagedNewBlockoutDate || formDates.includes(stagedNewBlockoutDate)) return;
    setFormDates([...formDates, stagedNewBlockoutDate].sort());
  }

  function handleRemoveFormBlockoutDate(dateStr: string) {
    setFormDates(formDates.filter(d => d !== dateStr));
  }

  async function handleCommitProfileEditsToDB(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProfileId || !formName.trim() || isSavingData) return;

    setIsSavingData(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formName.trim(),
        ministries: formMinistries,
        unavailable_dates: formDates,
        secondary_team_ids: formSecondaryTeams 
      })
      .eq("id", editingProfileId);

    if (!error) {
      setGlobalProfiles(prev => 
        prev.map(p => p.id === editingProfileId 
          ? { ...p, full_name: formName.trim(), ministries: formMinistries, unavailable_dates: formDates, secondary_team_ids: formSecondaryTeams } 
          : p
        )
      );
      setEditingProfileId(null);
    } else {
      alert(`Database Mutation Blocked: ${error.message}`);
    }
    setIsSavingData(false);
  }

  // ✅ SURGICAL FIX: Upgraded to a 4-tier Role Assignment Function
  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) throw error;
      setGlobalProfiles(prev => prev.map(p => 
        p.id === userId ? { ...p, role: newRole } : p
      ));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown role update error.";
      alert(`Failed to change role: ${message}`);
    }
  }

  // ✅ Filter profiles dynamically based on the search input
  const filteredProfiles = globalProfiles.filter(p => 
    p.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (position.x === 0 && position.y === 0) return null;

  const popupWidth = 250;
  const popupHeight = 155;
  const computedLeft = Math.min(dimensions.width - popupWidth - 24, Math.max(16, position.x - 95));
  const isTopHalf = position.y < dimensions.height / 2;
  const computedTop = isTopHalf ? position.y + 68 : Math.max(16, position.y - popupHeight - 16);

  return (
    <>
      {isOpen && !isGlobalModalOpen && (
        <div 
          style={{ left: `${computedLeft}px`, top: `${computedTop}px`, width: `${popupWidth}px` }}
          className="fixed bg-[#0c1527] text-white p-4 rounded-2xl shadow-2xl border border-zinc-800 z-[999998] flex flex-col gap-3 select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <h5 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Dev Simulation Context</h5>
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-2 text-xs font-bold">
            <span className="text-zinc-400 font-medium">Access Role</span>
            <select 
              value={simulatedRole} 
              onChange={(e) => setSimulatedRole(e.target.value as RoleType)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] font-black text-white outline-none cursor-pointer focus:border-blue-500"
            >
              <option value="admin">ADMIN</option>
              <option value="moderator">MODERATOR</option>
              <option value="musician">MUSICIAN</option>
              <option value="member">MEMBER</option>
              <option value="none">NONE (AUTH)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => { setIsGlobalModalOpen(true); setIsOpen(false); }}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-colors text-center"
          >
            👥 Open Global User Manager
          </button>
        </div>
      )}

      {isGlobalModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[250000] flex items-center justify-center p-4 md:p-6 select-none animate-in fade-in duration-150">
          <div className="bg-[#f8f9fa] rounded-[1rem] shadow-2xl border w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-150">
            
            <div className="bg-white border-b border-zinc-200 px-3 py-3 flex items-center justify-between flex-shrink-0">
              <div className="space-y-0.5">
                <h3 className="font-black text-xl text-zinc-900 tracking-tight flex items-center gap-2">
                  <span>👥</span> Global User Accounts Registry
                </h3>
                <p className="text-xs font-bold text-zinc-400">Database administrative controller overrides engine panel context nodes.</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsGlobalModalOpen(false)}
                className="w-9 h-9 rounded-full bg-zinc-50 hover:bg-zinc-100 text-zinc-400 font-bold text-xs border flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-3">
              
              {/* ✅ ADDED: Sleek Search Bar */}
              <div className="max-w-md">
                <input 
                  type="text" 
                  placeholder="Search users by name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-zinc-800 focus:border-blue-500 focus:outline-none transition-all shadow-inner"
                />
              </div>

              {loadingProfiles ? (
                <div className="text-center py-20 text-xs font-black uppercase text-zinc-400 tracking-widest animate-pulse">Querying Database User Registries Matrix...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                  
                  {/* ✅ Switched to mapping filteredProfiles */}
                  {filteredProfiles.map((profile) => {
                    const isRowEditingActive = editingProfileId === profile.id;

                    return (
                      <div 
                        key={profile.id} 
                        // ✅ ADDED: 'relative' class to anchor the absolute toggle switch
                        className={`relative bg-white border rounded-[1rem] p-3 shadow-sm transition-all duration-150 ${
                          isRowEditingActive ? "border-blue-500 ring-2 ring-blue-500/10" : "border-zinc-200"
                        }`}
                      >
                        
                        {/* ✅ SURGICAL FIX: 4-Tier Role Dropdown */}
                        {!isRowEditingActive && (
                          <div className="absolute top-6 right-6 flex items-center gap-2">
                            <select
                              value={profile.role || 'member'}
                              onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                              className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border outline-none cursor-pointer transition-colors shadow-sm ${
                                profile.role === 'admin' ? 'bg-red-50 text-red-600 border-red-200' :
                                profile.role === 'moderator' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                profile.role === 'musician' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                'bg-zinc-50 text-zinc-500 border-zinc-200'
                              }`}
                            >
                              <option value="admin">Admin</option>
                              <option value="moderator">Moderator</option>
                              <option value="musician">Musician</option>
                              <option value="member">Member</option>
                            </select>
                          </div>
                        )}

                        {isRowEditingActive ? (
                          <form onSubmit={handleCommitProfileEditsToDB} className="space-y-4 animate-in fade-in duration-100">
                            
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Modify Full Name Signature</label>
                              <input 
                                type="text" 
                                required 
                                value={formName} 
                                onChange={e => setFormName(e.target.value)} 
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2 text-xs font-bold text-zinc-800 outline-none focus:border-blue-500 focus:bg-white" 
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Assigned Workspace Positions</label>
                              <div className="flex flex-wrap gap-1.5">
                                {AVAILABLE_MINISTRY_POSITIONS.map(tag => {
                                  const isChecked = formMinistries.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => handleToggleFormMinistrySelection(tag)}
                                      className={`px-3 py-1 rounded-xl text-[10px] font-black border transition-all ${
                                        isChecked 
                                          ? "bg-blue-600 text-white border-blue-500 shadow-sm" 
                                          : "bg-zinc-50 text-zinc-400 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-600"
                                      }`}
                                    >
                                      {isChecked ? `✓ ${tag}` : tag}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-1 border-t border-zinc-100 mt-2">
                              <label className="text-[10px] font-black text-purple-600 uppercase tracking-wider block">Multi-Campus Access Permissions</label>
                              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar border rounded-xl p-2 bg-zinc-50">
                                {availableTeams.map(team => {
                                  const isPrimary = profile.team_id === team.id;
                                  const isChecked = isPrimary || formSecondaryTeams.includes(team.id);
                                  
                                  return (
                                    <div 
                                      key={team.id} 
                                      onClick={() => {
                                        if (!isPrimary) handleToggleFormTeamSelection(team.id);
                                      }}
                                      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                        isPrimary ? "bg-purple-50/50 border-purple-200 cursor-not-allowed opacity-90" : 
                                        isChecked ? "bg-white border-purple-200 shadow-sm cursor-pointer" : 
                                        "border-transparent hover:bg-white hover:border-zinc-200 cursor-pointer"
                                      }`}
                                    >
                                      <input type="checkbox" checked={isChecked} readOnly className={`pointer-events-none ${isPrimary ? "accent-purple-400" : "accent-purple-600"}`} />
                                      <span className={`text-[11px] font-bold ${isChecked ? "text-zinc-900" : "text-zinc-500"}`}>
                                        {team.name} 
                                        {isPrimary && <span className="text-[9px] font-black uppercase text-purple-600 ml-1.5 tracking-widest">(Primary)</span>}
                                      </span>
                                    </div>
                                  )
                                })}
                                {availableTeams.length === 0 && <span className="text-[10px] text-zinc-400 italic">No teams available in database.</span>}
                              </div>
                            </div>

                            <div className="space-y-2 pt-1 border-t border-zinc-100 mt-2">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mt-2">Date Blocked Roster Schedule Manager</label>
                              <div className="flex flex-wrap gap-1.5 bg-zinc-50 p-2.5 rounded-xl border max-h-24 overflow-y-auto custom-scrollbar">
                                {formDates.map(dStr => (
                                  <span key={dStr} className="inline-flex items-center gap-1 bg-white border border-zinc-200 px-2 py-0.5 rounded-lg text-[10px] font-bold text-zinc-700 shadow-sm">
                                    🚫 {dStr}
                                    <button type="button" onClick={() => handleRemoveFormBlockoutDate(dStr)} className="ml-1 text-[10px] font-bold text-zinc-400 hover:text-red-500">✕</button>
                                  </span>
                                ))}
                                {formDates.length === 0 && <span className="text-[10px] italic text-zinc-400 p-1 font-medium">Calendar is completely open.</span>}
                              </div>

                              <div className="flex gap-2">
                                <input 
                                  type="date" 
                                  value={stagedNewBlockoutDate} 
                                  onChange={e => setStagedNewBlockoutDate(e.target.value)} 
                                  className="bg-zinc-50 border rounded-xl px-2.5 py-1.5 text-[11px] font-bold outline-none cursor-pointer focus:border-blue-500" 
                                />
                                <button type="button" onClick={handleAppendFormBlockoutDate} className="px-3 bg-zinc-950 text-white font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-zinc-800 transition-colors">Block Date</button>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-zinc-100">
                              <button type="button" onClick={() => setEditingProfileId(null)} className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 text-xs font-bold rounded-xl">Cancel</button>
                              <button type="submit" disabled={isSavingData} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm">{isSavingData ? "Syncing..." : "Save Edits"}</button>
                            </div>

                          </form>
                        ) : (
                          <div className="space-y-4 flex flex-col justify-between h-full min-h-[160px]">
                            <div className="space-y-3.5 pr-14"> {/* Added pr-14 to prevent text overlapping the toggle */}
                              <div className="flex items-center gap-3">
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} className="w-12 h-12 rounded-xl object-cover border" alt="" />
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-sm">{profile.full_name?.charAt(0)}</div>
                                )}
                                <div className="min-w-0 leading-tight">
                                  <h4 className="font-extrabold text-[15px] text-zinc-900 truncate">{profile.full_name}</h4>
                                  <p className="text-xs text-zinc-400 font-bold truncate mt-0.5">{profile.email}</p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {profile.ministries?.map(m => (
                                    <span key={m} className="text-[9px] bg-zinc-50 border border-zinc-200/60 text-zinc-500 font-black px-2 py-0.5 rounded-md uppercase tracking-tight">{m}</span>
                                  ))}
                                  {(!profile.ministries || profile.ministries.length === 0) && <span className="text-[10px] text-zinc-400 italic font-medium">No position groups assigned.</span>}
                                </div>

                                {profile.secondary_team_ids && profile.secondary_team_ids.length > 0 && (
                                  <div className="text-[9px] font-black uppercase tracking-widest text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100 inline-block">
                                    {profile.secondary_team_ids.length} Extra Workspace{profile.secondary_team_ids.length > 1 ? "s" : ""}
                                  </div>
                                )}

                                <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5 truncate max-w-full">
                                  <span>🚫 Blocked:</span>
                                  <span className="text-zinc-600 truncate font-semibold">
                                    {profile.unavailable_dates?.length > 0 ? profile.unavailable_dates.join(", ") : "None"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-zinc-100">
                              <button
                                type="button"
                                onClick={() => handleTriggerTargetedEditMode(profile)}
                                className="w-full py-2 bg-zinc-50 border border-zinc-200 text-zinc-800 hover:bg-zinc-950 hover:text-white hover:border-zinc-950 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-inner text-center cursor-pointer"
                              >
                                Modify Profile
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {filteredProfiles.length === 0 && !loadingProfiles && (
                    <div className="col-span-1 md:col-span-2 text-center py-12 text-zinc-400 font-bold text-sm">
                      No profiles found matching "{searchQuery}"
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Inside your Dev Simulator FAB render block */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          style={{ left: `${position.x}px`, top: `${position.y}px` }}
          className={`fixed w-14 h-14 rounded-full bg-[#0c1527] border border-zinc-800 text-white flex items-center justify-center shadow-2xl z-[999998] select-none transition-transform hover:scale-105 active:scale-95 duration-75 touch-none ${
            isDragging ? "cursor-grabbing opacity-75" : "cursor-grab"
          } ${isOpen || isGlobalModalOpen ? "ring-4 ring-blue-500/30 border-blue-500 bg-zinc-950" : ""}`}
          title="Drag anywhere to reposition workspace tools. Click once to pull up global configuration panel overrides."
        >
          <span className="text-lg pointer-events-none select-none flex items-center justify-center">
             <img 
              src="/assets/account.svg" 
              alt="Dev Simulator" 
              className="w-5 h-5 object-contain"
              style={{ filter: "brightness(0) invert(1)" }} 
            />
          </span>
        </button>
    </>
  );
}