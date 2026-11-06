import { useState, useEffect, useRef } from "react";

export function useLivePresence(supabase: any, simulatedUserId: string, simulatedRole: string) {
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [localPresenceUser, setLocalPresenceUser] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const localPresenceUserRef = useRef<any>(null);
  const isChannelSubscribedRef = useRef<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);
  
  // ✅ SURGICAL FIX: The Spam Lock. 
  // Prevents users from breaking the network state by rapid-firing the MD toggle.
  const isTogglingRef = useRef<boolean>(false);

  // Fetch Current Identity
  useEffect(() => {
    async function fetchCurrentPresenceIdentity() {
      let targetUserId = null;
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        targetUserId = user.id;
      } else if (simulatedUserId && simulatedUserId !== "00000000-0000-0000-0000-000000000000") {
        targetUserId = simulatedUserId;
      }

      if (targetUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, role")
          .eq("id", targetUserId)
          .maybeSingle();

        const isDbAdmin = profile?.role === "admin";
        setIsAdmin(simulatedRole === "admin" || (simulatedRole !== "member" && isDbAdmin));

        const displayName = profile?.full_name || "Simulated Account";
        const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "U";
        
        const colorPresets = ["bg-red-600", "bg-blue-600", "bg-purple-600", "bg-emerald-600", "bg-amber-600", "bg-indigo-600"];
        const idCharCodeSum = targetUserId.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        const assignedBg = colorPresets[idCharCodeSum % colorPresets.length];

        const identityPayload = { 
          id: targetUserId, 
          connectionId: `${targetUserId}-${Math.random().toString(36).substring(2, 7)}`, 
          authoritySessionId: crypto.randomUUID(),
          name: displayName, 
          initials, 
          bg: assignedBg,
          avatar: profile?.avatar_url || null,
          isMD: false 
        };

        localPresenceUserRef.current = identityPayload;
        setLocalPresenceUser(identityPayload);
      }
    }
    fetchCurrentPresenceIdentity();
  }, [simulatedUserId, simulatedRole, supabase]);

  useEffect(() => {
    const killPresence = () => {
      if (realtimeChannelRef.current && isChannelSubscribedRef.current) {
        realtimeChannelRef.current.untrack();
      }
    };

    window.addEventListener("beforeunload", killPresence);
    window.addEventListener("pagehide", killPresence);

    return () => {
      killPresence();
      window.removeEventListener("beforeunload", killPresence);
      window.removeEventListener("pagehide", killPresence);
    };
  }, []);

  const handleToggleMusicDirectorMode = () => {
    // ✅ Keep the Spam Lock, but drop the async/await
    if (!localPresenceUserRef.current || isTogglingRef.current) return;

    const alternateMD = onlineUsers.find(u => u.isMD && u.id !== localPresenceUserRef.current.id);
    const isTakingOver = !localPresenceUserRef.current.isMD; 

    if (alternateMD && isTakingOver) {
      const confirmSteal = confirm(`${alternateMD.name} is currently driving. Do you want to force takeover as Music Director?`);
      if (!confirmSteal) return;
    }

    isTogglingRef.current = true;

    const updatedPresencePayload = { 
      ...localPresenceUserRef.current, 
      isMD: isTakingOver,
      authoritySessionId: isTakingOver ? crypto.randomUUID() : localPresenceUserRef.current.authoritySessionId,
      updatedAt: Date.now() 
    };
    
    setLocalPresenceUser(updatedPresencePayload);
    localPresenceUserRef.current = updatedPresencePayload;

    if (realtimeChannelRef.current && isChannelSubscribedRef.current) {
      
      // ✅ 1. INSTANT BROADCAST: Fire the UI update packet immediately. Do not wait for the server!
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: { 
          action: isTakingOver ? "MD_TAKEOVER" : "MD_RELEASE", 
          [isTakingOver ? "newMdId" : "releasedMdId"]: localPresenceUserRef.current.id,
          authorityConnectionId: isTakingOver ? localPresenceUserRef.current.connectionId : undefined,
          authoritySessionId: isTakingOver ? localPresenceUserRef.current.authoritySessionId : undefined
        }
      });

      // ✅ 2. BACKGROUND TRACKING: Send the presence update in the background (no await)
      realtimeChannelRef.current.track(updatedPresencePayload).catch(console.error);

      // Unlock the spam toggle after 600ms
      setTimeout(() => { isTogglingRef.current = false; }, 600);
    } else {
      isTogglingRef.current = false;
    }
  };

  return {
    onlineUsers, setOnlineUsers,
    localPresenceUser, setLocalPresenceUser, localPresenceUserRef,
    isAdmin,
    isChannelSubscribedRef,
    realtimeChannelRef,
    handleToggleMusicDirectorMode
  };
}