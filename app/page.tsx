"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '../utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';


// ✅ SURGICAL FIX: Force the Lottie Player to only load on the client side (browser)
const Player = dynamic(
  () => import('@lottiefiles/react-lottie-player').then((mod) => mod.Player),
  { ssr: false } // This tells Next.js to skip this during the server build!
);
// ============================================================================
// ✅ SURGICAL ADDITION: REUSABLE BLOB COMPONENT FOR CLEAN JSX
// ============================================================================
const Blob = ({ 
  color, w, hasEyes, animClass, delay, top, left, right, bottom 
}: { 
  color: string, w: string, hasEyes: boolean, animClass: string, delay: string, top?: string, left?: string, right?: string, bottom?: string 
}) => (
  <div 
    className={`absolute z-0 opacity-70 ${animClass}`} 
    style={{ animationDelay: delay, top, left, right, bottom, width: w }}
  >
    {/* <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <path fill={color} d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.5,-41.1C85.9,-26.9,92.5,-12.4,90.4,1.4C88.4,15.2,77.7,28.3,67.6,40.4C57.5,52.5,48,63.6,35.5,70.5C23,77.4,7.5,80.1,-6.9,78C-21.3,75.9,-34.5,69.1,-46.8,60.8C-59.1,52.5,-70.5,42.7,-78.6,30.3C-86.7,17.9,-91.5,2.9,-88.4,-10.8C-85.3,-24.5,-74.3,-36.9,-62,-46.1C-49.7,-55.3,-36.1,-61.3,-23.1,-68.2C-10.1,-75.1,2.3,-82.9,16.4,-82.6C30.5,-82.3,46,-73.9,45.7,-76.3Z" transform="translate(100 100)" />
      {hasEyes && (
        <>
          <circle cx="85" cy="90" r="8" fill="white" className="animate-blink" />
          <circle cx="115" cy="90" r="8" fill="white" className="animate-blink" />
        </>
      )}
    </svg> */}
  </div>
);

export default function Home() {
  const supabase = createClient();
  const router = useRouter();
  
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const [activeSlide, setActiveSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);

  // PWA Install Engine States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [hasInstalledApp, setHasInstalledApp] = useState(false);
  const [isInBrowserTab, setIsInBrowserTab] = useState(true);
  const [showInstallSuccessModal, setShowInstallSuccessModal] = useState(false);

  // ✅ SURGICAL FIX: Consolidated Session, Invite, & Profile Completion Routing
  useEffect(() => {
    // 1. Safely extract invite code and save to local storage immediately
    let currentInvite = inviteCode;
    if (!currentInvite && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      currentInvite = params.get("invite");
    }
    
    if (currentInvite) {
      localStorage.setItem("onpraise_pending_invite", currentInvite);
    }

    // ✅ HELPER: Checks profile completion before letting them into the app
    const checkAndRouteUser = async (session: any) => {
      const storedInvite = currentInvite || localStorage.getItem("onpraise_pending_invite");
      
      if (storedInvite) {
        router.push(`/onboarding?invite=${storedInvite}`);
        return;
      }

      // Check if user has actually finished onboarding (has a team and name)
      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id, full_name")
        .eq("id", session.user.id)
        .maybeSingle();

      const needsOnboarding = !profile || !profile.team_id || !profile.full_name;

      if (needsOnboarding) {
        router.push('/onboarding'); // Force to onboarding if incomplete
      } else {
        router.push('/dashboard'); // Safe to enter the app
      }
    };

    // 2. Check if they are ALREADY logged in on mount
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await checkAndRouteUser(session);
      }
    };
    checkExistingSession();

    // 3. Catch them right after they finish Google OAuth
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && event === 'SIGNED_IN') {
        await checkAndRouteUser(session);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router, inviteCode]);

  const handleInstallClick = async () => {
    // ✅ SURGICAL FIX: Fallback alert for iOS or strict browsers
    if (!deferredPrompt) {
      alert("To install this app on your device:\n\n📱 iOS / Safari: Tap the 'Share' icon at the bottom of your screen, then select 'Add to Home Screen'.\n\n🤖 Android: Tap the 3 dots in the top right of your browser and select 'Install App'.");
      return;
    }
    
    // Show the native browser install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstallable(false); // Hide button once installed
    }
    setDeferredPrompt(null);
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    
    // ✅ SURGICAL FIX: Retrieve the saved invite code
    const pendingInvite = inviteCode || localStorage.getItem("onpraise_pending_invite");
    
    // ✅ SURGICAL FIX: Append the invite parameter to the Google redirect URL
    let callbackUrl = `${window.location.origin}/auth/callback`;
    if (pendingInvite) {
      callbackUrl += `?invite=${pendingInvite}`;
    }
    
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });
  };

  // ✅ THE SLIDES ARRAY WITH DENSE, UNIQUE BLOB CLUSTERS
  const slides = [
    {
      title: "Sync your stage.",
      desc: "Realtime sets, connected bands, and zero paper. No pressure, just presence.",
      graphics: (
        <div className="absolute inset-0 flex items-start justify-center pt-[12vh] md:pt-[15vh] pointer-events-none">
          {/* Main Eyed Blobs (Snappy & Morphing) */}
          <Blob color="#2563EB" w="110px" hasEyes animClass="animate-dart-x" delay="-1s" top="15%" left="15%" />
          <Blob color="#60A5FA" w="90px" hasEyes animClass="animate-morph-squish" delay="-3s" top="35%" right="20%" />
          {/* Scatter Cluster (Eyeless) */}
          <Blob color="#DBEAFE" w="30px" hasEyes={false} animClass="animate-orbit-cw" delay="0s" top="10%" right="30%" />
          <Blob color="#BFDBFE" w="40px" hasEyes={false} animClass="animate-float-spin" delay="-2s" top="45%" left="10%" />
          <Blob color="#93C5FD" w="20px" hasEyes={false} animClass="animate-zigzag-pop" delay="-5s" top="20%" left="40%" />
          <Blob color="#EFF6FF" w="60px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" top="50%" right="10%" />
          <Blob color="#60A5FA" w="25px" hasEyes={false} animClass="animate-drift-a" delay="-7s" top="5%" left="50%" />
          <Blob color="#DBEAFE" w="35px" hasEyes={false} animClass="animate-drift-b" delay="-4s" top="25%" right="15%" />
          
          <Player autoplay loop src="/assets/login_01.json" className="w-[100%] max-w-[450px] aspect-square animate-float-lottie relative z-10" />
        </div>
      )
    },
    {
      title: "Perfectly timed.",
      desc: "Sample-accurate metronomes and vocal cues locked to your band's flow.",
      graphics: (
        <div className="absolute inset-0 flex items-start justify-center pt-[12vh] md:pt-[15vh] pointer-events-none">
          {/* Main Eyed Blobs */}
          <Blob color="#EF4444" w="120px" hasEyes animClass="animate-dart-y" delay="-2s" top="10%" right="18%" />
          <Blob color="#FCA5A5" w="80px" hasEyes animClass="animate-pulse-ghost" delay="-4s" top="40%" left="22%" />
          <Blob color="#FECACA" w="95px" hasEyes animClass="animate-zigzag-pop" delay="-1s" top="20%" left="12%" />
          {/* Scatter Cluster */}
          <Blob color="#FEE2E2" w="25px" hasEyes={false} animClass="animate-orbit-ccw" delay="-3s" top="30%" right="10%" />
          <Blob color="#F87171" w="45px" hasEyes={false} animClass="animate-morph-squish" delay="-6s" top="50%" left="15%" />
          <Blob color="#FEF2F2" w="30px" hasEyes={false} animClass="animate-float-spin" delay="-8s" top="15%" right="40%" />
          <Blob color="#FCA5A5" w="15px" hasEyes={false} animClass="animate-drift-b" delay="-2s" top="5%" left="30%" />
          <Blob color="#EF4444" w="35px" hasEyes={false} animClass="animate-dart-x" delay="-7s" top="45%" right="25%" />
          
          <Player autoplay loop src="/assets/login_02.json" className="w-[80%] max-w-[450px] aspect-square animate-float-lottie relative z-10" />
        </div>
      )
    },
    {
      title: "Build your set.",
      desc: "Arrange songs, map sections, and transpose keys on the fly. Total control.",
      graphics: (
        <div className="absolute inset-0 flex items-start justify-center pt-[12vh] md:pt-[15vh] pointer-events-none">
          {/* Main Eyed Blobs */}
          <Blob color="#F59E0B" w="100px" hasEyes animClass="animate-morph-squish" delay="0s" top="35%" left="18%" />
          {/* Scatter Cluster */}
          <Blob color="#FEF3C7" w="40px" hasEyes={false} animClass="animate-zigzag-pop" delay="-2s" top="12%" right="20%" />
          <Blob color="#FDE68A" w="25px" hasEyes={false} animClass="animate-orbit-cw" delay="-5s" top="45%" right="15%" />
          <Blob color="#FBBF24" w="35px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" top="15%" left="30%" />
          <Blob color="#FFFBEB" w="50px" hasEyes={false} animClass="animate-dart-y" delay="-8s" top="25%" left="8%" />
          <Blob color="#FCD34D" w="20px" hasEyes={false} animClass="animate-float-spin" delay="-3s" top="50%" left="40%" />
          <Blob color="#F59E0B" w="30px" hasEyes={false} animClass="animate-drift-a" delay="-6s" top="8%" right="40%" />
          <Blob color="#FEF3C7" w="15px" hasEyes={false} animClass="animate-dart-x" delay="-4s" top="30%" right="5%" />

          <Player autoplay loop src="/assets/login_03.json" className="w-[110%] max-w-[450px] aspect-square animate-float-lottie relative z-10" />
        </div>
      )
    },
    {
      title: "Ready to play.",
      desc: "Join your team's workspace and perform with absolute confidence.",
      graphics: (
        <div className="absolute inset-0 flex items-start justify-center pt-[12vh] md:pt-[15vh] pointer-events-none">
          {/* Main Eyed Blobs */}
          <Blob color="#A855F7" w="110px" hasEyes animClass="animate-float-spin" delay="-3s" top="25%" right="15%" />
          <Blob color="#C084FC" w="85px" hasEyes animClass="animate-dart-y" delay="-1s" top="40%" left="15%" />
          {/* Scatter Cluster */}
          <Blob color="#F3E8FF" w="35px" hasEyes={false} animClass="animate-morph-squish" delay="-5s" top="10%" left="25%" />
          <Blob color="#E9D5FF" w="20px" hasEyes={false} animClass="animate-orbit-ccw" delay="-2s" top="45%" right="25%" />
          <Blob color="#D8B4FE" w="45px" hasEyes={false} animClass="animate-zigzag-pop" delay="-7s" top="15%" right="35%" />
          <Blob color="#FAF5FF" w="25px" hasEyes={false} animClass="animate-pulse-ghost" delay="-4s" top="30%" left="8%" />
          <Blob color="#A855F7" w="15px" hasEyes={false} animClass="animate-drift-b" delay="-8s" top="5%" right="15%" />
          <Blob color="#C084FC" w="30px" hasEyes={false} animClass="animate-dart-x" delay="-2.5s" top="50%" left="35%" />

          <Player autoplay loop src="/assets/login_04.json" className="w-[80%] max-w-[450px] aspect-square animate-float-lottie relative z-10" />
        </div>
      )
    }
  ];

  const extendedSlides = [...slides, slides[0]];

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setActiveSlide((prev) => prev + 1);
    }, 4000); // 👈 Slightly longer so the crazy blob animations have time to shine
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSlide === slides.length) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setActiveSlide(0);
      }, 700); 
      return () => clearTimeout(timer);
    }
  }, [activeSlide, slides.length]);

  return (
    <main className="relative w-full h-screen bg-white overflow-hidden flex flex-col pointer-events-none select-none">
      
      {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: THE ANIMATION BANK MASSIVE UPGRADE  */}
      {/* ======================================================= */}
      <style dangerouslySetInnerHTML={{__html: `
        /* 1. Lottie Base Float */
        @keyframes float-lottie {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(3deg); }
        }
        .animate-float-lottie { animation: float-lottie 6s ease-in-out infinite; }

        /* 2. Snappy Horizontal Dart */
        @keyframes dart-x {
          0%, 100% { transform: translateX(0) scale(1); }
          2%, 6% { transform: translateX(30px) scale(0.9, 1.1) rotate(5deg); }
          8%, 50% { transform: translateX(30px) scale(1) rotate(5deg); }
          52%, 56% { transform: translateX(-15px) scale(1.1, 0.9) rotate(-2deg); }
          58%, 95% { transform: translateX(-15px) scale(1) rotate(-2deg); }
        }
        
        /* 3. Snappy Vertical Dart */
        @keyframes dart-y {
          0%, 100% { transform: translateY(0) scale(1); }
          5%, 10% { transform: translateY(-35px) scale(0.9, 1.1); }
          12%, 60% { transform: translateY(-35px) scale(1); }
          65%, 70% { transform: translateY(15px) scale(1.1, 0.9); }
          72%, 90% { transform: translateY(15px) scale(1); }
        }

        /* 4. Morphing & Squishing */
        @keyframes morph-squish {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.2, 0.8) rotate(10deg); }
          50% { transform: scale(0.9, 1.15) rotate(-5deg); }
          75% { transform: scale(1.05, 0.95) rotate(15deg); }
        }

        /* 5. Multiplying / Ghosting (Opacity + Scale out) */
        @keyframes pulse-ghost {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          30% { transform: scale(1.6); opacity: 0.1; }
          40% { transform: scale(0.8); opacity: 0.9; }
        }

        /* 6. Orbital Spinning Clockwise */
        @keyframes orbit-cw {
          0% { transform: rotate(0deg) translateX(15px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(15px) rotate(-360deg); }
        }

        /* 7. Orbital Spinning Counter-Clockwise */
        @keyframes orbit-ccw {
          0% { transform: rotate(0deg) translateX(25px) rotate(0deg); }
          100% { transform: rotate(-360deg) translateX(25px) rotate(360deg); }
        }

        /* 8. Zig-Zag Popping */
        @keyframes zigzag-pop {
          0%, 100% { transform: translate(0,0) scale(1); }
          15% { transform: translate(20px, -20px) scale(1.2); }
          30% { transform: translate(-10px, -30px) scale(0.8); }
          45% { transform: translate(15px, 10px) scale(1.1); }
        }

        /* 9. Float & Spin */
        @keyframes float-spin {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }

        /* 10. Classic Drifts */
        @keyframes drift-a { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-10px, -15px); } }
        @keyframes drift-b { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(15px, -10px); } }

        /* Eye Blinking Math */
        @keyframes blink {
          0%, 96%, 100% { transform: scaleY(1); opacity: 1; }
          98% { transform: scaleY(0.1); opacity: 0; }
        }

        /* Assigning Prime Number Durations so they naturally randomize and rarely sync up */
        .animate-dart-x { animation: dart-x 7s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
        .animate-dart-y { animation: dart-y 11s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
        .animate-morph-squish { animation: morph-squish 5s ease-in-out infinite; }
        .animate-pulse-ghost { animation: pulse-ghost 7s ease-in-out infinite; }
        .animate-orbit-cw { animation: orbit-cw 13s linear infinite; }
        .animate-orbit-ccw { animation: orbit-ccw 17s linear infinite; }
        .animate-zigzag-pop { animation: zigzag-pop 11s ease-in-out infinite; }
        .animate-float-spin { animation: float-spin 19s ease-in-out infinite; }
        .animate-drift-a { animation: drift-a 7s ease-in-out infinite; }
        .animate-drift-b { animation: drift-b 11s ease-in-out infinite; }
        .animate-blink { animation: blink 4s infinite; transform-origin: center; }
      `}} />

      {/* DYNAMIC PROGRESS DOTS */}
      <div className="absolute top-0 left-0 w-full z-50 flex items-center justify-center pt-14 pb-4">
        <div className="flex items-center gap-2 bg-white/50 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm">
          {slides.map((_, idx) => {
            const isActive = activeSlide === idx || (activeSlide === slides.length && idx === 0);
            return (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                  isActive ? "w-6 bg-blue-600" : "w-1.5 bg-zinc-300"
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* CAROUSEL TRACK */}
      <div className="relative w-full h-full flex items-center">
        <div 
          className="flex w-full h-full"
          style={{
            transform: `translateX(-${activeSlide * 100}%)`,
            transition: isTransitioning ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' 
          }}
        >
          {extendedSlides.map((slide, idx) => (
            <div key={idx} className="w-full h-full flex-shrink-0 relative overflow-hidden">
              {slide.graphics}
              <div className="absolute bottom-[200px] md:bottom-[220px] left-0 w-full z-40 px-8 flex flex-col text-center">
                <h1 className="text-4xl md:text-5xl font-black text-zinc-950 tracking-tighter leading-[1.1] mb-3 drop-shadow-sm">
                  {slide.title}
                </h1>
                <p className="text-[15px] font-bold text-zinc-500 max-w-[280px] mx-auto leading-relaxed">
                  {slide.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* BUTTONS */}
      <div className="absolute bottom-0 left-0 w-full z-50 p-6 pb-10 pointer-events-auto flex flex-col items-center justify-center">
        
        {/* ✅ SURGICAL ADDITION: Native PWA Install Button */}
        {/* ✅ SHOW THIS IF THEY HAVE NOT INSTALLED IT YET */}
        {isInstallable && !hasInstalledApp && isInBrowserTab && (
          <button
            onClick={handleInstallClick}
            className="w-full max-w-sm mb-3 bg-zinc-900 hover:bg-zinc-800 text-white font-black text-sm uppercase tracking-wider py-4 px-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer"
          >
            <span className="text-lg">📱</span> Install to Home Screen
          </button>
        )}

        {/* ✅ SHOW THIS IF IT IS INSTALLED, BUT THEY ARE IN THE BROWSER */}
        {hasInstalledApp && isInBrowserTab && (
          <a
            href="web+onpraise://open"
            className="w-full max-w-sm mb-3 bg-[#009DFE] hover:bg-[#1954D5] text-white font-black text-sm uppercase tracking-wider py-4 px-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer text-center decoration-transparent"
          >
            <span className="text-lg">🚀</span> Open OnPraise App
          </a>
        )}
        <button
          onClick={handleGoogleLogin}
          className="w-full max-w-sm bg-white hover:bg-zinc-50 text-zinc-800 font-black text-sm uppercase tracking-wider py-4 px-4 rounded-2xl border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Continue with Google
        </button>
      </div>
      
    {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: INSTALLATION SUCCESS MODAL          */}
      {/* ======================================================= */}
      {showInstallSuccessModal && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative overflow-hidden">
            
            {/* Background Confetti/Blob effect */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />

            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 shadow-inner relative">
              <span className="text-4xl relative z-10">🎉</span>
              <div className="absolute inset-0 border-4 border-blue-500 rounded-full animate-ping opacity-20" />
            </div>
            
            <h3 className="text-2xl font-black text-zinc-900 tracking-tight mb-2">
              App Installed!
            </h3>
            <p className="text-[13px] font-bold text-zinc-500 leading-relaxed mb-8">
              OnPraise is now on your home screen. You can safely close this browser tab and launch the app directly from your phone.
            </p>

            <div className="w-full space-y-3 relative z-10">
              <a
                href="web+onpraise://open"
                onClick={() => {
                  // Wait a second, then close the modal so they aren't trapped if the protocol fails
                  setTimeout(() => setShowInstallSuccessModal(false), 1000);
                }}
                className="w-full bg-[#009DFE] hover:bg-[#1954D5] text-white font-black text-sm uppercase tracking-wider py-4 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer decoration-transparent block"
              >
                Launch OnPraise App
              </a>
              <button
                onClick={() => setShowInstallSuccessModal(false)}
                className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-black text-[11px] uppercase tracking-widest py-3.5 px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center"
              >
                Close & Find on Home Screen
              </button>
            </div>

          </div>
        </div>
      )}
    </main>
  );
}