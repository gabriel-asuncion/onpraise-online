"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useEngine } from "../app/context/EngineContext";

type TeamPresenceUser = {
  userId: string;
  name: string;
  role: string;
  avatar: string | null;
  activeSetlistId: string | null;
};

type SetlistInvite = {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  setlistId: string;
  setlistName: string;
  eventName: string;
  trackTitles: string[];
  expiresAt: number;
};

type TeamChannel = ReturnType<ReturnType<typeof createClient>["channel"]>;

type InviteChannel = {
  channel: TeamChannel;
  subscribed: boolean;
};

type InviteContextValue = {
  onlineByTeam: Record<string, TeamPresenceUser[]>;
  sendInvite: (teamId: string, recipientId: string, setlistId: string, setlistName: string, eventName: string, trackTitles: string[]) => Promise<boolean>;
  cooldownSeconds: (recipientId: string) => number;
};

const InviteContext = createContext<InviteContextValue | null>(null);

function activeSetlistFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/setlists\/([^/]+)\/live(?:\/|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function SetlistInviteProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const { userTeamId, primaryTeamId, secondaryTeamIds } = useEngine();
  const [identity, setIdentity] = useState<{ id: string; name: string; role: string; avatar: string | null } | null>(null);
  const [onlineByTeam, setOnlineByTeam] = useState<Record<string, TeamPresenceUser[]>>({});
  const [incomingInvite, setIncomingInvite] = useState<SetlistInvite | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(0);
  const channelsRef = useRef<Map<string, InviteChannel>>(new Map());
  const activeSetlistId = activeSetlistFromPath(pathname);
  const activeSetlistRef = useRef(activeSetlistId);
  const identityRef = useRef(identity);
  const seenInviteIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { activeSetlistRef.current = activeSetlistId; }, [activeSetlistId]);
  useEffect(() => { identityRef.current = identity; }, [identity]);

  useEffect(() => {
    let cancelled = false;
    const loadIdentity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIdentity({
        id: user.id,
        name: profile?.full_name || user.email || "Team member",
        role: profile?.role || "member",
        avatar: profile?.avatar_url || null,
      });
    };
    void loadIdentity();
    return () => { cancelled = true; };
  }, [supabase]);

  const teamIds = useMemo(() => Array.from(new Set([userTeamId, primaryTeamId, ...secondaryTeamIds].filter((id): id is string => Boolean(id)))), [userTeamId, primaryTeamId, secondaryTeamIds]);

  useEffect(() => {
    if (!identity || teamIds.length === 0) return;
    let disposed = false;
    const teamChannels = new Map<string, InviteChannel>();
    const channelRegistry = channelsRef.current;
    const updatePresence = (teamId: string, channel: TeamChannel) => {
      const state = channel.presenceState() as Record<string, TeamPresenceUser[]>;
      const users = Object.values(state).flat().filter((user) => user?.userId);
      setOnlineByTeam((previous) => ({ ...previous, [teamId]: users }));
    };

    teamIds.forEach((teamId) => {
      const channel = supabase.channel(`team_live_invites_${teamId}`, {
        config: { presence: { key: identity.id }, broadcast: { ack: false, self: false } },
      });
      const record: InviteChannel = { channel, subscribed: false };
      teamChannels.set(teamId, record);
      channelsRef.current.set(teamId, record);

      channel
        .on("presence", { event: "sync" }, () => updatePresence(teamId, channel))
        .on("broadcast", { event: "setlist_invite" }, ({ payload }) => {
          const invite = payload as SetlistInvite;
          const currentIdentity = identityRef.current;
          if (!currentIdentity || invite?.recipientId !== currentIdentity.id || !invite?.id) return;
          if (seenInviteIdsRef.current.has(invite.id)) return;
          seenInviteIdsRef.current.add(invite.id);
          if (invite.expiresAt <= Date.now() || activeSetlistRef.current) return;
          setNow(Date.now());
          setIncomingInvite(invite);
        })
        .on("broadcast", { event: "setlist_invite_response" }, ({ payload }) => {
          const response = payload as { senderId: string; recipientId: string; decision: "accepted" | "declined" };
          if (!response?.recipientId || response.decision !== "declined") return;
          const until = Date.now() + 30_000;
          setNow(Date.now());
          setCooldowns((previous) => ({ ...previous, [response.recipientId]: until }));
        })
        .subscribe((status: string) => {
          if (status !== "SUBSCRIBED" || disposed) return;
          record.subscribed = true;
          const currentIdentity = identityRef.current;
          if (!currentIdentity) return;
          const presence: TeamPresenceUser = {
            userId: currentIdentity.id,
            name: currentIdentity.name,
            role: currentIdentity.role,
            avatar: currentIdentity.avatar,
            activeSetlistId: activeSetlistRef.current,
          };
          void channel.track(presence);
          updatePresence(teamId, channel);
        });
    });

    return () => {
      disposed = true;
      teamChannels.forEach(({ channel }, teamId) => {
        channelRegistry.delete(teamId);
        void supabase.removeChannel(channel);
      });
    };
  }, [identity, teamIds, supabase]);

  useEffect(() => {
    const channelRegistry = channelsRef.current;
    channelRegistry.forEach(({ channel, subscribed }) => {
      if (!subscribed || !identity) return;
      void channel.track({
        userId: identity.id,
        name: identity.name,
        role: identity.role,
        avatar: identity.avatar,
        activeSetlistId,
      });
    });
  }, [activeSetlistId, identity]);

  useEffect(() => {
    if (!incomingInvite) return;
    const delay = Math.max(0, incomingInvite.expiresAt - Date.now());
    const timeout = window.setTimeout(() => setIncomingInvite((current) => current?.id === incomingInvite.id ? null : current), delay);
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => { window.clearTimeout(timeout); window.clearInterval(interval); };
  }, [incomingInvite]);

  useEffect(() => {
    const hasCooldown = Object.values(cooldowns).some((until) => until > Date.now());
    if (!hasCooldown) return;
    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setCooldowns((previous) => Object.fromEntries(Object.entries(previous).filter(([, until]) => until > timestamp)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldowns]);

  const cooldownSeconds = useCallback((recipientId: string) => Math.max(0, Math.ceil(((cooldowns[recipientId] || 0) - now) / 1000)), [cooldowns, now]);

  const sendInvite = useCallback(async (teamId: string, recipientId: string, setlistId: string, setlistName: string, eventName: string, trackTitles: string[]) => {
    const record = channelsRef.current.get(teamId);
    const currentIdentity = identityRef.current;
    if (!record?.subscribed || !currentIdentity || !recipientId || cooldownSeconds(recipientId) > 0) return false;
    const invite: SetlistInvite = {
      id: crypto.randomUUID(),
      teamId,
      senderId: currentIdentity.id,
      senderName: currentIdentity.name,
      recipientId,
      setlistId,
      setlistName,
      eventName,
      trackTitles,
      expiresAt: Date.now() + 10_000,
    };
    try {
      const status = await record.channel.send({ type: "broadcast", event: "setlist_invite", payload: invite });
      return status === "ok";
    } catch (error) {
      console.error("Failed to send setlist invitation:", error);
      return false;
    }
  }, [cooldownSeconds]);

  const respondToInvite = useCallback((decision: "accepted" | "declined") => {
    if (!incomingInvite) return;
    if (decision === "accepted" && incomingInvite.expiresAt > Date.now() && !activeSetlistRef.current) {
      const channel = channelsRef.current.get(incomingInvite.teamId)?.channel;
      void channel?.send({
        type: "broadcast",
        event: "setlist_invite_response",
        payload: { senderId: incomingInvite.senderId, recipientId: incomingInvite.recipientId, decision },
      });
      const targetUrl = `/setlists/${encodeURIComponent(incomingInvite.setlistId)}/live`;
      setIncomingInvite(null);
      router.push(targetUrl);
      return;
    }
    if (decision === "declined") {
      const channel = channelsRef.current.get(incomingInvite.teamId)?.channel;
      void channel?.send({
        type: "broadcast",
        event: "setlist_invite_response",
        payload: { senderId: incomingInvite.senderId, recipientId: incomingInvite.recipientId, decision },
      });
    }
    setIncomingInvite(null);
  }, [incomingInvite, router]);

  const value = useMemo<InviteContextValue>(() => ({ onlineByTeam, sendInvite, cooldownSeconds }), [onlineByTeam, sendInvite, cooldownSeconds]);
  const remainingSeconds = incomingInvite ? Math.max(0, Math.ceil((incomingInvite.expiresAt - now) / 1000)) : 0;

  return (
    <InviteContext.Provider value={value}>
      {children}
      {incomingInvite && remainingSeconds > 0 && !activeSetlistId && (
        <div className="fixed inset-0 z-[600000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="setlist-invite-title" className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-outline-variant/30 bg-surface-container-low p-6 text-on-surface shadow-2xl animate-in zoom-in-95 fade-in duration-200">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Setlist invitation</p>
                <h2 id="setlist-invite-title" className="mt-1 text-xl font-black tracking-tight">Join rehearsal?</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">{remainingSeconds}s</span>
            </div>
            <p className="text-sm leading-relaxed text-on-surface-variant"><span className="font-bold text-on-surface">{incomingInvite.senderName}</span> invited you to join:</p>
            <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">{incomingInvite.eventName || "Event"}</p>
              <p className="mt-1 text-base font-extrabold text-on-surface">{incomingInvite.setlistName}</p>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container/60 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Tracks in this setlist</p>
              {incomingInvite.trackTitles.length > 0 ? (
                <ol className="space-y-2">
                  {incomingInvite.trackTitles.map((title, index) => (
                    <li key={`${index}-${title}`} className="flex gap-2 text-xs text-on-surface">
                      <span className="font-mono text-on-surface-variant">{String(index + 1).padStart(2, "0")}</span>
                      <span className="truncate">{title}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-xs italic text-on-surface-variant">No tracks have been added yet.</p>}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => respondToInvite("declined")} className="rounded-xl border border-outline-variant/30 bg-surface-container-high px-4 py-3 text-sm font-bold text-on-surface-variant transition hover:bg-surface-bright">Decline</button>
              <button type="button" onClick={() => respondToInvite("accepted")} className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-on-primary transition hover:bg-primary/80">Accept invite</button>
            </div>
          </section>
        </div>
      )}
    </InviteContext.Provider>
  );
}

export function useSetlistInvites() {
  const context = useContext(InviteContext);
  if (!context) throw new Error("useSetlistInvites must be used inside SetlistInviteProvider");
  return context;
}
