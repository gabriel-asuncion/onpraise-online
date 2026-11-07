"use client";

import React, { useState, useEffect, useSyncExternalStore, useRef } from 'react';
import { createClient } from '../utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Session } from '@supabase/supabase-js';
import { resolveAccountLandingDecision } from '../lib/account-routing';
import { getInvitationPath, normalizeJoinCode } from '../lib/invitations';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __onPraiseDeferredInstallPrompt?: BeforeInstallPromptEvent;
  }
}

const BROWSER_IOS = 1;
const BROWSER_MOBILE = 2;
const BROWSER_IN_APP = 4;
const BROWSER_STANDALONE = 8;

function subscribeToBrowserFlags(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const displayMode = window.matchMedia('(display-mode: standalone)');
  displayMode.addEventListener('change', onChange);
  return () => displayMode.removeEventListener('change', onChange);
}

function getBrowserFlags() {
  if (typeof window === 'undefined') return 0;

  const userAgent = window.navigator.userAgent;
  const normalizedUserAgent = userAgent.toLowerCase();
  const isAppleDevice = /iphone|ipad|ipod/.test(normalizedUserAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const isAndroidDevice = /android/.test(normalizedUserAgent);
  const isMobile = isAppleDevice || isAndroidDevice || /mobile/.test(normalizedUserAgent);
  const isInAppBrowser = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Twitter|TikTok/i.test(userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

  return (isAppleDevice ? BROWSER_IOS : 0) |
    (isMobile ? BROWSER_MOBILE : 0) |
    (isInAppBrowser ? BROWSER_IN_APP : 0) |
    (isStandalone ? BROWSER_STANDALONE : 0);
}

function clearStoredInstallPrompt() {
  if (typeof window !== 'undefined') {
    window.__onPraiseDeferredInstallPrompt = undefined;
  }
}

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
  const browserFlags = useSyncExternalStore(subscribeToBrowserFlags, getBrowserFlags, () => 0);
  const isStandalone = Boolean(browserFlags & BROWSER_STANDALONE);
  const isInBrowserTab = !isStandalone;
  const isIOS = Boolean(browserFlags & BROWSER_IOS);
  const isMobileDevice = Boolean(browserFlags & BROWSER_MOBILE);
  const isInAppBrowser = Boolean(browserFlags & BROWSER_IN_APP);
  
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const isAccountSwitch = searchParams.get("switch_account") === "1";
  const authErrorParam = searchParams.get("auth_error");
  const [authRoutingError, setAuthRoutingError] = useState(() => {
    if (authErrorParam) return "Sign-in could not be completed. Please try again.";
    if (inviteCode && !normalizeJoinCode(inviteCode)) {
      return "This invitation link is not valid. You can still sign in and request a new invite.";
    }
    return "";
  });
  const [isResolvingAccount, setIsResolvingAccount] = useState(true);
  const routingAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (isAccountSwitch) localStorage.removeItem("onpraise_switch_account");
  }, [isAccountSwitch]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);

  // PWA Install Engine States
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [hasInstalledApp, setHasInstalledApp] = useState(false);
  const [showInstallSuccessModal, setShowInstallSuccessModal] = useState(false);
  
  // ✅ SURGICAL ADDITION: iOS Custom Prompt States
  const [showIOSTutorial, setShowIOSTutorial] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installHelpMode, setInstallHelpMode] = useState<'install' | 'open'>('install');

  // ✅ SURGICAL ADDITION: Device Detection & PWA Event Listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 4. Listen for Android/Chrome Install Prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      const promptEvent = e as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      window.__onPraiseDeferredInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      setIsInstallable(true);
    };

    // 5. Listen for Successful Installation
    const handleAppInstalled = () => {
      window.__onPraiseDeferredInstallPrompt = undefined;
      setDeferredPrompt(null);
      setIsInstallable(false);
      setHasInstalledApp(true);
      setShowInstallSuccessModal(true);
      setShowIOSTutorial(false);
      setShowInstallHelp(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.__onPraiseDeferredInstallPrompt) {
      handleBeforeInstallPrompt(window.__onPraiseDeferredInstallPrompt);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Keep the invite available across OAuth redirects and embedded-browser reloads.
  useEffect(() => {
    const rawInvite = inviteCode;
    const normalizedInvite = normalizeJoinCode(rawInvite);
    if (rawInvite && normalizedInvite) {
      localStorage.setItem("onpraise_pending_invite", normalizedInvite);
    } else if (rawInvite) {
      localStorage.removeItem("onpraise_pending_invite");
    }

    let isActive = true;
    const routeForSession = async (session: Session | null) => {
      if (!session) {
        routingAttemptRef.current = null;
        if (isActive) setIsResolvingAccount(false);
        return;
      }

      const stashedInvite = rawInvite ? null : localStorage.getItem("onpraise_pending_invite");
      const activeInvite = normalizedInvite || normalizeJoinCode(stashedInvite);
      const routeKey = `${session.user.id}:${activeInvite || "account"}`;
      if (routingAttemptRef.current === routeKey) return;
      routingAttemptRef.current = routeKey;
      if (isActive) {
        setIsResolvingAccount(true);
        if (!rawInvite || normalizedInvite) setAuthRoutingError("");
      }

      try {
        const accountDecision = await resolveAccountLandingDecision(async () => {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("full_name, team_id, secondary_team_ids, ministries")
            .eq("id", session.user.id)
            .maybeSingle();
          if (profileError) throw profileError;
          return profile;
        }, async () => {
          const { data: membership, error: membershipError } = await supabase
            .from("team_members")
            .select("id")
            .eq("user_id", session.user.id)
            .limit(1);
          if (membershipError) throw membershipError;
          return Boolean(membership?.length);
        });

        if (!isActive) return;
        if (rawInvite && !normalizedInvite) {
          setIsResolvingAccount(false);
          routingAttemptRef.current = null;
          setAuthRoutingError("This invitation link is not valid. You can still sign in and request a new invite.");
          return;
        }

        if (activeInvite) {
          localStorage.setItem("onpraise_pending_invite", activeInvite);
          router.replace(getInvitationPath(activeInvite));
        } else {
          router.replace(accountDecision.destination);
        }
      } catch (error) {
        console.error("Could not resolve account onboarding state.", error);
        if (isActive) {
          routingAttemptRef.current = null;
          setIsResolvingAccount(false);
          setAuthRoutingError("We couldn't verify your account yet. Check your connection and try again.");
        }
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        void routeForSession(session);
      } else if (event === "SIGNED_OUT") {
        routingAttemptRef.current = null;
        if (isActive) setIsResolvingAccount(false);
      }
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isActive) return;
        if (error) {
          console.error("Could not restore the Supabase session.", error);
          setIsResolvingAccount(false);
          setAuthRoutingError("We couldn't restore your sign-in session. Sign in again or open this link in your browser.");
          return;
        }
        return routeForSession(data.session);
      })
      .catch((error: unknown) => {
        console.error("Could not restore the Supabase session.", error);
        if (isActive) {
          setIsResolvingAccount(false);
          setAuthRoutingError("We couldn't restore your sign-in session. Sign in again or open this link in your browser.");
        }
      });

    return () => {
      isActive = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router, inviteCode]);

  const handleInstallClick = async () => {
    // Use the native install dialog only when the browser actually provided it.
    if (deferredPrompt) {
      try {
        const promptEvent = deferredPrompt;
        clearStoredInstallPrompt();
        setDeferredPrompt(null);
        setIsInstallable(false);
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (error) {
        console.error('PWA install prompt failed:', error);
        clearStoredInstallPrompt();
        setDeferredPrompt(null);
        setIsInstallable(false);
        setInstallHelpMode('install');
        setShowInstallHelp(true);
      }
      return;
    }

    if (isInAppBrowser) {
      setInstallHelpMode('install');
      setShowInstallHelp(true);
      return;
    }

    attemptAppLaunch('install');
  };

  const attemptAppLaunch = (fallbackMode: 'install' | 'open') => {
    let leftPage = false;
    const launchUrl = 'web+onpraise://open';
    setShowInstallSuccessModal(false);
    const handleVisibilityChange = () => {
      leftPage ||= document.visibilityState === 'hidden';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    try {
      window.location.href = launchUrl;
    } catch (error) {
      console.error('PWA app launch failed:', error);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (fallbackMode === 'install' && isIOS) {
        setShowIOSTutorial(true);
      } else {
        setInstallHelpMode(fallbackMode);
        setShowInstallHelp(true);
      }
      return;
    }

    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (!leftPage && document.visibilityState === 'visible') {
        if (fallbackMode === 'install' && isIOS) {
          setShowIOSTutorial(true);
        } else {
          setInstallHelpMode(fallbackMode);
          setShowInstallHelp(true);
        }
      }
    }, 1500);
  };

  const handleOpenApp = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    attemptAppLaunch('open');
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const storedInvite = localStorage.getItem("onpraise_pending_invite");
    const activeInvite = normalizeJoinCode(inviteCode) || normalizeJoinCode(storedInvite);
    if (inviteCode && !activeInvite) {
      setAuthRoutingError("This invitation code is invalid. Ask the team owner for a new link.");
      return;
    }
    if (activeInvite) localStorage.setItem("onpraise_pending_invite", activeInvite);

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (activeInvite) callbackUrl.searchParams.set("invite", activeInvite);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          ...(isAccountSwitch ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google sign-in could not be started.", error);
      setAuthRoutingError("Google sign-in could not be started. Please try again.");
    }
  };

  // ✅ THE SLIDES ARRAY WITH DENSE, UNIQUE BLOB CLUSTERS
  const slides = [
    {
      title: "Sync your stage.",
      desc: "Realtime sets, connected bands, and zero paper. No pressure, just presence.",
      graphics: (
        // ✅ SURGICAL FIX: Bound the container to bottom-[250px] so it never touches the text below it
        <div className="absolute top-0 left-0 w-full bottom-[180px] md:bottom-[220px] flex items-center justify-center pt-8 md:pt-12 pointer-events-none">
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
          
          <Player autoplay loop src="/assets/login_01.json" className="w-full max-w-[320px] md:max-w-[450px] max-h-[85%] object-contain animate-float-lottie relative z-10" />
        </div>
      )
    },
    {
      title: "Perfectly timed.",
      desc: "Sample-accurate metronomes and vocal cues locked to your band's flow.",
      graphics: (
        <div className="absolute top-0 left-0 w-full bottom-[180px] md:bottom-[220px] flex items-center justify-center pt-8 md:pt-12 pointer-events-none">
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
          
          <Player autoplay loop src="/assets/login_02.json" className="w-[85%] max-w-[320px] md:max-w-[450px] max-h-[85%] object-contain animate-float-lottie relative z-10" />
        </div>
      )
    },
    {
      title: "Build your set.",
      desc: "Arrange songs, map sections, and transpose keys on the fly. Total control.",
      graphics: (
        <div className="absolute top-0 left-0 w-full bottom-[180px] md:bottom-[220px] flex items-center justify-center pt-8 md:pt-12 pointer-events-none">
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

          <Player autoplay loop src="/assets/login_03.json" className="w-[95%] max-w-[340px] md:max-w-[450px] max-h-[85%] object-contain animate-float-lottie relative z-10" />
        </div>
      )
    },
    {
      title: "Ready to play.",
      desc: "Join your team's workspace and perform with absolute confidence.",
      graphics: (
        <div className="absolute top-0 left-0 w-full bottom-[180px] md:bottom-[220px] flex items-center justify-center pt-8 md:pt-12 pointer-events-none">
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

          <Player autoplay loop src="/assets/login_04.json" className="w-[85%] max-w-[320px] md:max-w-[450px] max-h-[85%] object-contain animate-float-lottie relative z-10" />
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
    <main className="relative flex min-h-[100svh] min-h-[100dvh] w-full flex-col overflow-x-hidden bg-white pointer-events-none">
      
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
      <div className="absolute top-0 left-0 w-full z-50 flex items-center justify-center pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
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
      <div className="relative h-[65svh] min-h-[360px] max-h-[720px] w-full flex-none supports-[height:65dvh]:h-[65dvh]">
        <div 
          className="flex h-full w-full items-center"
          style={{
            transform: `translateX(-${activeSlide * 100}%)`,
            transition: isTransitioning ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' 
          }}
        >
          {extendedSlides.map((slide, idx) => (
            <div key={idx} className="w-full h-full flex-shrink-0 relative overflow-hidden">
              {slide.graphics}
              <div className="absolute bottom-[135px] md:bottom-[180px] left-0 w-full z-40 px-5 flex flex-col text-center">
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
      <div className="relative z-50 flex w-full flex-col items-center justify-center px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pointer-events-auto">
        
        {/* ✅ SURGICAL FIX: Show button if native installable OR if it's an iOS device in the browser */}
        {((isInstallable || isIOS || isMobileDevice) && !hasInstalledApp && isInBrowserTab) && (
          <button
            onClick={handleInstallClick}
            className="w-full max-w-sm mb-3 bg-zinc-900 hover:bg-zinc-800 text-white font-black text-sm uppercase tracking-wider py-4 px-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer"
          >
            <span className="text-lg">📱</span>
            {isInAppBrowser && !deferredPrompt ? 'Open in Browser to Install' : 'Install to Home Screen'}
          </button>
        )}

        {/* ✅ SHOW THIS IF IT IS INSTALLED, BUT THEY ARE IN THE BROWSER */}
        {hasInstalledApp && isInBrowserTab && (
          <a
            href="web+onpraise://open"
            onClick={handleOpenApp}
            className="w-full max-w-sm mb-3 bg-[#009DFE] hover:bg-[#1954D5] text-white font-black text-sm uppercase tracking-wider py-4 px-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer text-center decoration-transparent"
          >
            <span className="text-lg">🚀</span> Open OnPraise App
          </a>
        )}
        {authRoutingError && (
          <p className="mb-3 w-full max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-700" role="alert">
            {authRoutingError}
          </p>
        )}
        {isResolvingAccount && (
          <p className="mb-3 text-xs font-semibold text-zinc-500" role="status">
            Checking your sign-in…
          </p>
        )}
        <button
          onClick={handleGoogleLogin}
          disabled={isResolvingAccount}
          className="w-full max-w-sm bg-white hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-wait text-zinc-800 font-black text-sm uppercase tracking-wider py-4 px-4 rounded-2xl border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer"
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
                onClick={handleOpenApp}
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
      {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: IOS INSTALL TUTORIAL MODAL          */}
      {/* ======================================================= */}
      {showIOSTutorial && (
        <div className="fixed inset-0 z-[250000] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto pb-4 px-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm mx-auto p-6 flex flex-col items-center text-center relative animate-in slide-in-from-bottom-full duration-300">
            
            <button 
              onClick={() => setShowIOSTutorial(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 font-bold flex items-center justify-center"
            >
              ✕
            </button>

            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-blue-100">
              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            
            <h3 className="text-xl font-black text-zinc-900 tracking-tight mb-2">
              Install OnPraise
            </h3>
            <p className="text-[13px] font-bold text-zinc-500 leading-relaxed mb-6">
              iOS does not allow websites to show an automatic install popup. Use your browser&apos;s Share menu to add OnPraise to your Home Screen.
            </p>
            <p className="mb-5 text-xs font-semibold text-zinc-500">
              Already installed? Launch OnPraise from your Home Screen.
            </p>

            <div className="flex flex-col gap-3 w-full bg-zinc-50 p-4 rounded-2xl border border-zinc-100 text-left mb-6">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-[10px] flex items-center justify-center shrink-0">1</span>
                <span className="text-[12px] font-bold text-zinc-700">Tap the <strong>Share</strong> button in your browser toolbar.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-[10px] flex items-center justify-center shrink-0">2</span>
                <span className="text-[12px] font-bold text-zinc-700">Scroll down and tap <strong>Add to Home Screen</strong>.</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {showInstallHelp && (
        <div className="fixed inset-0 z-[250000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
          <div role="dialog" aria-modal="true" aria-labelledby="install-help-title" className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setShowInstallHelp(false)}
              aria-label="Close install instructions"
              className="float-right -mt-2 -mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 font-bold text-zinc-500"
            >
              ✕
            </button>
            <div className="clear-both pt-2">
              <h3 id="install-help-title" className="mb-2 text-xl font-black tracking-tight text-zinc-900">
                {installHelpMode === 'open'
                  ? 'Open OnPraise from your Home Screen'
                  : isInAppBrowser
                    ? 'Open OnPraise in your browser'
                    : 'Install OnPraise'}
              </h3>
              <p className="mb-5 text-[13px] font-semibold leading-relaxed text-zinc-600">
                {installHelpMode === 'open'
                  ? 'This browser could not switch to the installed app. Close this tab and launch OnPraise from your Home Screen. Browsers do not always allow websites to open an installed PWA directly.'
                  : isInAppBrowser
                    ? 'Messenger and some other in-app browsers do not support app installation. Use the app menu to open this page in Safari or Chrome, then install it there.'
                    : 'This browser has not provided an automatic install prompt. If OnPraise is already installed, open it from your Home Screen; otherwise, open the browser menu and choose “Install app” or “Add to Home Screen.”'}
              </p>
              {installHelpMode === 'install' && isInAppBrowser && (
                <p className="mb-5 rounded-xl bg-zinc-50 p-3 text-left text-xs font-semibold leading-relaxed text-zinc-600">
                  Your sign-in link will carry over when you open it in the browser. This page cannot launch another browser automatically.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowInstallHelp(false)}
                className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-wider text-white"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}