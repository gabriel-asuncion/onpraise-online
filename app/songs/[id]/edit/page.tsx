"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext";
import { getSongChordChart } from "../../../../utils/supabase/actions";
import GlobalLoader from '../../../../components/GlobalLoader';
import { useWebAudioEngine } from "../../../setlists/[id]/live/hooks/useWebAudioEngine";

// =======================================================
// --- TRANSPOSTITION & DIATONIC CONSTANT BLUEPRINTS -----
// =======================================================
const DIATONIC_MODES_MAP: { [key: string]: { root: string; suffix: string }[] } = {
  "C":  [{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}, {root:"A",suffix:"m"}, {root:"B",suffix:"dim"}],
  "Db": [{root:"Db",suffix:""},{root:"Eb",suffix:"m"},{root:"F",suffix:"m"},{root:"Gb",suffix:""},{root:"Ab",suffix:""},{root:"Bb",suffix:"m"},{root:"C",suffix:"dim"}],
  "D":  [{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}, {root:"B",suffix:"m"}, {root:"C#",suffix:"dim"}],
  "Eb": [{root:"Eb",suffix:""},{root:"F",suffix:"m"}, {root:"G",suffix:"m"}, {root:"Ab",suffix:""},{root:"Bb",suffix:""},{root:"C",suffix:"m"}, {root:"D",suffix:"dim"}],
  "E":  [{root:"E",suffix:""}, {root:"F#",suffix:"m"},{root:"G#",suffix:"m"},{root:"A",suffix:""}, {root:"B",suffix:""}, {root:"C#",suffix:"m"},{root:"D#",suffix:"dim"}],
  "F":  [{root:"F",suffix:""}, {root:"G",suffix:"m"}, {root:"A",suffix:"m"}, {root:"Bb",suffix:""},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"dim"}],
  "F#": [{root:"F#",suffix:""},{root:"G#",suffix:"m"},{root:"A#",suffix:"m"},{root:"B",suffix:""}, {root:"C#",suffix:""},{root:"D#",suffix:"m"}, {root:"F",suffix:"dim"}],
  "G":  [{root:"G",suffix:""}, {root:"A",suffix:"m"}, {root:"B",suffix:"m"}, {root:"C",suffix:""}, {root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"dim"}],
  "Ab": [{root:"Ab",suffix:""},{root:"Bb",suffix:"m"},{root:"C",suffix:"m"}, {root:"Db",suffix:""},{root:"Eb",suffix:""},{root:"F",suffix:"m"}, {root:"G",suffix:"dim"}],
  "A":  [{root:"A",suffix:""}, {root:"B",suffix:"m"}, {root:"C#",suffix:"m"},{root:"D",suffix:""}, {root:"E",suffix:""}, {root:"F#",suffix:"m"},{root:"G#",suffix:"dim"}],
  "Bb": [{root:"Bb",suffix:""},{root:"C",suffix:"m"}, {root:"D",suffix:"m"}, {root:"Eb",suffix:""},{root:"F",suffix:""}, {root:"G",suffix:"m"}, {root:"A",suffix:"dim"}],
  "B":  [{root:"B",suffix:""}, {root:"C#",suffix:"m"},{root:"D#",suffix:"m"},{root:"E",suffix:""}, {root:"F#",suffix:""},{root:"G#",suffix:"m"},{root:"A#",suffix:"dim"}],
  "Am": [{root:"A",suffix:"m"}, {root:"B",suffix:"dim"},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}],
  "Bm": [{root:"B",suffix:"m"}, {root:"C#",suffix:"dim"},{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}]
};

const Blob = ({ 
  color, w, hasEyes, animClass, delay, top, left, right, bottom 
}: { 
  color: string, w: string, hasEyes: boolean, animClass: string, delay: string, top?: string, left?: string, right?: string, bottom?: string 
}) => (
  <div className={`absolute z-0 opacity-70 ${animClass}`} style={{ animationDelay: delay, top, left, right, bottom, width: w }}>
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <path fill={color} d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.5,-41.1C85.9,-26.9,92.5,-12.4,90.4,1.4C88.4,15.2,77.7,28.3,67.6,40.4C57.5,52.5,48,63.6,35.5,70.5C23,77.4,7.5,80.1,-6.9,78C-21.3,75.9,-34.5,69.1,-46.8,60.8C-59.1,52.5,-70.5,42.7,-78.6,30.3C-86.7,17.9,-91.5,2.9,-88.4,-10.8C-85.3,-24.5,-74.3,-36.9,-62,-46.1C-49.7,-55.3,-36.1,-61.3,-23.1,-68.2C-10.1,-75.1,2.3,-82.9,16.4,-82.6C30.5,-82.3,46,-73.9,45.7,-76.3Z" transform="translate(100 100)" />
      {hasEyes && (
        <><circle cx="85" cy="90" r="8" fill="white" className="animate-blink" /><circle cx="115" cy="90" r="8" fill="white" className="animate-blink" /></>
      )}
    </svg>
  </div>
);

interface SongSectionBlock {
  id: string;
  type: string;     
  label: string;    
  content: string;  
  repetitions: number;
}

interface SectionTimingMap {
  [sectionType: string]: {
    measures: number;
    beats: number;
    repeats?: number;
    head_m?: number;
    tail_m?: number;
  };
}

// ✅ SURGICAL FIX: Dark-mode ready section palette colors matching the dashboard aesthetic
const SECTION_BASE_CATALOG = [
  { id: "V", display: "Verse", abbr: "V", color: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  { id: "PC", display: "Pre-Chorus", abbr: "PC", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { id: "C",  display: "Chorus", abbr: "C", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { id: "PoC", display: "Post-Chorus", abbr: "PoC", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { id: "R",  display: "Refrain", abbr: "R", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { id: "B",  display: "Bridge", abbr: "B", color: "text-primary border-primary/30 bg-primary/10" },
  { id: "IN", display: "Intro", abbr: "IN", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { id: "I",  display: "Instrumental", abbr: "I", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { id: "IT", display: "Interlude", abbr: "IT", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { id: "O",  display: "Outro", abbr: "O", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
  { id: "T",  display: "Tag", abbr: "T", color: "text-secondary border-secondary/30 bg-secondary/10" },
  { id: "AD", display: "Ad Lib", abbr: "AL", color: "text-rose-400 border-rose-500/30 bg-rose-500/10" }
];

const CHRISTIAN_THEMES_PRESETS = [
  "Praise", "Worship", "Thanksgiving", "Grace", "Faith", "Love", "Hope", "Joy", 
  "Peace", "Salvation", "Redemption", "Resurrection", "The Cross", "Holy Spirit", 
  "God's Faithfulness", "Sovereignty", "Healing", "Deliverance", "Mercy", "Hymn", 
  "Gospel", "Contemporary Christian", "Prophetic", "Adoration", "Victory", "Brokenness"
];

const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_LETTER_ROOTS = ["C", "D", "E", "F", "G", "A", "B"];

const normalizeKeyNote = (note: string): string => {
  const flatMap: { [key: string]: string } = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  return flatMap[note] || note;
};

const transposeBracketContent = (contentStr: string, semitones: number): string => {
  return contentStr.replace(/([A-G][#b]?\S*)/g, (match) => {
    if (match.includes("/")) {
      return match.split("/").map(part => {
        const m = part.match(/^([A-G][#b]?)(.*)$/);
        return m ? `${transposeSingleNote(m[1], semitones)}${m[2]}` : part;
      }).join("/");
    }
    const matchResult = match.match(/^([A-G][#b]?)(.*)$/);
    if (!matchResult) return match;
    return `${transposeSingleNote(matchResult[1], semitones)}${matchResult[2]}`;
  });
};

const transposeSingleNote = (note: string, semitones: number): string => {
  const normalized = normalizeKeyNote(note);
  const idx = CHROMATIC_SCALE.indexOf(normalized);
  if (idx === -1) return note;
  return CHROMATIC_SCALE[(idx + semitones + 12) % 12];
};

const ChordWheelOverlay = ({ config, deck, onSelect, onCancel }: { config: any, deck: any[], onSelect: (c: any) => void, onCancel: () => void }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    const handleMove = (e: TouchEvent | PointerEvent) => {
      if(e.cancelable) e.preventDefault(); 
      
      let cx, cy;
      if ('touches' in e && e.touches.length > 0) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
      } else {
        cx = (e as PointerEvent).clientX;
        cy = (e as PointerEvent).clientY;
      }

      const dx = cx - config.x;
      const dy = cy - config.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 40) { 
        setActiveIndex(null);
        return;
      }

      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      let idx = null;

      if (config.mode === "full") {
        let a = (angle + 90 + 360) % 360;
        let shiftedA = (a + (180 / 7)) % 360; 
        idx = Math.floor(shiftedA / (360 / 7));
      } else if (config.mode === "right") {
        if (angle >= -100 && angle <= 100) { 
          idx = Math.round((angle + 90) / 30);
        }
      } else if (config.mode === "left") {
        let a = (angle + 360) % 360; 
        if (a >= 80 && a <= 280) {
          idx = Math.round((270 - a) / 30);
        }
      }

      if (idx !== null && idx >= 0 && idx < 7) setActiveIndex(idx);
      else setActiveIndex(null);
    };

    const handleUp = (e: Event) => {
      if(e.cancelable) e.preventDefault();
      if (activeIndexRef.current !== null) onSelect(deck[activeIndexRef.current]);
      else onCancel();
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp, { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
      window.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, [config, deck, onSelect, onCancel]);

  const getPos = (i: number) => {
    let theta = 0;
    if (config.mode === "full") theta = (i * (360 / 7)) - 90;
    else if (config.mode === "right") theta = -90 + (i * 30);
    else if (config.mode === "left") theta = 270 - (i * 30);
    
    const rad = 85; 
    return { x: Math.cos(theta * Math.PI / 180) * rad, y: Math.sin(theta * Math.PI / 180) * rad };
  };

  let clipStyle = 'none';
  if (config.mode === "right") clipStyle = 'inset(0 0 0 50%)';
  if (config.mode === "left") clipStyle = 'inset(0 50% 0 0)';

  return (
    <div className="fixed inset-0 z-[600000] touch-none select-none overflow-hidden animate-in fade-in duration-150">
      <div className="absolute inset-0 bg-[#111113]/40 backdrop-blur-[2px]" />
      
      <div 
        className="absolute shadow-2xl bg-surface-container/95 backdrop-blur-xl"
        style={{
           left: config.x, top: config.y, width: 260, height: 260,
           transform: 'translate(-50%, -50%)', borderRadius: '50%',
           clipPath: clipStyle, boxShadow: '0 30px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)'
        }}
      >
         <svg width="260" height="260" viewBox="-130 -130 260 260" className="absolute top-0 left-0 opacity-10 pointer-events-none">
           {Array.from({length: 7}).map((_, i) => {
              let lineTheta = 0;
              if (config.mode === "full") lineTheta = (i * (360 / 7)) - 90 + (180/7); 
              else if (config.mode === "right") lineTheta = -90 + (i * 30) + 15;
              else lineTheta = 270 - (i * 30) - 15;
              const lx = Math.cos(lineTheta * Math.PI / 180) * 130;
              const ly = Math.sin(lineTheta * Math.PI / 180) * 130;
              return <line key={i} x1="0" y1="0" x2={lx} y2={ly} stroke="#fff" strokeWidth="2.5" />;
           })}
         </svg>
      </div>

      {deck.map((chord, i) => {
         const pos = getPos(i);
         const isActive = activeIndex === i;
         return (
            <div 
              key={i}
              className={`absolute w-16 h-16 -ml-8 -mt-8 rounded-full flex flex-col items-center justify-center transition-all duration-150 leading-none ${isActive ? 'bg-primary text-on-primary scale-125 shadow-xl font-black' : 'bg-transparent text-on-surface font-bold'}`}
              style={{ left: config.x + pos.x, top: config.y + pos.y }}
            >
              <span className={isActive ? 'text-[22px]' : 'text-[18px]'}>{chord.root}</span>
              {chord.suffix && <span className={`text-[10px] mt-0.5 ${isActive ? 'text-primary-container' : 'text-on-surface-variant'}`}>{chord.suffix}</span>}
            </div>
         );
      })}

      <div 
        className={`absolute w-14 h-14 -ml-7 -mt-7 rounded-full shadow-lg border flex items-center justify-center font-black text-xl transition-all duration-150 ${activeIndex === null ? 'scale-110 bg-surface-container-high text-on-surface border-outline-variant/30' : 'scale-95 bg-surface-container text-on-surface-variant border-outline-variant/20'}`}
        style={{ left: config.x, top: config.y }}
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </div>
    </div>
  );
};



export default function SongEditPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams(); 
  const editingSongId = params.id as string;

  const editorContentContainerRef = useRef<HTMLDivElement | null>(null);
  const { activeRole } = useEngine();

  useEffect(() => {
    if (activeRole === "member") {
      router.replace("/songs"); 
    }
  }, [activeRole, router]);

  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmExitModalOpen, setIsConfirmExitModalOpen] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null); 
  const [editorActiveTab, setEditorActiveTab] = useState<"details" | "content" | "structure">("details");

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollY = useRef(0);

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { initAudioContext, playZeroLatencyAudio, fetchAndDecodeAudio } = useWebAudioEngine();
  const lastTickedBeatRef = useRef<number>(-1);

  useEffect(() => {
    if (typeof window !== "undefined") {
      fetchAndDecodeAudio(`/sound_files/metronome_blip_1.wav`, `metronome_blip_1`);
      fetchAndDecodeAudio(`/sound_files/metronome_blip_2.wav`, `metronome_blip_2`);
    }
  }, [fetchAndDecodeAudio]);

  const handleCanvasScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;

    if (currentScrollY <= 0) {
      setIsScrollingDown(false);
    } else if (currentScrollY > lastScrollY.current) {
      setIsScrollingDown(true);
    } else if (currentScrollY < lastScrollY.current) {
      setIsScrollingDown(false);
    }
    
    lastScrollY.current = currentScrollY;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-scroll", { detail: false }));
    }
  }, []);
  
  const [formTitle, setFormTitle] = useState("");
  const [formTempo, setFormTempo] = useState("");
  const [isTapBpmModalOpen, setIsTapBpmModalOpen] = useState(false);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  const [formYoutubeUrl, setFormYoutubeUrl] = useState("");
  const [formYoutubeSyncOffset, setFormYoutubeSyncOffset] = useState<number>(0);
  const [formIsYoutubeSyncValidated, setFormIsYoutubeSyncValidated] = useState<boolean>(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const ytTimeTrackerRef = useRef<number | null>(null);

  // ✅ SURGICAL ADDITION: Real-time Metronome Mute state
  const [isMetronomeMuted, setIsMetronomeMuted] = useState(false);
  const isMetronomeMutedRef = useRef(false);
  useEffect(() => {
    isMetronomeMutedRef.current = isMetronomeMuted;
  }, [isMetronomeMuted]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: ytPlaying }));
    }
  }, [ytPlaying]);

  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [playerDragY, setPlayerDragY] = useState(0);
  const isPlayerDraggingRef = useRef(false);
  const playerDragStartYRef = useRef(0);

  const handlePlayerPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('button')) return;
    
    isPlayerDraggingRef.current = true;
    playerDragStartYRef.current = e.clientY;
    target.setPointerCapture(e.pointerId);
  };

  const handlePlayerPointerMove = (e: React.PointerEvent) => {
    if (!isPlayerDraggingRef.current) return;
    const deltaY = e.clientY - playerDragStartYRef.current;
    
    if (isPlayerExpanded && deltaY > 0) {
      setPlayerDragY(deltaY);
    }
  };

  const handlePlayerPointerUp = (e: React.PointerEvent) => {
    if (!isPlayerDraggingRef.current) return;
    isPlayerDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const deltaY = e.clientY - playerDragStartYRef.current;

    if (!isPlayerExpanded) {
      if (Math.abs(deltaY) < 10) setIsPlayerExpanded(true); 
    } else {
      if (deltaY > 60) setIsPlayerExpanded(false); 
    }

    setPlayerDragY(0); 
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const updateScrubber = () => {
      if (ytPlaying && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        const currentTime = ytPlayerRef.current.getCurrentTime();
        setYtCurrentTime(currentTime);

        const tempo = parseInt(formTempo) || 0;
        if (tempo > 0 && formYoutubeSyncOffset !== null) {
          const elapsedMs = (currentTime * 1000) - formYoutubeSyncOffset;
          if (elapsedMs >= 0) {
            const msPerBeat = 60000 / tempo;
            const currentBeat = Math.floor(elapsedMs / msPerBeat);
            
            if (currentBeat !== lastTickedBeatRef.current) {
              if (currentBeat > lastTickedBeatRef.current) {
                const isDownbeat = currentBeat % 4 === 0; 
                // ✅ SURGICAL FIX: Only play the click if the user hasn't muted it
                if (!isMetronomeMutedRef.current) {
                  playZeroLatencyAudio(isDownbeat ? 'metronome_blip_1' : 'metronome_blip_2', 1.0);
                }
              }
              lastTickedBeatRef.current = currentBeat;
            }
          } else {
            lastTickedBeatRef.current = -1; 
          }
        }
      } else {
        lastTickedBeatRef.current = -1;
      }
      ytTimeTrackerRef.current = requestAnimationFrame(updateScrubber);
    };

    if (ytPlaying) {
      ytTimeTrackerRef.current = requestAnimationFrame(updateScrubber);
    }
    
    return () => {
      if (ytTimeTrackerRef.current) cancelAnimationFrame(ytTimeTrackerRef.current);
    };
  }, [ytPlaying, formTempo, formYoutubeSyncOffset, initAudioContext, playZeroLatencyAudio]);
  
  const ytPlayerRef = useRef<any>(null);
  const isYtPlayerReadyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!formYoutubeUrl.trim()) {
      setYoutubeVideoId(null);
      return;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = formYoutubeUrl.match(regExp);
    if (match && match[2].length === 11) {
      setYoutubeVideoId(match[2]);
    } else {
      setYoutubeVideoId(null);
    }
  }, [formYoutubeUrl]);

  useEffect(() => {
    if (tapTimestamps.length > 0) {
      const idleTimer = setTimeout(() => setTapTimestamps([]), 3000);
      return () => clearTimeout(idleTimer);
    }
  }, [tapTimestamps]);

  const [formKey, setFormKey] = useState("G");
  const [formArtist, setFormArtist] = useState("");

  const [availableArtists, setAvailableArtists] = useState<string[]>([]);
  const filteredArtistSuggestions = availableArtists
    .filter(a => a.toLowerCase().includes(formArtist.toLowerCase()) && a.toLowerCase() !== formArtist.toLowerCase())
    .slice(0, 6);
  
  const [availableSongs, setAvailableSongs] = useState<{id: string, title: string, artist: string}[]>([]);
  const [isTitleDropdownFocused, setIsTitleDropdownFocused] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{id: string, title: string, artist: string} | null>(null);
  const [dismissedDuplicateIds, setDismissedDuplicateIds] = useState<string[]>([]);

  const filteredTitleSuggestions = availableSongs
    .filter(s => s.title.toLowerCase().includes(formTitle.toLowerCase()) && s.title.toLowerCase() !== formTitle.toLowerCase())
    .slice(0, 6);

  useEffect(() => {
    if (!formTitle.trim() || !formArtist.trim()) return;
    const duplicate = availableSongs.find(
      s => s.title.toLowerCase() === formTitle.trim().toLowerCase() &&
           s.artist.toLowerCase() === formArtist.trim().toLowerCase() &&
           s.id !== editingSongId
    );
    if (duplicate && !dismissedDuplicateIds.includes(duplicate.id) && duplicateWarning?.id !== duplicate.id) {
      setDuplicateWarning(duplicate);
    }
  }, [formTitle, formArtist, availableSongs, editingSongId, dismissedDuplicateIds]);

  const [formThemes, setFormThemes] = useState<string[]>([]);
  const [themeInputSearchValue, setThemeInputSearchValue] = useState("");
  const [isArtistDropdownFocused, setIsArtistDropdownFocused] = useState(false);
  const [isThemeDropdownFocused, setIsThemeDropdownFocused] = useState(false);
  const [formSections, setFormSections] = useState<SongSectionBlock[]>([]);
  const [sectionTimings, setSectionTimings] = useState<SectionTimingMap>({});
  const [lineOverrides, setLineOverrides] = useState<Record<string, Record<number, { measures: number; beats: number }>> | null>(null);
  
  const [isKeyPopupOpen, setIsKeyPopupOpen] = useState(false);
  const [modalKeyRoot, setModalKeyRoot] = useState("G");
  const [modalKeyAccidental, setModalKeyAccidental] = useState<"" | "#" | "b">("");

  const [isRealtimePreviewActive, setIsRealtimePreviewActive] = useState(false);

  const [chordMode, setChordMode] = useState<"Off" | "Chords" | "Keyboard">("Off");
  const [isAddNotesModeActive, setIsAddNotesModeActive] = useState(false); 

  const [wheelState, setWheelState] = useState<{isOpen: boolean, x: number, y: number, sectionType: string, lineIdx: number, wordIdx: number, mode: "full"|"left"|"right"} | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartPosRef = useRef({ x: 0, y: 0 });
  const justClosedWheelRef = useRef(0);

  const handleWheelSelect = (chordObj: { root: string, suffix: string }) => {
    if (!wheelState) return;
    const chordStr = `${chordObj.root}${chordObj.suffix}`;
    const { sectionType, lineIdx, wordIdx } = wheelState;
    
    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      let realWordCounter = 0;
      lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
        if (realWordCounter === wordIdx) {
          realWordCounter++;
          const cleanTextWord = match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "");
          return `[${chordStr}]${cleanTextWord}`;
        }
        realWordCounter++;
        return match;
      });
      return { ...sec, content: lines.join("\n") };
    }));

    setWheelState(null);
    justClosedWheelRef.current = Date.now(); 
  };

  const [multiSelectedChords, setMultiSelectedChords] = useState<{sectionType: string, lineIdx: number, wordIdx: number}[]>([]);
  const [selectedStagedChordIndices, setSelectedStagedChordIndices] = useState<number[]>([]);

  const [sectionAdjustmentsConfig, setSectionAdjustmentsConfig] = useState<{ isOpen: boolean; sectionType: string | null }>({ isOpen: false, sectionType: null });
  const [adjustmentsModalTab, setAdjustmentsModalTab] = useState<"section" | "lines">("section"); 
  const [chordPickerConfig, setChordPickerConfig] = useState<{ isOpen: boolean; sectionType: string | null; lineIdx: number; wordIdx: number; cleanWord: string }>({ isOpen: false, sectionType: null, lineIdx: -1, wordIdx: -1, cleanWord: "" });
  const [pickerLayoutView, setPickerLayoutView] = useState<"family" | "manual">("family");
  const [stagedChordsText, setStagedChordsText] = useState("");
  const [manualExtensionNumber, setManualExtensionNumber] = useState("");

  const [sectionModalConfig, setSectionModalConfig] = useState<{ isOpen: boolean, mode: "add" | "reassign", targetId?: string }>({ isOpen: false, mode: "add" });
  const [sectionModalSearch, setSectionModalSearch] = useState("");
  const [sectionModalSelected, setSectionModalSelected] = useState<string | null>(null);

  const [chordTargetCoordinate, setChordTargetCoordinate] = useState<{ sectionType: string; lineIdx: number; wordIdx: number } | null>(null);
  const [notesTargetCoordinate, setNotesTargetCoordinate] = useState<{ sectionType: string; lineIdx: number } | null>(null); 

  const [selectedChordRoot, setSelectedChordRoot] = useState("G");
  const [customChordInputValue, setCustomChordInputValue] = useState("G");
  const [customCommentInputValue, setCustomCommentInputValue] = useState("");

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedRawLyricsText, setPastedRawLyricsText] = useState("");
  const [initialModalText, setInitialModalText] = useState(""); 

  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false);
  const [isScrapingSelection, setIsScrapingSelection] = useState(false);
  const [fetchedLyricsOptions, setFetchedLyricsOptions] = useState<{title: string, artist: string, url?: string, lyrics?: string, type?: string, thumbnail?: string}[] | null>(null);

  const handleSmartLyricsFetch = async () => {
    if (!formTitle.trim()) {
      alert("Please enter a Track Title first to search for lyrics.");
      return;
    }
    setIsFetchingLyrics(true);
    setFetchedLyricsOptions(null); 

    let cleanTitle = formTitle.replace(/\[.*?\]|\(.*?\)/g, ""); 
    cleanTitle = cleanTitle.replace(/(official|live|lyric|video|audio|music)/gi, "").trim(); 
    
    const searchQuery = cleanTitle;

    try {
      const res = await fetch(`/api/lyrics?q=${encodeURIComponent(searchQuery)}&action=search`);
      const data = await res.json();

      if (res.ok) {
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
          
          const targetArtist = formArtist.toLowerCase().trim();
          const targetTitle = cleanTitle.toLowerCase();

          const scoredResults = data.results.map((item: any) => {
            const itemArtist = (item.artist || "").toLowerCase();
            const itemTitle = (item.title || "").toLowerCase();
            let score = 0; let type = "Alternative Version";

            if (itemTitle === targetTitle) score += 10;
            else if (itemTitle.includes(targetTitle)) score += 5;

            if (targetArtist && itemArtist === targetArtist) {
              score += 50; type = "Top Result";
            } else if (targetArtist && (itemArtist.includes(targetArtist) || targetArtist.includes(itemArtist))) {
              score += 25; type = "Close Match";
            }

            return { ...item, score, type };
          });

          scoredResults.sort((a: any, b: any) => b.score - a.score);
          if (scoredResults.length > 0 && scoredResults[0].type === "Alternative Version") {
            scoredResults[0].type = "Top Result";
          }
          setFetchedLyricsOptions(scoredResults);
        } 
        else if (data.lyrics) {
          setFetchedLyricsOptions([{ title: cleanTitle, artist: formArtist || "Unknown", lyrics: data.lyrics, type: "Top Result" }]);
        } else {
          alert("No lyrics found for this track. Try simplifying the title.");
        }
      } else {
        alert(data.error || "Failed to fetch lyrics.");
      }
    } catch (err) {
      alert("Failed to connect to the Lyrics Engine.");
    } finally {
      setIsFetchingLyrics(false);
    }
  };

  const handleSelectLyricsCard = async (opt: any) => {
    let baseLyrics = opt.lyrics || "";
    setIsScrapingSelection(true);

    try {
      if (!baseLyrics) {
        if (!opt.url) {
          alert("Missing URL to scrape lyrics from.");
          setIsScrapingSelection(false); return;
        }
        
        const res = await fetch(`/api/lyrics?url=${encodeURIComponent(opt.url)}&action=scrape`);
        const data = await res.json();
        
        if (res.ok && data.lyrics) {
          baseLyrics = data.lyrics;
        } else {
          alert(data.error || "Failed to extract Genius lyrics.");
          setIsScrapingSelection(false); return;
        }
      }

      setPastedRawLyricsText(baseLyrics);
      setFetchedLyricsOptions(null); 
      
    } catch (err) {
      alert("A critical error occurred processing the song data. Check console.");
    } finally {
      setIsScrapingSelection(false);
    }
  };

  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [draggedStructureIndex, setDraggedStructureIndex] = useState<number | null>(null);
  const [dragOverStructureIndex, setDragOverStructureIndex] = useState<number | null>(null);

  const [confirmClearSectionId, setConfirmClearSectionId] = useState<string | null>(null);

  const executeClearChords = () => {
    if (!confirmClearSectionId) return;
    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.id !== confirmClearSectionId) return sec;
      const clearedContent = sec.content.replace(/\[[^\]]*\]/g, "");
      return { ...sec, content: clearedContent };
    }));
    setConfirmClearSectionId(null);
  };

  const dynamicCatalogOptions = useMemo(() => {
    return SECTION_BASE_CATALOG.map(base => {
      const regex = new RegExp(`^${base.display}\\s+(\\d+)$`, 'i');
      let maxNum = 0;
      formSections.forEach(sec => {
        const match = sec.type.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const nextName = `${base.display} ${maxNum + 1}`;
      return { ...base, computedId: nextName, computedDisplay: nextName };
    });
  }, [formSections]);

  const cycleChordMode = () => {
    if (chordMode === "Off") setChordMode("Chords");
    else if (chordMode === "Chords") setChordMode("Keyboard");
    else setChordMode("Off");
    setChordTargetCoordinate(null);
  };

  const handleSectionModalSubmit = () => {
    if (!sectionModalSelected) return;
    const tmpl = dynamicCatalogOptions.find(x => x.computedId === sectionModalSelected);
    if (!tmpl) return;

    if (sectionModalConfig.mode === "add") {
      setHasUnsavedChanges(true);
      setFormSections([...formSections, { 
        id: `sec-add-${Date.now()}-${Math.random()}`, 
        type: tmpl.computedDisplay, 
        label: tmpl.computedDisplay, 
        content: "", 
        repetitions: 1 
      }]);
    } else if (sectionModalConfig.mode === "reassign" && sectionModalConfig.targetId) {
      setHasUnsavedChanges(true);
      setFormSections(formSections.map(item => 
        item.id === sectionModalConfig.targetId 
          ? { ...item, type: tmpl.computedDisplay, label: tmpl.computedDisplay } 
          : item
      ));
    }
    setSectionModalConfig({ isOpen: false, mode: "add" });
  };

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const { data } = await supabase.from("songs").select("id, title, artist");
        if (data) {
          const uniqueArtists = Array.from(new Set(data.map(s => s.artist?.trim()).filter(Boolean)));
          setAvailableArtists(uniqueArtists as string[]);
          setAvailableSongs(data.map(s => ({ 
            id: s.id, 
            title: s.title?.trim() || "", 
            artist: s.artist?.trim() || "Unknown Artist" 
          })));
        }
      } catch (err) {
        console.error("Failed to fetch dictionary", err);
      }
    };
    fetchDictionary();
  }, [supabase]);

  useEffect(() => {
    const hydrateArrangementWorkspace = async () => {
      if (!editingSongId) return;
      
      if (editingSongId === "new") {
        const prefillTitle = searchParams.get("title") || "";
        const prefillArtist = searchParams.get("artist") || "";
        const prefillYoutubeUrl = searchParams.get("youtube_url") || "";

        if (prefillTitle) setFormTitle(prefillTitle);
        if (prefillArtist) setFormArtist(prefillArtist);
        if (prefillYoutubeUrl) setFormYoutubeUrl(prefillYoutubeUrl);
        
        if (prefillTitle || prefillArtist || prefillYoutubeUrl) {
          setHasUnsavedChanges(true);
        }

        setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data: song, error: songFetchError } = await supabase
          .from("songs")
          .select("*")
          .eq("id", editingSongId)
          .single();

        if (songFetchError || !song) throw songFetchError;
        
        setFormTitle(song.title || "");
        setFormTempo(song.tempo || "");
        setFormKey(song.original_key || "G");
        setFormArtist(song.artist || "");
        setFormYoutubeUrl(song.youtube_url || "");
        setFormYoutubeSyncOffset(song.youtube_sync_offset_ms || 0);
        setFormIsYoutubeSyncValidated(song.is_youtube_sync_validated || false);
        setFormThemes(song.themes ? song.themes.split(",").map((t: string) => t.trim()).filter(Boolean) : []);

        let dbTimings = song.section_timings || {};
        if (typeof dbTimings === 'string') {
          try { dbTimings = JSON.parse(dbTimings); } catch(e) { dbTimings = {}; }
        }
        setSectionTimings(dbTimings);

        const sectionsRaw = await getSongChordChart(editingSongId);
        if (sectionsRaw && sectionsRaw.length > 0) {
          const loadedBlocks = sectionsRaw.map((s: any, idx: number) => ({ 
            id: s.id || `sec-${idx}-${Math.random()}`, 
            type: s.section_name || "Verse 1", 
            label: s.section_name || "Verse 1", 
            content: s.content || "", 
            repetitions: 1
          }));
          setFormSections(loadedBlocks);

          const hydratedOverrides: Record<string, any> = {};
          loadedBlocks.forEach((sec) => {
            const savedMetricsNode = dbTimings?.[sec.type];
            if (savedMetricsNode?.line_timings) {
              hydratedOverrides[sec.type] = savedMetricsNode.line_timings;
            }
          });
          setLineOverrides(hydratedOverrides);
        } else {
          setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]);
        }
      } catch (err) {
        console.error("Tracking hydration synced drop failure:", err);
      } finally {
        setLoading(false);
        setHasUnsavedChanges(false);
      }
    };
    hydrateArrangementWorkspace();
  }, [editingSongId]);

  useEffect(() => {
    const handleModalHardwareEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleAttemptDismissal();
    };
    window.addEventListener("keydown", handleModalHardwareEscapeKey);
    return () => window.removeEventListener("keydown", handleModalHardwareEscapeKey);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleNextJsLinkClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      
      if (target && target.href && target.target !== '_blank') {
        const targetUrl = new URL(target.href);
        if (targetUrl.origin === window.location.origin && targetUrl.pathname !== window.location.pathname) {
          e.preventDefault(); 
          e.stopPropagation(); 
          
          setPendingNavigationUrl(targetUrl.pathname + targetUrl.search);
          setIsConfirmExitModalOpen(true);
        }
      }
    };

    const handlePopState = () => {
      if (hasUnsavedChanges) {
        window.history.pushState(null, '', window.location.href);
        setPendingNavigationUrl(null); 
        setIsConfirmExitModalOpen(true);
      }
    };

    document.addEventListener('click', handleNextJsLinkClick, { capture: true });
    window.addEventListener('popstate', handlePopState);

    window.history.pushState(null, '', window.location.href);

    return () => {
      document.removeEventListener('click', handleNextJsLinkClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges]);

  const activeScaleDiatonicDeck = useMemo(() => DIATONIC_MODES_MAP[formKey] || DIATONIC_MODES_MAP["G"], [formKey]);

  useEffect(() => {
    const handleNashvilleNumberKeyInjections = (e: KeyboardEvent) => {
      if (chordMode !== "Keyboard" || !chordTargetCoordinate || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      
      if (["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
        e.preventDefault();
        const targetedScaleChord = activeScaleDiatonicDeck[parseInt(e.key, 10) - 1];
        if (targetedScaleChord) {
          const formattedFullChordStr = `${targetedScaleChord.root}${targetedScaleChord.suffix}`;
          const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
          setHasUnsavedChanges(true);
          setFormSections(prev => prev.map(sec => {
            if (sec.type !== sectionType) return sec;
            const lines = sec.content.split("\n");
            let currentLine = lines[lineIdx] || "";
            const matchCount = (currentLine.match(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g) || []).length;

            if (wordIdx === -1) {
                currentLine = `[${formattedFullChordStr}] ${currentLine}`.trim();
            } else if (wordIdx === -2) {
                currentLine = `[${formattedFullChordStr}]`;
            } else if (wordIdx >= matchCount) {
                currentLine = `${currentLine} [${formattedFullChordStr}]`.trim();
            } else {
                let realWordCounter = 0;
                currentLine = currentLine.replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
                  if (realWordCounter === wordIdx) { 
                    realWordCounter++; 
                    return `[${formattedFullChordStr}]${match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "")}`; 
                  }
                  realWordCounter++; return match;
                });
            }
            lines[lineIdx] = currentLine;
            return { ...sec, content: lines.join("\n") };
          }));
          setChordTargetCoordinate(null);
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
        setHasUnsavedChanges(true);
        setFormSections(prev => prev.map(sec => {
          if (sec.type !== sectionType) return sec;
          const lines = sec.content.split("\n");
          let currentLine = lines[lineIdx] || "";
          const matchCount = (currentLine.match(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g) || []).length;

          if (wordIdx !== -1 && wordIdx !== -2 && wordIdx < matchCount) {
              let realWordCounter = 0;
              currentLine = currentLine.replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
                if (realWordCounter === wordIdx) { realWordCounter++; return match.replace(/\[[^\]]+\]/g, ""); }
                realWordCounter++; return match;
              });
          }
          lines[lineIdx] = currentLine;
          return { ...sec, content: lines.join("\n") };
        }));
        setChordTargetCoordinate(null);
      }
    };
    window.addEventListener("keydown", handleNashvilleNumberKeyInjections);
    return () => window.removeEventListener("keydown", handleNashvilleNumberKeyInjections);
  }, [chordMode, chordTargetCoordinate, activeScaleDiatonicDeck]);

  useEffect(() => {
    if (!youtubeVideoId) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try { ytPlayerRef.current.destroy(); } catch(e) {}
        ytPlayerRef.current = null;
        isYtPlayerReadyRef.current = false;
      }
      return;
    }

    const initPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) {
        setTimeout(initPlayer, 200); return;
      }

      const container = document.getElementById('onpraise-persistent-yt');
      if (!container) {
          setTimeout(initPlayer, 200); return;
      }
      
      ytPlayerRef.current = new (window as any).YT.Player('onpraise-persistent-yt', {
        height: '360', 
        width: '640', 
        videoId: youtubeVideoId,
        playerVars: { 
            'playsinline': 1, 
            'controls': 0, 
            'disablekb': 1,
            'origin': typeof window !== 'undefined' ? window.location.origin : '*' 
        }, 
        events: {
          'onReady': (event: any) => {
            isYtPlayerReadyRef.current = true; 
            try { setYtDuration(event.target.getDuration() || 0); } catch(e){}
          },
          'onStateChange': (event: any) => {
            if (event.data === 1 || event.data === 3) { 
              setYtPlaying(true);
              try { setYtDuration(event.target.getDuration() || 0); } catch(e){}
            } else if (event.data === 2 || event.data === 0) { 
              setYtPlaying(false);
            }
          },
          'onError': (error: any) => console.error("YT Error:", error.data)
        }
      });
    };

    if (!(window as any).YT) {
      const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
    initPlayer();
    
    return () => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try { ytPlayerRef.current.destroy(); } catch(e) {}
        ytPlayerRef.current = null;
        isYtPlayerReadyRef.current = false;
      }
    };
  }, [youtubeVideoId]);

  useEffect(() => {
    const isEditingFocused = 
      chordMode !== "Off" || 
      chordPickerConfig.isOpen || 
      sectionAdjustmentsConfig.isOpen || 
      sectionModalConfig.isOpen;
    
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-ui-focus", { detail: isEditingFocused }));
    }
    
    return () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("onpraise-ui-focus", { detail: false }));
      }
    };
  }, [chordMode, chordPickerConfig.isOpen, sectionAdjustmentsConfig.isOpen, sectionModalConfig.isOpen]);


  const handleCaptureSyncPoint = () => {
    if (isYtPlayerReadyRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
      try {
        const currentTimeSecs = ytPlayerRef.current.getCurrentTime();
        setFormYoutubeSyncOffset(Math.round(currentTimeSecs * 1000));
        setHasUnsavedChanges(true);
      } catch(e) {}
    }
  };

  const handleOpenKeySelectionPopup = () => {
    const cleanKeyBase = formKey.endsWith("m") ? formKey.slice(0, -1) : formKey;
    let baseLetter = cleanKeyBase.charAt(0);
    let accidentalSign: "" | "#" | "b" = "";
    if (cleanKeyBase.includes("#")) accidentalSign = "#";
    else if (cleanKeyBase.includes("b")) accidentalSign = "b";
    setModalKeyRoot(baseLetter);
    setModalKeyAccidental(accidentalSign);
    setIsKeyPopupOpen(true);
  };

  const handleSelectNewKeySignature = (newKey: string) => {
    if (newKey === formKey) return;
    const oldIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(formKey.endsWith("m") ? formKey.slice(0, -1) : formKey));
    const newIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(newKey.endsWith("m") ? newKey.slice(0, -1) : newKey));
    if (oldIdx !== -1 && newIdx !== -1) {
      const semitoneDelta = (newIdx - oldIdx + 12) % 12;
      if (semitoneDelta !== 0) {
        setHasUnsavedChanges(true);
        setFormSections(prev => prev.map(sec => ({ 
          ...sec, 
          content: sec.content.replace(/\[([^\]]+)\]/g, (m, inner) => `[${transposeBracketContent(inner, semitoneDelta)}]`) 
        })));
      }
    }
    setFormKey(newKey); 
    setIsKeyPopupOpen(false);
  };

  const handleSaveModalKeySelection = (e: React.FormEvent) => {
    e.preventDefault();
    const isMinorSong = formKey.endsWith("m");
    const nextKeyComputedName = `${modalKeyRoot}${modalKeyAccidental}${isMinorSong ? "m" : ""}`;
    handleSelectNewKeySignature(nextKeyComputedName);
  };

  const getCentralizedMetricsTuple = (sectionType: string) => {
    const savedMetrics = sectionTimings[sectionType];
    return {
      measures: savedMetrics?.measures ?? 4,
      beats: savedMetrics?.beats ?? 0,
      repeats: savedMetrics?.repeats ?? 0,
      head_m: savedMetrics?.head_m ?? 0,
      tail_m: savedMetrics?.tail_m ?? 0
    };
  };

  const handleUpdateCentralizedMetrics = (sectionType: string, field: "measures" | "beats" | "repeats" | "head_m" | "tail_m", value: number) => {
    setHasUnsavedChanges(true);
    setSectionTimings(prev => {
      const currentTuple = prev[sectionType] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      return { ...prev, [sectionType]: { ...currentTuple, [field]: value } };
    });
  };

  const handleAddSectionBelow = (tmpl: any) => {
    const newSection = { id: `sec-${Date.now()}-${Math.random()}`, type: tmpl.type, label: tmpl.label, content: tmpl.content, repetitions: 1 };
    const updatedSections = [...formSections];
    const selectedIndex = updatedSections.findIndex(s => s.id === selectedSequenceId);
    if (selectedIndex > -1) updatedSections.splice(selectedIndex + 1, 0, newSection);
    else updatedSections.push(newSection);
    setHasUnsavedChanges(true);
    setFormSections(updatedSections);
  };

  const handleStructureDropOverride = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedStructureIndex !== null && draggedStructureIndex !== targetIdx) {
      setHasUnsavedChanges(true);
      const reordered = [...formSections]; 
      const [removed] = reordered.splice(draggedStructureIndex, 1); 
      reordered.splice(targetIdx, 0, removed);
      setFormSections(reordered); 
    }
    setDraggedStructureIndex(null);
    setDragOverStructureIndex(null);
  };

  const executeChordInjectionAtIndex = (injectedTokenStr: string) => {
    if (!chordTargetCoordinate) return;
    const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
    const cleanInput = injectedTokenStr.trim();
    let bracketedTag = cleanInput !== "" ? ((cleanInput.startsWith("[") && cleanInput.endsWith("]")) ? cleanInput : `[${cleanInput}]`) : "";

    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      let currentLine = lines[lineIdx] || "";
      const matchCount = (currentLine.match(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g) || []).length;

      if (wordIdx === -1) {
          currentLine = `${bracketedTag} ${currentLine}`.trim();
      } else if (wordIdx === -2) {
          currentLine = bracketedTag;
      } else if (wordIdx >= matchCount) {
          currentLine = `${currentLine} ${bracketedTag}`.trim();
      } else {
          let realWordCounter = 0;
          currentLine = currentLine.replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
            if (realWordCounter === wordIdx) { 
              realWordCounter++; 
              return `${bracketedTag}${match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "")}`; 
            }
            realWordCounter++; return match;
          });
      }
      lines[lineIdx] = currentLine;
      return { ...sec, content: lines.join("\n") };
    }));
    setChordTargetCoordinate(null); 
    setCustomChordInputValue("");
  };

  const executeChordPickerConfirm = () => {
    if (!chordPickerConfig.sectionType || chordPickerConfig.lineIdx === -1) return;

    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== chordPickerConfig.sectionType) return sec;
      const lines = sec.content.split("\n");
      let currentLine = lines[chordPickerConfig.lineIdx] || "";
      
      const compiledBrackets = stagedChordsText.trim().split(/\s+/).filter(Boolean).map(ch => `[${ch.trim()}]`).join("");
      const matchCount = (currentLine.match(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g) || []).length;

      if (chordPickerConfig.wordIdx === -1) {
          currentLine = `${compiledBrackets} ${currentLine}`.trim();
      } else if (chordPickerConfig.wordIdx === -2) {
          currentLine = compiledBrackets;
      } else if (chordPickerConfig.wordIdx >= matchCount) {
          currentLine = `${currentLine} ${compiledBrackets}`.trim();
      } else {
          let realWordCounter = 0;
          currentLine = currentLine.replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
            if (realWordCounter === chordPickerConfig.wordIdx) {
              realWordCounter++;
              const cleanTextWord = match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "");
              return `${compiledBrackets}${cleanTextWord}`;
            }
            realWordCounter++;
            return match;
          });
      }
      lines[chordPickerConfig.lineIdx] = currentLine;
      return { ...sec, content: lines.join("\n") };
    }));

    setChordPickerConfig({ isOpen: false, sectionType: null, lineIdx: -1, wordIdx: -1, cleanWord: "" });
    setSelectedStagedChordIndices([]);
  };

  const executeChordPickerRemoval = () => {
    if (!chordPickerConfig.sectionType || chordPickerConfig.lineIdx === -1) return;

    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== chordPickerConfig.sectionType) return sec;
      const lines = sec.content.split("\n");
      let currentLine = lines[chordPickerConfig.lineIdx] || "";
      const matchCount = (currentLine.match(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g) || []).length;

      if (chordPickerConfig.wordIdx !== -1 && chordPickerConfig.wordIdx !== -2 && chordPickerConfig.wordIdx < matchCount) {
          let realWordCounter = 0;
          currentLine = currentLine.replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
            if (realWordCounter === chordPickerConfig.wordIdx) {
              realWordCounter++;
              return match.replace(/\[[^\]]+\]/g, "");
            }
            realWordCounter++;
            return match;
          });
      }
      lines[chordPickerConfig.lineIdx] = currentLine;
      return { ...sec, content: lines.join("\n") };
    }));

    setChordPickerConfig({ isOpen: false, sectionType: null, lineIdx: -1, wordIdx: -1, cleanWord: "" });
    setSelectedStagedChordIndices([]);
  };

  const handlePickerChordTap = (chordComponent: string) => {
    if (selectedStagedChordIndices.length > 0) {
      setStagedChordsText(prev => {
        const arr = prev.split(/\s+/).filter(Boolean);
        selectedStagedChordIndices.forEach(idx => { if (arr[idx]) arr[idx] = chordComponent; });
        return arr.join(" ");
      });
      setSelectedStagedChordIndices([]);
    } else {
      setStagedChordsText(prev => {
        const cleanPrev = prev.trim();
        if (!cleanPrev || cleanPrev.endsWith("/")) return `${prev}${chordComponent}`;
        return `${cleanPrev} ${chordComponent}`;
      });
    }
  };

  const handlePickerModifierTap = (modifier: string) => {
    if (selectedStagedChordIndices.length > 0) {
      setStagedChordsText(prev => {
        const arr = prev.split(/\s+/).filter(Boolean);
        selectedStagedChordIndices.forEach(idx => { if (arr[idx]) arr[idx] += modifier; });
        return arr.join(" ");
      });
    } else {
      setStagedChordsText(prev => prev + modifier);
    }
  };

  const executeLineCommentInjection = (injectedCommentStr: string) => {
    if (!notesTargetCoordinate) return;
    const { sectionType, lineIdx } = notesTargetCoordinate;
    const cleanInput = injectedCommentStr.trim();
    let taggedComment = cleanInput !== "" ? ((cleanInput.startsWith("{") && cleanInput.endsWith("}")) ? cleanInput : `{${cleanInput}}`) : "";

    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      lines[lineIdx] = (lines[lineIdx] || "").replace(/\{[^\}]+\}/g, "").trim() + (taggedComment ? ` ${taggedComment}` : "");
      return { ...sec, content: lines.join("\n") };
    }));
    setNotesTargetCoordinate(null); 
    setCustomCommentInputValue("");
  };

  const handleOpenImportModal = () => {
    const hasRealContent = formSections.some(sec => sec.content.trim() !== "");
    if (hasRealContent) {
      const rawString = formSections.map((sec) => {
        const metrics = getCentralizedMetricsTuple(sec.type);
        const header = `[${sec.type}] (M: ${metrics.measures}, B: ${metrics.beats}, R: ${metrics.repeats}, H: ${metrics.head_m}, T: ${metrics.tail_m})`;
        
        const lines = sec.content.split("\n");
        const processedLines = lines.map(l => ({ rawText: l, cleanText: l.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim() }));
        const validLines = processedLines.filter(l => l.cleanText.length > 0);
        const totalLines = validLines.length;

        const autoSpreadMeasures = totalLines > 0 ? Math.floor(metrics.measures / totalLines) : 0;
        const remainderMeasures = totalLines > 0 ? metrics.measures % totalLines : 0;
        const autoSpreadBeats = totalLines > 0 ? Math.floor(metrics.beats / totalLines) : 0;
        const remainderBeats = totalLines > 0 ? metrics.beats % totalLines : 0;

        let validLineCounter = 0;
        const linesWithMetrics = lines.map((line) => {
           const clean = line.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim();
           if (clean.length === 0) return line;

           const override = (lineOverrides as any)?.[sec.type]?.[validLineCounter];
           const m = override?.measures ?? (autoSpreadMeasures + (validLineCounter < remainderMeasures ? 1 : 0));
           const b = override?.beats ?? (autoSpreadBeats + (validLineCounter < remainderBeats ? 1 : 0));
           validLineCounter++;

           return `${line} (M: ${m}, B: ${b})`;
        });

        return `${header}\n${linesWithMetrics.join('\n')}`.trim();
      }).join("\n\n");
      
      setPastedRawLyricsText(rawString);
      setInitialModalText(rawString);
    } else {
      setPastedRawLyricsText("");
      setInitialModalText("");
    }
    setIsImportModalOpen(true);
  };

  const executeRawLyricsImportAction = () => {
    if (!pastedRawLyricsText.trim()) return;
    setHasUnsavedChanges(true);
    const cleanLines = pastedRawLyricsText.split(/\r?\n/).map(l => l.trim());
    
    let currentSectionType = "";
    let currentBuffer: string[] = [];
    const parsedBlocks: SongSectionBlock[] = [];
    let unassignedCounter = 1;
    const newExtractedTimings: SectionTimingMap = {};
    
    const newLineOverrides: Record<string, Record<number, { measures: number; beats: number }>> = {};

    const flushBuffer = () => {
      if (currentBuffer.length === 0 && !currentSectionType) return;
      let finalType = currentSectionType;
      if (!finalType) {
        finalType = `Unassigned ${unassignedCounter}`;
        unassignedCounter++;
      }
      parsedBlocks.push({
        id: `sec-imp-${Date.now()}-${Math.random()}`,
        type: finalType,
        label: finalType,
        content: currentBuffer.join("\n"),
        repetitions: 1
      });
      currentBuffer = [];
      currentSectionType = "";
    };

    cleanLines.forEach(line => {
      const match = line.match(/^\[([^\]]+)\](?:\s*\(([^)]+)\))?$/);
      if (match) {
        flushBuffer();
        currentSectionType = match[1].trim();
        if (match[2]) {
          const metricsStr = match[2];
          const extractedMetrics = { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
          const mMatch = metricsStr.match(/M:\s*(\d+)/i);
          const bMatch = metricsStr.match(/B:\s*(\d+)/i);
          const rMatch = metricsStr.match(/R:\s*(\d+)/i);
          const hMatch = metricsStr.match(/H:\s*(\d+)/i);
          const tMatch = metricsStr.match(/T:\s*(\d+)/i);

          if (mMatch) extractedMetrics.measures = parseInt(mMatch[1], 10);
          if (bMatch) extractedMetrics.beats = parseInt(bMatch[1], 10);
          if (rMatch) extractedMetrics.repeats = parseInt(rMatch[1], 10);
          if (hMatch) extractedMetrics.head_m = parseInt(hMatch[1], 10);
          if (tMatch) extractedMetrics.tail_m = parseInt(tMatch[1], 10);

          newExtractedTimings[currentSectionType] = extractedMetrics;
        }
      } else if (line === "") {
        if (currentBuffer.length > 0) flushBuffer(); 
      } else {
        const lineMetricMatch = line.match(/(.*?)\s*\(\s*M:\s*(\d+),\s*B:\s*(\d+)\s*\)$/i);
        let cleanLineForContent = line;
        
        if (lineMetricMatch) {
           cleanLineForContent = lineMetricMatch[1].trim();
        }

        const isContentLine = cleanLineForContent.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim().length > 0;
        
        if (isContentLine && lineMetricMatch && currentSectionType) {
           const m = parseInt(lineMetricMatch[2], 10);
           const b = parseInt(lineMetricMatch[3], 10);
           if (!newLineOverrides[currentSectionType]) newLineOverrides[currentSectionType] = {};
           
           const currentLineIdx = currentBuffer.filter(l => l.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim().length > 0).length;
           newLineOverrides[currentSectionType][currentLineIdx] = { measures: m, beats: b };
        }

        currentBuffer.push(cleanLineForContent);
      }
    });

    flushBuffer();
    if (parsedBlocks.length > 0) {
      setFormSections(parsedBlocks);
      setSectionTimings(prev => {
        const mergedTimings = { ...prev };
        Object.keys(newExtractedTimings).forEach(key => {
          mergedTimings[key] = { ...mergedTimings[key], ...newExtractedTimings[key] };
        });
        return mergedTimings;
      });
      
      if (Object.keys(newLineOverrides).length > 0) {
         setLineOverrides(prev => {
            const merged = { ...(prev || {}) };
            Object.keys(newLineOverrides).forEach(key => {
               merged[key] = { ...(merged[key] || {}), ...newLineOverrides[key] };
            });
            return merged;
         });
      }
    }
    setIsImportModalOpen(false); 
    setPastedRawLyricsText("");
    setEditorActiveTab("content");
  };

  const handleAttemptDismissal = () => {
    if (hasUnsavedChanges) {
      setPendingNavigationUrl(null); 
      setIsConfirmExitModalOpen(true);
      return;
    }
    router.back(); 
  };

  const handleCommitSongChangesToDB = async () => {
    if (!editingSongId) return;
    if (!formTitle.trim()) {
      alert("⚠️ Track Title is required before saving.");
      return;
    }
    setSaveStatus("saving");

    try {
      const updatedSectionTimings: Record<string, any> = {};
      
      formSections.forEach((sec) => {
        const metricsTuple = getCentralizedMetricsTuple(sec.type);
        let specificRowOverrides = lineOverrides?.[sec.type] || null;

        if (!specificRowOverrides) {
          const processedLines = sec.content.split("\n").map(l => l.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim()).filter(l => l.length > 0);
          const totalLines = processedLines.length;
          
          const autoSpreadMeasures = totalLines > 0 ? Math.floor(metricsTuple.measures / totalLines) : 0;
          const remainderMeasures = totalLines > 0 ? metricsTuple.measures % totalLines : 0;
          const autoSpreadBeats = totalLines > 0 ? Math.floor(metricsTuple.beats / totalLines) : 0;
          const remainderBeats = totalLines > 0 ? metricsTuple.beats % totalLines : 0;

          specificRowOverrides = {};
          processedLines.forEach((_, lIdx) => {
            specificRowOverrides![lIdx] = {
              measures: autoSpreadMeasures + (lIdx < remainderMeasures ? 1 : 0),
              beats: autoSpreadBeats + (lIdx < remainderBeats ? 1 : 0)
            };
          });
        }

        updatedSectionTimings[sec.type] = {
          measures: metricsTuple.measures,
          beats: metricsTuple.beats,
          repeats: metricsTuple.repeats,
          head_m: metricsTuple.head_m,  
          tail_m: metricsTuple.tail_m,  
          line_timings: specificRowOverrides, 
          youtube_url: formYoutubeUrl.trim(),
          youtube_sync_offset_ms: formYoutubeSyncOffset
        };
      });

      const compiledChordPro = formSections
        .map((sec) => `[${sec.type}]\n${sec.content || ""}`)
        .join("\n\n");

      let finalSongId = editingSongId;
      const isNewSong = editingSongId === "new";

      if (isNewSong) {
        const { data: { user } } = await supabase.auth.getUser();
        let currentTeamId = null;
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).single();
          currentTeamId = profile?.team_id;
        }

        const insertPayload: any = {
          title: formTitle.trim(),
          artist: formArtist.trim() || "Unknown Artist",
          tempo: parseInt(formTempo, 10) || 75,
          original_key: formKey,
          themes: formThemes.join(", "),
          section_timings: updatedSectionTimings,
          chordpro_content: compiledChordPro,
          youtube_url: formYoutubeUrl.trim(),
          youtube_sync_offset_ms: formYoutubeSyncOffset,
          is_youtube_sync_validated: formIsYoutubeSyncValidated, 
          approval_status: ["admin", "moderator"].includes(activeRole) ? "pending" : "approved"
        };

        if (currentTeamId) insertPayload.team_id = currentTeamId;

        const { data: newSong, error: insertError } = await supabase.from("songs").insert(insertPayload).select("id").single();
        if (insertError) throw insertError;
        finalSongId = newSong.id; 
      } else {
        const { error: songUpdateError } = await supabase.from("songs").update({ 
            title: formTitle.trim(),
            artist: formArtist.trim() || "Unknown Artist",
            tempo: parseInt(formTempo, 10) || 75,
            original_key: formKey,
            themes: formThemes.join(", "),
            section_timings: updatedSectionTimings,
            chordpro_content: compiledChordPro,
            youtube_url: formYoutubeUrl.trim(),
            youtube_sync_offset_ms: formYoutubeSyncOffset,
            is_youtube_sync_validated: formIsYoutubeSyncValidated 
          }).eq("id", finalSongId);
        if (songUpdateError) throw songUpdateError;

        const { error: deleteError } = await supabase.from("song_sections").delete().eq("song_id", finalSongId);
        if (deleteError) throw deleteError;
      }

      const sectionsToInsert = formSections.map((sec, index) => ({
        song_id: finalSongId,
        section_name: sec.type,
        content: sec.content || "",
        sequence_order: index
      }));

      if (sectionsToInsert.length > 0) {
        const { error: insertError } = await supabase.from("song_sections").insert(sectionsToInsert);
        if (insertError) throw insertError;
      }

      setHasUnsavedChanges(false);
      setSaveStatus("success");
      
      setTimeout(() => {
        if (isNewSong) router.replace(`/songs/${finalSongId}/edit`);
        else setSaveStatus("idle");
      }, 1500);

    } catch (err: any) {
      setSaveErrorMessage(err?.message || JSON.stringify(err));
      setSaveStatus("error");
    }
  };

  const uniqueContentSectionsList = formSections.reduce((acc: SongSectionBlock[], curr) => { if (!acc.some(item => item.type === curr.type)) acc.push(curr); return acc; }, []);
  const filteredThemeCatalogSuggestions = CHRISTIAN_THEMES_PRESETS.filter(th => th.toLowerCase().includes(themeInputSearchValue.toLowerCase()) && !formThemes.includes(th));
  const isCommentInputBlank = customCommentInputValue.trim() === "";

  if (loading) {
    return (
      <div className="h-[100dvh] w-full overflow-hidden bg-surface flex flex-col relative animate-in slide-in-from-right-full fade-in duration-300 ease-out">
        {/* SKELETON HEADER */}
        <header className="sticky top-0 z-[100] w-full flex-shrink-0 bg-surface/90 border-b border-outline-variant/30 shadow-sm">
          <div className="flex items-center justify-between px-4 md:px-8 py-3.5 w-full">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-container-high animate-pulse" />
              <div className="w-48 h-5 bg-surface-container-high rounded animate-pulse" />
            </div>
            <div className="hidden md:flex items-center gap-2">
              <div className="w-24 h-7 rounded-lg bg-surface-container-high animate-pulse" />
              <div className="w-32 h-7 rounded-lg bg-surface-container-high animate-pulse" />
            </div>
          </div>
          <div className="px-4 md:px-8 flex items-center border-t border-outline-variant/30 bg-surface-container-lowest/30">
            <div className="py-4 flex gap-4 w-full">
              <div className="w-16 h-3 bg-surface-container-high rounded animate-pulse" />
              <div className="w-16 h-3 bg-surface-container-high rounded animate-pulse" />
              <div className="w-20 h-3 bg-surface-container-high rounded animate-pulse" />
            </div>
          </div>
        </header>
        
        {/* SKELETON CANVAS */}
        <div className="flex-1 p-4 md:p-8 space-y-4">
          <div className="w-full h-[250px] bg-surface-container-low border border-outline-variant/30 rounded-2xl animate-pulse shadow-sm" />
          <div className="w-full h-[400px] bg-surface-container-low border border-outline-variant/30 rounded-2xl animate-pulse shadow-sm" />
        </div>
      </div>
    );
  }

  const isAnySectionMismatchedAcrossModal = formSections.some((checkSec) => {
    const checkTuple = getCentralizedMetricsTuple(checkSec.type);
    const checkLines = checkSec.content.split("\n").map(l => l.replace(/\[[^\]]+\]/g, "").trim()).filter(l => l.length > 0);
    if (checkLines.length === 0) return false;
    
    const targetAbsoluteBeats = (checkTuple.measures * 4) + checkTuple.beats;
    
    const checkSpreadMeasures = Math.floor(checkTuple.measures / checkLines.length);
    const checkRemainderMeasures = checkTuple.measures % checkLines.length;
    const checkSpreadBeats = Math.floor(checkTuple.beats / checkLines.length);
    const checkRemainderBeats = checkTuple.beats % checkLines.length;

    const calculatedBeatsSum = checkLines.reduce((sum, _, lineIndex) => {
      const lineOverride = (lineOverrides as any)?.[checkSec.type]?.[lineIndex];
      const measures = lineOverride?.measures ?? (checkSpreadMeasures + (lineIndex < checkRemainderMeasures ? 1 : 0));
      const beats = lineOverride?.beats ?? (checkSpreadBeats + (lineIndex < checkRemainderBeats ? 1 : 0));
      return sum + (measures * 4) + beats;
    }, 0);

    return calculatedBeatsSum !== targetAbsoluteBeats;
  });

  const isMismatched = isRealtimePreviewActive && isAnySectionMismatchedAcrossModal; 
  const isSaveDisabled = isMismatched || !hasUnsavedChanges; 
  
  return (
    <div 
      ref={editorContentContainerRef} 
      // ✅ SURGICAL FIX: Applied slide-in-from-right-full to match the skeleton
      className="h-[100dvh] w-full overflow-hidden bg-surface flex flex-col relative animate-in slide-in-from-right-full fade-in duration-300 ease-out"
    >
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* --- UNIFIED SEMANTIC STICKY HEADER --- */}
      <header className="sticky top-0 z-[100] w-full flex-shrink-0 bg-surface/90 border-b border-outline-variant/30 shadow-sm supports-[backdrop-filter]:backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 md:px-8 py-3.5 w-full">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleAttemptDismissal} className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface-variant font-bold flex items-center justify-center transition-colors">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <h1 className="font-black text-base md:text-lg text-on-surface tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
              Modify Worship Arrangement
            </h1>
          </div>
          
         {/* Desktop Control Panel */}
          <div className="hidden md:flex items-center gap-2 select-none">
            {editorActiveTab === "content" && (
              <>
                <button type="button" onClick={handleOpenImportModal} className="px-3 py-1.5 text-[11px] font-black text-primary bg-primary-container/20 border border-primary/20 hover:bg-primary-container/40 rounded-lg shadow-sm flex items-center transition-colors">
                  <span className="material-symbols-outlined text-[14px] mr-1">download</span> Import Raw
                </button>
                <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setChordMode("Off"); setIsAddNotesModeActive(false); } }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all flex items-center ${isRealtimePreviewActive ? 'bg-primary border-primary/50 text-on-primary shadow-md' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-[14px] mr-1">{isRealtimePreviewActive ? 'visibility_off' : 'visibility'}</span> 
                  {isRealtimePreviewActive ? "Hide Preview" : "Show Preview"}
                </button>
          
                <button type="button" disabled={!isRealtimePreviewActive} onClick={cycleChordMode} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 min-w-[110px] flex items-center ${chordMode !== "Off" ? 'bg-secondary border-secondary/50 text-on-secondary shadow-md' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'}`}> 
                  <span className="material-symbols-outlined text-[14px] mr-1">music_note</span>
                  Chords: {chordMode}
                </button>
                
                <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setChordMode("Off"); }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 flex items-center ${isAddNotesModeActive ? 'bg-purple-500 border-purple-400/50 text-white shadow-md' : 'bg-surface-container border-outline-variant/30 text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined text-[14px] mr-1">edit_note</span> Add Notes 
                </button>
              </>
            )}

            <div className="w-px h-6 bg-outline-variant/30 mx-1" />
            {(activeRole === "admin" || activeRole === "member") && (
              <button 
                type="button" 
                disabled={isSaveDisabled} 
                className={`px-4 py-1.5 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all flex items-center ${isSaveDisabled ? "bg-surface-container-high text-on-surface-variant border border-outline-variant/30 cursor-not-allowed opacity-80" : "bg-primary hover:bg-primary/90 text-on-primary shadow-md cursor-pointer"}`} 
                onClick={handleCommitSongChangesToDB}
              >
                {isMismatched ? <><span className="material-symbols-outlined text-[14px] mr-1">lock</span> Mismatch</> : (!hasUnsavedChanges ? "No Changes" : "Save Arrangement")}
              </button>
            )}
          </div>
        </div>

        <nav className="flex flex-col select-none w-full border-t border-outline-variant/30">
          <div className="px-4 md:px-8 flex justify-between items-center bg-surface-container-lowest/30">
            <div className="flex gap-4 text-xs font-bold">
              {(["details", "content", "structure"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setEditorActiveTab(tab)} className={`py-3 capitalize tracking-wide transition-all border-b-2 font-black ${editorActiveTab === tab ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>{tab}</button>
              ))}
            </div>

            <div className="md:hidden flex items-center py-1.5">
              {(activeRole === "admin" || activeRole === "member") && (
                <button 
                  type="button" 
                  disabled={isSaveDisabled} 
                  className={`px-3 py-1.5 rounded-md font-black text-[9px] uppercase tracking-wider transition-all shadow-sm flex items-center ${isSaveDisabled ? "bg-surface-container-high text-on-surface-variant border border-outline-variant/30 cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-on-primary"}`} 
                  onClick={handleCommitSongChangesToDB}
                >
                  {isMismatched ? "Error" : (!hasUnsavedChanges ? "Saved" : "Save")}
                </button>
              )}
            </div>
          </div>

          {/* Mobile Quick Action Action Row */}
          {editorActiveTab === "content" && (
            <div className="w-full bg-surface-container p-2 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-none border-t border-outline-variant/30 md:hidden">
              <button type="button" onClick={handleOpenImportModal} className="px-2.5 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-md text-[9px] font-black uppercase tracking-wider text-on-surface shrink-0 shadow-sm flex items-center">
                <span className="material-symbols-outlined text-[14px] mr-1">download</span> Import
              </button>
              <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setChordMode("Off"); setIsAddNotesModeActive(false); } }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border shadow-sm transition-colors flex items-center ${isRealtimePreviewActive ? 'bg-primary border-primary/50 text-on-primary' : 'bg-surface-container-low border-outline-variant/30 text-on-surface'}`}>
                <span className="material-symbols-outlined text-[14px] mr-1">{isRealtimePreviewActive ? 'visibility_off' : 'visibility'}</span> 
                {isRealtimePreviewActive ? "Hide Live" : "Preview"}
              </button>
              <button type="button" disabled={!isRealtimePreviewActive} onClick={cycleChordMode} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 flex items-center ${chordMode !== "Off" ? 'bg-secondary border-secondary/50 text-on-secondary shadow-sm' : 'bg-surface-container-low border-outline-variant/30 text-on-surface'}`}>
                <span className="material-symbols-outlined text-[14px] mr-1">music_note</span>
                {chordMode === "Off" ? "Chords" : `Mode: ${chordMode}`}
              </button>
              <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setChordMode("Off"); }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 flex items-center ${isAddNotesModeActive ? 'bg-purple-500 border-purple-400/50 text-white shadow-sm' : 'bg-surface-container-low border-outline-variant/30 text-on-surface'}`}>
                <span className="material-symbols-outlined text-[14px] mr-1">edit_note</span> Note Rows
              </button>
            </div>
          )}
        </nav>
      </header>

      {/* FULL-BLEED WORKSPACE CANVAS */}
      <div 
        className={`flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar space-y-3 w-full pb-[64px] ${youtubeVideoId ? 'pb-[80px]' : ''}`} 
        onScroll={handleCanvasScroll}
      >
        {editorActiveTab === "details" && (
          <div className="w-full animate-in fade-in">
            <div className="bg-surface-container-lowest p-4 md:p-6 rounded-xl md:rounded-2xl border border-outline-variant/30 space-y-4 shadow-sm">
              <div className="relative">
                <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest block mb-1">Track Title Signature *</label>
                <input type="text" value={formTitle} onFocus={() => setIsTitleDropdownFocused(true)} onBlur={() => setTimeout(() => setIsTitleDropdownFocused(false), 200)} onChange={e => { setHasUnsavedChanges(true); setFormTitle(e.target.value); }} className="w-full border border-outline-variant/30 focus:border-primary rounded-xl p-2.5 text-xs font-bold text-on-surface bg-surface-container outline-none transition-all" placeholder="e.g. Washed" />
                {isTitleDropdownFocused && filteredTitleSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-high border border-outline-variant/50 rounded-xl max-h-48 overflow-y-auto z-[3000] shadow-xl custom-scrollbar">
                    {filteredTitleSuggestions.map(song => (
                      <button key={song.id} type="button" className="w-full px-3 py-2 text-left block border-b border-outline-variant/30 last:border-0 hover:bg-surface-bright transition-colors" onClick={() => { setHasUnsavedChanges(true); setFormTitle(song.title); if (song.artist && song.artist !== "Unknown Artist") setFormArtist(song.artist); }}>
                        <div className="text-xs font-bold text-on-surface">{song.title}</div>
                        <div className="text-[9px] font-bold text-on-surface-variant">{song.artist}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest block mb-1">BPM Tempo Count</label>
                  <div className="relative flex items-center">
                    <input type="number" value={formTempo} className="w-full border border-outline-variant/30 focus:border-primary rounded-xl p-2.5 text-xs outline-none pr-16 bg-surface-container text-on-surface" onChange={e => { setHasUnsavedChanges(true); setFormTempo(e.target.value); }} />
                    <button type="button" onClick={() => { setTapTimestamps([]); setIsTapBpmModalOpen(true); }} className="absolute right-1.5 px-3 py-1.5 bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm">TAP</button>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest block mb-1">Original Target Key Signature *</label>
                  <button type="button" onClick={() => handleOpenKeySelectionPopup()} className="w-full border border-outline-variant/30 focus:border-primary rounded-xl p-2.5 text-xs font-bold text-on-surface bg-surface-container text-left flex justify-between items-center outline-none">
                    <span>{formKey ? `Key of ${formKey}` : "Select Key"}</span>
                    <span className="text-[10px] text-on-surface-variant">▼</span>
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest block mb-1">Artist / Author Label Signature *</label>
                <input type="text" value={formArtist} onFocus={() => setIsArtistDropdownFocused(true)} onBlur={() => setTimeout(() => setIsArtistDropdownFocused(false), 200)} onChange={e => { setHasUnsavedChanges(true); setFormArtist(e.target.value); }} className="w-full border border-outline-variant/30 focus:border-primary rounded-xl p-2.5 text-xs font-bold text-on-surface bg-surface-container outline-none transition-all" placeholder="e.g. Hillsong Worship" />
                {isArtistDropdownFocused && filteredArtistSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-high border border-outline-variant/50 rounded-xl max-h-36 overflow-y-auto z-[3000] shadow-xl custom-scrollbar">
                    {filteredArtistSuggestions.map(artist => (
                      <button key={artist} type="button" className="w-full px-3 py-2 text-left text-xs font-bold block border-b border-outline-variant/30 last:border-0 hover:bg-surface-bright transition-colors text-on-surface" onClick={() => { setHasUnsavedChanges(true); setFormArtist(artist); }}>{artist}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider block mb-1">Themes / Set Categories</label>
                <div className="w-full border-outline-variant/30 border rounded-xl p-1.5 bg-surface-container flex flex-wrap gap-1.5 items-center shadow-inner">
                  {formThemes.map(tag => <span key={tag} className="px-2.5 py-0.5 bg-surface-container-highest text-on-surface border border-outline-variant/30 rounded-lg text-[10px] font-bold flex items-center gap-1">{tag}<button type="button" className="text-[9px] text-on-surface-variant hover:text-error transition-colors" onClick={() => { setHasUnsavedChanges(true); setFormThemes(prev => prev.filter(t => t !== tag)); }}>✕</button></span>)}
                  <input type="text" value={themeInputSearchValue} onFocus={() => setIsThemeDropdownFocused(true)} onBlur={() => setTimeout(() => setIsThemeDropdownFocused(false), 200)} placeholder="Add themes..." className="flex-1 bg-transparent border-0 outline-none text-xs font-bold p-1 text-on-surface" onChange={e => setThemeInputSearchValue(e.target.value)} />
                </div>
                {isThemeDropdownFocused && filteredThemeCatalogSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-0.5 bg-surface-container-high border border-outline-variant/50 rounded-xl max-h-36 overflow-y-auto z-[3000] shadow-xl">{filteredThemeCatalogSuggestions.map(th => <button key={th} type="button" className="w-full px-3 py-2 text-left text-xs font-bold block border-b border-outline-variant/30 text-on-surface hover:bg-surface-bright" onClick={() => { setHasUnsavedChanges(true); setFormThemes([...formThemes, th]); setThemeInputSearchValue(""); }}>{th}</button>)}</div>
                )}
              </div>
              <div className="pt-4 mt-2 border-t border-outline-variant/30 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center font-black text-xs shrink-0 shadow-inner">
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-on-surface tracking-tight">YouTube Live Sync Engine</h4>
                    <p className="text-[10px] font-bold text-on-surface-variant leading-tight">Lock the stage metronome to an absolute master track.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 shadow-sm transition-all">
                  <div className="pr-4">
                    <span className="text-[11px] font-black text-on-surface uppercase tracking-widest block mb-0.5">Performance Ready</span>
                    <p className="text-[9px] font-bold text-on-surface-variant leading-tight">Toggle this ON to badge this track as Stage-Ready when the offset and chords are perfectly synced.</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => { setHasUnsavedChanges(true); setFormIsYoutubeSyncValidated(!formIsYoutubeSyncValidated); }} 
                    className={`w-12 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner shrink-0 ${formIsYoutubeSyncValidated ? 'bg-emerald-500' : 'bg-surface-container-highest border border-outline-variant/30'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${formIsYoutubeSyncValidated ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest block mb-1">Source URL</label>
                    <input 
                      type="text" 
                      value={formYoutubeUrl} 
                      onChange={e => { setHasUnsavedChanges(true); setFormYoutubeUrl(e.target.value); }} 
                      className={`w-full border focus:border-error rounded-xl p-2.5 text-xs font-bold text-on-surface outline-none transition-all ${formYoutubeUrl && !youtubeVideoId ? 'border-error/50 bg-error/10' : 'border-outline-variant/30 bg-surface-container'}`} 
                      placeholder="https://youtu.be/..." 
                    />
                    {formYoutubeUrl && !youtubeVideoId && <span className="text-[9px] font-bold text-error absolute top-1 right-2">Invalid Link</span>}
                  </div>

                  {youtubeVideoId && (
                    <div className="bg-surface-container-low border border-outline-variant/30 p-3 rounded-xl space-y-3 shadow-inner">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2 pr-1">
                            <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest block">Downbeat Offset (ms)</label>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* 1. Combined Input + Play Offset Button */}
                            <div className="flex items-center bg-surface-container border border-outline-variant/30 rounded-lg overflow-hidden flex-1 max-w-[140px] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all shadow-sm">
                              <input 
                                type="number" 
                                value={formYoutubeSyncOffset} 
                                onChange={e => { setHasUnsavedChanges(true); setFormYoutubeSyncOffset(parseInt(e.target.value) || 0); }} 
                                className="w-full bg-transparent p-2 text-xs font-black text-on-surface text-center outline-none" 
                                title="Offset in milliseconds"
                              />
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.preventDefault();
                                  initAudioContext();
                                  if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
                                    ytPlayerRef.current.seekTo(formYoutubeSyncOffset / 1000, true);
                                    ytPlayerRef.current.playVideo();
                                  }
                                }} 
                                className="h-[32px] px-2.5 bg-primary-container/30 hover:bg-primary text-primary hover:text-on-primary transition-colors flex items-center justify-center border-l border-outline-variant/30 cursor-pointer"
                                title="Play from Offset"
                              >
                                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                              </button>
                            </div>

                            {/* 2. Capture Button */}
                            <button 
                              type="button" 
                              onClick={handleCaptureSyncPoint} 
                              className="w-8 h-8 flex items-center justify-center bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-lg shrink-0 transition-colors border border-outline-variant/30 shadow-sm cursor-pointer"
                              title="Capture Current Time"
                            >
                              <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                            </button>

                            {/* 3. Play from 0:00 */}
                            <button 
                              type="button" 
                              onClick={() => {
                                initAudioContext();
                                if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
                                  ytPlayerRef.current.seekTo(0, true);
                                  ytPlayerRef.current.playVideo();
                                }
                              }} 
                              className="w-8 h-8 flex items-center justify-center bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-lg shrink-0 transition-colors border border-outline-variant/30 shadow-sm cursor-pointer"
                              title="Play from 0:00"
                            >
                              <span className="material-symbols-outlined text-[16px]">skip_previous</span>
                            </button>

                            {/* 4. Metronome Toggle */}
                            <button 
                              type="button" 
                              onClick={() => setIsMetronomeMuted(!isMetronomeMuted)} 
                              className={`w-8 h-8 flex items-center justify-center rounded-lg shrink-0 transition-colors shadow-sm cursor-pointer border ${
                                isMetronomeMuted 
                                  ? 'bg-error/10 text-error border-error/30 hover:bg-error/20' 
                                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
                              }`}
                              title={isMetronomeMuted ? "Unmute Clicks" : "Mute Clicks"}
                            >
                              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                {isMetronomeMuted ? 'volume_off' : 'volume_up'}
                              </span>
                            </button>

                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTENT TAB LAYER PANEL */}
        {editorActiveTab === "content" && (
          <div className="w-full space-y-3 pb-6 animate-in fade-in">
            <div className="space-y-3">
              {formSections.map((sec) => {
                const timingTuple = getCentralizedMetricsTuple(sec.type);
                const linesRaw = sec.content === "" ? [""] : sec.content.split("\n");
                const processedLines = linesRaw.map((line) => {
                  return {
                    rawText: line,
                    cleanText: line.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim()
                  };
                });

                const totalLines = processedLines.length;
                const sectionRepeats = timingTuple.repeats || 0;
                const totalPasses = sectionRepeats + 1; 
                const masterTotalAbsoluteBeats = (timingTuple.measures * 4) + timingTuple.beats;

                const autoSpreadMeasures = totalLines > 0 ? Math.floor(timingTuple.measures / totalLines) : 0;
                const remainderMeasures = totalLines > 0 ? timingTuple.measures % totalLines : 0;
                const autoSpreadBeats = totalLines > 0 ? Math.floor(timingTuple.beats / totalLines) : 0;
                const remainderBeats = totalLines > 0 ? timingTuple.beats % totalLines : 0;

                const currentLinesMetrics = processedLines.map((_, lIdx) => {
                  const explicitOverride = (lineOverrides as any)?.[sec.type]?.[lIdx];
                  if (explicitOverride) return explicitOverride;
                  return {
                    measures: autoSpreadMeasures + (lIdx < remainderMeasures ? 1 : 0),
                    beats: autoSpreadBeats + (lIdx < remainderBeats ? 1 : 0)
                  };
                });

                const totalManualLineMeasures = currentLinesMetrics.reduce((sum, l) => sum + l.measures, 0);
                const totalManualLineBeats = currentLinesMetrics.reduce((sum, l) => sum + l.beats, 0);
                const totalManualAbsoluteBeats = (totalManualLineMeasures * 4) + totalManualLineBeats;
                const isSectionMismatched = totalLines > 0 && totalManualAbsoluteBeats !== masterTotalAbsoluteBeats;

                const handleAdjustLineMetricValue = (lineIdx: number, field: "measures" | "beats", delta: number) => {
                  const currentVal = currentLinesMetrics[lineIdx][field];
                  const proposedVal = Math.max(0, currentVal + delta);
                  if (field === "beats" && proposedVal > 3) return;

                  setHasUnsavedChanges(true);
                  setLineOverrides(prev => {
                    const prevOverrides = prev || {};
                    const sectionMap = { ...(prevOverrides[sec.type] || {}) };
                    processedLines.forEach((_, currentIdx) => {
                      if (sectionMap[currentIdx] === undefined) {
                        sectionMap[currentIdx] = {
                          measures: autoSpreadMeasures + (currentIdx < remainderMeasures ? 1 : 0),
                          beats: autoSpreadBeats + (currentIdx < remainderBeats ? 1 : 0)
                        };
                      } else {
                        sectionMap[currentIdx] = { ...sectionMap[currentIdx] };
                      }
                    });
                    sectionMap[lineIdx] = { ...sectionMap[lineIdx], [field]: proposedVal };
                    return { ...prevOverrides, [sec.type]: sectionMap };
                  });
                };

                return (
                  <div key={sec.id} className={`border rounded-xl p-3.5 space-y-2 relative transition-all shadow-sm ${isRealtimePreviewActive && isSectionMismatched ? "bg-error/10 border-error/30 ring-4 ring-error/5" : "bg-surface-container-low border-outline-variant/30"}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex flex-wrap items-center gap-1.5 w-full justify-between sm:justify-start">
                        
                        <div className="flex items-center gap-2">
                          <button 
                            type="button" 
                            className="px-2.5 py-1 bg-primary-container/20 border border-primary/30 hover:bg-primary-container/40 text-primary font-black text-[10px] rounded-full uppercase tracking-wider block shadow-sm flex items-center gap-1 transition-colors" 
                            onClick={() => {
                              setSectionModalSearch("");
                              setSectionModalSelected(null);
                              setSectionModalConfig({ isOpen: true, mode: "reassign", targetId: sec.id });
                            }}
                          >
                            <span>{sec.type}</span>
                            <span className="text-[8px] opacity-60">▼</span>
                          </button>
                          
                          {isRealtimePreviewActive && (
                            <button
                              type="button"
                              onClick={() => { 
                                setAdjustmentsModalTab("section"); 
                                setSectionAdjustmentsConfig({ isOpen: true, sectionType: sec.type }); 
                              }}
                              className="px-2.5 py-1 border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-black text-[10px] rounded-lg tracking-wider shadow-sm flex items-center lg:hidden transition-all"
                            >
                              <span className="material-symbols-outlined text-[14px] mr-1">tune</span> Adjustments
                            </button>
                          )}

                          {isRealtimePreviewActive && (() => {
                            const hasChords = /\[[^\]]*\]/.test(sec.content);
                            return (
                              <button
                                type="button"
                                disabled={!hasChords}
                                onClick={() => setConfirmClearSectionId(sec.id)}
                                className={`px-2 py-1 border rounded-lg font-black text-[10px] tracking-wider flex items-center transition-all ${
                                  hasChords 
                                    ? 'border-error/30 bg-error/10 text-error hover:bg-error/20 shadow-sm active:scale-95 cursor-pointer' 
                                    : 'border-outline-variant/30 bg-surface-container text-on-surface-variant opacity-60 cursor-not-allowed'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[14px] mr-1">backspace</span>
                                Clear
                              </button>
                            );
                          })()}
                        </div>

                        <div className={`flex-wrap items-center gap-1.5 ${isRealtimePreviewActive ? "hidden lg:flex" : "flex"}`}>
                          <div className="flex items-center gap-1 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-on-surface-variant shadow-inner">
                            <span className="text-[8px] font-black uppercase text-on-surface-variant opacity-60">M:</span>
                            <input type="number" min={0} value={timingTuple.measures} className="w-6 bg-transparent text-center font-black text-on-surface outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "measures", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-on-surface-variant shadow-inner">
                            <span className="text-[8px] font-black uppercase text-on-surface-variant opacity-60">B:</span>
                            <input type="number" min={0} max={3} value={timingTuple.beats} className="w-5 bg-transparent text-center font-black text-on-surface outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "beats", Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0))); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-on-surface-variant shadow-inner">
                            <span className="text-[8px] font-black uppercase text-on-surface-variant opacity-60">R:</span>
                            <input type="number" min={0} value={sectionRepeats} className="w-5 bg-transparent text-center font-black text-on-surface outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "repeats", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-on-surface-variant shadow-inner">
                            <span className="text-[8px] font-black uppercase text-on-surface-variant opacity-60">H:</span>
                            <input type="number" min={0} value={timingTuple.head_m} className="w-5 bg-transparent text-center font-black text-on-surface outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "head_m", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-on-surface-variant shadow-inner">
                            <span className="text-[8px] font-black uppercase text-on-surface-variant opacity-60">T:</span>
                            <input type="number" min={0} value={timingTuple.tail_m} className="w-5 bg-transparent text-center font-black text-on-surface outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "tail_m", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                        </div>

                        {activeRole === "admin" && !isRealtimePreviewActive && (
                          <button type="button" className="w-6 h-6 rounded-lg bg-surface-container hover:bg-error/20 text-on-surface-variant hover:text-error text-xs border border-outline-variant/30 flex items-center justify-center ml-auto sm:ml-2 transition-colors cursor-pointer" onClick={() => { setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); }}>
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isRealtimePreviewActive ? (
                      <div className="border border-dashed border-outline-variant/30 rounded-xl p-4 bg-surface-container/30 space-y-4">
                        {isSectionMismatched && (
                          <div className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg leading-snug">
                            <span className="material-symbols-outlined text-[14px] align-middle mr-1">warning</span> Alignment Warning: Line values sum up to <span className="font-mono">{Math.floor(totalManualAbsoluteBeats / 4)}m + {totalManualAbsoluteBeats % 4}b</span>. Please adjust properties to equal master total <span className="font-mono">{timingTuple.measures}m + {timingTuple.beats}b</span>.
                          </div>
                        )}

                        <div className="space-y-3">
                          {processedLines.map((line, lineIdx) => {
                            const lineMetrics = currentLinesMetrics[lineIdx] || { measures: 4, beats: 0 };
                            const wordsArray = line.rawText.replace(/\{([^\}]+)\}/g, "").match(/(?:\[[^\]]+\]|\S)+/g) || [];

                            const targetWordIdx = wordsArray.length;
                            const isGhostTargeted = (chordMode === "Keyboard" && chordTargetCoordinate?.sectionType === sec.type && chordTargetCoordinate?.lineIdx === lineIdx && chordTargetCoordinate?.wordIdx === targetWordIdx) ||
                                                    (chordMode === "Chords" && chordPickerConfig?.sectionType === sec.type && chordPickerConfig?.lineIdx === lineIdx && chordPickerConfig?.wordIdx === targetWordIdx);

                            return (
                              <div key={lineIdx} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 py-1.5 border-b border-outline-variant/10 last:border-0 group min-h-[44px]">
                                <div className="flex flex-wrap items-end gap-x-1.5 gap-y-2 py-0.5 leading-none flex-1">
                                  
                                  {wordsArray.map((chunk, currentWordIdx) => {
                                    const chordRegex = /\[([^\]]+)\]/g;
                                    const extractedChordsList: string[] = [];
                                    let matchResult;
                                    while ((matchResult = chordRegex.exec(chunk)) !== null) { extractedChordsList.push(matchResult[1]); }
                                    const cleanWordDisplay = chunk.replace(/\[[^\]]+\]/g, "");
                                    
                                    const isTargetedCoordinate = (chordMode === "Keyboard" && chordTargetCoordinate?.sectionType === sec.type && chordTargetCoordinate?.lineIdx === lineIdx && chordTargetCoordinate?.wordIdx === currentWordIdx) ||
                                                                (chordMode === "Chords" && chordPickerConfig?.sectionType === sec.type && chordPickerConfig?.lineIdx === lineIdx && chordPickerConfig?.wordIdx === currentWordIdx);
                                    
                                    const hasNotation = extractedChordsList.length > 0;

                                    return (
                                      <div 
                                        key={currentWordIdx} 
                                        onClick={(e) => { 
                                          if (chordMode === "Keyboard") { 
                                            e.stopPropagation(); 
                                            setChordTargetCoordinate({ sectionType: sec.type, lineIdx, wordIdx: currentWordIdx }); 
                                            setCustomChordInputValue(hasNotation ? extractedChordsList[0] : ""); 
                                          } else if (chordMode === "Chords") {
                                            e.stopPropagation();
                                            setPickerLayoutView("family");
                                            setStagedChordsText(extractedChordsList.join(" "));
                                            setManualExtensionNumber("");
                                            setChordPickerConfig({
                                              isOpen: true,
                                              sectionType: sec.type,
                                              lineIdx,
                                              wordIdx: currentWordIdx,
                                              cleanWord: cleanWordDisplay || "$word"
                                            });
                                          }
                                        }} 
                                        className={`flex flex-col items-start relative select-none rounded-lg px-2 py-0.5 transition-all duration-150 cursor-pointer ${chordMode !== "Off" ? hasNotation ? 'border border-primary/50 bg-primary-container/20 ring-1 ring-primary/20 shadow-sm' : 'border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container hover:border-outline-variant/50' : 'border border-transparent'} ${isTargetedCoordinate ? '!bg-primary !text-on-primary ring-2 ring-primary/30 !scale-105 z-10' : ''}`}
                                      >
                                        {hasNotation && (
                                          <div className="min-h-[1rem] text-[10px] font-mono font-black flex flex-wrap gap-0.5 mb-0.5 leading-none">
                                            {extractedChordsList.map((ch, cIndex) => {
                                              const isMultiSelected = multiSelectedChords.some(m => m.sectionType === sec.type && m.lineIdx === lineIdx && m.wordIdx === currentWordIdx);
                                              return (
                                                <span 
                                                  key={cIndex} 
                                                  onClick={(e) => {
                                                    if (chordMode === "Chords") {
                                                      e.stopPropagation(); 
                                                      setMultiSelectedChords(prev => {
                                                        const exists = prev.find(p => p.sectionType === sec.type && p.lineIdx === lineIdx && p.wordIdx === currentWordIdx);
                                                        const next = exists ? prev.filter(p => p !== exists) : [...prev, { sectionType: sec.type, lineIdx, wordIdx: currentWordIdx }];
                                                        
                                                        if (next.length > 0) {
                                                          if (!chordPickerConfig.isOpen) {
                                                            setPickerLayoutView("family");
                                                            setStagedChordsText(extractedChordsList.join(" "));
                                                            setManualExtensionNumber("");
                                                          }
                                                          setChordPickerConfig(cfg => ({...cfg, isOpen: true, sectionType: sec.type, lineIdx, wordIdx: currentWordIdx, cleanWord: "Multiple" }));
                                                        } else {
                                                          setChordPickerConfig(cfg => ({...cfg, isOpen: false}));
                                                        }
                                                        return next;
                                                      });
                                                    }
                                                  }}
                                                  className={`px-0.5 rounded border font-bold transition-all cursor-pointer ${isMultiSelected ? '!bg-secondary !text-on-secondary !border-secondary shadow-sm scale-110' : isTargetedCoordinate ? 'text-on-primary border-transparent' : 'text-primary bg-primary-container/30 border-primary/30 hover:bg-primary-container/50'}`}
                                                >
                                                  {ch}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                        <div className={`text-[13px] font-sans font-bold leading-tight ${isTargetedCoordinate ? 'text-on-primary' : 'text-on-surface'}`}>
                                          {cleanWordDisplay || " "}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {chordMode !== "Off" && (
                                    <div 
                                      key={`ghost-${targetWordIdx}`}
                                      onClick={(e) => { 
                                        e.stopPropagation();
                                        if (chordMode === "Keyboard") { 
                                          setChordTargetCoordinate({ sectionType: sec.type, lineIdx, wordIdx: targetWordIdx }); 
                                          setCustomChordInputValue(""); 
                                        } else if (chordMode === "Chords") {
                                          setMultiSelectedChords([]);
                                          setPickerLayoutView("family");
                                          setStagedChordsText("");
                                          setManualExtensionNumber("");
                                          setChordPickerConfig({
                                            isOpen: true,
                                            sectionType: sec.type,
                                            lineIdx,
                                            wordIdx: targetWordIdx,
                                            cleanWord: "Empty Slot"
                                          });
                                        }
                                      }}
                                      className={`flex items-center justify-center h-[26px] min-w-[44px] px-2 border-2 border-dashed rounded-lg transition-all duration-150 cursor-pointer ${
                                        isGhostTargeted 
                                          ? 'bg-primary-container/20 border-primary shadow-md scale-105 z-10 opacity-100' 
                                          : 'bg-transparent border-outline-variant/40 opacity-40 hover:opacity-100 hover:border-primary/50 hover:bg-primary-container/10'
                                      }`}
                                    >
                                      <span className={`text-[16px] font-black leading-none pb-0.5 ${isGhostTargeted ? 'text-primary' : 'text-on-surface-variant'}`}>+</span>
                                    </div>
                                  )}

                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <textarea rows={Math.max(4, sec.content.split("\n").length)} value={sec.content} className="w-full border border-outline-variant/30 rounded-xl p-2.5 font-mono text-xs resize-none outline-none focus:border-primary bg-surface-container/50 overflow-hidden text-on-surface transition-colors" onChange={(e) => { setHasUnsavedChanges(true); setFormSections(formSections.map(x => x.type === sec.type ? { ...x, content: e.target.value } : x)); }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {activeRole === "admin" && (
              <button type="button" className="w-full border border-dashed border-outline-variant/50 py-3.5 text-center rounded-2xl text-primary hover:text-primary/80 font-black text-xs uppercase tracking-wider block hover:bg-surface-container-high transition-colors shadow-sm bg-surface-container-low flex items-center justify-center gap-1 cursor-pointer" onClick={() => { setSectionModalSearch(""); setSectionModalSelected(null); setSectionModalConfig({ isOpen: true, mode: "add" }); }}>
                <span className="material-symbols-outlined text-[18px]">add_circle</span> Add New Section Enclosures
              </button>
            )}
          </div>
        )}

        {editorActiveTab === "structure" && (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 animate-in fade-in select-none">
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Active Performance Sequence</h4>
              <div className="space-y-1.5 min-h-[220px] h-fit bg-surface-container p-3 rounded-xl border border-outline-variant/30 shadow-inner">
                {formSections.map((sec, idx) => {
                  const isBeingDragged = draggedStructureIndex === idx;
                  const isHoveredTarget = dragOverStructureIndex === idx;
                  const isSelectedNode = selectedSequenceId === sec.id;

                  return (
                    <div key={sec.id} draggable={activeRole === "admin"} onDragStart={() => setDraggedStructureIndex(idx)} onDragOver={(e) => { e.preventDefault(); if (dragOverStructureIndex !== idx) setDragOverStructureIndex(idx); }} onDragLeave={() => { if (dragOverStructureIndex === idx) setDragOverStructureIndex(null); }} onDragEnd={() => { setDraggedStructureIndex(null); setDragOverStructureIndex(null); }} onDrop={(e) => handleStructureDropOverride(e, idx)} onClick={() => setSelectedSequenceId(isSelectedNode ? null : sec.id)} className={`flex items-center justify-between p-3.5 border rounded-xl transition-all duration-150 ${isBeingDragged ? "opacity-30 bg-surface-container-high border-outline-variant/50 cursor-grabbing" : isHoveredTarget ? "border-primary bg-primary-container/20 scale-[1.01] ring-2 ring-primary/20 shadow-md cursor-pointer" : isSelectedNode ? "border-primary bg-primary-container/30 scale-[1.005] ring-2 ring-primary/30 shadow-md cursor-pointer" : "bg-surface-container-lowest border-outline-variant/30 shadow-sm cursor-grab hover:bg-surface-container-low"}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] text-on-surface-variant font-mono font-bold shrink-0">#{idx + 1}</span>
                        <span className="text-xs font-black uppercase tracking-wider text-on-surface truncate">{sec.type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeRole === "admin" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); if (isSelectedNode) setSelectedSequenceId(null); }} className="text-[10px] font-bold text-on-surface-variant hover:text-error px-1 transition-colors cursor-pointer flex items-center">
                            <span className="material-symbols-outlined text-[14px]">close</span> Remove
                          </button>
                        )}
                        <span className="material-symbols-outlined text-outline text-[16px] select-none">drag_handle</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Add Block Element</h4>
              <div className="grid grid-cols-1 gap-1.5 bg-surface-container p-3 rounded-xl border border-outline-variant/30 shadow-inner h-fit">
                {uniqueContentSectionsList.map(tmpl => (
                  <div key={tmpl.id} className="p-2.5 border border-outline-variant/30 bg-surface-container-lowest hover:bg-primary-container/10 hover:border-primary/50 rounded-xl flex items-center justify-between shadow-sm transition-all group select-none">
                    <span className="text-xs font-black text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] opacity-60 shrink-0 text-on-surface-variant">label</span> 
                      {tmpl.type}
                    </span>
                    <button type="button" onClick={() => handleAddSectionBelow(tmpl)} className="w-6 h-6 rounded-lg bg-surface-container hover:bg-primary border border-outline-variant/30 hover:border-primary text-on-surface-variant group-hover:text-on-primary flex items-center justify-center font-black text-xs transition-colors cursor-pointer">
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div 
        className={`fixed left-0 right-0 z-[100] px-4 md:px-8 transition-all duration-300 ease-out flex justify-center pointer-events-none ${
          hasUnsavedChanges || (editorActiveTab === "content" && chordMode === "Keyboard")
            ? (isScrollingDown ? "bottom-6 opacity-100" : "bottom-[85px] opacity-100") 
            : "-bottom-24 opacity-0"
        }`}
      >
      </div>

      {confirmClearSectionId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center text-xl mx-auto mb-2 shadow-sm border border-error/20">
              <span className="material-symbols-outlined text-[24px]">backspace</span>
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-on-surface tracking-tight">Clear All Chords?</h4>
              <p className="text-[13px] text-on-surface-variant font-medium leading-relaxed">
                Are you sure you want to remove all chords from this section? This action cannot be undone.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setConfirmClearSectionId(null)} className="py-3 bg-surface-container-high hover:bg-surface-bright text-on-surface text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={executeClearChords} className="py-3 bg-error hover:bg-error/90 text-on-error text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">Clear Chords</button>
            </div>
          </div>
        </div>
      )}

      {isConfirmExitModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-on-surface tracking-tight">Unsaved Modifications</h4>
              <p className="text-xs text-on-surface-variant font-medium leading-relaxed">You have active modifications inside your arrangement canvas layers. Discard changes and close workspace?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => { setIsConfirmExitModalOpen(false); setPendingNavigationUrl(null); }} className="py-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Keep Editing</button>
              <button type="button" onClick={() => { 
                  setHasUnsavedChanges(false); 
                  setIsConfirmExitModalOpen(false); 
                  if (pendingNavigationUrl) {
                    router.push(pendingNavigationUrl);
                  } else {
                    router.back(); 
                  }
                }} 
                className="py-2.5 bg-error hover:bg-error/90 text-on-error text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Discard & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="w-12 h-12 bg-secondary-container/30 text-secondary rounded-full flex items-center justify-center text-2xl mb-2 shadow-sm border border-secondary/30">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-on-surface tracking-tight">Duplicate Song Detected</h4>
              <p className="text-[13px] text-on-surface-variant font-medium leading-relaxed">
                <strong className="text-on-surface">"{duplicateWarning.title}"</strong> by <strong className="text-on-surface">{duplicateWarning.artist}</strong> is already in the database.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button type="button" onClick={() => router.push(`/songs/${duplicateWarning.id}/edit`)} className="py-3 bg-primary hover:bg-primary/90 text-on-primary text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer">Open Existing Song</button>
              <button type="button" onClick={() => { setDismissedDuplicateIds(prev => [...prev, duplicateWarning.id]); setDuplicateWarning(null); }} className="py-3 bg-surface-container-high hover:bg-surface-bright text-on-surface text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Ignore & Create Anyway</button>
            </div>
          </div>
        </div>
      )}

      {sectionModalConfig.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[12000] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-200">
          <div className="w-full bg-surface-container-low rounded-t-3xl md:rounded-3xl h-[85vh] md:h-[600px] max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-200 overflow-hidden border border-outline-variant/20">
            <div className="relative flex items-center justify-center p-4 md:p-5 border-b border-outline-variant/30 bg-surface-container shrink-0">
              <button type="button" onClick={() => setSectionModalConfig({ isOpen: false, mode: "add" })} className="absolute right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-bright transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
              <h3 className="text-base font-black text-on-surface tracking-tight">{sectionModalConfig.mode === "add" ? "Add New Sections" : "Reassign Section"}</h3>
            </div>
            <div className="p-4 bg-surface-container shrink-0">
              <input type="text" placeholder="Search for a new section" value={sectionModalSearch} onChange={e => setSectionModalSearch(e.target.value)} className="w-full bg-surface-container-highest rounded-xl py-2.5 px-4 text-[13px] font-bold text-on-surface placeholder:text-on-surface-variant outline-none border border-outline-variant/30 focus:border-primary transition-colors" />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar bg-surface-container-low pt-2">
              {dynamicCatalogOptions.filter(tmpl => tmpl.computedDisplay.toLowerCase().includes(sectionModalSearch.toLowerCase())).map(tmpl => {
                const isSelected = sectionModalSelected === tmpl.computedId;
                return (
                  <button key={tmpl.computedId} type="button" onClick={() => setSectionModalSelected(tmpl.computedId)} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer ${isSelected ? "bg-surface-container ring-2 ring-primary/50 shadow-sm" : "bg-surface-container border border-outline-variant/30 shadow-sm hover:bg-surface-container-high"}`}>
                    <div className="flex items-center gap-3.5">
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-black ${tmpl.color}`}>{tmpl.abbr}</div>
                      <span className="text-[14px] font-bold text-on-surface tracking-tight">{tmpl.computedDisplay}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-[2.5px] flex items-center justify-center ${isSelected ? "border-primary" : "border-outline-variant/40"}`}>{isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}</div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 bg-surface-container border-t border-outline-variant/30 shrink-0 pb-safe">
              <button type="button" disabled={!sectionModalSelected} onClick={handleSectionModalSubmit} className={`w-full py-3.5 rounded-xl text-[14px] font-black tracking-wide transition-colors ${sectionModalSelected ? "bg-primary text-on-primary hover:bg-primary/90 cursor-pointer shadow-md" : "bg-surface-container-highest text-on-surface-variant cursor-not-allowed"}`}>Select</button>
            </div>
          </div>
        </div>
      )}

      {sectionAdjustmentsConfig.isOpen && sectionAdjustmentsConfig.sectionType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[13000] flex items-end justify-center animate-in fade-in duration-200">
          {(() => {
            const sType = sectionAdjustmentsConfig.sectionType!;
            const timingTuple = getCentralizedMetricsTuple(sType);
            
            const sec = formSections.find(s => s.type === sType);
            const processedLines = sec ? sec.content.split("\n").map(l => ({ rawText: l, cleanText: l.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim() })).filter(l => l.cleanText.length > 0) : [];
            const totalLines = processedLines.length;
            
            const autoSpreadMeasures = totalLines > 0 ? Math.floor(timingTuple.measures / totalLines) : 0;
            const remainderMeasures = totalLines > 0 ? timingTuple.measures % totalLines : 0;
            const autoSpreadBeats = totalLines > 0 ? Math.floor(timingTuple.beats / totalLines) : 0;
            const remainderBeats = totalLines > 0 ? timingTuple.beats % totalLines : 0;

            const currentLinesMetrics = processedLines.map((_, lIdx) => {
              const explicitOverride = (lineOverrides as any)?.[sType]?.[lIdx];
              if (explicitOverride) return explicitOverride;
              return {
                measures: autoSpreadMeasures + (lIdx < remainderMeasures ? 1 : 0),
                beats: autoSpreadBeats + (lIdx < remainderBeats ? 1 : 0)
              };
            });

            const handleAdjustLineMetricValueLocal = (lineIdx: number, field: "measures" | "beats", delta: number) => {
              const currentVal = currentLinesMetrics[lineIdx][field];
              const proposedVal = Math.max(0, currentVal + delta);
              if (field === "beats" && proposedVal > 3) return;

              setHasUnsavedChanges(true);
              setLineOverrides(prev => {
                const prevOverrides = prev || {};
                const sectionMap = { ...(prevOverrides[sType] || {}) };
                processedLines.forEach((_, currentIdx) => {
                  if (sectionMap[currentIdx] === undefined) {
                    sectionMap[currentIdx] = {
                      measures: autoSpreadMeasures + (currentIdx < remainderMeasures ? 1 : 0),
                      beats: autoSpreadBeats + (currentIdx < remainderBeats ? 1 : 0)
                    };
                  } else {
                    sectionMap[currentIdx] = { ...sectionMap[currentIdx] };
                  }
                });
                sectionMap[lineIdx] = { ...sectionMap[lineIdx], [field]: proposedVal };
                return { ...prevOverrides, [sType]: sectionMap };
              });
            };

            return (
              <div className="w-full bg-surface-container-low rounded-t-3xl max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-200 overflow-hidden border border-outline-variant/20">
                <div className="relative flex flex-col items-center justify-center pt-4 border-b border-outline-variant/30 bg-surface-container shrink-0">
                  <div className="flex w-full px-4 items-center justify-center mb-4 relative">
                    <button type="button" onClick={() => setSectionAdjustmentsConfig({ isOpen: false, sectionType: null })} className="absolute left-4 w-7 h-7 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-bright font-bold transition-colors cursor-pointer">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                    <h3 className="text-[14px] font-black text-on-surface tracking-tight uppercase">{sType} Adjustments</h3>
                  </div>
                  
                  <div className="flex w-full px-4 gap-6 text-[11px] uppercase tracking-wider font-black select-none">
                    <button type="button" onClick={() => setAdjustmentsModalTab("section")} className={`pb-3 transition-all border-b-[3px] cursor-pointer ${adjustmentsModalTab === "section" ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Section Master</button>
                    <button type="button" onClick={() => setAdjustmentsModalTab("lines")} className={`pb-3 transition-all border-b-[3px] cursor-pointer ${adjustmentsModalTab === "lines" ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>Line Measures</button>
                  </div>
                </div>
                
                <div className="p-4 md:p-5 space-y-3 flex-1 overflow-y-auto max-h-[55vh] custom-scrollbar">
                  {adjustmentsModalTab === "section" ? (
                    <>
                      {[
                        { label: "Total Measures (M)", field: "measures" as const },
                        { label: "Total Beats (B)", field: "beats" as const, max: 3 },
                        { label: "Repeat Block (R)", field: "repeats" as const },
                        { label: "Head Padding (H)", field: "head_m" as const },
                        { label: "Tail Padding (T)", field: "tail_m" as const },
                      ].map(item => (
                        <div key={item.field} className="flex items-center justify-between p-3.5 bg-surface-container border border-outline-variant/30 rounded-2xl shadow-sm">
                          <span className="text-xs font-black text-on-surface">{item.label}</span>
                          <div className="flex items-center bg-surface-container-highest rounded-xl overflow-hidden border border-outline-variant/40 h-9 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                            <button type="button" onClick={() => handleUpdateCentralizedMetrics(sType, item.field, Math.max(0, (timingTuple[item.field] || 0) - 1))} className="w-10 h-full flex items-center justify-center text-on-surface-variant font-bold hover:bg-surface-bright hover:text-primary transition-colors cursor-pointer">－</button>
                            <span className="w-10 text-center font-mono font-black text-on-surface text-xs">{timingTuple[item.field] || 0}</span>
                            <button type="button" onClick={() => handleUpdateCentralizedMetrics(sType, item.field, Math.min(item.max ?? 999, (timingTuple[item.field] || 0) + 1))} className="w-10 h-full flex items-center justify-center text-on-surface-variant font-bold hover:bg-surface-bright hover:text-primary transition-colors cursor-pointer">＋</button>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {processedLines.length > 0 ? processedLines.map((line, lineIdx) => {
                         const lineMetrics = currentLinesMetrics[lineIdx];
                         return (
                            <div key={lineIdx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-surface-container border border-outline-variant/30 rounded-2xl shadow-sm gap-3">
                              <span className="text-[11px] font-bold text-on-surface truncate flex-1 leading-snug">
                                Line {lineIdx + 1}: <span className="font-medium text-on-surface-variant ml-1">{line.cleanText}</span>
                              </span>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                  <div className="flex items-center bg-surface-container-highest rounded-xl overflow-hidden border border-outline-variant/40 h-8 transition-colors">
                                    <div className="px-1.5 text-[9px] font-black text-on-surface-variant opacity-70 bg-surface-container-lowest border-r border-outline-variant/30 flex items-center h-full">M</div>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "measures", -1)} className="w-7 h-full flex items-center justify-center text-on-surface-variant font-bold hover:bg-surface-bright cursor-pointer">－</button>
                                    <span className="w-5 text-center font-mono font-black text-on-surface text-[11px]">{lineMetrics.measures}</span>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "measures", 1)} className="w-7 h-full flex items-center justify-center text-on-surface-variant font-bold hover:bg-surface-bright cursor-pointer">＋</button>
                                  </div>
                                  <div className="flex items-center bg-surface-container-highest rounded-xl overflow-hidden border border-outline-variant/40 h-8 transition-colors">
                                    <div className="px-1.5 text-[9px] font-black text-on-surface-variant opacity-70 bg-surface-container-lowest border-r border-outline-variant/30 flex items-center h-full">B</div>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "beats", -1)} className="w-7 h-full flex items-center justify-center text-on-surface-variant font-bold hover:bg-surface-bright cursor-pointer">－</button>
                                    <span className="w-4 text-center font-mono font-black text-on-surface text-[11px]">{lineMetrics.beats}</span>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "beats", 1)} className="w-7 h-full flex items-center justify-center text-on-surface-variant font-bold hover:bg-surface-bright cursor-pointer">＋</button>
                                  </div>
                              </div>
                            </div>
                         );
                      }) : (
                        <div className="text-center py-8 text-on-surface-variant text-[11px] uppercase tracking-wider font-black">No lines available in this section</div>
                      )}
                    </>
                  )}
                </div>

                <div className="p-4 border-t border-outline-variant/30 bg-surface-container shrink-0 pb-safe">
                  <button type="button" onClick={() => { setSectionAdjustmentsConfig({ isOpen: false, sectionType: null }); }} className="w-full py-3.5 bg-primary text-on-primary hover:bg-primary/90 rounded-xl font-black text-[14px] shadow-md tracking-wide active:scale-[0.98] transition-all cursor-pointer">
                    Apply Adjustments
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {chordPickerConfig.isOpen && chordPickerConfig.sectionType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[14000] flex items-end justify-center animate-in fade-in duration-200">
          <div className="w-full bg-surface-container-low rounded-t-3xl max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-200 overflow-hidden border border-outline-variant/20">
            
            <div className="relative flex items-center justify-center p-4 border-b border-outline-variant/30 bg-surface-container shrink-0">
              <button type="button" onClick={() => { setMultiSelectedChords([]); setChordPickerConfig({ isOpen: false, sectionType: null, lineIdx: -1, wordIdx: -1, cleanWord: "" }); }} className="absolute left-4 w-7 h-7 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-bright transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
              <h3 className="text-[14px] font-black text-on-surface tracking-tight">Assign Notation</h3>
            </div>

            <div className="p-4 bg-surface-container border-b border-outline-variant/30 shrink-0">
              <div className="border border-outline-variant/30 rounded-xl p-3 bg-surface-container-lowest min-h-[56px] flex flex-col justify-center">
                {stagedChordsText ? (
                  <div className="flex flex-wrap gap-1 mb-1 font-mono font-black text-[10px] text-primary">
                    {stagedChordsText.split(/\s+/).filter(Boolean).map((c, i) => {
                      const isSelected = selectedStagedChordIndices.includes(i);
                      return (
                        <span 
                          key={i} 
                          onClick={() => setSelectedStagedChordIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-all border ${isSelected ? 'bg-secondary text-on-secondary border-secondary shadow-sm scale-110' : 'bg-primary-container/30 border-primary/30 hover:bg-primary-container/50'}`}
                        >
                          {c}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono font-bold text-on-surface-variant opacity-50 italic mb-1">[Staging...]</div>
                )}
                <div className="text-xs font-bold text-on-surface">
                  {chordPickerConfig.cleanWord}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 text-xs font-black text-on-surface-variant select-none">
                <span>{pickerLayoutView === "family" ? `Key of ${formKey} Family` : "Manual Key Mode"}</span>
                <button type="button" onClick={() => setPickerLayoutView(pickerLayoutView === "family" ? "manual" : "family")} className="text-primary flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer">
                  <span className="material-symbols-outlined text-[14px]">{pickerLayoutView === "family" ? "keyboard" : "auto_awesome"}</span>
                  <span>{pickerLayoutView === "family" ? "Manual Input" : "Key Family"}</span>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[45vh] bg-surface-container-low custom-scrollbar">
              {pickerLayoutView === "family" ? (
                <div className="grid grid-cols-4 gap-2">
                  {activeScaleDiatonicDeck.map((opt, i) => {
                    const fullLabel = `${opt.root}${opt.suffix}`;
                    return (
                      <button key={i} type="button" onClick={() => handlePickerChordTap(fullLabel)} className="h-12 bg-surface-container hover:bg-surface-container-high active:bg-surface-bright rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border border-outline-variant/30 text-on-surface transition-all cursor-pointer">
                        {fullLabel}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setStagedChordsText(p => p.trim() + "/")} className="h-12 bg-surface-container text-primary rounded-xl font-black text-sm shadow-sm flex items-center justify-center border border-outline-variant/30 cursor-pointer hover:bg-surface-container-high">
                    /
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {["C", "D", "E", "F", "G", "A", "B"].map(letter => (
                      <button key={letter} type="button" onClick={() => handlePickerChordTap(letter)} className="h-11 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border border-outline-variant/30 text-on-surface cursor-pointer">
                        {letter}
                      </button>
                    ))}
                    <button type="button" onClick={() => setStagedChordsText(p => p.trim() + "/")} className="h-11 bg-surface-container hover:bg-surface-container-high text-primary rounded-xl font-black text-sm shadow-sm flex items-center justify-center border border-outline-variant/30 cursor-pointer">
                      /
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {["m", "dim", "#", "b"].map(modifier => (
                      <button key={modifier} type="button" onClick={() => handlePickerModifierTap(modifier)} className="h-11 bg-surface-container-highest hover:bg-surface-bright rounded-xl font-black text-xs shadow-sm flex items-center justify-center border border-outline-variant/20 text-on-surface cursor-pointer">
                        {modifier}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => handlePickerModifierTap("add")} className="h-11 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border border-outline-variant/30 text-on-surface-variant cursor-pointer">add</button>
                    <button type="button" onClick={() => handlePickerModifierTap("sus")} className="h-11 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border border-outline-variant/30 text-on-surface-variant cursor-pointer">sus</button>
                    
                    <div className="bg-surface-container hover:bg-surface-container-high rounded-xl border border-outline-variant/30 shadow-sm flex items-center px-3 h-11 relative cursor-pointer">
                      <select 
                        value={manualExtensionNumber} 
                        onChange={e => {
                          const val = e.target.value;
                          setManualExtensionNumber(val);
                          if (val) handlePickerModifierTap(val);
                        }} 
                        className="w-full bg-transparent text-xs font-bold text-on-surface-variant outline-none appearance-none cursor-pointer"
                      >
                        <option value="">Number</option>
                        {["2","4","5","6","7","9","11","13"].map(n => <option key={n} value={n} className="bg-surface-container text-on-surface">{n}</option>)}
                      </select>
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant absolute right-3 pointer-events-none">arrow_drop_down</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-outline-variant/30 bg-surface-container flex gap-2 shrink-0 pb-safe">
              <button 
                type="button" 
                onClick={() => {
                  if (selectedStagedChordIndices.length > 0) {
                    setStagedChordsText(prev => {
                      const arr = prev.split(/\s+/).filter(Boolean);
                      return arr.filter((_, i) => !selectedStagedChordIndices.includes(i)).join(" ");
                    });
                    setSelectedStagedChordIndices([]);
                  } else {
                    executeChordPickerRemoval();
                  }
                }} 
                className="flex-1 py-3.5 bg-error/10 hover:bg-error/20 text-error font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                {selectedStagedChordIndices.length > 0 ? `Remove Selected (${selectedStagedChordIndices.length})` : "Remove All"}
              </button>
              <button type="button" onClick={executeChordPickerConfirm} className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-on-primary font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer">
                Confirm
              </button>
            </div>

          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200000] flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-xl p-5 w-full max-w-xl border border-outline-variant/30 shadow-2xl space-y-4 text-on-surface">
            
            <div className="flex justify-between items-center">
              <h4 className="text-base font-black">
                {fetchedLyricsOptions ? "Select Lyrics Version" : "Import / Edit Plain Text"}
              </h4>
              
              {!fetchedLyricsOptions && (
                <button 
                  type="button" 
                  onClick={handleSmartLyricsFetch} 
                  disabled={isFetchingLyrics} 
                  className="px-3 py-1.5 text-[10px] font-black text-purple-400 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 rounded-lg shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isFetchingLyrics ? "hourglass_empty" : "auto_awesome"}
                  </span>
                  {isFetchingLyrics ? "Searching..." : "Smart Fetch"}
                </button>
              )}
            </div>

            {fetchedLyricsOptions ? (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-2 animate-in fade-in zoom-in-95 duration-200">
                {fetchedLyricsOptions.map((opt, idx) => (
                  <button 
                    key={idx}
                    type="button"
                    disabled={isScrapingSelection}
                    onClick={() => handleSelectLyricsCard(opt)}
                    className={`w-full text-left p-3.5 border border-outline-variant/30 rounded-xl transition-all group shadow-sm bg-surface-container-lowest flex gap-4 items-center ${
                      isScrapingSelection ? 'opacity-50 cursor-wait' : 'hover:bg-purple-500/10 hover:border-purple-500/30 cursor-pointer'
                    }`}
                  >
                    {opt.thumbnail ? (
                       <img src={opt.thumbnail} alt="cover" className="w-16 h-16 rounded-md object-cover shadow-sm shrink-0 bg-surface-container-highest border border-outline-variant/30" />
                    ) : (
                       <div className="w-16 h-16 rounded-md bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center shrink-0 shadow-sm text-on-surface-variant text-xl">
                         <span className="material-symbols-outlined text-[24px]">music_note</span>
                       </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm ${idx === 0 ? 'text-purple-400 bg-purple-500/20' : 'text-on-surface-variant bg-surface-container-high'}`}>
                        {isScrapingSelection ? "Processing Plain Lyrics..." : opt.type || "Alternative Version"}
                      </span>
                      </div>
                      <h5 className="font-black text-on-surface text-[15px] tracking-tight truncate">{opt.title}</h5>
                      <p className="text-[11px] font-bold text-on-surface-variant truncate">{opt.artist}</p>
                    </div>
                  </button>
                ))}
                
                <button 
                  type="button"
                  onClick={() => setFetchedLyricsOptions(null)}
                  className="w-full py-3.5 bg-surface-container-high text-on-surface font-black text-[11px] uppercase tracking-wider rounded-xl hover:bg-surface-bright transition-colors mt-2 cursor-pointer border border-outline-variant/30"
                >
                  Cancel Selection
                </button>
              </div>
            ) : (
              <>
                <textarea 
                  rows={16} 
                  value={pastedRawLyricsText} 
                  placeholder="Paste plain track text format layout sections (e.g. [Verse 1] lines)..." 
                  className="w-full text-[13px] leading-relaxed p-4 border border-outline-variant/30 bg-surface-container-lowest rounded-xl outline-none focus:border-primary text-on-surface font-mono resize-none transition-all shadow-inner custom-scrollbar" 
                  onChange={e => setPastedRawLyricsText(e.target.value)} 
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button" 
                    className="py-3 bg-surface-container-high text-on-surface hover:bg-surface-bright transition-colors text-xs font-black rounded-lg cursor-pointer border border-outline-variant/30" 
                    onClick={() => {
                      if (pastedRawLyricsText !== initialModalText) {
                        if (!window.confirm("You have unsaved text changes. Discard?")) return;
                      }
                      setIsImportModalOpen(false);
                      setFetchedLyricsOptions(null);
                    }}
                  >
                    Cancel
                  </button>
                  
                  <button 
                    type="button" 
                    disabled={pastedRawLyricsText === initialModalText || !pastedRawLyricsText.trim()}
                    className="py-3 bg-primary text-on-primary hover:bg-primary/90 transition-colors text-xs font-black rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" 
                    onClick={executeRawLyricsImportAction}
                  >
                    {initialModalText.trim() ? "Apply Modifications" : "Parse & Import"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isKeyPopupOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none">
          <form onSubmit={handleSaveModalKeySelection} className="bg-surface-container border border-outline-variant/30 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 text-left">
            <div className="space-y-0.5">
              <h3 className="text-base font-black text-on-surface tracking-tight">Change Key</h3>
              <p className="text-[11px] font-black text-primary">Original {formKey}</p>
            </div>
            <div className="grid grid-cols-7 gap-1 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/30 shadow-inner">
              {BASE_LETTER_ROOTS.map((letter) => {
                const isSelected = modalKeyRoot === letter;
                return <button key={letter} type="button" className={`aspect-square rounded-lg text-center text-xs font-black flex items-center justify-center cursor-pointer ${isSelected ? "bg-primary text-on-primary shadow-sm scale-105" : "bg-surface-container hover:bg-surface-container-high text-on-surface"}`} onClick={() => setModalKeyRoot(letter)}>{letter}</button>;
              })}
            </div>
            <div className="grid grid-cols-2 divide-x divide-outline-variant/30 bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden shadow-inner h-10">
              <button type="button" className={`text-center text-sm font-black flex items-center justify-center h-full cursor-pointer ${modalKeyAccidental === "b" ? "bg-primary-container/30 text-primary" : "text-on-surface-variant hover:bg-surface-container"}`} onClick={() => setModalKeyAccidental(modalKeyAccidental === "b" ? "" : "b")}>♭</button>
              <button type="button" className={`text-center text-xs font-black flex items-center justify-center h-full cursor-pointer ${modalKeyAccidental === "#" ? "bg-primary-container/30 text-primary" : "text-on-surface-variant hover:bg-surface-container"}`} onClick={() => setModalKeyAccidental(modalKeyAccidental === "#" ? "" : "#")}>#</button>
            </div>
            <div className="pt-1">
              <button type="submit" className="w-full py-2.5 bg-primary hover:bg-primary/90 text-on-primary font-black text-xs uppercase tracking-widest rounded-xl shadow-md text-center cursor-pointer">Save Key Change</button>
            </div>
          </form>
        </div>
      )}

      {isTapBpmModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none">
          <div className="bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6 text-center">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-on-surface tracking-tight">Tap Tempo</h3>
              <p className="text-[11px] font-bold text-on-surface-variant">Tap the button to the beat to calculate the exact BPM.</p>
            </div>
            <div onClick={() => setTapTimestamps([])} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 shadow-inner h-28 w-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-surface-container-high transition-colors relative group">
              {tapTimestamps.length === 0 ? (
                <span className="text-on-surface-variant text-sm font-bold italic">Start tapping...</span>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-4 w-full">
                  {Array.from({ length: Math.ceil(Math.min(tapTimestamps.length, 48) / 4) }).map((_, groupIdx) => {
                    const totalTaps = Math.min(tapTimestamps.length, 48);
                    const starsInGroup = Math.min(4, totalTaps - groupIdx * 4);
                    let tapSizeClass = "text-4xl";
                    if (totalTaps > 36) tapSizeClass = "text-xl";
                    else if (totalTaps > 24) tapSizeClass = "text-2xl";
                    else if (totalTaps > 12) tapSizeClass = "text-3xl";
                    return (
                      <div key={groupIdx} className="flex gap-1.5 flex-nowrap shrink-0">
                        {Array.from({ length: starsInGroup }).map((_, starIdx) => <span key={starIdx} className={`text-primary font-black leading-none ${tapSizeClass}`}>*</span>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="text-5xl font-black text-on-surface tracking-tighter">{formTempo || "--"} <span className="text-sm font-bold text-on-surface-variant tracking-normal">BPM</span></div>
            <button type="button" onClick={(e) => { e.preventDefault(); const now = Date.now(); setTapTimestamps(prev => { if (prev.length > 0 && now - prev[prev.length - 1] > 2500) return [now]; const newTaps = [...prev, now]; if (newTaps.length >= 2) { const intervals = []; for (let i = 1; i < newTaps.length; i++) intervals.push(newTaps[i] - newTaps[i - 1]); const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length; setFormTempo(Math.round(60000 / averageInterval).toString()); setHasUnsavedChanges(true); } return newTaps; }); }} className="w-full h-32 bg-primary hover:bg-primary/90 text-on-primary font-black text-3xl rounded-3xl shadow-lg flex items-center justify-center cursor-pointer active:scale-95 transition-transform">TAP</button>
            <button type="button" onClick={() => setIsTapBpmModalOpen(false)} className="w-full py-3.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-black text-[11px] uppercase rounded-xl cursor-pointer border border-outline-variant/30">Confirm & Close</button>
          </div>
        </div>
      )}

      {saveStatus !== "idle" && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300000] flex items-center justify-center p-4 select-none">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes dart-x { 0%, 100% { transform: translateX(0) scale(1); } 2%, 6% { transform: translateX(30px) scale(0.9, 1.1) rotate(5deg); } 8%, 50% { transform: translateX(30px) scale(1) rotate(5deg); } 52%, 56% { transform: translateX(-15px) scale(1.1, 0.9) rotate(-2deg); } 58%, 95% { transform: translateX(-15px) scale(1) rotate(-2deg); } }
            @keyframes morph-squish { 0%, 100% { transform: scale(1) rotate(0deg); } 25% { transform: scale(1.2, 0.8) rotate(10deg); } 50% { transform: scale(0.9, 1.15) rotate(-5deg); } 75% { transform: scale(1.05, 0.95) rotate(15deg); } }
            @keyframes float-spin { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(180deg); } }
            @keyframes pulse-ghost { 0%, 100% { transform: scale(1); opacity: 0.7; } 30% { transform: scale(1.6); opacity: 0.1; } 40% { transform: scale(0.8); opacity: 0.9; } }
            @keyframes blink { 0%, 96%, 100% { transform: scaleY(1); opacity: 1; } 98% { transform: scaleY(0.1); opacity: 0; } }
            .animate-dart-x { animation: dart-x 7s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
            .animate-morph-squish { animation: morph-squish 5s ease-in-out infinite; }
            .animate-float-spin { animation: float-spin 19s ease-in-out infinite; }
            .animate-pulse-ghost { animation: pulse-ghost 7s ease-in-out infinite; }
            .animate-blink { animation: blink 4s infinite; transform-origin: center; }
          `}} />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {saveStatus === "saving" && (
              <>
                <Blob color="#3B82F6" w="100px" hasEyes animClass="animate-dart-x" delay="0s" top="20%" left="30%" />
                <Blob color="#60A5FA" w="60px" hasEyes={false} animClass="animate-float-spin" delay="-2s" bottom="30%" right="25%" />
              </>
            )}
            {saveStatus === "success" && (
              <>
                <Blob color="#10B981" w="110px" hasEyes animClass="animate-morph-squish" delay="0s" top="30%" right="30%" />
                <Blob color="#34D399" w="50px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" bottom="20%" left="20%" />
              </>
            )}
            {saveStatus === "error" && (
              <>
                <Blob color="#EF4444" w="90px" hasEyes animClass="animate-dart-x" delay="0s" bottom="25%" left="25%" />
                <Blob color="#F87171" w="70px" hasEyes={false} animClass="animate-float-spin" delay="-3s" top="20%" right="20%" />
              </>
            )}
          </div>
          <div className="bg-surface-container rounded-[2rem] shadow-2xl border border-outline-variant/30 p-8 max-w-sm w-full relative z-10 text-center animate-in zoom-in-95 duration-200">
            {saveStatus === "saving" && (
              <>
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-6" />
                <h3 className="text-xl font-black tracking-tight text-on-surface">Saving Matrix...</h3>
                <p className="text-[13px] font-bold text-on-surface-variant mt-2">Writing arrangement to secure database.</p>
              </>
            )}
            {saveStatus === "success" && (
              <div>
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 border border-emerald-500/30">
                  <span className="material-symbols-outlined text-[32px]">check</span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-on-surface">Saved Successfully</h3>
                <p className="text-[13px] font-bold text-on-surface-variant mt-2">Your changes have been safely logged.</p>
              </div>
            )}
            {saveStatus === "error" && (
              <div>
                <div className="w-16 h-16 bg-error/20 text-error rounded-full flex items-center justify-center text-3xl mx-auto mb-6 border border-error/30">
                  <span className="material-symbols-outlined text-[32px]">close</span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-on-surface">Save Failed</h3>
                <div className="bg-error/10 border border-error/20 rounded-xl p-3 mt-4 mb-6">
                  <p className="text-[11px] font-bold text-error font-mono break-words">{saveErrorMessage}</p>
                </div>
                <button onClick={() => setSaveStatus("idle")} className="w-full py-3.5 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded-xl font-black text-xs uppercase shadow-md border border-outline-variant/30 cursor-pointer">Close & Try Again</button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {wheelState && (
        <ChordWheelOverlay 
          config={wheelState} 
          deck={activeScaleDiatonicDeck} 
          onSelect={handleWheelSelect} 
          onCancel={() => { setWheelState(null); justClosedWheelRef.current = Date.now(); }} 
        />
      )}
      
      {youtubeVideoId && mounted && (
        <>
          {/* ========================================= */}
          {/* MOBILE COLLAPSED (Portaled to Sidebar)    */}
          {/* ========================================= */}
          {isMobile && !isPlayerExpanded && document.getElementById("media-player-portal-slot") && createPortal(
            <div 
              onClick={() => setIsPlayerExpanded(true)}
              className="flex items-center justify-between w-full h-[64px] px-4 cursor-pointer bg-[#18181A] rounded-t-2xl shadow-lg transition-transform active:scale-[0.99] border-t border-outline-variant/10"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-md bg-surface-container flex items-center justify-center shrink-0 overflow-hidden shadow-sm border border-outline-variant/20">
                  <img src={`https://img.youtube.com/vi/${youtubeVideoId}/default.jpg`} alt="thumbnail" className="w-full h-full object-cover opacity-90" />
                </div>
                <div className="flex flex-col min-w-0 pr-2 pb-0.5">
                  <h2 className="font-extrabold text-[14px] text-white truncate tracking-tight leading-tight">
                    {formTitle || "Unknown Track"}
                  </h2>
                  <span className="text-[11px] font-semibold text-zinc-400 truncate mt-0.5">
                    {formArtist || "Unknown"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button 
                  onClick={(e) => {
                    e.stopPropagation(); 
                    initAudioContext();
                    if (!ytPlayerRef.current || typeof ytPlayerRef.current.playVideo !== 'function') return;
                    if (ytPlaying) ytPlayerRef.current.pauseVideo();
                    else ytPlayerRef.current.playVideo();
                  }}
                  className={`w-10 h-10 flex items-center justify-center shrink-0 transition-transform active:scale-90 ${ytPlaying ? "text-primary" : "text-white"}`}
                >
                  {ytPlaying ? (
                    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-8 h-8 fill-currentColor ml-1"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
              </div>
            </div>,
            document.getElementById("media-player-portal-slot")!
          )}

          {/* ========================================= */}
          {/* MOBILE EXPANDED OR DESKTOP FIXED          */}
          {/* ========================================= */}
          {(!isMobile || isPlayerExpanded) && (
            <div className={`fixed z-[200000] overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] select-none flex flex-col ${
              isMobile 
                ? "inset-0 bg-surface animate-in slide-in-from-bottom-full" 
                : "bottom-6 left-1/2 -translate-x-1/2 w-[400px] bg-[#18181b] rounded-3xl border border-outline-variant/20 shadow-2xl p-5"
            }`}>
               
               {isMobile && (
                 <div className="flex items-center justify-between w-full shrink-0 mb-6 pt-safe px-6 mt-4">
                   <button type="button" onClick={() => setIsPlayerExpanded(false)} className="w-10 h-10 flex items-center justify-center bg-surface-container-high rounded-full hover:bg-surface-bright transition-colors shadow-sm active:scale-95 cursor-pointer border border-outline-variant/30 text-on-surface">
                     <span className="material-symbols-outlined text-[20px]">keyboard_arrow_down</span>
                   </button>
                   <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Now Playing</span>
                   <div className="w-10"></div> 
                 </div>
               )}

               <div className={`flex flex-col items-center justify-center flex-1 ${isMobile ? "px-8" : ""}`}>
                  <div className={`w-full aspect-square rounded-2xl overflow-hidden shadow-2xl mb-8 border border-outline-variant/20 ${isMobile ? "max-w-[320px]" : "max-h-[240px] mb-4"}`}>
                    <img src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`} alt="cover" className="w-full h-full object-cover opacity-90" />
                  </div>
                  
                  <div className="w-full text-center mb-8">
                    <h2 className="font-black text-2xl text-white tracking-tight mb-1 truncate">{formTitle || "Unknown Track"}</h2>
                    <p className="font-bold text-sm text-zinc-400 truncate">{formArtist || "Unknown Artist"}</p>
                  </div>

                  <div className="w-full max-w-sm mb-8">
                    <input 
                      type="range" 
                      min={0} max={ytDuration || 100} step="0.1"
                      value={ytCurrentTime} 
                      onChange={(e) => {
                        const t = parseFloat(e.target.value);
                        setYtCurrentTime(t);
                        if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') ytPlayerRef.current.seekTo(t, true);
                      }}
                      className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all mb-2"
                    />
                    <div className="flex justify-between text-[11px] font-mono font-bold text-zinc-400 pointer-events-none">
                      <span>{formatTime(ytCurrentTime)}</span>
                      <span>-{formatTime(Math.max(0, ytDuration - ytCurrentTime))}</span>
                    </div>
                  </div>

                  <button 
                    type="button"
                    className="w-20 h-20 bg-white text-[#18181b] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.15)] active:scale-95 transition-transform cursor-pointer outline-none mb-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      initAudioContext();
                      if (!ytPlayerRef.current || typeof ytPlayerRef.current.playVideo !== 'function') return;
                      if (ytPlaying) ytPlayerRef.current.pauseVideo();
                      else ytPlayerRef.current.playVideo();
                    }}
                  >
                    {ytPlaying ? (
                      <svg viewBox="0 0 24 24" className="w-10 h-10 fill-currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-10 h-10 fill-currentColor ml-2"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
               </div>
            </div>
          )}
        </>
      )}

      <div 
        key={youtubeVideoId || "empty"} 
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '640px', height: '360px' }}
      >
        <div id="onpraise-persistent-yt"></div>
      </div>
      
    </div>
  );
}