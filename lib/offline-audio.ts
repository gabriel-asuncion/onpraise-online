import { captureOfflineGeneration, isCurrentOfflineGeneration, openOfflineDatabase } from "./offline-db";

export type StemRole = "track" | "drums" | "bass" | "keys" | "guitars" | "vocals" | "guide" | "other";

export interface StoredAudioStem {
  key: string;
  ownerId: string;
  songId: string;
  stemId: string;
  label: string;
  role: StemRole;
  fileName: string;
  mimeType: string;
  blob: Blob;
  updatedAt: string;
}

export interface AudioDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface SavedDirectory {
  id: "root_stems_folder";
  ownerId: string;
  handle: AudioDirectoryHandle;
  folderName: string;
  updatedAt: string;
}

type AudioGeneration = ReturnType<typeof captureOfflineGeneration>;

async function operation<T>(
  store: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
  generation?: AudioGeneration,
): Promise<T | undefined> {
  const db = await openOfflineDatabase();
  if (generation && !isCurrentOfflineGeneration(generation)) {
    db.close();
    return undefined;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = callback(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error("Audio storage failed.")); };
  });
}

function assertOwner(ownerId: string): AudioGeneration {
  const generation = captureOfflineGeneration();
  if (!ownerId || ownerId !== generation.ownerId) throw new Error("The audio account is no longer active.");
  return generation;
}

export async function pickAndSaveRootAudioFolder(ownerId: string): Promise<SavedDirectory> {
  const generation = assertOwner(ownerId);
  const picker = (window as Window & { showDirectoryPicker?: (options: { mode: "read" }) => Promise<AudioDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Folder linking is not supported in this browser. Add audio files instead.");
  const handle = await picker({ mode: "read" });
  const directory: SavedDirectory = { id: "root_stems_folder", ownerId, handle, folderName: handle.name, updatedAt: new Date().toISOString() };
  const saved = await operation("audio_directory_handles", "readwrite", (store) => store.put(directory), generation);
  if (saved === undefined) throw new Error("The account changed while linking the folder.");
  return directory;
}

export async function getSavedAudioFolderHandle(ownerId: string): Promise<SavedDirectory | null> {
  const generation = assertOwner(ownerId);
  const directory = await operation<SavedDirectory | undefined>("audio_directory_handles", "readonly", (store) => store.get("root_stems_folder"));
  if (!isCurrentOfflineGeneration(generation)) throw new Error("The audio account changed while loading the folder.");
  return directory?.ownerId === ownerId ? directory : null;
}

export async function verifyFolderPermission(handle: AudioDirectoryHandle): Promise<boolean> {
  if (await handle.queryPermission({ mode: "read" }) === "granted") return true;
  return await handle.requestPermission({ mode: "read" }) === "granted";
}

export function inferStemRole(name: string): StemRole {
  const words = name.replace(/[^a-z0-9]+/gi, " ");
  if (/\b(drums?|percussion)\b/i.test(words)) return "drums";
  if (/\bbass\b/i.test(words)) return "bass";
  if (/\b(piano|keys?|keyboard|synth)\b/i.test(words)) return "keys";
  if (/\bguitars?\b/i.test(words)) return "guitars";
  if (/\b(vocals?|vox)\b/i.test(words)) return "vocals";
  if (/\b(guide|cues?)\b/i.test(words)) return "guide";
  return "track";
}

export function normalizeAudioName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function findSongAudioFiles(handle: AudioDirectoryHandle, songId: string, title: string): Promise<File[]> {
  const id = normalizeAudioName(songId);
  const normalizedTitle = normalizeAudioName(title);
  const files: File[] = [];
  for await (const entry of handle.values()) {
    const normalized = normalizeAudioName(entry.name);
    const matches = Boolean((id && normalized.startsWith(id)) || (normalizedTitle && normalized.startsWith(normalizedTitle)));
    if (!matches) continue;
    if (entry.kind === "file") {
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name)) files.push(file);
    } else {
      for await (const child of (entry as AudioDirectoryHandle).values()) {
        if (child.kind !== "file") continue;
        const file = await (child as FileSystemFileHandle).getFile();
        if (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name)) files.push(file);
      }
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSongAudioStems(ownerId: string, songId: string): Promise<StoredAudioStem[]> {
  const generation = assertOwner(ownerId);
  const stems = await operation<StoredAudioStem[]>("song_audio_stems", "readonly", (store) =>
    store.index("owner_song").getAll([ownerId, songId]));
  if (!isCurrentOfflineGeneration(generation)) throw new Error("The audio account changed while loading stems.");
  return stems || [];
}

export async function saveSongAudioStem(stem: StoredAudioStem, generation = assertOwner(stem.ownerId)): Promise<void> {
  if (stem.ownerId !== generation.ownerId || stem.key !== `${stem.ownerId}:${stem.songId}:${stem.stemId}`) {
    throw new Error("Invalid audio stem owner or key.");
  }
  const result = await operation("song_audio_stems", "readwrite", (store) => store.put(stem), generation);
  if (result === undefined) throw new Error("The account changed while saving audio.");
}

export async function removeSongAudioStem(ownerId: string, songId: string, stemId: string): Promise<void> {
  const generation = assertOwner(ownerId);
  await operation("song_audio_stems", "readwrite", (store) => store.delete(`${ownerId}:${songId}:${stemId}`), generation);
}
