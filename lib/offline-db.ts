import type { ArrangementSection, SetlistTrackItem, SongRecord } from "../app/setlists/[id]/live/types/setlist";

const DATABASE_NAME = "onpraise_offline_v1";
const DATABASE_VERSION = 2;
const GENERATION_KEY = "onpraise_offline_generation";
let sessionGeneration = 0;

function snapshotUserId(): string | null {
  const raw = localStorage.getItem("onpraise_offline_auth");
  if (!raw) return null;
  try {
    const snapshot: unknown = JSON.parse(raw);
    if (snapshot && typeof snapshot === "object" && "userId" in snapshot && typeof snapshot.userId === "string") return snapshot.userId;
  } catch (error) {
    console.error("Could not read the offline account snapshot.", error);
  }
  return null;
}

export function captureOfflineGeneration(): { local: number; shared: string | null; ownerId: string | null } {
  return { local: sessionGeneration, shared: localStorage.getItem(GENERATION_KEY), ownerId: snapshotUserId() };
}

export function isCurrentOfflineGeneration(generation: ReturnType<typeof captureOfflineGeneration>): boolean {
  return Boolean(generation.ownerId) && generation.ownerId === snapshotUserId() &&
    generation.local === sessionGeneration && generation.shared === localStorage.getItem(GENERATION_KEY);
}

export interface OfflineSong extends SongRecord {
  song_sections: Array<ArrangementSection & { song_id: string; sequence_order: number }>;
  downloadedAt: string;
  ownerId: string;
}

export interface OfflineSetlist {
  id: string;
  name: string;
  eventName: string;
  teamId: string | null;
  tracks: SetlistTrackItem[];
  downloadedAt: string;
  ownerId: string;
}

export interface OfflineSongIndex {
  id: string;
  ownerId: string;
  title?: string;
  artist?: string;
  original_key?: string;
  key_signature?: string;
  tempo?: number | string;
  chordpro_content?: string;
  approval_status?: string;
  youtube_url?: string;
  is_youtube_sync_validated?: boolean;
  themes?: string;
  created_by?: string;
  visibility_scope?: "workspace" | "global";
}

export function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) {
        database.createObjectStore("songs", { keyPath: "id" });
        database.createObjectStore("song_sections", { keyPath: "id" });
        database.createObjectStore("setlists", { keyPath: "id" });
        database.createObjectStore("song_index", { keyPath: "id" });
      }
      if (event.oldVersion < 2) {
        database.createObjectStore("audio_directory_handles", { keyPath: "id" });
        const stems = database.createObjectStore("song_audio_stems", { keyPath: "key" });
        stems.createIndex("owner_song", ["ownerId", "songId"]);
      }
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
    request.onblocked = () => { blocked = true; reject(new Error("Offline storage is blocked by another tab.")); };
  });
}

function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (transaction: IDBTransaction) => IDBRequest<T>): Promise<T>;
function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (transaction: IDBTransaction) => IDBRequest<T>, generation: ReturnType<typeof captureOfflineGeneration>): Promise<T | undefined>;
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => IDBRequest<T>,
  generation?: ReturnType<typeof captureOfflineGeneration>,
): Promise<T | undefined> {
  const database = await openOfflineDatabase();
  if (generation && !isCurrentOfflineGeneration(generation)) {
    database.close();
    return undefined;
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    const request = run(tx);
    tx.oncomplete = () => { database.close(); resolve(request.result); };
    tx.onerror = () => { database.close(); reject(tx.error || new Error("Offline storage operation failed.")); };
    tx.onabort = () => { database.close(); reject(tx.error || new Error("Offline storage operation was cancelled.")); };
  });
}

export async function saveOfflineSong(song: OfflineSong, generation: ReturnType<typeof captureOfflineGeneration>): Promise<boolean> {
  if (song.ownerId !== generation.ownerId) return false;
  const result = await transaction(["songs", "song_sections"], "readwrite", (tx) => {
    const sections = tx.objectStore("song_sections");
    song.song_sections.forEach((section) => sections.put({ ...section, ownerId: song.ownerId }));
    return tx.objectStore("songs").put(song);
  }, generation);
  return result !== undefined;
}

export async function getOfflineSong(id: string, ownerId: string): Promise<OfflineSong | null> {
  const song = await transaction<OfflineSong | undefined>(["songs"], "readonly", (tx) => tx.objectStore("songs").get(id));
  return song?.ownerId === ownerId ? song : null;
}

export async function getOfflineSongs(ownerId: string): Promise<OfflineSong[]> {
  const songs = await transaction<OfflineSong[]>(["songs"], "readonly", (tx) => tx.objectStore("songs").getAll());
  return songs.filter((song) => song.ownerId === ownerId);
}

export async function removeOfflineSong(id: string, ownerId: string): Promise<void> {
  const song = await getOfflineSong(id, ownerId);
  if (!song) return;
  await transaction(["songs", "song_sections"], "readwrite", (tx) => {
    const sections = tx.objectStore("song_sections");
    song.song_sections.forEach((section) => sections.delete(section.id));
    return tx.objectStore("songs").delete(id);
  });
}

export async function saveOfflineSetlistBundle(setlist: OfflineSetlist, songs: OfflineSong[], generation: ReturnType<typeof captureOfflineGeneration>): Promise<boolean> {
  if (setlist.ownerId !== generation.ownerId || songs.some((song) => song.ownerId !== generation.ownerId)) return false;
  const result = await transaction(["songs", "song_sections", "setlists"], "readwrite", (tx) => {
    const songStore = tx.objectStore("songs");
    const sectionStore = tx.objectStore("song_sections");
    songs.forEach((song) => {
      songStore.put(song);
      song.song_sections.forEach((section) => sectionStore.put({ ...section, ownerId: song.ownerId }));
    });
    return tx.objectStore("setlists").put(setlist);
  }, generation);
  return result !== undefined;
}

export async function getOfflineSetlist(id: string, ownerId: string): Promise<OfflineSetlist | null> {
  const setlist = await transaction<OfflineSetlist | undefined>(["setlists"], "readonly", (tx) => tx.objectStore("setlists").get(id));
  return setlist?.ownerId === ownerId ? setlist : null;
}

export async function removeOfflineSetlist(id: string, ownerId: string): Promise<void> {
  if (!await getOfflineSetlist(id, ownerId)) return;
  await transaction(["setlists"], "readwrite", (tx) => tx.objectStore("setlists").delete(id));
}

export async function saveSongIndex(songs: OfflineSongIndex[], generation: ReturnType<typeof captureOfflineGeneration>): Promise<void> {
  if (songs.some((song) => song.ownerId !== generation.ownerId)) return;
  await transaction(["song_index"], "readwrite", (tx) => {
    const store = tx.objectStore("song_index");
    store.clear();
    songs.forEach((song) => store.put(song));
    return store.count();
  }, generation);
}

export async function getSongIndex(ownerId: string): Promise<OfflineSongIndex[]> {
  const songs = await transaction<OfflineSongIndex[]>(["song_index"], "readonly", (tx) => tx.objectStore("song_index").getAll());
  return songs.filter((song) => song.ownerId === ownerId);
}

export async function clearOfflineData(): Promise<void> {
  sessionGeneration += 1;
  localStorage.setItem(GENERATION_KEY, crypto.randomUUID());
  await transaction(["songs", "song_sections", "setlists", "song_index", "audio_directory_handles", "song_audio_stems"], "readwrite", (tx) => {
    tx.objectStore("songs").clear();
    tx.objectStore("song_sections").clear();
    tx.objectStore("setlists").clear();
    tx.objectStore("audio_directory_handles").clear();
    tx.objectStore("song_audio_stems").clear();
    return tx.objectStore("song_index").clear();
  });
}
