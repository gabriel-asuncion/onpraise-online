import React from 'react';

// ============================================================================
// THE REUSABLE BLOB COMPONENT (Rendered instantly on the server/client)
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

export default function Loading() {
  return (
    <main className="relative w-full h-screen bg-white overflow-hidden flex flex-col items-center justify-center pointer-events-none select-none">
      
      {/* ======================================================= */}
      {/* THE ANIMATION BANK (Shared with Login)                    */}
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
        @keyframes orbit-ccw {
          0% { transform: rotate(0deg) translateX(25px) rotate(0deg); }
          100% { transform: rotate(-360deg) translateX(25px) rotate(360deg); }
        }
        @keyframes zigzag-pop {
          0%, 100% { transform: translate(0,0) scale(1); }
          15% { transform: translate(20px, -20px) scale(1.2); }
          30% { transform: translate(-10px, -30px) scale(0.8); }
          45% { transform: translate(15px, 10px) scale(1.1); }
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
        .animate-orbit-ccw { animation: orbit-ccw 17s linear infinite; }
        .animate-zigzag-pop { animation: zigzag-pop 11s ease-in-out infinite; }
        .animate-float-spin { animation: float-spin 19s ease-in-out infinite; }
        .animate-drift-a { animation: drift-a 7s ease-in-out infinite; }
        .animate-drift-b { animation: drift-b 11s ease-in-out infinite; }
        .animate-blink { animation: blink 4s infinite; transform-origin: center; }
      `}} />

      {/* ======================================================= */}
      {/* FLOATING ECOSYSTEM (Framing the center)                   */}
      {/* ======================================================= */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Top Left Cluster */}
        <Blob color="#2563EB" w="90px" hasEyes animClass="animate-dart-x" delay="-1s" top="20%" left="15%" />
        <Blob color="#BFDBFE" w="40px" hasEyes={false} animClass="animate-orbit-cw" delay="0s" top="15%" left="25%" />
        
        {/* Bottom Right Cluster */}
        <Blob color="#EF4444" w="100px" hasEyes animClass="animate-dart-y" delay="-2s" bottom="25%" right="15%" />
        <Blob color="#FECACA" w="35px" hasEyes={false} animClass="animate-zigzag-pop" delay="-1s" bottom="20%" right="28%" />

        {/* Top Right Cluster */}
        <Blob color="#F59E0B" w="80px" hasEyes animClass="animate-morph-squish" delay="0s" top="25%" right="20%" />
        <Blob color="#FDE68A" w="25px" hasEyes={false} animClass="animate-float-spin" delay="-4s" top="18%" right="12%" />

        {/* Bottom Left Cluster */}
        <Blob color="#A855F7" w="85px" hasEyes animClass="animate-float-spin" delay="-3s" bottom="20%" left="20%" />
        <Blob color="#E9D5FF" w="45px" hasEyes={false} animClass="animate-orbit-ccw" delay="-2s" bottom="30%" left="10%" />
        
        {/* Scattered Eyeless Ghost Blobs for depth */}
        <Blob color="#EFF6FF" w="60px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" top="40%" right="10%" />
        <Blob color="#F3E8FF" w="70px" hasEyes={false} animClass="animate-pulse-ghost" delay="-5s" bottom="40%" left="8%" />
        <Blob color="#FEF2F2" w="50px" hasEyes={false} animClass="animate-drift-b" delay="-3s" top="10%" left="50%" />
      </div>

      {/* ======================================================= */}
      {/* CENTER LOADING INDICATOR                                  */}
      {/* ======================================================= */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-500">
        
        {/* Spinning Rings */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-zinc-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute inset-2 border-4 border-purple-500 rounded-full border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
        </div>

        {/* Pulsing Text */}
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-xl font-black text-zinc-900 tracking-tight animate-pulse">Syncing...</h2>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Warming up the stage</p>
        </div>

      </div>


    </main>
  );
}