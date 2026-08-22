"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { createClient } from "../../utils/supabase/client";

export type RoleType = "admin" | "moderator" | "musician" | "member" | "none";

interface EngineContextProps {
  simulatedRole: RoleType;
  activeRole: string;
  simulatedUserId: string; 
  userTeamId: string | null;
  primaryTeamId: string | null;
  secondaryTeamIds: string[];
  isSuperAdmin: boolean;
  setSimulatedRole: (role: RoleType) => void;
  switchWorkspace: (teamId: string) => void;
}

const EngineContext = createContext<EngineContextProps | undefined>(undefined);

const MOCK_UUIDS = {
  admin: "11111111-1111-1111-1111-111111111111",
  moderator: "33333333-3333-3333-3333-333333333333", // ✅ ADDED
  musician: "44444444-4444-4444-4444-444444444444", // ✅ ADDED
  member: "22222222-2222-2222-2222-222222222222"
};

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [simulatedRole, setSimulatedRoleState] = useState<RoleType>("none");
  const [simulatedUserId, setSimulatedUserId] = useState<string>("");
  const [realUserId, setRealUserId] = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [realRole, setRealRole] = useState<string>("member"); // ✅ ADD THIS
  const [primaryTeamId, setPrimaryTeamId] = useState<string | null>(null);
  const [secondaryTeamIds, setSecondaryTeamIds] = useState<string[]>([]);
  
  // ✅ SURGICAL ADDITION: Hold the team ID in global state
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  
  // ✅ SURGICAL FIX: Track if the user was kicked out so we can show the modal
  const [isKickedOut, setIsKickedOut] = useState<boolean>(false);
  const isKickedOutRef = useRef<boolean>(false); 
  const instanceFingerprintRef = useRef(`${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  // Track the authentic user ID session in the background

  
  // Track the authentic user ID session in the background
  useEffect(() => {
    async function fetchRealUserSession() {
      const { data: { user } } = await supabase.auth.getUser();
      
      // ✅ SURGICAL FIX: The Bouncer. If there is NO user, kick them to the root page immediately!
      if (!user) {
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
        return; // Stop executing so we don't load phantom fallback data
      }

      if (user) {
        setRealUserId(user.id);
        
        // Fetch the profile
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("team_id, secondary_team_ids, full_name, is_super_admin, role") 
          .eq("id", user.id)
          .maybeSingle();

        // ✅ SURGICAL FIX: The Bouncer now checks for a full_name instead of a team_id!
        if (!profile || !profile.full_name) {
          if (typeof window !== "undefined" && !window.location.pathname.includes("/onboarding") && window.location.pathname !== "/") {
            window.location.href = "/onboarding";
          }
        } else {
          // They are fully onboarded! Now we safely set up their workspace (even if team_id is null)
          if (profile.team_id) {
            setPrimaryTeamId(profile.team_id);
            setSecondaryTeamIds(profile.secondary_team_ids || []);
            
            const savedWorkspace = localStorage.getItem("active_workspace_id");
            const isAuthorized = savedWorkspace === profile.team_id || (profile.secondary_team_ids || []).includes(savedWorkspace);
            
            if (savedWorkspace && isAuthorized) {
              setUserTeamId(savedWorkspace);
            } else {
              setUserTeamId(profile.team_id); 
            }
          } else {
            // They are a Lone Wolf!
            setPrimaryTeamId(null);
            setUserTeamId(null);
            setSecondaryTeamIds([]);
          }
          
          if (profile.is_super_admin) setIsSuperAdmin(true);
          if (profile.role) setRealRole(profile.role);
        }
        
        const cached = localStorage.getItem("onpraise_sim_role") as RoleType;
        if (cached === "none" || !cached) {
          setSimulatedUserId(user.id);
        }
      }
    }
    fetchRealUserSession();
  }, []);
  

  const setSimulatedRole = (role: RoleType) => {
    setSimulatedRoleState(role);
    
    if (role === "none") {
      // Automatically swap to your true authentic user ID
      setSimulatedUserId(realUserId || "00000000-0000-0000-0000-000000000000");
    } else {
      setSimulatedUserId(MOCK_UUIDS[role]);
    }
    
    if (typeof window !== "undefined") {
      localStorage.setItem("onpraise_sim_role", role);
    }
  };

  // ✅ SURGICAL FIX: Background listener (with pause switch for the kick-out modal)
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        localStorage.removeItem("active_workspace_id");
        localStorage.removeItem("onpraise_sim_role");
        
        // ONLY auto-redirect if they weren't explicitly kicked out (allowing the modal to show!)
        if (!isKickedOutRef.current) {
          if (typeof window !== "undefined" && window.location.pathname !== "/") {
            window.location.href = "/"; 
          }
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase.auth, realUserId]);
  
  // ✅ SURGICAL FIX: Trigger the modal instead of an instant redirect
  useEffect(() => {
    if (!realUserId || realUserId === "") return;

    const exclusiveUserChannel = supabase.channel(`exclusive_session_${realUserId}`);

    exclusiveUserChannel
      .on("broadcast", { event: "CLAIM_SESSION" }, async ({ payload }) => {
        if (payload.instanceId !== instanceFingerprintRef.current) {
          console.warn("Duplicate cross-device session detected. Logging out.");
          
          // 1. Flag it so the background listener doesn't whisk them away immediately
          isKickedOutRef.current = true;
          setIsKickedOut(true);

          // 2. Safely wipe the local session in the background
          await supabase.auth.signOut();
          localStorage.removeItem("active_workspace_id");
          localStorage.removeItem("onpraise_sim_role");
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          exclusiveUserChannel.send({
            type: "broadcast",
            event: "CLAIM_SESSION",
            payload: { instanceId: instanceFingerprintRef.current }
          });
        }
      });

    return () => {
      supabase.removeChannel(exclusiveUserChannel);
    };
  }, [realUserId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("onpraise_sim_role") as RoleType;
      if (cached && ["admin", "moderator", "musician", "member", "none"].includes(cached)) {
        setSimulatedRoleState(cached);
        if (cached !== "none") {
          setSimulatedUserId(MOCK_UUIDS[cached]);
        } else if (realUserId) {
          setSimulatedUserId(realUserId);
        }
      } else if (!cached && realUserId) {
        // Fallback baseline layout mapping for fresh un-cached user allocations
        setSimulatedUserId(realUserId);
      }
    }
  }, [realUserId]);

  const switchWorkspace = (teamId: string) => {
    setUserTeamId(teamId);
    localStorage.setItem("active_workspace_id", teamId); // Remember their choice
    window.location.reload(); // Hard reload to securely refresh all data scopes
  };

  const activeRole = simulatedRole === "none" ? realRole : simulatedRole;

  // ✅ SURGICAL FIX: Safely render the overlay on top of the app when kicked out
  return (
    <EngineContext.Provider value={{ 
      simulatedRole, 
      activeRole,
      // isAdmin,
      simulatedUserId, 
      userTeamId, 
      primaryTeamId,
      secondaryTeamIds,
      isSuperAdmin, 
      setSimulatedRole,
      switchWorkspace
    }}>
      {isKickedOut && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-sm z-[999999] flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <span className="text-3xl">🛡️</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Session Terminated</h2>
          <p className="text-zinc-400 font-bold text-sm max-w-sm leading-relaxed mb-8">
            You recently logged in to another device or window. To protect your account security, this older session has been logged out.
          </p>
          <button
            onClick={() => {
              // Finish the redirect when they acknowledge it
              window.location.href = "/";
            }}
            className="px-8 py-3.5 bg-zinc-100 hover:bg-white text-zinc-900 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
          >
            Close & Return
          </button>
        </div>
      )}
      {children}
    </EngineContext.Provider>
  );
}

export function useEngine() {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error("useEngine must be used within an EngineProvider block context.");
  }
  return context;
}