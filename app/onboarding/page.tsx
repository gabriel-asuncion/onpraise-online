"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

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
  
  const [isVerifyingLink, setIsVerifyingLink] = useState(false);
  const [stagedMagicTeam, setStagedMagicTeam] = useState<{name: string, code: string} | null>(null);

  useEffect(() => {
    async function verifyStashedLink() {
      const stashedCode = localStorage.getItem("onpraise_pending_invite");
      if (!stashedCode) return;
      
      setIsVerifyingLink(true);
      localStorage.removeItem("onpraise_pending_invite"); 

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

  async function handleJoinTeam(overrideCode?: string) {
    setJoinError("");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0e12] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-4" />
        <div className="animate-pulse text-xs font-black uppercase tracking-widest text-blue-500">
          Preparing your workspace...
        </div>
      </div>
    );
  }

  return (
    <main className="w-full min-h-[100dvh] bg-[#0d0e12] relative overflow-hidden flex flex-col text-white selection:bg-blue-600 selection:text-white font-sans items-center sm:p-4">
      
      {/* ======================================================= */}
      {/* 1. BACKGROUND AMBIENT EFFECTS                             */}
      {/* ======================================================= */}
      <style dangerouslySetInnerHTML={{__html: `
        .stage-ambient-gradient {
          background: radial-gradient(circle at 50% 15%, rgba(37, 99, 235, 0.18) 0%, transparent 60%),
                      radial-gradient(circle at 15% 75%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
                      radial-gradient(circle at 85% 65%, rgba(30, 58, 138, 0.2) 0%, transparent 55%),
                      linear-gradient(180deg, #10121a 0%, #090a0d 100%);
        }
        @keyframes pulseBeam {
          0%, 100% { opacity: 0.35; transform: scale(1) translateY(0); }
          50% { opacity: 0.55; transform: scale(1.04) translateY(-4px); }
        }
        .ambient-glow-orb { animation: pulseBeam 7s ease-in-out infinite; }
      `}} />

      <div className="absolute inset-0 pointer-events-none stage-ambient-gradient z-0 overflow-hidden">
        <div className={`ambient-glow-orb absolute -top-10 -left-10 w-52 h-52 rounded-full blur-3xl ${step === 3 ? 'bg-purple-600/20' : 'bg-blue-600/20'}`}></div>
        <div className={`ambient-glow-orb absolute top-40 -right-12 w-48 h-48 rounded-full blur-2xl ${step === 3 ? 'bg-fuchsia-500/15' : 'bg-indigo-500/15'}`}></div>
        <div className={`ambient-glow-orb absolute bottom-24 left-4 w-40 h-40 rounded-full blur-3xl ${step === 3 ? 'bg-purple-500/15' : 'bg-blue-500/15'}`}></div>
        <div className={`absolute -bottom-20 -inset-x-10 h-44 bg-gradient-to-t rounded-[100%] blur-md ${step === 3 ? 'from-purple-950/40 via-slate-900/60 to-transparent' : 'from-blue-950/40 via-slate-900/60 to-transparent'}`}></div>
      </div>

      <div className="w-full max-w-[420px] flex-1 flex flex-col justify-between relative z-10 sm:h-[844px] sm:max-h-[860px] sm:rounded-[44px] sm:border-[6px] sm:border-[#262833] sm:shadow-2xl bg-transparent sm:bg-[#0d0e12]">
        
        {/* ======================================================= */}
        {/* 2. TOP STATUS BAR & STEPPER                               */}
        {/* ======================================================= */}
        <header className="relative z-20 pt-12 sm:pt-6 px-6 pb-2">
          {/* App Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-xs tracking-wider uppercase font-semibold text-slate-400">OnPraise • Setup</span>
            </div>
            <button aria-label="Quick Switch Profile" className="w-8 h-8 rounded-full bg-[#1b1d26] border border-slate-700/60 flex items-center justify-center text-slate-300 active:scale-95 transition-transform" type="button">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </button>
          </div>

          {/* Stepper */}
          <nav className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium tracking-wide">
              <span className={`font-semibold ${step === 3 ? 'text-purple-400' : 'text-blue-400'}`}>STEP {step} OF 3</span>
              <span className="text-slate-400">Next: {step === 1 ? 'Church Code' : step === 2 ? 'Ministries' : 'Finish'}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 w-full">
              <div className={`h-1.5 rounded-full transition-colors ${step >= 1 ? (step === 3 ? 'bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(168,43,251,0.6)]' : 'bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.6)]') : 'bg-[#202330]'}`}></div>
              <div className={`h-1.5 rounded-full transition-colors ${step >= 2 ? (step === 3 ? 'bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(168,43,251,0.6)]' : 'bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.6)]') : 'bg-[#202330]'}`}></div>
              <div className={`h-1.5 rounded-full transition-colors ${step >= 3 ? 'bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_10px_rgba(168,43,251,0.6)]' : 'bg-[#202330]'}`}></div>
            </div>
          </nav>
        </header>

        {/* ======================================================= */}
        {/* 3. DYNAMIC CARD CONTENT                                   */}
        {/* ======================================================= */}
        <div className="relative z-10 px-5 flex-1 flex flex-col justify-center py-2">
          
          {/* STEP 1: VERIFY IDENTITY */}
          {step === 1 && (
            <section className="bg-[#14161f]/95 backdrop-blur-xl rounded-[28px] border border-white/[0.09] p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-blue-500/70 to-transparent"></div>
              
              <div className="flex justify-center mb-5">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-500"></div>
                  <div className="relative w-16 h-16 rounded-full bg-[#1b1e2a] border border-blue-400/30 flex items-center justify-center text-blue-400 shadow-inner">
                    <svg className="w-8 h-8 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                      <rect height="6" opacity="0.75" rx="1.25" width="2.5" x="4" y="9"></rect>
                      <rect height="14" rx="1.25" width="2.5" x="8.5" y="5"></rect>
                      <rect height="20" rx="1.25" width="2.5" x="13" y="2"></rect>
                      <rect height="8" opacity="0.75" rx="1.25" width="2.5" x="17.5" y="8"></rect>
                    </svg>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-600 rounded-full border-2 border-[#14161f] flex items-center justify-center shadow">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Verify Your Identity</h1>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[270px] mx-auto">
                  How would you like your name to appear to the rest of the worship & tech team?
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-[10.5px] font-bold tracking-widest text-slate-400 uppercase">
                    Full Name
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Gabriel Asuncion" 
                      className="w-full h-12 bg-[#1b1c24] border border-[#2b2d3d] rounded-xl px-4 text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors shadow-inner" 
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    disabled={!fullName.trim()}
                    onClick={() => setStep(2)}
                    className="w-full h-12 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold tracking-widest uppercase rounded-xl flex items-center justify-center gap-2 shadow-[0_0_25px_-5px_rgba(37,99,235,0.45)] transition-all duration-200 active:scale-[0.99] cursor-pointer" 
                  >
                    <span>Continue To Team</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* STEP 2: CHURCH ID / MAGIC LINK */}
          {step === 2 && (
            <section className="bg-[#14161f]/95 backdrop-blur-xl rounded-[28px] border border-white/[0.09] p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-blue-500/70 to-transparent"></div>
              
              {isVerifyingLink ? (
                 <div className="flex flex-col items-center justify-center py-10">
                   <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-4" />
                   <p className="text-[11px] font-black tracking-widest text-slate-300 uppercase animate-pulse">Verifying Link...</p>
                 </div>
              ) : stagedMagicTeam ? (
                <>
                  <div className="flex justify-center mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shadow-[0_0_35px_-5px_rgba(59,130,246,0.35)]">
                      <span className="text-3xl text-blue-400">⛪</span>
                    </div>
                  </div>
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2">Joining {stagedMagicTeam.name}</h1>
                    <p className="text-sm text-gray-400 px-2 leading-relaxed">If this is not the correct group, request another invite code from your Music Director.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={() => setStagedMagicTeam(null)} className="w-full py-3.5 px-4 rounded-xl bg-[#1e2029] hover:bg-[#25252c] border border-[#2a2d3d] text-xs font-bold tracking-wider text-gray-300 uppercase transition-all cursor-pointer">
                      Back
                    </button>
                    <button onClick={() => handleJoinTeam(stagedMagicTeam.code)} className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold tracking-wider text-white uppercase shadow-[0_0_35px_-5px_rgba(59,130,246,0.35)] transition-all cursor-pointer">
                      Continue
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-center mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shadow-[0_0_35px_-5px_rgba(59,130,246,0.35)]">
                      <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 7h20L12 2zM4 10v9m5-9v9m6-9v9m5-9v9M2 21h20" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75"></path>
                      </svg>
                    </div>
                  </div>
                  
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2">Enter your Church ID</h1>
                    <p className="text-sm text-gray-400 px-2 leading-relaxed">Ask your Music Director for your 10-character join code.</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="relative">
                      <input 
                        type="text" 
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="XXXX-00000" 
                        maxLength={10}
                        spellCheck="false"
                        className="w-full bg-[#141417] text-white font-mono text-center font-bold text-xl py-4 px-4 rounded-xl border border-blue-500/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 tracking-[0.25em] uppercase transition-all shadow-inner outline-none" 
                      />
                    </div>
                    {joinError && (
                      <p className="text-red-400 text-xs font-bold text-center mt-2 animate-in slide-in-from-top-1">{joinError}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button onClick={handleSkipTeamSelection} className="w-full py-3.5 px-4 rounded-xl bg-[#1e2029] hover:bg-[#25252c] active:scale-[0.98] border border-[#2a2d3d] text-xs font-bold tracking-wider text-gray-300 uppercase transition-all cursor-pointer">
                      Skip for now
                    </button>
                    <button onClick={() => handleJoinTeam()} disabled={joinCode.trim().length < 10} className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${joinCode.trim().length === 10 ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_35px_-5px_rgba(59,130,246,0.35)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                      Continue
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* STEP 3: MINISTRIES */}
          {step === 3 && (
            <section className="bg-[#1a1a1e]/95 backdrop-blur-md rounded-[32px] border border-white/10 p-6 pt-7 pb-6 flex flex-col items-center shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] relative overflow-hidden animate-in fade-in slide-in-from-right-4">
              <div className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
              
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-[0_0_25px_-3px_rgba(168,43,251,0.45)] mb-4 relative">
                <span className="text-2xl transform -rotate-12 select-none" role="img">🎸</span>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#131315] border-2 border-[#1f1f24] flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                </div>
              </div>

              <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-tight text-center mb-1.5">
                Your Ministries
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm text-center max-w-[270px] leading-relaxed mb-6 font-normal">
                Select all the roles or departments you serve in.
              </p>

              <div className="mb-5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                <span>{selectedMinistries.length} Roles Selected</span>
              </div>

              <div className="flex flex-wrap justify-center gap-2.5 w-full max-w-[340px] mb-7">
                {MINISTRY_OPTIONS.map(min => {
                  const isSelected = selectedMinistries.includes(min);
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => handleToggleMinistry(min)}
                      className={`px-4 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer ${
                        isSelected 
                          ? "font-semibold bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_25px_-3px_rgba(168,43,251,0.45)] border border-purple-400/40 transform scale-[0.98]" 
                          : "font-medium bg-[#26262c] text-slate-300 hover:bg-[#303038] hover:text-white border border-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                          </svg>
                        )}
                        <span>{min}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="w-full grid grid-cols-12 gap-3 pt-2 border-t border-white/5">
                <button onClick={() => setStep(2)} className="col-span-4 py-3.5 px-3 rounded-2xl bg-[#25252C] hover:bg-[#2E2E36] active:scale-95 text-slate-300 hover:text-white font-semibold text-xs tracking-wider uppercase transition-all duration-150 border border-white/5 cursor-pointer">
                  Back
                </button>
                <button 
                  onClick={handleCompleteOnboarding} 
                  disabled={selectedMinistries.length === 0 || saving}
                  className="col-span-8 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-[#9A2FFB] to-purple-600 hover:from-purple-500 hover:to-purple-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wider uppercase transition-all duration-200 shadow-[0_0_25px_-3px_rgba(168,43,251,0.45)] flex items-center justify-center gap-1.5 border border-purple-300/30 cursor-pointer"
                >
                  <span>{saving ? "Finalizing..." : "Complete Setup"}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </button>
              </div>
            </section>
          )}

        </div>

        {/* ======================================================= */}
        {/* 4. FOOTER                                                 */}
        {/* ======================================================= */}
        <footer className="relative z-20 px-6 pb-6 pt-2">
          <div className="flex items-center justify-between text-[11px] text-[#7A7A8A] border-t border-[#2a2d3d]/40 pt-4">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Stage Ready Mode</span>
            </div>
            <span className="font-mono text-gray-500">v2.4.0 (Live Sync)</span>
          </div>
        </footer>
      </div>
    </main>
  );
}