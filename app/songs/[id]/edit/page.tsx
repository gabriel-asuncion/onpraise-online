"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext";
import { getSongChordChart } from "../../../../utils/supabase/actions";
import GlobalLoader from '../../../../components/GlobalLoader';
import { useWebAudioEngine } from "../../../setlists/[id]/live/hooks/useWebAudioEngine";
// 1. UPDATE YOUR IMPORT AT THE TOP OF page.tsx
import { 
  injectChordsIntoGeniusLyrics, 
  injectChordsIntoStanza, 
  extractDonorChordsFromChordPro 
} from "../../utils/chord-injector";




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

const SECTION_BASE_CATALOG = [
  { id: "V", display: "Verse", abbr: "V", color: "text-sky-500 border-sky-300 bg-sky-50" },
  { id: "PC", display: "Pre-Chorus", abbr: "PC", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "C",  display: "Chorus", abbr: "C", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "PoC", display: "Post-Chorus", abbr: "PoC", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "R",  display: "Refrain", abbr: "R", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "B",  display: "Bridge", abbr: "B", color: "text-blue-500 border-blue-300 bg-blue-50" },
  { id: "IN", display: "Intro", abbr: "IN", color: "text-emerald-500 border-emerald-300 bg-emerald-50" },
  { id: "I",  display: "Instrumental", abbr: "I", color: "text-emerald-500 border-emerald-300 bg-emerald-50" },
  { id: "IT", display: "Interlude", Leit: "IT", color: "text-emerald-500 border-emerald-300 bg-emerald-50" },
  { id: "O",  display: "Outro", abbr: "O", color: "text-purple-500 border-purple-300 bg-purple-50" },
  { id: "T",  display: "Tag", abbr: "T", color: "text-amber-500 border-amber-300 bg-amber-50" },
  { id: "AD", display: "Ad Lib", abbr: "AL", color: "text-rose-500 border-rose-300 bg-rose-50" }
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
      <div className="absolute inset-0 bg-zinc-950/20 backdrop-blur-[2px]" />
      
      <div 
        className="absolute shadow-2xl bg-white/90 backdrop-blur-xl"
        style={{
           left: config.x, top: config.y, width: 260, height: 260,
           transform: 'translate(-50%, -50%)', borderRadius: '50%',
           clipPath: clipStyle, boxShadow: '0 30px 60px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.05)'
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
              return <line key={i} x1="0" y1="0" x2={lx} y2={ly} stroke="#000" strokeWidth="2.5" />;
           })}
         </svg>
      </div>

      {deck.map((chord, i) => {
         const pos = getPos(i);
         const isActive = activeIndex === i;
         return (
            <div 
              key={i}
              className={`absolute w-16 h-16 -ml-8 -mt-8 rounded-full flex flex-col items-center justify-center transition-all duration-150 leading-none ${isActive ? 'bg-blue-600 text-white scale-125 shadow-xl font-black' : 'bg-transparent text-zinc-700 font-bold'}`}
              style={{ left: config.x + pos.x, top: config.y + pos.y }}
            >
              <span className={isActive ? 'text-[22px]' : 'text-[18px]'}>{chord.root}</span>
              {chord.suffix && <span className={`text-[10px] mt-0.5 ${isActive ? 'text-blue-100' : 'text-zinc-400'}`}>{chord.suffix}</span>}
            </div>
         );
      })}

      <div 
        className={`absolute w-14 h-14 -ml-7 -mt-7 rounded-full shadow-lg border flex items-center justify-center font-black text-xl transition-all duration-150 ${activeIndex === null ? 'scale-110 bg-white text-zinc-900 border-zinc-200' : 'scale-95 bg-zinc-100 text-zinc-400 border-zinc-200'}`}
        style={{ left: config.x, top: config.y }}
      >
        ✕
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

  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingData, setMappingData] = useState<{
    filledStanzas: { id: string, label: string, text: string }[],
    unfilledStanzas: { id: string, originalIdx: number, text: string, label: string }[],
    allStanzas: string[]
  } | null>(null);
  const [stanzaMappings, setStanzaMappings] = useState<Record<string, string>>({});

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

  const { initAudioContext, playZeroLatencyAudio, fetchAndDecodeAudio } = useWebAudioEngine();
  const lastTickedBeatRef = useRef<number>(-1);

  // Load the click sounds into memory when the edit page opens
  useEffect(() => {
    if (typeof window !== "undefined") {
      fetchAndDecodeAudio(`/sound_files/metronome_blip_1.wav`, `metronome_blip_1`);
      fetchAndDecodeAudio(`/sound_files/metronome_blip_2.wav`, `metronome_blip_2`);
    }
  }, [fetchAndDecodeAudio]);

  const handleCanvasScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;

    // ✅ SURGICAL FIX: 0-pixel tolerance for instant triggering. 
    // Also guarantees it stays visible if you bounce at the absolute top of the page.
    if (currentScrollY <= 0) {
      setIsScrollingDown(false);
    } else if (currentScrollY > lastScrollY.current) {
      setIsScrollingDown(true);
    } else if (currentScrollY < lastScrollY.current) {
      setIsScrollingDown(false);
    }
    
    lastScrollY.current = currentScrollY;
  };


  // ✅ Ensures the nav is locked up the exact millisecond the page mounts
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

  // ============================================================================
  // ✅ SURGICAL ADDITION: Media Player Gesture & State Engine
  // ============================================================================
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [playerDragY, setPlayerDragY] = useState(0);
  const isPlayerDraggingRef = useRef(false);
  const playerDragStartYRef = useRef(0);

  const handlePlayerPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Don't trigger drag if interacting with controls
    if (target.tagName === 'INPUT' || target.closest('button')) return;
    
    isPlayerDraggingRef.current = true;
    playerDragStartYRef.current = e.clientY;
    target.setPointerCapture(e.pointerId);
  };

  const handlePlayerPointerMove = (e: React.PointerEvent) => {
    if (!isPlayerDraggingRef.current) return;
    const deltaY = e.clientY - playerDragStartYRef.current;
    
    // ✅ SURGICAL FIX: Removed drag-up logic for docked state.
    // Expanded: Only allow dragging DOWN (positive delta) to close.
    if (isPlayerExpanded && deltaY > 0) {
      setPlayerDragY(deltaY);
    }
  };
  
  // ✅ The Execution Engine for Manual Mappings
  const executeManualStanzaMapping = () => {
    if (!mappingData) return;
    
    const finalStanzas = [...mappingData.allStanzas];
    
    mappingData.unfilledStanzas.forEach(unf => {
      const donorId = stanzaMappings[unf.id];
      if (donorId && donorId !== "blank") {
        const donorStanza = mappingData.filledStanzas.find(f => f.id === donorId);
        if (donorStanza) {
          // Extract the chords from the chosen filled section, and inject them into the blank one
          const extractedChords = extractDonorChordsFromChordPro(donorStanza.text);
          finalStanzas[unf.originalIdx] = injectChordsIntoStanza(unf.text, extractedChords);
        }
      }
    });

    setPastedRawLyricsText(finalStanzas.join("\n\n"));
    setIsMappingModalOpen(false);
  };

  const handlePlayerPointerUp = (e: React.PointerEvent) => {
    if (!isPlayerDraggingRef.current) return;
    isPlayerDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const deltaY = e.clientY - playerDragStartYRef.current;

    if (!isPlayerExpanded) {
      // ✅ SURGICAL FIX: Only allow standard click detection when docked. No swipe thresholds.
      if (Math.abs(deltaY) < 10) setIsPlayerExpanded(true); 
    } else {
      if (deltaY > 60) setIsPlayerExpanded(false); // Keep swipe down to close
    }

    setPlayerDragY(0); // Reset live transform, let Tailwind take over
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

        // ✅ FIX 1: THE EDIT PAGE METRONOME
        const tempo = parseInt(formTempo) || 0;
        if (tempo > 0 && formYoutubeSyncOffset !== null) {
          const elapsedMs = (currentTime * 1000) - formYoutubeSyncOffset;
          if (elapsedMs >= 0) {
            const msPerBeat = 60000 / tempo;
            const currentBeat = Math.floor(elapsedMs / msPerBeat);
            
            // If we crossed into a new beat boundary, play the click!
            if (currentBeat !== lastTickedBeatRef.current) {
              if (currentBeat > lastTickedBeatRef.current) {
                const isDownbeat = currentBeat % 4 === 0; // 0 is the first beat after offset
                playZeroLatencyAudio(isDownbeat ? 'metronome_blip_1' : 'metronome_blip_2', 1.0);
              }
              lastTickedBeatRef.current = currentBeat;
            }
          } else {
            lastTickedBeatRef.current = -1; // Reset if scrubbing before the downbeat
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
  // ✅ SURGICAL FIX: Declare the ref so the YouTube player logic can use it!
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
  // ✅ NEW: Tracks the loading state while the backend scrapes the clicked song
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
    
    // We send ONLY the title to cast a wide net
    const searchQuery = cleanTitle;

    try {
      // ✅ STEP 1: We tell the API to ONLY perform a search and return an array of hits
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
        // Fallback for your current API until you update it
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

  // ✅ SURGICAL UPDATE: Hardened Pipeline for Open Database Chords
  const handleSelectLyricsCard = async (opt: any) => {
    let baseLyrics = opt.lyrics || "";
    setIsScrapingSelection(true);

    console.log("🚀 [Step 1] Starting Smart Fetch pipeline...");

    try {
      // --- FETCH GENIUS LYRICS ---
      if (!baseLyrics) {
        if (!opt.url) {
          alert("Missing URL to scrape lyrics from.");
          setIsScrapingSelection(false); return;
        }
        
        console.log("🔍 [Step 2] Fetching base lyrics from Genius URL...");
        const res = await fetch(`/api/lyrics?url=${encodeURIComponent(opt.url)}&action=scrape`);
        const data = await res.json();
        
        if (res.ok && data.lyrics) {
          baseLyrics = data.lyrics;
          console.log("✅ [Step 2] Genius lyrics fetched successfully!");
        } else {
          alert(data.error || "Failed to extract Genius lyrics.");
          setIsScrapingSelection(false); return;
        }
      }

      // --- FETCH OPEN DATABASE CHORDS (GitHub Multi-Format) ---
      const searchTitle = formTitle.trim() || opt.title || "";
      const searchArtist = formArtist.trim() || opt.artist || "";
      console.log(`🎸 [Step 3] Querying Open Chord Database for: "${searchTitle}" by "${searchArtist}"`);

      try {
        const chordRes = await fetch(`/api/chords?title=${encodeURIComponent(searchTitle)}&artist=${encodeURIComponent(searchArtist)}`);
        
        // ✅ Graceful 404 Handling: If no chords exist, just use plain lyrics
        if (chordRes.status === 404) {
           console.warn(`⚠️ [Step 3] No open-source chords found. Falling back to plain lyrics.`);
           setPastedRawLyricsText(baseLyrics);
        } 
        // 🚨 Fatal API Error Handling (Token missing, GitHub down, etc.)
        else if (!chordRes.ok) {
           throw new Error(`GitHub Database Error: ${chordRes.status}`);
        } 
        // ✅ Success: We found a match!
        else {
          const chordData = await chordRes.json();

          if (chordData.rawText) {
        console.log("✨ [Step 4] Injection Complete! Scanning for unfilled sections...");
        const injectedChordPro = injectChordsIntoGeniusLyrics(baseLyrics, chordData.rawText);
        
        // --- NEW: THE ORPHAN SCANNER ---
        const stanzas = injectedChordPro.split(/\n\s*\n/).filter(s => s.trim());
        const filled: any[] = [];
        const unfilled: any[] = [];

        stanzas.forEach((stanza, idx) => {
          // Identify the section label (e.g., [Verse 1])
          const labelMatch = stanza.match(/^\[(.*?)\]/);
          const label = labelMatch ? labelMatch[1] : `Section ${idx + 1}`;
          
          // Check if it has injected chords (ignoring the header tag)
          const bodyText = stanza.replace(/^\[.*?\]\n/, '');
          const hasChords = /\[[A-G][#b]?.*?\]/.test(bodyText);

          if (hasChords) filled.push({ id: `f-${idx}`, label, text: stanza });
          else unfilled.push({ id: `u-${idx}`, originalIdx: idx, label, text: stanza });
        });

        // Intercept if there are unfilled sections AND we have donor sections to copy from
        if (unfilled.length > 0 && filled.length > 0) {
          setMappingData({ filledStanzas: filled, unfilledStanzas: unfilled, allStanzas: stanzas });
          setStanzaMappings({}); // Reset selections
          setIsMappingModalOpen(true);
        } else {
          setPastedRawLyricsText(injectedChordPro);
        }
      }
        }
      } catch (chordErr) {
        console.error("🚨 [Step 3] Chord Engine Failed. Falling back to plain lyrics. Reason:", chordErr);
        setPastedRawLyricsText(baseLyrics);
      }

      // Transition the UI to the editor textarea so the user can verify before importing
      console.log("🎉 [Step 5] Pipeline complete. Opening editor view.");
      setFetchedLyricsOptions(null); 
      
    } catch (err) {
      console.error("🚨 [Fatal Pipeline Error]:", err);
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

            // ✅ SURGICAL FIX: Process Ghost Slots
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

          // Ghost slots don't have chords to backspace!
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

      // ✅ SURGICAL FIX: Process Ghost Slots
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

      // ✅ SURGICAL FIX: Process Ghost Slots
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
        
        // ✅ SURGICAL FIX: Serialize line-level (M: x, B: y) metrics into the text
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
    
    // ✅ NEW: Capture line-level overrides during parsing
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
        // ✅ SURGICAL FIX: Detect and strip line-level metrics (M: x, B: y)
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
      
      // ✅ Apply the newly scraped line overrides
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

        // ============================================================================
        // ✅ SURGICAL FIX: Force generate the exact line timings!
        // This stops the Setlist Live Page from falling back to the broken "repeats" math.
        // ============================================================================
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
          line_timings: specificRowOverrides, // ✅ DB now explicitly tells Live exactly what to do
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
    return <GlobalLoader message="LOADING SONGS DETAILS..." />;
  }

  const isAnySectionMismatchedAcrossModal = formSections.some((checkSec) => {
    const checkTuple = getCentralizedMetricsTuple(checkSec.type);
    const checkLines = checkSec.content.split("\n").map(l => l.replace(/\[[^\]]+\]/g, "").trim()).filter(l => l.length > 0);
    if (checkLines.length === 0) return false;
    
    // ✅ SURGICAL FIX: Target beats for ONE pass. Removed head/tail bloat from line calculations.
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
    // ✅ SURGICAL FIX: Restored the permanent 57px clearance for the global navigation
    <div ref={editorContentContainerRef} className="h-screen w-full border-b-[57px] border-[#333333] overflow-hidden bg-[#333333] flex flex-col relative animate-in fade-in duration-200">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* --- UNIFIED SEMANTIC STICKY HEADER --- */}
      <header className="sticky top-0 z-[100] w-full flex-shrink-0 bg-white border-b border-zinc-200 shadow-sm supports-[backdrop-filter]:bg-white/95 supports-[backdrop-filter]:backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 md:px-8 py-3.5 w-full">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleAttemptDismissal} className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold flex items-center justify-center transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h1 className="font-black text-base md:text-lg text-zinc-900 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
              Modify Worship Arrangement
            </h1>
          </div>
          
         {/* Desktop Control Panel */}
          <div className="hidden md:flex items-center gap-2 select-none">
            {editorActiveTab === "content" && (
              <>
                <button type="button" onClick={handleOpenImportModal} className="px-3 py-1.5 text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg block shadow-sm">📥 Import Raw</button>
                <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setChordMode("Off"); setIsAddNotesModeActive(false); } }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-700'}`}> {isRealtimePreviewActive ? "👁️ Hide Preview" : "👁️ Show Preview"} </button>
          
                
                <button type="button" disabled={!isRealtimePreviewActive} onClick={cycleChordMode} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 min-w-[110px] ${chordMode !== "Off" ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white border-zinc-200 text-zinc-700'}`}> 
                  🎸 Chords: {chordMode}
                </button>
                
                <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setChordMode("Off"); }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-700'}`}> 📝 Add Notes </button>
              </>
            )}

            <div className="w-px h-6 bg-zinc-200 mx-1" />
            {(activeRole === "admin" || activeRole === "member") && (
              <button 
                type="button" 
                disabled={isSaveDisabled} 
                className={`px-4 py-1.5 rounded-lg font-black text-[11px] uppercase tracking-wider transition-all ${isSaveDisabled ? "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed opacity-80" : "bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer"}`} 
                onClick={handleCommitSongChangesToDB}
              >
                {isMismatched ? "🔒 Mismatch" : (!hasUnsavedChanges ? "No Changes" : "Save Arrangement")}
              </button>
            )}
          </div>
        </div>

        <nav className="flex flex-col select-none w-full border-t border-zinc-100">
          <div className="px-4 md:px-8 flex justify-between items-center bg-zinc-50/30">
            <div className="flex gap-4 text-xs font-bold">
              {(["details", "content", "structure"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setEditorActiveTab(tab)} className={`py-3 capitalize tracking-wide transition-all border-b-2 font-black ${editorActiveTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>{tab}</button>
              ))}
            </div>

            <div className="md:hidden flex items-center py-1.5">
              {(activeRole === "admin" || activeRole === "member") && (
                <button 
                  type="button" 
                  disabled={isSaveDisabled} 
                  className={`px-3 py-1.5 rounded-md font-black text-[9px] uppercase tracking-wider transition-all shadow-sm ${isSaveDisabled ? "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`} 
                  onClick={handleCommitSongChangesToDB}
                >
                  {isMismatched ? "Error" : (!hasUnsavedChanges ? "Saved" : "Save")}
                </button>
              )}
            </div>
          </div>

          {/* Mobile Quick Action Action Row */}
          {editorActiveTab === "content" && (
            <div className="w-full bg-zinc-50/80 p-2 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-none border-t border-zinc-100 md:hidden">
              <button type="button" onClick={handleOpenImportModal} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-md text-[9px] font-black uppercase tracking-wider text-zinc-700 shrink-0 shadow-sm">📥 Import</button>
              <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setChordMode("Off"); setIsAddNotesModeActive(false); } }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border shadow-sm transition-colors ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white border-zinc-200 text-zinc-700'}`}>👁️ {isRealtimePreviewActive ? "Hide Live" : "Preview"}</button>
              <button type="button" disabled={!isRealtimePreviewActive} onClick={cycleChordMode} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 ${chordMode !== "Off" ? 'bg-amber-500 border-amber-400 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-700'}`}>
                🎸 {chordMode === "Off" ? "Chords" : `Mode: ${chordMode}`}
              </button>
              
              <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setChordMode("Off"); }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-700'}`}>📝 Note Rows</button>
            </div>
          )}
        </nav>
      </header>

      {/* FULL-BLEED WORKSPACE CANVAS */}
      <div 
        // ✅ SURGICAL FIX: Adds 80px of internal padding ONLY when the docked player exists!
        className={`flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar space-y-3 w-full ${youtubeVideoId ? 'pb-[80px]' : ''}`} 
        onScroll={handleCanvasScroll}
      >
        {editorActiveTab === "details" && (
          <div className="w-full animate-in fade-in">
            <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-zinc-200 space-y-4 shadow-sm">
              <div className="relative">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Track Title Signature *</label>
                <input type="text" value={formTitle} onFocus={() => setIsTitleDropdownFocused(true)} onBlur={() => setTimeout(() => setIsTitleDropdownFocused(false), 200)} onChange={e => { setHasUnsavedChanges(true); setFormTitle(e.target.value); }} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none transition-all" placeholder="e.g. Washed" />
                {isTitleDropdownFocused && filteredTitleSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl max-h-48 overflow-y-auto z-[3000] shadow-xl custom-scrollbar">
                    {filteredTitleSuggestions.map(song => (
                      <button key={song.id} type="button" className="w-full px-3 py-2 text-left block border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors" onClick={() => { setHasUnsavedChanges(true); setFormTitle(song.title); if (song.artist && song.artist !== "Unknown Artist") setFormArtist(song.artist); }}>
                        <div className="text-xs font-bold text-zinc-700">{song.title}</div>
                        <div className="text-[9px] font-bold text-zinc-400">{song.artist}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">BPM Tempo Count</label>
                  <div className="relative flex items-center">
                    <input type="number" value={formTempo} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs outline-none pr-16 bg-zinc-50/50" onChange={e => { setHasUnsavedChanges(true); setFormTempo(e.target.value); }} />
                    <button type="button" onClick={() => { setTapTimestamps([]); setIsTapBpmModalOpen(true); }} className="absolute right-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm">TAP</button>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Original Target Key Signature *</label>
                  <button type="button" onClick={() => handleOpenKeySelectionPopup()} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 text-left flex justify-between items-center outline-none">
                    <span>{formKey ? `Key of ${formKey}` : "Select Key"}</span>
                    <span className="text-[10px] text-zinc-400">▼</span>
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Artist / Author Label Signature *</label>
                <input type="text" value={formArtist} onFocus={() => setIsArtistDropdownFocused(true)} onBlur={() => setTimeout(() => setIsArtistDropdownFocused(false), 200)} onChange={e => { setHasUnsavedChanges(true); setFormArtist(e.target.value); }} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none transition-all" placeholder="e.g. Hillsong Worship" />
                {isArtistDropdownFocused && filteredArtistSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl max-h-36 overflow-y-auto z-[3000] shadow-xl custom-scrollbar">
                    {filteredArtistSuggestions.map(artist => (
                      <button key={artist} type="button" className="w-full px-3 py-2 text-left text-xs font-bold block border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors text-zinc-700" onClick={() => { setHasUnsavedChanges(true); setFormArtist(artist); }}>{artist}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-wider block mb-1">Themes / Set Categories</label>
                <div className="w-full border rounded-xl p-1.5 bg-zinc-50/50 flex flex-wrap gap-1.5 items-center shadow-inner">
                  {formThemes.map(tag => <span key={tag} className="px-2.5 py-0.5 bg-zinc-950 text-white rounded-lg text-[10px] font-bold flex items-center gap-1">{tag}<button type="button" className="text-[9px] text-zinc-400" onClick={() => { setHasUnsavedChanges(true); setFormThemes(prev => prev.filter(t => t !== tag)); }}>✕</button></span>)}
                  <input type="text" value={themeInputSearchValue} onFocus={() => setIsThemeDropdownFocused(true)} onBlur={() => setTimeout(() => setIsThemeDropdownFocused(false), 200)} placeholder="Add themes..." className="flex-1 bg-transparent border-0 outline-none text-xs font-bold p-1 text-zinc-800" onChange={e => setThemeInputSearchValue(e.target.value)} />
                </div>
                {isThemeDropdownFocused && filteredThemeCatalogSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border rounded-xl max-h-36 overflow-y-auto z-[3000] shadow-xl">{filteredThemeCatalogSuggestions.map(th => <button key={th} type="button" className="w-full px-3 py-2 text-left text-xs font-bold block border-b" onClick={() => { setHasUnsavedChanges(true); setFormThemes([...formThemes, th]); setThemeInputSearchValue(""); }}>{th}</button>)}</div>
                )}
              </div>
              <div className="pt-4 mt-2 border-t border-zinc-100 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-black text-xs shrink-0 shadow-inner">▶</div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-900 tracking-tight">YouTube Live Sync Engine</h4>
                    <p className="text-[10px] font-bold text-zinc-400 leading-tight">Lock the stage metronome to an absolute master track.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200 shadow-sm transition-all">
                  <div className="pr-4">
                    <span className="text-[11px] font-black text-zinc-800 uppercase tracking-widest block mb-0.5">Performance Ready</span>
                    <p className="text-[9px] font-bold text-zinc-500 leading-tight">Toggle this ON to badge this track as Stage-Ready when the offset and chords are perfectly synced.</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => { setHasUnsavedChanges(true); setFormIsYoutubeSyncValidated(!formIsYoutubeSyncValidated); }} 
                    className={`w-12 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner shrink-0 ${formIsYoutubeSyncValidated ? 'bg-green-500' : 'bg-zinc-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${formIsYoutubeSyncValidated ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Source URL</label>
                    <input 
                      type="text" 
                      value={formYoutubeUrl} 
                      onChange={e => { setHasUnsavedChanges(true); setFormYoutubeUrl(e.target.value); }} 
                      className={`w-full border focus:border-red-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none transition-all ${formYoutubeUrl && !youtubeVideoId ? 'border-red-400 bg-red-50' : 'border-zinc-200'}`} 
                      placeholder="https://youtu.be/..." 
                    />
                    {formYoutubeUrl && !youtubeVideoId && <span className="text-[9px] font-bold text-red-500 absolute top-1 right-2">Invalid Link</span>}
                  </div>

                  {youtubeVideoId && (
                    <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-xl space-y-3 shadow-inner">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1 pr-1">
                            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block">Downbeat Offset (ms)</label>
                          </div>
                          <div className="flex items-center gap-2 max-w-[200px]">
                            <input 
                              type="number" 
                              value={formYoutubeSyncOffset} 
                              onChange={e => { setHasUnsavedChanges(true); setFormYoutubeSyncOffset(parseInt(e.target.value) || 0); }} 
                              className="w-full border border-zinc-200 rounded-lg p-2 text-xs font-black text-zinc-800 text-center outline-none focus:border-red-500" 
                            />
                            <button type="button" onClick={handleCaptureSyncPoint} className="px-3 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-black text-[9px] uppercase tracking-wider rounded-lg shrink-0 transition-colors">Capture</button>
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
                // ✅ SURGICAL FIX #1: Stop deleting empty lines!
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
                  <div key={sec.id} className={`border rounded-xl p-3.5 space-y-2 relative transition-all shadow-sm ${isRealtimePreviewActive && isSectionMismatched ? "bg-amber-50/40 border-amber-300 ring-4 ring-amber-500/5" : "bg-white border-zinc-200"}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex flex-wrap items-center gap-1.5 w-full justify-between sm:justify-start">
                        
                        <div className="flex items-center gap-2">
                          <button 
                            type="button" 
                            className="px-2.5 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 font-black text-[10px] rounded-full uppercase tracking-wider block shadow-sm flex items-center gap-1 transition-colors" 
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
                              className="px-2.5 py-1 border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-black text-[10px] rounded-lg tracking-wider block shadow-sm flex items-center lg:hidden transition-all"
                            >
                              ⚙️ Adjustments
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
                                    ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 shadow-sm active:scale-95 cursor-pointer' 
                                    : 'border-zinc-200 bg-zinc-50 text-zinc-400 opacity-60 cursor-not-allowed'
                                }`}
                              >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                Clear
                              </button>
                            );
                          })()}
                        </div>

                        <div className={`flex-wrap items-center gap-1.5 ${isRealtimePreviewActive ? "hidden lg:flex" : "flex"}`}>
                          <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                            <span className="text-[8px] font-black uppercase text-zinc-400">M:</span>
                            <input type="number" min={0} value={timingTuple.measures} className="w-6 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "measures", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                            <span className="text-[8px] font-black uppercase text-zinc-400">B:</span>
                            <input type="number" min={0} max={3} value={timingTuple.beats} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "beats", Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0))); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                            <span className="text-[8px] font-black uppercase text-zinc-400">R:</span>
                            <input type="number" min={0} value={sectionRepeats} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "repeats", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                            <span className="text-[8px] font-black uppercase text-zinc-400">H:</span>
                            <input type="number" min={0} value={timingTuple.head_m} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "head_m", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                          <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                            <span className="text-[8px] font-black uppercase text-zinc-400">T:</span>
                            <input type="number" min={0} value={timingTuple.tail_m} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "tail_m", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                          </div>
                        </div>

                        {activeRole === "admin" && !isRealtimePreviewActive && (
                          <button type="button" className="w-6 h-6 rounded-lg bg-zinc-50 text-zinc-400 text-xs border flex items-center justify-center ml-auto sm:ml-2" onClick={() => { setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); }}>✕</button>
                        )}
                      </div>
                    </div>

                    {isRealtimePreviewActive ? (
                      <div className="border border-dashed border-zinc-200 rounded-xl p-4 bg-zinc-50/15 space-y-4">
                        {isSectionMismatched && (
                          <div className="text-[10px] font-black text-amber-700 bg-amber-100/70 border border-amber-200 p-2 rounded-lg leading-snug">
                            ⚠️ Alignment Warning: Line values sum up to <span className="font-mono">{Math.floor(totalManualAbsoluteBeats / 4)}m + {totalManualAbsoluteBeats % 4}b</span>. Please adjust properties to equal master total <span className="font-mono">{timingTuple.measures}m + {timingTuple.beats}b</span>.
                          </div>
                        )}

                        {/* ✅ SURGICAL FIX #2: The Active Rendering Loop */}
                        <div className="space-y-3">
                          {processedLines.map((line, lineIdx) => {
                            const lineMetrics = currentLinesMetrics[lineIdx] || { measures: 4, beats: 0 };
                            const wordsArray = line.rawText.replace(/\{([^\}]+)\}/g, "").match(/(?:\[[^\]]+\]|\S)+/g) || [];

                            // ✅ GHOST SLOT TARGETING
                            const targetWordIdx = wordsArray.length;
                            const isGhostTargeted = (chordMode === "Keyboard" && chordTargetCoordinate?.sectionType === sec.type && chordTargetCoordinate?.lineIdx === lineIdx && chordTargetCoordinate?.wordIdx === targetWordIdx) ||
                                                    (chordMode === "Chords" && chordPickerConfig?.sectionType === sec.type && chordPickerConfig?.lineIdx === lineIdx && chordPickerConfig?.wordIdx === targetWordIdx);

                            return (
                              <div key={lineIdx} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 py-1.5 border-b border-zinc-100/40 last:border-0 group min-h-[44px]">
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
                                        className={`flex flex-col items-start relative select-none rounded-lg px-2 py-0.5 transition-all duration-150 cursor-pointer ${chordMode !== "Off" ? hasNotation ? 'border border-blue-500 bg-blue-50/40 ring-1 ring-blue-400/20 shadow-sm' : 'border border-zinc-200 bg-white hover:bg-zinc-100 hover:border-zinc-300' : 'border border-transparent'} ${isTargetedCoordinate ? '!bg-blue-600 !text-white ring-2 ring-blue-500/30 !scale-105 z-10' : ''}`}
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
                                                  className={`px-0.5 rounded border font-bold transition-all cursor-pointer ${isMultiSelected ? '!bg-amber-500 !text-white !border-amber-600 shadow-sm scale-110' : isTargetedCoordinate ? 'text-white border-transparent' : 'text-blue-600 bg-blue-100/50 border-blue-200 hover:bg-blue-200/50'}`}
                                                >
                                                  {ch}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                        <div className={`text-[13px] font-sans font-bold leading-tight ${isTargetedCoordinate ? 'text-white' : 'text-zinc-800'}`}>
                                          {cleanWordDisplay || " "}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* ✅ SURGICAL FIX #3: The UI Ghost Slot inside the live engine! */}
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
                                          ? 'bg-blue-50 border-blue-500 shadow-md scale-105 z-10 opacity-100' 
                                          : 'bg-transparent border-zinc-300 opacity-40 hover:opacity-100 hover:border-blue-400 hover:bg-blue-50/30'
                                      }`}
                                    >
                                      <span className={`text-[16px] font-black leading-none pb-0.5 ${isGhostTargeted ? 'text-blue-600' : 'text-zinc-400'}`}>+</span>
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
                        <textarea rows={Math.max(4, sec.content.split("\n").length)} value={sec.content} className="w-full border rounded-xl p-2.5 font-mono text-xs resize-none outline-none focus:border-zinc-400 bg-zinc-50/20 overflow-hidden" onChange={(e) => { setHasUnsavedChanges(true); setFormSections(formSections.map(x => x.type === sec.type ? { ...x, content: e.target.value } : x)); }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {activeRole === "admin" && (
              <button type="button" className="w-full border border-dashed py-3.5 text-center rounded-2xl text-blue-600 font-black text-xs uppercase tracking-wider block hover:bg-zinc-50 transition-colors shadow-sm bg-white" onClick={() => { setSectionModalSearch(""); setSectionModalSelected(null); setSectionModalConfig({ isOpen: true, mode: "add" }); }}>＋ Add New Section Enclosures</button>
            )}
          </div>
        )}

        {editorActiveTab === "structure" && (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 animate-in fade-in select-none">
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Active Performance Sequence</h4>
              <div className="space-y-1.5 min-h-[220px] h-fit bg-zinc-50/40 p-3 rounded-xl border border-zinc-200/60 shadow-inner">
                {formSections.map((sec, idx) => {
                  const isBeingDragged = draggedStructureIndex === idx;
                  const isHoveredTarget = dragOverStructureIndex === idx;
                  const isSelectedNode = selectedSequenceId === sec.id;

                  return (
                    <div key={sec.id} draggable={activeRole === "admin"} onDragStart={() => setDraggedStructureIndex(idx)} onDragOver={(e) => { e.preventDefault(); if (dragOverStructureIndex !== idx) setDragOverStructureIndex(idx); }} onDragLeave={() => { if (dragOverStructureIndex === idx) setDragOverStructureIndex(null); }} onDragEnd={() => { setDraggedStructureIndex(null); setDragOverStructureIndex(null); }} onDrop={(e) => handleStructureDropOverride(e, idx)} onClick={() => setSelectedSequenceId(isSelectedNode ? null : sec.id)} className={`flex items-center justify-between p-3.5 border rounded-xl transition-all duration-150 ${isBeingDragged ? "opacity-30 bg-zinc-150 border-zinc-300 cursor-grabbing" : isHoveredTarget ? "border-blue-500 bg-blue-50/50 scale-[1.01] ring-2 ring-blue-400/20 shadow-md cursor-pointer" : isSelectedNode ? "border-blue-600 bg-blue-50/80 scale-[1.005] ring-2 ring-blue-500/30 shadow-md cursor-pointer" : "bg-white border-zinc-200/80 shadow-sm cursor-grab hover:bg-zinc-50"}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] text-zinc-400 font-mono font-bold shrink-0">#{idx + 1}</span>
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-700 truncate">{sec.type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeRole === "admin" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); if (isSelectedNode) setSelectedSequenceId(null); }} className="text-[10px] font-bold text-zinc-400 hover:text-red-500 px-1 transition-colors cursor-pointer">✕ Remove</button>
                        )}
                        <span className="text-zinc-300 text-sm font-bold select-none">☰</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Add Block Element</h4>
              <div className="grid grid-cols-1 gap-1.5 bg-zinc-50/40 p-3 rounded-xl border border-zinc-200/60 shadow-inner h-fit">
                {uniqueContentSectionsList.map(tmpl => (
                  <div key={tmpl.id} className="p-2.5 border border-zinc-200/80 bg-white hover:bg-blue-50/10 hover:border-blue-300 rounded-xl flex items-center justify-between shadow-sm transition-all group select-none">
                    <span className="text-xs font-black text-zinc-700 uppercase tracking-wider flex items-center gap-1.5"><span className="opacity-60 text-xs shrink-0">🏷️</span> {tmpl.type}</span>
                    <button type="button" onClick={() => handleAddSectionBelow(tmpl)} className="w-6 h-6 rounded-lg bg-zinc-50 hover:bg-blue-600 border border-zinc-200 hover:border-blue-500 text-zinc-400 group-hover:text-white flex items-center justify-center font-black text-xs transition-colors cursor-pointer">＋</button>
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
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl mx-auto mb-2 shadow-sm border border-red-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-zinc-900 tracking-tight">Clear All Chords?</h4>
              <p className="text-[13px] text-zinc-500 font-medium leading-relaxed">
                Are you sure you want to remove all chords from this section? This action cannot be undone.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setConfirmClearSectionId(null)} className="py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Cancel</button>
              <button type="button" onClick={executeClearChords} className="py-3 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">Clear Chords</button>
            </div>
          </div>
        </div>
      )}

      {isConfirmExitModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[20000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-zinc-900 tracking-tight">Unsaved Modifications</h4>
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">You have active modifications inside your arrangement canvas layers. Discard changes and close workspace?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => { setIsConfirmExitModalOpen(false); setPendingNavigationUrl(null); }} className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Keep Editing</button>
              <button type="button" onClick={() => { 
                  setHasUnsavedChanges(false); 
                  setIsConfirmExitModalOpen(false); 
                  if (pendingNavigationUrl) {
                    router.push(pendingNavigationUrl);
                  } else {
                    router.back(); 
                  }
                }} 
                className="py-2.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Discard & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateWarning && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mb-2 shadow-sm border border-amber-200">
              <span className="font-black">!</span>
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-zinc-900 tracking-tight">Duplicate Song Detected</h4>
              <p className="text-[13px] text-zinc-500 font-medium leading-relaxed">
                <strong className="text-zinc-800">"{duplicateWarning.title}"</strong> by <strong className="text-zinc-800">{duplicateWarning.artist}</strong> is already in the database.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <button type="button" onClick={() => router.push(`/songs/${duplicateWarning.id}/edit`)} className="py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer">Open Existing Song</button>
              <button type="button" onClick={() => { setDismissedDuplicateIds(prev => [...prev, duplicateWarning.id]); setDuplicateWarning(null); }} className="py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Ignore & Create Anyway</button>
            </div>
          </div>
        </div>
      )}

      {sectionModalConfig.isOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[12000] flex items-end md:items-center justify-center md:p-4 animate-in fade-in duration-200">
          <div className="w-full bg-[#f2f2f6] md:bg-white rounded-t-3xl md:rounded-3xl h-[85vh] md:h-[600px] max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-200 overflow-hidden">
            <div className="relative flex items-center justify-center p-4 md:p-5 border-b border-zinc-200/60 bg-white shrink-0">
              <button type="button" onClick={() => setSectionModalConfig({ isOpen: false, mode: "add" })} className="absolute right-4 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors">✕</button>
              <h3 className="text-base font-black text-zinc-900 tracking-tight">{sectionModalConfig.mode === "add" ? "Add New Sections" : "Reassign Section"}</h3>
            </div>
            <div className="p-4 bg-[#f2f2f6] md:bg-white shrink-0">
              <input type="text" placeholder="Search for a new section" value={sectionModalSearch} onChange={e => setSectionModalSearch(e.target.value)} className="w-full bg-zinc-200/50 md:bg-zinc-100/80 rounded-xl py-2.5 px-4 text-[13px] font-bold text-zinc-800 placeholder:text-zinc-500 outline-none" />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar bg-[#f2f2f6] md:bg-white">
              {dynamicCatalogOptions.filter(tmpl => tmpl.computedDisplay.toLowerCase().includes(sectionModalSearch.toLowerCase())).map(tmpl => {
                const isSelected = sectionModalSelected === tmpl.computedId;
                return (
                  <button key={tmpl.computedId} type="button" onClick={() => setSectionModalSelected(tmpl.computedId)} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${isSelected ? "bg-white ring-2 ring-blue-500 shadow-sm" : "bg-white border shadow-sm"}`}>
                    <div className="flex items-center gap-3.5">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${tmpl.color}`}>{tmpl.abbr}</div>
                      <span className="text-[14px] font-bold text-zinc-900 tracking-tight">{tmpl.computedDisplay}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-[2.5px] flex items-center justify-center ${isSelected ? "border-blue-500" : "border-zinc-300"}`}>{isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}</div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 bg-[#f2f2f6] md:bg-white border-t shrink-0">
              <button type="button" disabled={!sectionModalSelected} onClick={handleSectionModalSubmit} className={`w-full py-3.5 rounded-xl text-[14px] font-black tracking-wide ${sectionModalSelected ? "bg-zinc-900 text-white" : "bg-zinc-300 text-zinc-500 cursor-not-allowed"}`}>Select</button>
            </div>
          </div>
        </div>
      )}

      {sectionAdjustmentsConfig.isOpen && sectionAdjustmentsConfig.sectionType && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[13000] flex items-end justify-center animate-in fade-in duration-200">
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
              <div className="w-full bg-[#f2f2f6] rounded-t-3xl max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-200 overflow-hidden">
                <div className="relative flex flex-col items-center justify-center pt-4 border-b border-zinc-200/60 bg-white shrink-0">
                  <div className="flex w-full px-4 items-center justify-center mb-4 relative">
                    <button type="button" onClick={() => setSectionAdjustmentsConfig({ isOpen: false, sectionType: null })} className="absolute left-4 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 font-bold transition-colors">✕</button>
                    <h3 className="text-[14px] font-black text-zinc-900 tracking-tight uppercase">{sType} Adjustments</h3>
                  </div>
                  
                  <div className="flex w-full px-4 gap-6 text-[11px] uppercase tracking-wider font-black select-none">
                    <button type="button" onClick={() => setAdjustmentsModalTab("section")} className={`pb-3 transition-all border-b-[3px] ${adjustmentsModalTab === "section" ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>Section Master</button>
                    <button type="button" onClick={() => setAdjustmentsModalTab("lines")} className={`pb-3 transition-all border-b-[3px] ${adjustmentsModalTab === "lines" ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>Line Measures</button>
                  </div>
                </div>
                
                <div className="p-4 md:p-5 space-y-3 flex-1 overflow-y-auto max-h-[55vh]">
                  {adjustmentsModalTab === "section" ? (
                    <>
                      {[
                        { label: "Total Measures (M)", field: "measures" as const },
                        { label: "Total Beats (B)", field: "beats" as const, max: 3 },
                        { label: "Repeat Block (R)", field: "repeats" as const },
                        { label: "Head Padding (H)", field: "head_m" as const },
                        { label: "Tail Padding (T)", field: "tail_m" as const },
                      ].map(item => (
                        <div key={item.field} className="flex items-center justify-between p-3.5 bg-white border border-zinc-200/60 rounded-2xl shadow-sm">
                          <span className="text-xs font-black text-zinc-700">{item.label}</span>
                          <div className="flex items-center bg-zinc-100 rounded-xl overflow-hidden border border-zinc-200 h-9 transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
                            <button type="button" onClick={() => handleUpdateCentralizedMetrics(sType, item.field, Math.max(0, (timingTuple[item.field] || 0) - 1))} className="w-10 h-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200 hover:text-blue-600 transition-colors">－</button>
                            <span className="w-10 text-center font-mono font-black text-zinc-800 text-xs">{timingTuple[item.field] || 0}</span>
                            <button type="button" onClick={() => handleUpdateCentralizedMetrics(sType, item.field, Math.min(item.max ?? 999, (timingTuple[item.field] || 0) + 1))} className="w-10 h-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200 hover:text-blue-600 transition-colors">＋</button>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {processedLines.length > 0 ? processedLines.map((line, lineIdx) => {
                         const lineMetrics = currentLinesMetrics[lineIdx];
                         return (
                            <div key={lineIdx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white border border-zinc-200/60 rounded-2xl shadow-sm gap-3">
                              <span className="text-[11px] font-bold text-zinc-800 truncate flex-1 leading-snug">
                                Line {lineIdx + 1}: <span className="font-medium text-zinc-500 ml-1">{line.cleanText}</span>
                              </span>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                  <div className="flex items-center bg-zinc-100 rounded-xl overflow-hidden border border-zinc-200 h-8 transition-colors">
                                    <div className="px-1.5 text-[9px] font-black text-zinc-400 bg-zinc-200/50 border-r border-zinc-200/60 flex items-center h-full">M</div>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "measures", -1)} className="w-7 h-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200">－</button>
                                    <span className="w-5 text-center font-mono font-black text-zinc-800 text-[11px]">{lineMetrics.measures}</span>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "measures", 1)} className="w-7 h-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200">＋</button>
                                  </div>
                                  <div className="flex items-center bg-zinc-100 rounded-xl overflow-hidden border border-zinc-200 h-8 transition-colors">
                                    <div className="px-1.5 text-[9px] font-black text-zinc-400 bg-zinc-200/50 border-r border-zinc-200/60 flex items-center h-full">B</div>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "beats", -1)} className="w-7 h-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200">－</button>
                                    <span className="w-4 text-center font-mono font-black text-zinc-800 text-[11px]">{lineMetrics.beats}</span>
                                    <button type="button" onClick={() => handleAdjustLineMetricValueLocal(lineIdx, "beats", 1)} className="w-7 h-full flex items-center justify-center text-zinc-500 font-bold hover:bg-zinc-200">＋</button>
                                  </div>
                              </div>
                            </div>
                         );
                      }) : (
                        <div className="text-center py-8 text-zinc-400 text-[11px] uppercase tracking-wider font-black">No lines available in this section</div>
                      )}
                    </>
                  )}
                </div>

                <div className="p-4 border-t border-zinc-200/60 bg-white shrink-0 pb-safe">
                  <button type="button" onClick={() => { setSectionAdjustmentsConfig({ isOpen: false, sectionType: null }); }} className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-black text-[14px] shadow-md tracking-wide active:scale-[0.98] transition-all">
                    Apply Adjustments
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {chordPickerConfig.isOpen && chordPickerConfig.sectionType && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[14000] flex items-end justify-center animate-in fade-in duration-200">
          <div className="w-full bg-[#f2f2f6] rounded-t-3xl max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-200 overflow-hidden">
            
            <div className="relative flex items-center justify-center p-4 border-b bg-white shrink-0">
              <button type="button" onClick={() => { setMultiSelectedChords([]); setChordPickerConfig({ isOpen: false, sectionType: null, lineIdx: -1, wordIdx: -1, cleanWord: "" }); }} className="absolute left-4 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors">✕</button>
              <h3 className="text-[14px] font-black text-zinc-800 tracking-tight">Assign Notation</h3>
            </div>

            <div className="p-4 bg-white border-b shrink-0">
              <div className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/50 min-h-[56px] flex flex-col justify-center">
                {stagedChordsText ? (
                  <div className="flex flex-wrap gap-1 mb-1 font-mono font-black text-[10px] text-blue-600">
                    {stagedChordsText.split(/\s+/).filter(Boolean).map((c, i) => {
                      const isSelected = selectedStagedChordIndices.includes(i);
                      return (
                        <span 
                          key={i} 
                          onClick={() => setSelectedStagedChordIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-all border ${isSelected ? 'bg-amber-500 text-white border-amber-600 shadow-sm scale-110' : 'bg-blue-100/60 border-blue-200 hover:bg-blue-200/60'}`}
                        >
                          {c}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono font-bold text-zinc-300 italic mb-1">[Staging...]</div>
                )}
                <div className="text-xs font-bold text-zinc-800">
                  {chordPickerConfig.cleanWord}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 text-xs font-black text-zinc-500 select-none">
                <span>{pickerLayoutView === "family" ? `Key of ${formKey} Family` : "Manual Key Mode"}</span>
                <button type="button" onClick={() => setPickerLayoutView(pickerLayoutView === "family" ? "manual" : "family")} className="text-blue-600 flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m17 2 4 4-4 4M3 22l4-4-4-4M21 6H9M3 18h12"/></svg>
                  <span>{pickerLayoutView === "family" ? "Manual Input" : "Key Family"}</span>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[45vh] bg-[#f2f2f6]">
              {pickerLayoutView === "family" ? (
                <div className="grid grid-cols-4 gap-2">
                  {activeScaleDiatonicDeck.map((opt, i) => {
                    const fullLabel = `${opt.root}${opt.suffix}`;
                    return (
                      <button key={i} type="button" onClick={() => handlePickerChordTap(fullLabel)} className="h-12 bg-white hover:bg-zinc-50 active:bg-zinc-100 rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border text-zinc-800 transition-all">
                        {fullLabel}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setStagedChordsText(p => p.trim() + "/")} className="h-12 bg-white text-blue-600 rounded-xl font-black text-sm shadow-sm flex items-center justify-center border border-zinc-200">
                    /
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {["C", "D", "E", "F", "G", "A", "B"].map(letter => (
                      <button key={letter} type="button" onClick={() => handlePickerChordTap(letter)} className="h-11 bg-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border text-zinc-800">
                        {letter}
                      </button>
                    ))}
                    <button type="button" onClick={() => setStagedChordsText(p => p.trim() + "/")} className="h-11 bg-white text-blue-600 rounded-xl font-black text-sm shadow-sm flex items-center justify-center border">
                      /
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {["m", "dim", "#", "b"].map(modifier => (
                      <button key={modifier} type="button" onClick={() => handlePickerModifierTap(modifier)} className="h-11 bg-white rounded-xl font-black text-xs shadow-sm flex items-center justify-center border text-zinc-700 bg-zinc-50/50">
                        {modifier}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => handlePickerModifierTap("add")} className="h-11 bg-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border text-zinc-600">add</button>
                    <button type="button" onClick={() => handlePickerModifierTap("sus")} className="h-11 bg-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center border text-zinc-600">sus</button>
                    
                    <div className="bg-white rounded-xl border shadow-sm flex items-center px-3 h-11 relative">
                      <select 
                        value={manualExtensionNumber} 
                        onChange={e => {
                          const val = e.target.value;
                          setManualExtensionNumber(val);
                          if (val) handlePickerModifierTap(val);
                        }} 
                        className="w-full bg-transparent text-xs font-bold text-zinc-700 outline-none appearance-none"
                      >
                        <option value="">Number</option>
                        {["2","4","5","6","7","9","11","13"].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <span className="text-[9px] text-zinc-400 absolute right-3 pointer-events-none">▼</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-white flex gap-2 shrink-0 pb-safe">
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
                className="flex-1 py-3.5 bg-red-100 hover:bg-red-200 text-red-600 font-black text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                {selectedStagedChordIndices.length > 0 ? `Remove Selected (${selectedStagedChordIndices.length})` : "Remove All"}
              </button>
              <button type="button" onClick={executeChordPickerConfirm} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-[0.98]">
                Confirm
              </button>
            </div>

          </div>
        </div>
      )}

      {isMappingModalOpen && mappingData && (
    // Elevated the z-index to 250000 so it completely overrides the Import Modal
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-[250000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg border shadow-2xl space-y-5">
        
        <div>
          <h4 className="text-lg font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <span className="text-amber-500">⚠️</span> Unfilled Sections Detected
          </h4>
          <p className="text-[13px] text-zinc-500 font-medium leading-relaxed mt-1">
            We couldn't find chord matches for <strong className="text-zinc-800">{mappingData.unfilledStanzas.length} sections</strong>. You can force them to copy chords from a different section, or leave them blank for manual editing.
          </p>
        </div>

        <div className="max-h-[45vh] overflow-y-auto space-y-3 custom-scrollbar pr-2">
          {mappingData.unfilledStanzas.map((unf) => (
            <div key={unf.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400 block mb-0.5">Missing Chords</span>
                <span className="text-sm font-bold text-zinc-800 truncate block">{unf.label}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 text-lg">→</span>
                <select 
                  value={stanzaMappings[unf.id] || "blank"}
                  onChange={(e) => setStanzaMappings(prev => ({ ...prev, [unf.id]: e.target.value }))}
                  className="bg-white border border-zinc-300 text-zinc-800 text-xs font-bold rounded-lg p-2 outline-none focus:border-purple-500 shadow-sm cursor-pointer"
                >
                  <option value="blank">Leave Blank</option>
                  <optgroup label="Copy Chords From...">
                    {mappingData.filledStanzas.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
          <button 
            type="button" 
            onClick={() => {
              setPastedRawLyricsText(mappingData.allStanzas.join("\n\n"));
              setIsMappingModalOpen(false);
            }} 
            className="py-3 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors text-xs font-black rounded-lg uppercase tracking-wider"
          >
            Skip & Leave Blank
          </button>
          <button 
            type="button" 
            onClick={executeManualStanzaMapping}
            className="py-3 bg-purple-600 text-white hover:bg-purple-700 transition-colors text-xs font-black rounded-lg shadow-md uppercase tracking-wider"
          >
            Apply & Continue
          </button>
        </div>

      </div>
    </div>
  )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md z-[200000] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-xl border shadow-2xl space-y-4">
            
            <div className="flex justify-between items-center">
              <h4 className="text-base font-black">
                {fetchedLyricsOptions ? "Select Lyrics Version" : "Import / Edit Plain Text"}
              </h4>
              
              {!fetchedLyricsOptions && (
                <button 
                  type="button" 
                  onClick={handleSmartLyricsFetch} 
                  disabled={isFetchingLyrics} 
                  className="px-3 py-1.5 text-[10px] font-black text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-lg shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {isFetchingLyrics ? "⏳ Searching..." : "✨ Smart Fetch"}
                </button>
              )}
            </div>

            {fetchedLyricsOptions ? (
              // ✅ NEW: The Rich Options Selection View
              <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-2 animate-in fade-in zoom-in-95 duration-200">
                {fetchedLyricsOptions.map((opt, idx) => (
                  <button 
                    key={idx}
                    type="button"
                    disabled={isScrapingSelection}
                    // ✅ SURGICAL FIX: Fire the Step 2 Scrape function!
                    onClick={() => handleSelectLyricsCard(opt)}
                    className={`w-full text-left p-3.5 border border-zinc-200 rounded-xl transition-all group shadow-sm bg-zinc-50/50 flex gap-4 items-center ${
                      isScrapingSelection ? 'opacity-50 cursor-wait' : 'hover:bg-purple-50 hover:border-purple-300'
                    }`}
                  >
                    {/* Thumbnail formatting */}
                    {opt.thumbnail ? (
                       <img src={opt.thumbnail} alt="cover" className="w-16 h-16 rounded-md object-cover shadow-sm shrink-0 bg-zinc-200 border border-zinc-200" />
                    ) : (
                       <div className="w-16 h-16 rounded-md bg-zinc-200 border border-zinc-300 flex items-center justify-center shrink-0 shadow-sm text-zinc-400 text-xl">🎵</div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm ${idx === 0 ? 'text-purple-600 bg-purple-100' : 'text-zinc-600 bg-zinc-200'}`}>
                        {isScrapingSelection ? "Matching & Injecting Chords..." : opt.type || "Alternative Version"}
                      </span>
                      </div>
                      <h5 className="font-black text-zinc-900 text-[15px] tracking-tight truncate">{opt.title}</h5>
                      <p className="text-[11px] font-bold text-zinc-500 truncate">{opt.artist}</p>
                    </div>
                  </button>
                ))}
                
                <button 
                  type="button"
                  onClick={() => setFetchedLyricsOptions(null)}
                  className="w-full py-3.5 bg-zinc-100 text-zinc-700 font-black text-[11px] uppercase tracking-wider rounded-xl hover:bg-zinc-200 transition-colors mt-2"
                >
                  Cancel Selection
                </button>
              </div>
            ) : (
              // 🔄 The Original Text Area View
              <>
                <textarea 
                  rows={16} 
                  value={pastedRawLyricsText} 
                  placeholder="Paste plain track text format layout sections (e.g. [Verse 1] lines)..." 
                  className="w-full text-[13px] leading-relaxed p-4 border border-zinc-200 bg-zinc-50/50 rounded-xl outline-none focus:border-blue-500 focus:bg-white font-mono resize-none transition-all shadow-inner" 
                  onChange={e => setPastedRawLyricsText(e.target.value)} 
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button" 
                    className="py-3 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors text-xs font-black rounded-lg" 
                    onClick={() => {
                      if (pastedRawLyricsText !== initialModalText) {
                        if (!window.confirm("You have unsaved text changes. Discard?")) return;
                      }
                      setIsImportModalOpen(false);
                      setFetchedLyricsOptions(null); // Clear options on hard close
                    }}
                  >
                    Cancel
                  </button>
                  
                  <button 
                    type="button" 
                    disabled={pastedRawLyricsText === initialModalText || !pastedRawLyricsText.trim()}
                    className="py-3 bg-blue-600 text-white hover:bg-blue-700 transition-colors text-xs font-black rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed" 
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
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none">
          <form onSubmit={handleSaveModalKeySelection} className="bg-[#f8f9fa] border border-zinc-200 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 text-left">
            <div className="space-y-0.5">
              <h3 className="text-base font-black text-zinc-900 tracking-tight">Change Key</h3>
              <p className="text-[11px] font-black text-blue-500">Original {formKey}</p>
            </div>
            <div className="grid grid-cols-7 gap-1 bg-white p-1 rounded-xl border shadow-inner">
              {BASE_LETTER_ROOTS.map((letter) => {
                const isSelected = modalKeyRoot === letter;
                return <button key={letter} type="button" className={`aspect-square rounded-lg text-center text-xs font-black flex items-center justify-center cursor-pointer ${isSelected ? "bg-blue-600 text-white shadow-sm scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"}`} onClick={() => setModalKeyRoot(letter)}>{letter}</button>;
              })}
            </div>
            <div className="grid grid-cols-2 divide-x bg-white rounded-xl border overflow-hidden shadow-inner h-10">
              <button type="button" className={`text-center text-sm font-black flex items-center justify-center h-full cursor-pointer ${modalKeyAccidental === "b" ? "bg-blue-50/80 text-blue-600" : "text-zinc-600 hover:bg-zinc-50/50"}`} onClick={() => setModalKeyAccidental(modalKeyAccidental === "b" ? "" : "b")}>♭</button>
              <button type="button" className={`text-center text-xs font-black flex items-center justify-center h-full cursor-pointer ${modalKeyAccidental === "#" ? "bg-blue-50/80 text-blue-600" : "text-zinc-600 hover:bg-zinc-50/50"}`} onClick={() => setModalKeyAccidental(modalKeyAccidental === "#" ? "" : "#")}>#</button>
            </div>
            <div className="pt-1">
              <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md text-center">Save Key Change</button>
            </div>
          </form>
        </div>
      )}

      {isTapBpmModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none">
          <div className="bg-[#f8f9fa] border border-zinc-200 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6 text-center">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-zinc-900 tracking-tight">Tap Tempo</h3>
              <p className="text-[11px] font-bold text-zinc-500">Tap the button to the beat to calculate the exact BPM.</p>
            </div>
            <div onClick={() => setTapTimestamps([])} className="bg-white border rounded-xl p-4 shadow-inner h-28 w-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-zinc-50 transition-colors relative group">
              {tapTimestamps.length === 0 ? (
                <span className="text-zinc-400 text-sm font-bold italic">Start tapping...</span>
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
                        {Array.from({ length: starsInGroup }).map((_, starIdx) => <span key={starIdx} className={`text-blue-600 font-black leading-none ${tapSizeClass}`}>*</span>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="text-5xl font-black text-zinc-900 tracking-tighter">{formTempo || "--"} <span className="text-sm font-bold text-zinc-400 tracking-normal">BPM</span></div>
            <button type="button" onClick={(e) => { e.preventDefault(); const now = Date.now(); setTapTimestamps(prev => { if (prev.length > 0 && now - prev[prev.length - 1] > 2500) return [now]; const newTaps = [...prev, now]; if (newTaps.length >= 2) { const intervals = []; for (let i = 1; i < newTaps.length; i++) intervals.push(newTaps[i] - newTaps[i - 1]); const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length; setFormTempo(Math.round(60000 / averageInterval).toString()); setHasUnsavedChanges(true); } return newTaps; }); }} className="w-full h-32 bg-blue-600 text-white font-black text-3xl rounded-3xl shadow-lg flex items-center justify-center">TAP</button>
            <button type="button" onClick={() => setIsTapBpmModalOpen(false)} className="w-full py-3.5 bg-zinc-200 text-zinc-700 font-black text-[11px] uppercase rounded-xl">Confirm & Close</button>
          </div>
        </div>
      )}

      {saveStatus !== "idle" && (
        <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-[300000] flex items-center justify-center p-4 select-none">
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
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full relative z-10 text-center animate-in zoom-in-95 duration-200">
            {saveStatus === "saving" && (
              <>
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-6" />
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Saving Matrix...</h3>
                <p className="text-[13px] font-bold text-zinc-500 mt-2">Writing arrangement to secure database.</p>
              </>
            )}
            {saveStatus === "success" && (
              <div>
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">✓</div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Saved Successfully</h3>
                <p className="text-[13px] font-bold text-zinc-500 mt-2">Your changes have been safely logged.</p>
              </div>
            )}
            {saveStatus === "error" && (
              <div>
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">✕</div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Save Failed</h3>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-4 mb-6">
                  <p className="text-[11px] font-bold text-red-600 font-mono break-words">{saveErrorMessage}</p>
                </div>
                <button onClick={() => setSaveStatus("idle")} className="w-full py-3.5 bg-zinc-900 text-white rounded-xl font-black text-xs uppercase shadow-md">Close & Try Again</button>
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
      
      {youtubeVideoId && (
        <div 
          onPointerDown={handlePlayerPointerDown}
          onPointerMove={handlePlayerPointerMove}
          onPointerUp={handlePlayerPointerUp}
          onPointerCancel={handlePlayerPointerUp}
          className={`fixed left-0 right-0 md:mx-auto md:w-[500px] z-[150000] overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] select-none ${
            chordMode !== "Off" || chordPickerConfig.isOpen ? 'opacity-0 pointer-events-none' : ''
          }`}
          style={{
            zIndex: isPlayerExpanded ? 150000 : 45, // ✅ FIX 3: Drops safely below the Global FAB (z-50) when docked
            transform: playerDragY !== 0 
              ? `translateY(${playerDragY}px)` 
              : (!isPlayerExpanded && isScrollingDown ? 'translateY(63px)' : 'translateY(0px)'),
            height: isPlayerExpanded ? '100dvh' : '54px',
            bottom: isPlayerExpanded ? '0px' : '63px',
            backgroundColor: isPlayerExpanded ? '#0f0f0f' : '#18181b', // ✅ Matches your dark screenshot
            color: '#ffffff',
            borderTop: isPlayerExpanded ? '1px solid transparent' : '1px solid #3f3f46',
            borderRadius: isPlayerExpanded ? '0px' : '0.75rem',
            boxShadow: isPlayerExpanded ? 'none' : '0 -4px 20px rgba(0,0,0,0.5)'
          }}
        >
          {/* DOCKED CLICK CATCHER (Expands the player) */}
          {!isPlayerExpanded && (
            <div className="absolute inset-0 z-0 cursor-pointer" onClick={() => setIsPlayerExpanded(true)} />
          )}

          {/* DOCKED BACKGROUND PROGRESS BAR */}
          <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-200/50 transition-opacity duration-300 pointer-events-none ${isPlayerExpanded ? 'opacity-0' : 'opacity-100'}`}>
            <div className="h-full bg-zinc-900 transition-all duration-200 ease-linear" style={{ width: `${ytDuration ? (ytCurrentTime / ytDuration) * 100 : 0}%` }} />
          </div>

          {/* TOP BAR (Fullscreen Only) */}
          <div className={`absolute top-0 left-0 right-0 flex justify-between items-center px-6 pt-safe mt-4 transition-all duration-500 z-10 ${isPlayerExpanded ? 'opacity-100 translate-y-0 delay-100' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsPlayerExpanded(false); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Now Playing</span>
            <div className="w-11"></div> 
          </div>

          {/* MORPHING THUMBNAIL */}
          <div 
            className="absolute z-10 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] bg-zinc-800 pointer-events-none"
            style={{
               bottom: isPlayerExpanded ? 'calc(25dvh + 130px)' : '8px',
               left: isPlayerExpanded ? '50%' : '12px',
               width: isPlayerExpanded ? 'calc(100vw - 48px)' : '38px',
               maxWidth: isPlayerExpanded ? '384px' : '38px',
               height: isPlayerExpanded ? 'calc(100vw - 48px)' : '38px',
               maxHeight: isPlayerExpanded ? '384px' : '38px',
               transform: isPlayerExpanded ? 'translateX(-50%)' : 'translateX(0)',
               borderRadius: isPlayerExpanded ? '12px' : '4px',
               boxShadow: isPlayerExpanded ? '0 20px 40px rgba(0,0,0,0.4)' : 'none'
            }}
          >
            <img src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`} alt="cover" className="w-full h-full object-cover opacity-90" />
          </div>

          {/* MORPHING TEXT */}
          <div 
            className="absolute z-10 flex flex-col justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] pointer-events-none"
            style={{
               bottom: isPlayerExpanded ? 'calc(25dvh + 50px)' : '8px',
               left: isPlayerExpanded ? '50%' : '62px',
               width: isPlayerExpanded ? 'calc(100vw - 48px)' : 'calc(100% - 120px)',
               maxWidth: isPlayerExpanded ? '384px' : 'none',
               height: isPlayerExpanded ? '60px' : '38px',
               transform: isPlayerExpanded ? 'translateX(-50%)' : 'translateX(0)',
               textAlign: isPlayerExpanded ? 'center' : 'left'
            }}
          >
            <h2 className={`font-black truncate transition-colors duration-500 ${isPlayerExpanded ? 'text-2xl text-white tracking-tight mb-1' : 'text-[13px] text-zinc-900 leading-tight'}`}>
              {formTitle || "Unknown Track"}
            </h2>
            <p className={`font-bold truncate transition-colors duration-500 ${isPlayerExpanded ? 'text-sm text-zinc-400' : 'text-[11px] text-zinc-500 leading-tight'}`}>
              {formArtist || "Unknown Artist"}
            </p>
          </div>

          {/* FULLSCREEN SCRUBBER (Fade in/out) */}
          <div 
            className={`absolute left-[10%] w-[80%] max-w-sm mx-auto transition-all duration-500 z-20 ${isPlayerExpanded ? 'bottom-[20dvh] opacity-100' : 'bottom-[10dvh] opacity-0 pointer-events-none'}`}
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
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

          {/* MORPHING PLAY BUTTON */}
          <button 
            type="button"
            className="absolute z-30 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer outline-none"
            style={{
               bottom: isPlayerExpanded ? '8dvh' : '7px',
               // ✅ FIX 2: Locks strictly to the right side so it can't overflow out of bounds
               right: isPlayerExpanded ? 'auto' : '8px',
               left: isPlayerExpanded ? '50%' : 'auto',
               transform: isPlayerExpanded ? 'translateX(-50%)' : 'none',
               width: isPlayerExpanded ? '84px' : '40px',
               height: isPlayerExpanded ? '84px' : '40px',
               backgroundColor: isPlayerExpanded ? '#ffffff' : 'transparent',
               color: isPlayerExpanded ? '#18181b' : '#ffffff', // ✅ Forces icon to be white when docked
               borderRadius: '9999px',
               boxShadow: isPlayerExpanded ? '0 0 40px rgba(255,255,255,0.15)' : 'none'
            }}
            onClick={(e) => {
              e.stopPropagation();
              initAudioContext();
              if (!ytPlayerRef.current || typeof ytPlayerRef.current.playVideo !== 'function') return;
              if (ytPlaying) ytPlayerRef.current.pauseVideo();
              else ytPlayerRef.current.playVideo();
            }}
          >
            {ytPlaying ? (
              <svg className={`transition-all duration-500 ${isPlayerExpanded ? 'w-[34px] h-[34px]' : 'w-[22px] h-[22px]'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
            ) : (
              <svg className={`transition-all duration-500 ${isPlayerExpanded ? 'w-[34px] h-[34px] ml-2' : 'w-[22px] h-[22px] ml-1'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
            )}
          </button>

        </div>
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