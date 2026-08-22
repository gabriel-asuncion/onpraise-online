// types/setlist.ts

export interface SongRecord {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  tempo: number;
  youtube_url?: string;
  youtube_sync_offset_ms?: number;
  section_timings: {
    [sectionName: string]: { 
      measures: number; 
      beats: number;
      repeats?: number;
      head_m?: number;
      tail_m?: number;
      line_timings?: {
        [lineIndex: string]: { measures: number; beats: number; repeats?: number }
      };
    };
  };
}

export interface SetlistTrackItem {
  id: string;
  sequence_order: number;
  start_time: string;
  custom_key?: string; 
  custom_structure?: ArrangementSection[] | null;
  songs: SongRecord | null;
  group_name?: string | null;
  group_color?: string | null;
}

export interface ArrangementSection {
  id: string;
  section_name: string;
  content: string;
}

export interface BeatNode {
  absoluteBeatIndex: number;
  measureBeatIndex: number;
  measureLength: number;
  sectionIndex: number;
  isDownbeat: boolean;
}

export interface CompiledBeatMap {
  totalBeats: number;
  nodes: BeatNode[];
  sectionStartBeats: number[];
}

export interface ParsedWordToken {
  chords: string[];
  word: string;
}

export interface ParsedLineToken {
  words: ParsedWordToken[];
  comment: string;
}

export interface CompiledSectionToken {
  id: string;
  section_name: string;
  lines: ParsedLineToken[];
}