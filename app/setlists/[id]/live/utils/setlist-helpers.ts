// utils/setlist-helpers.ts

export const normalizeSectionNameToAudioFile = (rawSectionName: string): string | null => {
  if (!rawSectionName) return null;
  let cleanName = rawSectionName.trim();
  const lowerName = cleanName.toLowerCase();
  
  if (lowerName.includes("pre")) return "Pre Chorus";
  if (lowerName.includes("post")) return "Post Chorus";
  if (lowerName.includes("chorus")) return "Chorus";
  if (lowerName.includes("bridge")) return "Bridge";
  if (lowerName.includes("intro")) return "Intro";
  if (lowerName.includes("outro")) return "Outro";
  if (lowerName.includes("refrain")) return "Refrain";
  if (lowerName.includes("tag")) return "Tag";
  if (lowerName.includes("ad lib")) return "Ad Lib";
  if (lowerName.includes("interlude")) return "Interlude";
  if (lowerName.includes("instrumental") || lowerName.includes("inst")) return "Instrumental";
  
  const verseMatch = lowerName.match(/verse\s*(\d+)/);
  if (verseMatch) return `Verse ${verseMatch[1]}`;
  
  return null; 
};

export const getSectionAbbreviation = (name: string): string => {
  if (!name) return "";
  const lower = name.toLowerCase();
  
  if (lower.includes('verse')) {
    const match = lower.match(/\d+/);
    return match ? `V${match[0]}` : 'V';
  }
  if (lower.includes('pre')) return 'Pr';
  if (lower.includes('post')) return 'Po';
  if (lower.includes('chorus')) {
    const match = lower.match(/\d+/);
    return match ? `C${match[0]}` : 'C';
  }
  if (lower.includes('bridge')) return 'Br';
  if (lower.includes('intro')) return 'In';
  if (lower.includes('outro')) return 'Ou';
  if (lower.includes('tag')) return 'Tg'; 
  if (lower.includes('inst')) return 'In';
  if (lower.includes('ad lib')) return 'AL';
  
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
};

export const getSectionColorClass = (name: string): string => {
  if (!name) return 'border-zinc-300 text-zinc-500';
  const lower = name.toLowerCase();
  if (lower.includes('verse')) return 'border-[#71cbf4] text-[#4db3df] bg-[#eefaff]';
  if (lower.includes('chorus')) return 'border-[#fcbca0] text-[#ea9772] bg-[#fff5f0]';
  if (lower.includes('pre')) return 'border-[#fbd277] text-[#e0a82e] bg-[#fffbf0]';
  if (lower.includes('bridge')) return 'border-[#d0a7f1] text-[#aa73d7] bg-[#fbf5ff]';
  if (lower.includes('intro') || lower.includes('outro')) return 'border-[#a7f1d0] text-[#69c79e] bg-[#f0fdf6]';
  return 'border-zinc-300 text-zinc-500 bg-zinc-50';
};

export type SongContentType = "Chords + Lyrics" | "Chords" | "Lyrics" | "Empty";

export const getSongContentType = (chordproContent?: string | null): SongContentType => {
  // If the database column is literally empty/null, fail gracefully
  if (!chordproContent || typeof chordproContent !== "string" || !chordproContent.trim()) {
    return "Empty";
  }

  // Split into an array of lines (handles both \n and \r\n safely)
  const lines = chordproContent.split(/\r?\n/);
  
  let hasChords = false;
  let hasLyrics = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Skip Section Headers (e.g., "[Verse 1]" or "[Chorus] (M: 4, B: 0)")
    // This perfectly ignores the whole line if it's just a header.
    if (/^\[[^\]]+\](?:\s*\([^)]+\))?$/.test(trimmed)) {
      continue;
    }

    // 2. Check for inline chords (any remaining brackets on a content line)
    if (/\[[^\]]+\]/.test(trimmed)) {
      hasChords = true;
    }

    // 3. Check for actual lyric text
    // Strip out the chords, comments, and all punctuation to see if letters/numbers remain.
    // \u00C0-\u024F ensures foreign/accented characters aren't accidentally erased.
    const plainText = trimmed
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "");

    if (plainText.length > 0) {
      hasLyrics = true;
    }
  }

  // Calculate the final matrix state
  if (hasChords && hasLyrics) return "Chords + Lyrics";
  if (hasChords && !hasLyrics) return "Chords";
  if (!hasChords && hasLyrics) return "Lyrics";
  
  return "Empty";
};