"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

// ============================================================================
// ✅ SURGICAL ADDITION: REUSABLE BLOB COMPONENT (From Login Page)
// ============================================================================
const Blob = ({ 
  color, w, hasEyes, animClass, delay, top, left, right, bottom 
}: { 
  color: string, w: string, hasEyes: boolean, animClass: string, delay: string, top?: string, left?: string, right?: string, bottom?: string 
}) => (
  <div 
    className={`absolute z-0 opacity-60 ${animClass}`} 
    style={{ animationDelay: delay, top, left, right, bottom, width: w }}
  >
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <path fill={color} d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.5,-41.1C85.9,-26.9,92.5,-12.4,90.4,1.4C88.4,15.2,77.7,28.3,67.6,40.4C57.5,52.5,48,63.6,35.5,70.5C23,77.4,7.5,80.1,-6.9,78C-21.3,75.9,-34.5,69.1,-46.8,60.8C-59.1,52.5,-70.5,42.7,-78.6,30.3C-86.7,17.9,-91.5,2.9,-88.4,-10.8C-85.3,-24.5,-74.3,-36.9,-62,-46.1C-49.7,-55.3,-36.1,-61.3,-23.1,-68.2C-10.1,-75.1,2.3,-82.9,16.4,-82.6C30.5,-82.3,46,-73.9,45.7,-76.3Z" transform="translate(100 100)" />
      {hasEyes && (
        <>
          <circle cx="85" cy="90" r="8" fill="white" className="animate-blink" />
          <circle cx="115" cy="90" r="8" fill="white" className="animate-blink" />
        </>
      )}
    </svg>
  </div>
);

const MINISTRY_OPTIONS = [
  "Pastor",
  "Music Leader",
  "Musician",
  "Backup",
  "Tech & Media",
  "Usher / Greeter",
  "General Member"
];

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [step, setStep] = useState(1);
  
  const [fullName, setFullName] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);

  const [joinCode, setJoinCode] = useState<string>("");
  const [joinError, setJoinError] = useState<string>("");
  
  // ✅ SURGICAL FIX: Magic Link Verification States
  const [isVerifyingLink, setIsVerifyingLink] = useState(false);
  const [stagedMagicTeam, setStagedMagicTeam] = useState<{name: string, code: string} | null>(null);

  useEffect(() => {
    async function verifyStashedLink() {
      const stashedCode = localStorage.getItem("onpraise_pending_invite");
      if (!stashedCode) return;
      
      setIsVerifyingLink(true);
      localStorage.removeItem("onpraise_pending_invite"); // Clean up immediately

      // Fetch the actual team name from the database using the stashed code
      const { data } = await supabase
        .from("teams")
        .select("name")
        .eq("join_code", stashedCode.toLowerCase().trim())
        .maybeSingle();

      if (data) {
        setStagedMagicTeam({ name: data.name, code: stashedCode });
      } else {
        setJoinError("The invite link expired or is invalid.");
      }
      setIsVerifyingLink(false);
    }

    verifyStashedLink();
  }, [supabase]);

  // ✅ SURGICAL FIX: Allow the function to accept our staged override code
  async function handleJoinTeam(overrideCode?: string) {
    setJoinError("");
    
    // Use the override code if passed, otherwise use what they typed manually
    const activeCode = typeof overrideCode === 'string' ? overrideCode : joinCode;
    
    if (!activeCode.trim()) {
      setJoinError("Please enter a valid join code.");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setJoinError("Authentication error. Please log in again.");
      return;
    }

    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("join_code", activeCode.toLowerCase().trim())
      .maybeSingle();

    if (teamError || !teamData) {
      setJoinError("Invalid code. Please check your spelling and try again.");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ team_id: teamData.id })
      .eq("id", user.id); 

    if (profileError) {
      setJoinError("Failed to join the team. Please try again.");
      return;
    }

    setStep(3); 
  }

  async function handleSkipTeamSelection() {
    setStep(3); 
  }

  useEffect(() => {
    async function fetchInitialData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profile?.full_name) {
        setFullName(profile.full_name);
      }

      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .order("name", { ascending: true });
        
      if (teamsData) setTeams(teamsData);
      setLoading(false);
    }
    fetchInitialData();
  }, [router, supabase]);

  const handleToggleMinistry = (ministry: string) => {
    setSelectedMinistries(prev => 
      prev.includes(ministry) 
        ? prev.filter(m => m !== ministry) 
        : [...prev, ministry]
    );
  };

  const handleCompleteOnboarding = async () => {
    if (!userId || selectedMinistries.length === 0 || !fullName.trim()) return;

    setSaving(true);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const googleAvatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
      const gmailAddress = user?.email || user?.user_metadata?.email || null;

      const { error } = await supabase
        .from("profiles")
        .upsert({ 
          id: userId,
          full_name: fullName.trim(), 
          ministries: selectedMinistries,
          avatar_url: googleAvatarUrl,
          email: gmailAddress 
        });

      if (error) throw error;

      window.location.href = "/dashboard"; 
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to save profile. Please try again.");
      setSaving(false);
    }
  };
  


  return (
    <main className="relative min-h-screen bg-gradient-to-b from-[#EFF6FF] to-white flex items-center justify-center p-4 select-none overflow-hidden">
      
      {/* ======================================================= */}
      {/* 1. UNIFIED BACKGROUND ANIMATIONS                          */}
      {/* ======================================================= */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes dart-x {
          0%, 100% { transform: translateX(0) scale(1); }
          2%, 6% { transform: translateX(30px) scale(0.9, 1.1) rotate(5deg); }
          8%, 50% { transform: translateX(30px) scale(1) rotate(5deg); }
          52%, 56% { transform: translateX(-15px) scale(1.1, 0.9) rotate(-2deg); }
          58%, 95% { transform: translateX(-15px) scale(1) rotate(-2deg); }
        }
        @keyframes dart-y {
          0%, 100% { transform: translateY(0) scale(1); }
          5%, 10% { transform: translateY(-35px) scale(0.9, 1.1); }
          12%, 60% { transform: translateY(-35px) scale(1); }
          65%, 70% { transform: translateY(15px) scale(1.1, 0.9); }
          72%, 90% { transform: translateY(15px) scale(1); }
        }
        @keyframes morph-squish {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.2, 0.8) rotate(10deg); }
          50% { transform: scale(0.9, 1.15) rotate(-5deg); }
          75% { transform: scale(1.05, 0.95) rotate(15deg); }
        }
        @keyframes pulse-ghost {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          30% { transform: scale(1.6); opacity: 0.1; }
          40% { transform: scale(0.8); opacity: 0.9; }
        }
        @keyframes orbit-cw {
          0% { transform: rotate(0deg) translateX(15px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(15px) rotate(-360deg); }
        }
        @keyframes float-spin {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        @keyframes drift-a { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-10px, -15px); } }
        @keyframes drift-b { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(15px, -10px); } }
        @keyframes blink {
          0%, 96%, 100% { transform: scaleY(1); opacity: 1; }
          98% { transform: scaleY(0.1); opacity: 0; }
        }

        .animate-dart-x { animation: dart-x 7s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
        .animate-dart-y { animation: dart-y 11s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
        .animate-morph-squish { animation: morph-squish 5s ease-in-out infinite; }
        .animate-pulse-ghost { animation: pulse-ghost 7s ease-in-out infinite; }
        .animate-orbit-cw { animation: orbit-cw 13s linear infinite; }
        .animate-float-spin { animation: float-spin 19s ease-in-out infinite; }
        .animate-drift-a { animation: drift-a 7s ease-in-out infinite; }
        .animate-drift-b { animation: drift-b 11s ease-in-out infinite; }
        .animate-blink { animation: blink 4s infinite; transform-origin: center; }
      `}} />

      {/* Floating Blue Ecosystem */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <Blob color="#2563EB" w="110px" hasEyes animClass="animate-dart-x" delay="-1s" top="10%" left="8%" />
        <Blob color="#60A5FA" w="70px" hasEyes animClass="animate-morph-squish" delay="-3s" bottom="20%" right="15%" />
        <Blob color="#DBEAFE" w="40px" hasEyes={false} animClass="animate-orbit-cw" delay="0s" top="20%" right="25%" />
        <Blob color="#BFDBFE" w="60px" hasEyes={false} animClass="animate-float-spin" delay="-2s" bottom="15%" left="15%" />
        <Blob color="#93C5FD" w="30px" hasEyes={false} animClass="animate-pulse-ghost" delay="-5s" top="40%" right="8%" />
      </div>

      {/* Grounding Wave (Matches Login) */}
      <div className="absolute bottom-0 left-0 w-full z-0 pointer-events-none">
        <svg viewBox="0 0 1440 320" className="w-full h-auto opacity-70">
          <path fill="#EFF6FF" fillOpacity="1" d="M0,160L48,165.3C96,171,192,181,288,165.3C384,149,480,107,576,112C672,117,768,171,864,186.7C960,203,1056,181,1152,149.3C1248,117,1344,75,1392,53.3L1440,32L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </div>

      {/* ======================================================= */}
      {/* 2. FOREGROUND ONBOARDING CARD                             */}
      {/* ======================================================= */}
      {loading ? (
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          <div className="animate-pulse text-xs font-black uppercase tracking-widest text-blue-800">
            Preparing your workspace...
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-[2.5rem] p-8 shadow-2xl relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          
          {/* Dynamic Progress Indicator */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-zinc-100">
            <div 
              className="h-full bg-blue-600 transition-all duration-500 ease-out" 
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

          {/* STEP 1: CONFIRM NAME */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center space-y-2 mb-8 mt-2">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-md mb-4">
                  👋
                </div>
                <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Verify Your Identity</h1>
                <p className="text-xs font-bold text-zinc-500">How would you like your name to appear to the rest of the team?</p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block ml-1">
                    Full Name
                  </label>
                  <input 
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name..."
                    className="w-full p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm font-bold text-zinc-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    autoFocus
                  />
                </div>

                <button
                  type="button"
                  disabled={!fullName.trim()}
                  onClick={() => setStep(2)}
                  className="w-full py-4 rounded-xl bg-zinc-950 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continue to Team
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CHOOSE TEAM */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              
              {isVerifyingLink ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-4" />
                  <p className="text-[11px] font-black tracking-widest text-zinc-800 uppercase animate-pulse">Verifying Link...</p>
                </div>
              ) : stagedMagicTeam ? (
                // ✅ SURGICAL FIX: THE NEW MAGIC LINK CONFIRMATION VIEW
                <>
                  <div className="text-center space-y-2 mb-8">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner text-3xl">
                      ⛪
                    </div>
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Joining {stagedMagicTeam.name}</h2>
                    <p className="text-xs font-bold text-zinc-500 max-w-[280px] mx-auto leading-relaxed mt-2">
                      If this is not the correct group, request another invite code from your Music Director.
                    </p>
                  </div>
                  
                  <div className="flex gap-3 mt-8">
                    <button
                      type="button"
                      onClick={() => setStagedMagicTeam(null)} // Reverts them to manual entry if they cancel
                      className="flex-1 py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95"
                    >
                      Back
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleJoinTeam(stagedMagicTeam.code)}
                      className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                    >
                      Continue
                    </button>
                  </div>
                </>
              ) : (
                // 🔄 THE STANDARD MANUAL ENTRY UI (Fallback)
                <>
                  <div className="text-center space-y-2 mb-8">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md text-xl">
                      🏛️
                    </div>
                    <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Enter your Church ID</h2>
                    <p className="text-xs font-bold text-zinc-500">Ask your Music Director for your 10-character join code.</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div>
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="e.g. gith-12345"
                        className="w-full text-center text-lg font-black tracking-widest uppercase border border-zinc-200 rounded-xl p-4 shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        maxLength={10}
                      />
                      {joinError && (
                        <p className="text-red-500 text-xs font-bold text-center mt-2 animate-in slide-in-from-top-1">{joinError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button
                      type="button"
                      onClick={handleSkipTeamSelection}
                      className="flex-1 py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95"
                    >
                      Skip For Now
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleJoinTeam()}
                      disabled={joinCode.trim().length < 10}
                      className={`flex-1 py-4 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 ${
                        joinCode.trim().length === 10
                          ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                          : "bg-zinc-500 hover:bg-zinc-600 text-white/50 cursor-not-allowed"
                      }`}
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 3: CHOOSE MINISTRIES */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center space-y-2 mb-8 mt-2">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-md mb-4">
                  🎸
                </div>
                <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Your Ministries</h1>
                <p className="text-xs font-bold text-zinc-500">Select all the roles or departments you serve in.</p>
              </div>

              <div className="space-y-6">
                <div className="flex flex-wrap gap-2 justify-center">
                  {MINISTRY_OPTIONS.map(min => {
                    const isSelected = selectedMinistries.includes(min);
                    return (
                      <button
                        key={min}
                        type="button"
                        onClick={() => handleToggleMinistry(min)}
                        className={`px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                          isSelected 
                            ? "bg-purple-600 border-purple-500 text-white shadow-md ring-4 ring-purple-500/20 scale-105" 
                            : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        }`}
                      >
                        {isSelected ? "✓ " : ""}{min}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="col-span-1 py-4 rounded-xl bg-zinc-100 text-zinc-700 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={selectedMinistries.length === 0 || saving}
                    onClick={handleCompleteOnboarding}
                    className="col-span-2 py-4 rounded-xl bg-purple-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {saving ? "Finalizing..." : "Complete Setup"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </main>
  );
}