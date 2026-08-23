export interface DonorAnchor {
  chord: string;
  anchorWord: string;
}

// ============================================================================
// 🛠️ HELPER FUNCTIONS
// ============================================================================

const isSlightMatch = (wordA: string, wordB: string): boolean => {
  const cleanA = wordA.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = wordB.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB || cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA);
};

export const extractDonorChordsFromChordPro = (choText: string): DonorAnchor[] => {
  const anchors: DonorAnchor[] = [];
  if (!choText) return anchors;

  let cleanText = choText.replace(/<[^>]+>/g, ' ').replace(/\{[^}]+\}/g, '');
  const tokens = cleanText.split(/\s+/);

  tokens.forEach((token) => {
    const chordMatches = [...token.matchAll(/\[([^\]]+)\]/g)];
    if (chordMatches.length > 0) {
      const cleanWord = token.replace(/\[[^\]]+\]/g, '').replace(/[^a-zA-Z0-9]/g, '');
      if (cleanWord.length > 0) {
        anchors.push({ chord: chordMatches[0][1], anchorWord: cleanWord });
      }
    }
  });

  return anchors;
};

// ✅ NEW: Calculates overlap percentage (Bag of Words) to find matching repeated sections
const calculateOverlapScore = (hostText: string, donorText: string): number => {
  const hostWords = hostText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const donorWords = donorText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  
  if (hostWords.length === 0 || donorWords.length === 0) return 0;

  let matches = 0;
  const donorPool = [...donorWords];
  
  for (const hw of hostWords) {
    const idx = donorPool.indexOf(hw);
    if (idx !== -1) {
      matches++;
      donorPool.splice(idx, 1); 
    }
  }

  // Divides matching words by the longer section to penalize massive length differences, 
  // but allows a 4-line donor to match an 8-line host at exactly 50%.
  return matches / Math.max(hostWords.length, donorWords.length);
};

// ============================================================================
// 🚀 MASTER INJECTION ENGINE (STANZA-BASED FUZZY MATCHING)
// ============================================================================

/**
 * Runs the 3-Tier Fallback logic isolated to a single paragraph/stanza.
 */
export const injectChordsIntoStanza = (hostStanza: string, donorChords: DonorAnchor[]): string => {
  if (donorChords.length === 0) return hostStanza;

  const hostWords = hostStanza.split(/(\s+)/);
  const hostTokens = hostWords.map((text) => ({
    text,
    clean: text.toLowerCase().replace(/[^a-z0-9]/g, ''),
    chordInjected: false
  }));

  let searchCursor = 0;

  donorChords.forEach((donor) => {
    let matchFound = false;
    let targetHostIndex = -1;
    const SEARCH_WINDOW = 15;
    const donorClean = donor.anchorWord.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 🥇 TIER 1 & 2: PERFECT & SLIGHT MATCH
    for (let i = searchCursor; i < Math.min(searchCursor + SEARCH_WINDOW, hostTokens.length); i++) {
      if (hostTokens[i].clean === '') continue;

      if (hostTokens[i].clean === donorClean || isSlightMatch(hostTokens[i].clean, donor.anchorWord)) {
        targetHostIndex = i;
        matchFound = true;
        break;
      }
    }

    // 🥉 TIER 3: PROXIMITY FALLBACK
    if (!matchFound) {
      for (const offset of [-1, 1, -2, 2, 0]) {
        const attemptIdx = searchCursor + offset * 2;
        if (attemptIdx >= 0 && attemptIdx < hostTokens.length && !hostTokens[attemptIdx].chordInjected) {
          targetHostIndex = attemptIdx;
          matchFound = true;
          break;
        }
      }
    }

    // ✅ EXECUTE
    if (matchFound && targetHostIndex !== -1 && !hostTokens[targetHostIndex].chordInjected) {
      hostTokens[targetHostIndex].text = `[${donor.chord}]${hostTokens[targetHostIndex].text}`;
      hostTokens[targetHostIndex].chordInjected = true;
      searchCursor = targetHostIndex + 1;
    }
  });

  return hostTokens.map((t) => t.text).join('');
};

/**
 * Merges extracted chords into official Genius lyrics using Section-Based Overlap.
 */
export const injectChordsIntoGeniusLyrics = (geniusLyrics: string, rawChoText: string): string => {
  if (!geniusLyrics || !rawChoText) return geniusLyrics;

  // 1. Break both texts into Stanzas (paragraphs separated by blank lines)
  const hostStanzas = geniusLyrics.split(/\n\s*\n/);
  const donorStanzas = rawChoText.split(/\n\s*\n/);

  // 2. Pre-process donor stanzas to extract their specific chords
  const donorBlocks = donorStanzas.map(stanza => ({
    chords: extractDonorChordsFromChordPro(stanza),
    pureText: stanza.replace(/\[[^\]]+\]/g, '').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '')
  }));

  // 3. Evaluate and inject section by section
  const finalLyrics = hostStanzas.map(hostStanza => {
    const hostPureText = hostStanza.replace(/\[[^\]]+\]/g, ''); // Ignore Genius headers like [Chorus]
    if (!hostPureText.trim()) return hostStanza; 

    let bestMatch = null;
    let highestScore = 0;

    // Compare this Genius paragraph against EVERY GitHub paragraph
    for (const db of donorBlocks) {
      const score = calculateOverlapScore(hostPureText, db.pureText);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = db;
      }
    }

    // 4. Threshold Check (Passes if the match is 50% or higher)
    if (highestScore >= 0.5 && bestMatch && bestMatch.chords.length > 0) {
      return injectChordsIntoStanza(hostStanza, bestMatch.chords);
    }

    // Fallback: If it's a completely unique Genius section, leave it un-chorded
    return hostStanza;
  });

  // Reassemble the final song text
  return finalLyrics.join('\n\n');
};