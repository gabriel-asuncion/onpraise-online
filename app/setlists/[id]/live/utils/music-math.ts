// utils/music-math.ts

export const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const BASE_LETTER_ROOTS = ["C", "D", "E", "F", "G", "A", "B"];

export const STRUCTURE_CATALOG_PRESETS = [
  "Intro", "Verse 1", "Verse 2", "Verse 3", "Pre-Chorus", "Chorus 1", "Chorus 2", "Bridge", "Instrumental", "Outro"
];

export const normalizeKeyNote = (note: string): string => {
  const flatMap: { [key: string]: string } = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  return flatMap[note] || note;
};

export const transposeDisplayKey = (key: string, delta: number): string => {
  const minor = key.endsWith("m");
  const root = minor ? key.slice(0, -1) : key;
  const index = CHROMATIC_SCALE.indexOf(normalizeKeyNote(root));
  if (index < 0 || !Number.isFinite(delta)) return key;
  return CHROMATIC_SCALE[((index + Math.trunc(delta)) % 12 + 12) % 12] + (minor ? "m" : "");
};

export const transposeSingleNote = (note: string, semitones: number): string => {
  const normalized = normalizeKeyNote(note);
  const idx = CHROMATIC_SCALE.indexOf(normalized);
  if (idx === -1) return note;
  return CHROMATIC_SCALE[(idx + semitones + 12) % 12];
};

export const transposeBracketContent = (contentStr: string, semitones: number): string => {
  if (contentStr.includes("/")) {
    return contentStr.split("/").map(part => {
      const cleanPart = part.trim();
      const m = cleanPart.match(/^([A-G][#b]?)(.*)$/);
      return m ? `${transposeSingleNote(m[1], semitones)}${m[2]}` : cleanPart;
    }).join("/");
  }
  return contentStr.replace(/([A-G][#b]?\S*)/g, (match) => {
    const matchResult = match.match(/^([A-G][#b]?)(.*)$/);
    if (!matchResult) return match;
    return `${transposeSingleNote(matchResult[1], semitones)}${matchResult[2]}`;
  });
};

export const chordToRomanBase = (bassStr: string, activeKey: string): string => {
  const match = bassStr.trim().match(/^([A-G][#b]?)(.*)$/);
  if (!match) return bassStr.trim();
  const chordRoot = match[1];
  const keyBase = activeKey.replace(/m$/, '');
  const rootIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(keyBase));
  const chordIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(chordRoot));
  if (rootIdx === -1 || chordIdx === -1) return bassStr.trim();
  const diff = (chordIdx - rootIdx + 12) % 12;
  const romanBases = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];
  return romanBases[diff] + match[2];
};

export const chordToRoman = (chordStr: string, activeKey: string): string => {
  if (chordStr.includes('/')) {
    const [main, bass] = chordStr.split('/');
    return `${chordToRoman(main.trim(), activeKey)}/${chordToRomanBase(bass.trim(), activeKey)}`;
  }

  const match = chordStr.trim().match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chordStr.trim();

  const chordRoot = match[1];
  let suffix = match[2];

  const keyBase = activeKey.replace(/m$/, '');
  const rootIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(keyBase));
  const chordIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(chordRoot));

  if (rootIdx === -1 || chordIdx === -1) return chordStr.trim();

  const diff = (chordIdx - rootIdx + 12) % 12;
  const romanBases = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];
  let roman = romanBases[diff];

  if (suffix.match(/^m(?!aj)/)) {
    roman = roman.toLowerCase();
    suffix = suffix.replace(/^m/, '');
  } else if (suffix.startsWith('-')) {
    roman = roman.toLowerCase();
    suffix = suffix.replace(/^-/, '');
  } else if (suffix.startsWith('dim') || suffix.startsWith('°')) {
    roman = roman.toLowerCase();
  }

  return `${roman}${suffix}`;
};