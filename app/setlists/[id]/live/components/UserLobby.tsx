import React, { useRef, useState, useEffect, useMemo } from "react";
import { createClient } from "../../../../../utils/supabase/client";
import { useSetlistInvites } from "../../../../../components/SetlistInviteProvider";

interface TeamRosterProfile {
  id: string;
  full_name: string | null;
  role: string | null;
  ministries: string[] | null;
  avatar_url: string | null;
}

interface LobbyPerson {
  id: string;
  name: string;
  initials?: string;
  avatar?: string | null;
  isMD?: boolean;
}

interface LobbyReader {
  id: string;
  name: string;
  initials?: string;
  avatar?: string | null;
}

interface LobbyMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  targetUserId?: string;
  timestamp: number;
  seenBy?: LobbyReader[];
}

interface UserLobbyProps {
  isOpen: boolean;
  onClose: () => void;
  onlineUsers: LobbyPerson[];
  localPresenceUser: LobbyPerson | null;
  lobbyMessages: LobbyMessage[];
  sendChatMessage: (text: string, targetId?: string) => void;
  sendPingMessage: (text: string, targetId?: string) => void;
  sendReadReceipt: (messageId: string) => void; // ✅ Add Prop
  pingCooldown: number;
  lastReadTimes: Record<string, number>;
  setLastReadTimes: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  teamId: string | null;
  setlistId: string;
  setlistName: string;
  eventName: string;
  trackTitles: string[];
}

export function UserLobby({ isOpen, onClose, onlineUsers, localPresenceUser, lobbyMessages, sendChatMessage, sendPingMessage, sendReadReceipt, pingCooldown, lastReadTimes, setLastReadTimes, teamId, setlistId, setlistName, eventName, trackTitles }: UserLobbyProps) {
  const supabase = useMemo(() => createClient(), []);
  const { onlineByTeam, sendInvite, cooldownSeconds } = useSetlistInvites();
  const [dragY, setDragY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [whisperTarget, setWhisperTarget] = useState<LobbyPerson | null>(null);
  
  // ✅ SURGICAL ADDITION: Ping Toggle State
  const [isPingMode, setIsPingMode] = useState(false);
  const [showInviteList, setShowInviteList] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [teamRoster, setTeamRoster] = useState<TeamRosterProfile[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [sentInvites, setSentInvites] = useState<Record<string, boolean>>({});
  
  const startY = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const rosterLoadedForTeamRef = useRef<string | null>(null);
  const lastReadEffectKeyRef = useRef("");

  useEffect(() => {
    if (!isOpen || !showInviteList || !teamId) return;
    if (rosterLoadedForTeamRef.current === teamId) return;
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => setRosterLoading(true), 0);
    supabase
      .from("profiles")
      .select("id, full_name, role, ministries, avatar_url")
      .or(`team_id.eq.${teamId},secondary_team_ids.cs.{${teamId}}`)
      .order("full_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load team members for setlist invites:", error.message);
          rosterLoadedForTeamRef.current = null;
        } else {
          rosterLoadedForTeamRef.current = teamId;
        }
        setTeamRoster((data || []) as TeamRosterProfile[]);
        setRosterLoading(false);
      });
    return () => { cancelled = true; window.clearTimeout(loadingTimer); };
  }, [isOpen, showInviteList, teamId, supabase]);

  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setDragY(0);
      setShowInviteList(false);
      onClose();
    }, 250);
  };

  const handleTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) setDragY(diff);
  };
  const handleTouchEnd = () => {
    if (dragY > 100) triggerClose();
    else setDragY(0);
  };

  // ✅ SURGICAL FIX: Hoisted Memos ABOVE Effects to fix the ReferenceError
  const visibleMessages = useMemo(() => {
    if (whisperTarget) {
      return lobbyMessages.filter(msg => 
        (msg.senderId === localPresenceUser?.id && msg.targetUserId === whisperTarget.id) ||
        (msg.senderId === whisperTarget.id && msg.targetUserId === localPresenceUser?.id)
      );
    }
    return lobbyMessages.filter(msg => !msg.targetUserId);
  }, [lobbyMessages, localPresenceUser, whisperTarget]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    lobbyMessages.forEach(msg => {
       if (msg.senderId === localPresenceUser?.id) return;
       
       if (msg.targetUserId === localPresenceUser?.id) {
          const lastRead = lastReadTimes[msg.senderId] || 0;
          if (msg.timestamp > lastRead) counts[msg.senderId] = (counts[msg.senderId] || 0) + 1;
       } else if (!msg.targetUserId) {
          const lastRead = lastReadTimes['global'] || 0;
          if (msg.timestamp > lastRead) counts['global'] = (counts['global'] || 0) + 1;
       }
    });
    return counts;
  }, [lobbyMessages, lastReadTimes, localPresenceUser]);

  const allUsers = useMemo(() => {
    const usersMap = new Map<string, LobbyPerson>();
    onlineUsers.forEach((user) => { if (user.id) usersMap.set(user.id, user); });
    if (localPresenceUser) usersMap.set(localPresenceUser.id, localPresenceUser);
    
    return Array.from(usersMap.values()).sort((a, b) => {
      if (a.isMD && !b.isMD) return -1;
      if (!a.isMD && b.isMD) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [onlineUsers, localPresenceUser]);

  const teamPresence = useMemo(() => onlineByTeam[teamId || ""] || [], [onlineByTeam, teamId]);
  const presenceByUser = useMemo(() => new Map(teamPresence.map((user) => [user.userId, user])), [teamPresence]);
  const inviteCandidates = useMemo(() => teamRoster
    .filter((profile) => profile.id !== localPresenceUser?.id)
    .map((profile) => ({ profile, presence: presenceByUser.get(profile.id) }))
    .filter(({ profile, presence }) => (!onlineOnly || Boolean(presence)) &&
      `${profile.full_name || ""} ${profile.role || ""} ${(profile.ministries || []).join(" ")}`.toLowerCase().includes(inviteSearch.toLowerCase().trim()))
    .sort((a, b) => Number(Boolean(b.presence)) - Number(Boolean(a.presence)) || (a.profile.full_name || "").localeCompare(b.profile.full_name || "")),
  [teamRoster, presenceByUser, onlineOnly, inviteSearch, localPresenceUser]);

  const handleInvite = async (recipientId: string) => {
    if (!teamId) return;
    const sent = await sendInvite(teamId, recipientId, setlistId, setlistName, eventName, trackTitles);
    if (sent) {
      setSentInvites((previous) => ({ ...previous, [recipientId]: true }));
      window.setTimeout(() => setSentInvites((previous) => {
        const next = { ...previous };
        delete next[recipientId];
        return next;
      }), 10_000);
    }
  };

  // Effects execute now that dependencies exist
  useEffect(() => {
    if (isOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lobbyMessages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const latestMessage = visibleMessages[visibleMessages.length - 1];
    const readKey = `${whisperTarget?.id || "global"}:${latestMessage?.id || "empty"}`;
    if (lastReadEffectKeyRef.current === readKey) return;
    lastReadEffectKeyRef.current = readKey;

    if (whisperTarget) {
      setLastReadTimes(prev => ({ ...prev, [whisperTarget.id]: Date.now() }));
    } else {
      setLastReadTimes(prev => ({ ...prev, global: Date.now() }));
    }
    
    // Broadcast Network Read Receipt for the latest message visible
    if (visibleMessages.length > 0) {
      const lastMsg = visibleMessages[visibleMessages.length - 1];
      const iHaveSeenIt = (lastMsg.seenBy || []).some((user) => user.id === localPresenceUser?.id);
      
      if (lastMsg.senderId !== localPresenceUser?.id && !iHaveSeenIt) {
        sendReadReceipt(lastMsg.id);
      }
    }
  }, [whisperTarget, visibleMessages, isOpen, localPresenceUser?.id, sendReadReceipt, setLastReadTimes]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[250000] flex items-end sm:items-center justify-center select-none transition-opacity duration-250 ${isClosing ? "opacity-0" : "animate-in fade-in"} bg-surface text-on-surface font-sans`}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={triggerClose} />
      
      <div 
        className="bg-surface-container-low w-full sm:max-w-md h-[85vh] sm:h-[80vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-bottom-full duration-300 border border-outline-variant/30"
        style={{ 
          transform: isClosing ? 'translateY(100vh)' : (dragY > 0 ? `translateY(${dragY}px)` : undefined), 
          transition: isClosing || dragY === 0 ? 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : 'none' 
        }}
      >
        <div 
          className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 touch-none cursor-grab active:cursor-grabbing border-b border-outline-variant/20"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-surface-container-highest rounded-full sm:hidden" />
          <button type="button" onClick={showInviteList ? () => setShowInviteList(false) : triggerClose} className="absolute left-4 w-8 h-8 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center hover:bg-surface-bright transition-colors cursor-pointer border border-outline-variant/30" aria-label={showInviteList ? "Back to lobby" : "Close lobby"}>
            <span className="material-symbols-outlined !text-[18px]">{showInviteList ? "arrow_back" : "close"}</span>
          </button>
          <h2 className="!text-[18px] font-extrabold text-on-surface tracking-tight">{showInviteList ? "Invite to Setlist" : "Active Lobby"}</h2>
          {!showInviteList ? (
            <button type="button" onClick={() => setShowInviteList(true)} className="absolute right-4 flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-on-primary transition hover:bg-primary/80">
              <span className="material-symbols-outlined !text-[16px]">person_add</span> Invite
            </button>
          ) : <span className="absolute right-4 w-8" />}
        </div>

        {showInviteList ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
            <p className="text-[11px] font-medium leading-relaxed text-on-surface-variant">Invite a teammate to <span className="font-bold text-on-surface">{eventName} — {setlistName}</span>. Invitations expire after 10 seconds.</p>
            <input value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} placeholder="Search team members..." className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none placeholder:text-outline focus:border-primary" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Team members</span>
              <button type="button" onClick={() => setOnlineOnly((value) => !value)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${onlineOnly ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-outline-variant/30 bg-surface-container-high text-on-surface-variant"}`}>
                {onlineOnly ? "Online only" : "All members"}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto custom-scrollbar">
              {rosterLoading ? (
                <div className="py-8 text-center text-xs font-semibold text-on-surface-variant">Loading team members…</div>
              ) : inviteCandidates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-outline-variant/30 px-4 py-8 text-center text-xs font-semibold text-on-surface-variant">
                  {onlineOnly ? "No teammates are online right now." : "No matching team members found."}
                </div>
              ) : inviteCandidates.map(({ profile, presence }) => {
                const roles = profile.ministries?.length ? profile.ministries.join(" · ") : (profile.role || "Team member");
                const isBusyElsewhere = Boolean(presence?.activeSetlistId && presence.activeSetlistId !== setlistId);
                const isAlreadyInSetlist = presence?.activeSetlistId === setlistId;
                const cooldown = cooldownSeconds(profile.id);
                const isSent = sentInvites[profile.id];
                const disabled = !presence || isBusyElsewhere || isAlreadyInSetlist || isSent || cooldown > 0;
                return (
                  <div key={profile.id} className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-xs font-black text-primary">
                        {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : (profile.full_name || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                        <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface-container ${presence ? "bg-emerald-400" : "bg-zinc-500"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-on-surface">{profile.full_name || "Team member"}</p>
                        <p className="truncate text-[10px] font-medium text-on-surface-variant">{roles}{isBusyElsewhere ? " · In another setlist" : ""}{isAlreadyInSetlist ? " · Already here" : ""}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <button type="button" disabled={disabled} onClick={() => void handleInvite(profile.id)} aria-label={cooldown > 0 ? `Invite cooldown: ${cooldown} seconds` : `Invite ${profile.full_name || "team member"}`} className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-on-primary transition disabled:cursor-not-allowed ${cooldown > 0 ? "bg-rose-500/15 text-rose-400" : "bg-primary hover:bg-primary/80 disabled:bg-surface-container-high disabled:text-on-surface-variant"}`}>
                        {cooldown > 0 ? <span className="material-symbols-outlined !text-[18px]">close</span> : isSent ? <span className="material-symbols-outlined !text-[18px]">check</span> : isBusyElsewhere || isAlreadyInSetlist || !presence ? <span className="material-symbols-outlined !text-[16px]">block</span> : <span className="material-symbols-outlined !text-[20px]">add</span>}
                      </button>
                      {cooldown > 0 && <span className="text-[9px] font-black text-rose-400">{cooldown}s</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          
          {/* USER ROSTER (Top Half) */}
          <div className="flex flex-col gap-2 max-h-[35%] overflow-y-auto custom-scrollbar pr-1">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                {allUsers.length} Connection{allUsers.length !== 1 ? 's' : ''}
              </span>
              {/* ✅ SURGICAL FIX: Display Global Unread if whispering */}
              {whisperTarget && unreadCounts['global'] > 0 && (
                <button onClick={() => setWhisperTarget(null)} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-500/20">
                  Global ({unreadCounts['global']})
                </button>
              )}
            </div>

            {/* ✅ SURGICAL FIX: Removed Global Chat Row */}

            {allUsers.map((u) => {
              const isMe = u.id === localPresenceUser?.id;
              const isWhisperingThisUser = whisperTarget?.id === u.id;
              const unread = unreadCounts[u.id] || 0;

              return (
                <div 
                  key={u.id} 
                  onClick={() => { if (!isMe) setWhisperTarget(isWhisperingThisUser ? null : u); }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${isMe ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'} ${isWhisperingThisUser ? 'ring-2 ring-purple-500 bg-purple-500/10 border-purple-500/30' : u.isMD ? 'ring-2 ring-blue-600 bg-blue-600/10 border-blue-600/30 shadow-sm' : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/20'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full border border-[#18181A] overflow-hidden bg-blue-600 flex items-center justify-center relative shadow-sm shrink-0">
                      {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" /> : <span className="text-[10px] text-white font-bold">{u.initials}</span>}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-bold text-on-surface truncate">
                        {u.name} {isMe ? "(You)" : ""}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${u.isMD ? 'text-blue-500' : 'text-on-surface-variant'}`}>
                        {u.isMD ? "Music Director" : "Musician"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {unread > 0 && !isWhisperingThisUser && (
                       <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[10px] font-black text-white shadow-sm">
                         {unread}
                       </span>
                    )}
                    {/* ✅ SURGICAL FIX: Resized MD Shield and Chat Bubble down to 12px */}
                    {u.isMD && !unread && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-sm">
                        <span className="material-symbols-outlined !text-[16px]">verified_user</span>
                      </div>
                    )}
                    {isWhisperingThisUser && (
                      <span className="material-symbols-outlined text-[12px] text-purple-400 mr-1">chat</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* CHAT AREA (Bottom Half) */}
          <div className="flex-1 flex flex-col bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden relative shadow-inner">
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {visibleMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <span className="text-[11px] font-bold text-on-surface-variant italic whitespace-pre-wrap">
                    {whisperTarget 
                      ? `No messages yet.\nStart a private chat with ${whisperTarget.name.split(' ')[0]}.` 
                      : `No messages yet.\nSay hello to the team!`}
                  </span>
                </div>
              ) : (
                visibleMessages.map(msg => {
                  const isMe = msg.senderId === localPresenceUser?.id;
                  const isWhisper = !!msg.targetUserId;
                  
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-baseline gap-1.5 mb-1">
                         <span className="text-[10px] font-black text-on-surface-variant">{isMe ? 'You' : msg.senderName}</span>
                         {isWhisper && <span className="text-[8px] font-bold uppercase text-purple-400 tracking-widest">Whispers</span>}
                         {/* ✅ SURGICAL ADDITION: Formatted Local Timestamp */}
                         <span className="text-[8px] font-bold text-outline ml-1">
                           {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                      </div>
                      <div className={`px-3 py-2 rounded-2xl text-[13px] max-w-[85%] break-words shadow-sm ${
                        isWhisper 
                          ? 'bg-purple-500/20 text-purple-100 border border-purple-500/30' 
                          : isMe 
                            ? 'bg-blue-600 text-white rounded-br-sm' 
                            : 'bg-surface-container-high text-on-surface rounded-bl-sm border border-outline-variant/20'
                      }`}>
                        {msg.text}
                      </div>
                      
                      {/* ✅ SURGICAL ADDITION: Network Read Receipt Avatars */}
                      {msg.seenBy && msg.seenBy.length > 0 && (
                        <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {msg.seenBy.map((reader, i) => (
                            <div key={i} className="w-3.5 h-3.5 rounded-full overflow-hidden bg-surface-container-highest border border-surface shadow-sm" title={`Seen by ${reader.name}`}>
                              {reader.avatar ? (
                                <img src={reader.avatar} alt={reader.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-blue-600 text-[6px] text-white font-bold">{reader.initials}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const text = chatInput.trim();
                
                // ✅ SURGICAL FIX: Safely route to Ping or Chat.
                // If Ping Mode is active but the text is empty, send a default ping message.
                // If Chat Mode is active but the text is empty, abort the send.
                if (isPingMode) {
                  if (pingCooldown > 0) return;
                  sendPingMessage(text || "Pay attention!", whisperTarget?.id);
                  setIsPingMode(false); 
                } else {
                  if (!text) return;
                  sendChatMessage(text, whisperTarget?.id);
                }
                
                setChatInput("");
              }}
              className="p-2.5 bg-surface-container-highest border-t border-outline-variant/20 flex items-center gap-2 shrink-0"
            >
              {whisperTarget && (
                <button type="button" onClick={() => setWhisperTarget(null)} className="flex items-center gap-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-2 py-1.5 rounded-lg border border-purple-500/30 transition-colors shrink-0 max-w-[100px]" title="Cancel Whisper">
                  <span className="text-[10px] font-bold truncate">To: {whisperTarget.name.split(" ")[0]}</span>
                  <span className="material-symbols-outlined text-[12px]">close</span>
                </button>
              )}

              {/* ✅ SURGICAL FIX: Ping Toggle Mode Button */}
              
              
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={isPingMode ? "Type alert to ping..." : (whisperTarget ? `Whisper to ${whisperTarget.name.split(" ")[0]}...` : "Message team...")}
                className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px] focus:outline-none transition-colors border ${
                  isPingMode 
                    ? 'bg-amber-500/10 text-amber-100 border-amber-500/50 focus:border-amber-400 placeholder-amber-500/50' 
                    : 'bg-surface-container text-on-surface border-outline-variant/30 focus:border-primary placeholder-outline'
                }`}
              />
              <button 
                type="button" 
                onClick={() => setIsPingMode(!isPingMode)}
                disabled={pingCooldown > 0}
                className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors shadow-sm ${
                  pingCooldown > 0 
                    ? 'bg-surface-container-high text-on-surface-variant cursor-not-allowed' 
                    : isPingMode 
                      ? 'bg-amber-500 text-white border-2 border-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.4)]' 
                      : 'bg-surface-container text-amber-500 border border-amber-500/30 hover:bg-amber-500/10'
                }`}
                title={pingCooldown > 0 ? `Wait ${pingCooldown}s` : "Toggle Ping Alert Mode"}
              >
                {pingCooldown > 0 ? (
                   <span className="text-[11px] font-black">{pingCooldown}s</span>
                ) : (
                   <span className="material-symbols-outlined !text-[16px]">notifications_active</span>
                )}
              </button>
              <button 
                type="submit" 
                // ✅ SURGICAL FIX: Allow submission if Ping Mode is ON (sends default text), otherwise require text.
                disabled={(isPingMode && pingCooldown > 0) || (!isPingMode && !chatInput.trim())}
                className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center disabled:opacity-50 disabled:bg-surface-container-high disabled:text-on-surface-variant transition-colors ${
                  isPingMode ? 'bg-amber-500 text-white' : 'bg-primary text-on-primary'
                }`}
              >
                <span className="material-symbols-outlined !text-[16px]">send</span>
              </button>
            </form>

          </div>
        </div>
        )}
      </div>
    </div>
  );
}