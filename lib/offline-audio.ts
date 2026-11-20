import { captureOfflineGeneration, getSongIndex, isCurrentOfflineGeneration, openOfflineDatabase } from "./offline-db";
import { createZipFromFiles, extractAudioFilesFromZip, isInstrumentalAudioFile, isZipFile } from "./zip-audio";

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
  values(): ReturnType<FileSystemDirectoryHandle["values"]>;
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

export function isDirectoryHandlePickerSupported(): boolean {
  return typeof window !== "undefined" &&
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

const LINKED_FALLBACK_FOLDER_KEY_PREFIX = "onpraise_linked_folder_name:";

export function saveLinkedFallbackFolderName(ownerId: string, folderName: string): void {
  if (typeof window === "undefined" || !ownerId) return;
  try {
    window.localStorage.setItem(`${LINKED_FALLBACK_FOLDER_KEY_PREFIX}${ownerId}`, folderName);
  } catch {
    // Ignore storage quota / privacy errors
  }
}

export function getLinkedFallbackFolderName(ownerId: string): string | null {
  if (typeof window === "undefined" || !ownerId) return null;
  try {
    return window.localStorage.getItem(`${LINKED_FALLBACK_FOLDER_KEY_PREFIX}${ownerId}`);
  } catch {
    return null;
  }
}

export async function pickAndSaveRootAudioFolder(ownerId: string): Promise<SavedDirectory> {
  const generation = assertOwner(ownerId);
  const picker = (window as Window & { showDirectoryPicker?: (options: { mode: "read" }) => Promise<AudioDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Folder linking is not supported in this browser. Add audio files instead.");
  const handle = await picker({ mode: "read" });
  const directory: SavedDirectory = { id: "root_stems_folder", ownerId, handle, folderName: handle.name, updatedAt: new Date().toISOString() };
  const saved = await operation("audio_directory_handles", "readwrite", (store) => store.put(directory), generation);
  if (saved === undefined) throw new Error("The account changed while linking the folder.");
  saveLinkedFallbackFolderName(ownerId, handle.name);
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

function matchesNormalizedSongPrefix(rawName: string, normalizedTarget: string): boolean {
  if (!normalizedTarget) return false;
  const normalized = normalizeAudioName(rawName);
  if (!normalized.startsWith(normalizedTarget)) return false;
  let consumed = 0;
  for (let i = 0; i < rawName.length; i++) {
    if (/[a-z0-9]/i.test(rawName[i])) {
      consumed += 1;
      if (consumed === normalizedTarget.length) {
        const nextChar = rawName[i + 1];
        return !nextChar || !/[a-z]/i.test(nextChar);
      }
    }
  }
  return true;
}

export async function findSongAudioFiles(handle: AudioDirectoryHandle, songId: string, title: string): Promise<File[]> {
  const id = normalizeAudioName(songId);
  const normalizedTitle = normalizeAudioName(title);
  const files: File[] = [];
  const collectFile = async (file: File) => {
    if (isZipFile(file)) {
      files.push(...(await extractAudioFilesFromZip(file)));
    } else if (
      !isInstrumentalAudioFile(file.name) &&
      (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name))
    ) {
      files.push(file);
    }
  };
  for await (const entry of handle.values()) {
    const matches = Boolean(
      matchesNormalizedSongPrefix(entry.name, id) || matchesNormalizedSongPrefix(entry.name, normalizedTitle),
    );
    if (!matches) continue;
    if (entry.kind === "file") {
      await collectFile(await (entry as FileSystemFileHandle).getFile());
    } else {
      for await (const child of (entry as AudioDirectoryHandle).values()) {
        if (child.kind !== "file") continue;
        await collectFile(await (child as FileSystemFileHandle).getFile());
      }
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function findSongAudioFilesFromFileList(files: File[], songId: string, title: string): Promise<File[]> {
  const id = normalizeAudioName(songId);
  const normalizedTitle = normalizeAudioName(title);
  const matched: File[] = [];

  for (const file of files) {
    const relativeSegments = (file.webkitRelativePath || file.name).split(/[\\/]/).filter(Boolean);
    const folderSegments = relativeSegments.length > 2 ? relativeSegments.slice(1, -1) : [];
    const candidateNames = [file.name, ...folderSegments];
    const isMatch = candidateNames.some((candidate) =>
      Boolean(matchesNormalizedSongPrefix(candidate, id) || matchesNormalizedSongPrefix(candidate, normalizedTitle)),
    );
    if (!isMatch) continue;

    if (isZipFile(file)) {
      matched.push(...(await extractAudioFilesFromZip(file)));
    } else if (
      !isInstrumentalAudioFile(file.name) &&
      (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name))
    ) {
      matched.push(file);
    }
  }

  return matched.sort((a, b) => a.name.localeCompare(b.name));
}

interface SongMatchCandidate {
  id: string;
  normId: string;
  normTitle: string;
}

async function buildSongMatchCandidates(
  ownerId: string,
  currentSong?: { id: string; title: string },
): Promise<SongMatchCandidate[]> {
  const indexed = await getSongIndex(ownerId).catch(() => []);
  const byId = new Map<string, SongMatchCandidate>();

  for (const song of indexed) {
    if (!song?.id) continue;
    byId.set(song.id, {
      id: song.id,
      normId: normalizeAudioName(song.id),
      normTitle: normalizeAudioName(song.title ?? ""),
    });
  }

  if (currentSong?.id && !byId.has(currentSong.id)) {
    byId.set(currentSong.id, {
      id: currentSong.id,
      normId: normalizeAudioName(currentSong.id),
      normTitle: normalizeAudioName(currentSong.title ?? ""),
    });
  }

  return Array.from(byId.values()).filter((c) => Boolean(c.normId || c.normTitle));
}

export async function preloadLibraryStemsFromFileList(
  ownerId: string,
  files: File[],
  currentSong?: { id: string; title: string },
  signal?: AbortSignal,
): Promise<{ matchedSongCount: number; currentSongStems: StoredAudioStem[] }> {
  assertOwner(ownerId);
  const candidates = await buildSongMatchCandidates(ownerId, currentSong);
  if (signal?.aborted) return { matchedSongCount: 0, currentSongStems: [] };

  const filesBySongId = new Map<string, File[]>();

  for (const file of files) {
    if (signal?.aborted) return { matchedSongCount: 0, currentSongStems: [] };
    const isArchive = isZipFile(file);
    const isStemAudio =
      !isArchive &&
      !isInstrumentalAudioFile(file.name) &&
      (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name));
    if (!isArchive && !isStemAudio) continue;

    const relativeSegments = (file.webkitRelativePath || file.name).split(/[\\/]/).filter(Boolean);
    const folderSegments = relativeSegments.length > 2 ? relativeSegments.slice(1, -1) : [];
    const candidateNames = [file.name, ...folderSegments].filter(Boolean);

    const matchedSongs = candidates.filter((song) =>
      candidateNames.some(
        (candidate) =>
          Boolean(matchesNormalizedSongPrefix(candidate, song.normId) || matchesNormalizedSongPrefix(candidate, song.normTitle)),
      ),
    );
    if (matchedSongs.length === 0) continue;

    const extracted = isArchive ? await extractAudioFilesFromZip(file) : [file];
    if (extracted.length === 0) continue;

    for (const song of matchedSongs) {
      const bucket = filesBySongId.get(song.id) ?? [];
      bucket.push(...extracted);
      filesBySongId.set(song.id, bucket);
    }
  }

  let matchedSongCount = 0;
  for (const [targetSongId, songFiles] of filesBySongId.entries()) {
    if (signal?.aborted) break;
    const sorted = songFiles.sort((a, b) => a.name.localeCompare(b.name));
    const saved = await syncFolderFilesToSongStems(ownerId, targetSongId, sorted, signal);
    if (saved.length > 0) matchedSongCount += 1;
  }

  const currentSongStems =
    currentSong?.id && !signal?.aborted ? await getSongAudioStems(ownerId, currentSong.id) : [];

  return { matchedSongCount, currentSongStems };
}

export async function preloadLibraryStemsFromDirectoryHandle(
  ownerId: string,
  handle: AudioDirectoryHandle,
  currentSong?: { id: string; title: string },
  signal?: AbortSignal,
): Promise<{ matchedSongCount: number; currentSongStems: StoredAudioStem[] }> {
  assertOwner(ownerId);
  const candidates = await buildSongMatchCandidates(ownerId, currentSong);
  if (signal?.aborted) return { matchedSongCount: 0, currentSongStems: [] };

  const filesBySongId = new Map<string, File[]>();
  const collectFile = async (file: File, targetSongIds: string[]) => {
    if (isZipFile(file)) {
      const extracted = await extractAudioFilesFromZip(file);
      for (const id of targetSongIds) {
        const bucket = filesBySongId.get(id) ?? [];
        bucket.push(...extracted);
        filesBySongId.set(id, bucket);
      }
    } else if (
      !isInstrumentalAudioFile(file.name) &&
      (file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i.test(file.name))
    ) {
      for (const id of targetSongIds) {
        const bucket = filesBySongId.get(id) ?? [];
        bucket.push(file);
        filesBySongId.set(id, bucket);
      }
    }
  };

  for await (const entry of handle.values()) {
    if (signal?.aborted) break;
    const matchedSongIds = candidates
      .filter((song) => Boolean(matchesNormalizedSongPrefix(entry.name, song.normId) || matchesNormalizedSongPrefix(entry.name, song.normTitle)))
      .map((song) => song.id);
    if (matchedSongIds.length === 0) continue;

    if (entry.kind === "file") {
      await collectFile(await (entry as FileSystemFileHandle).getFile(), matchedSongIds);
    } else {
      for await (const child of (entry as AudioDirectoryHandle).values()) {
        if (child.kind !== "file") continue;
        await collectFile(await (child as FileSystemFileHandle).getFile(), matchedSongIds);
      }
    }
  }

  let matchedSongCount = 0;
  for (const [targetSongId, songFiles] of filesBySongId.entries()) {
    if (signal?.aborted) break;
    const sorted = songFiles.sort((a, b) => a.name.localeCompare(b.name));
    const saved = await syncFolderFilesToSongStems(ownerId, targetSongId, sorted, signal);
    if (saved.length > 0) matchedSongCount += 1;
  }

  const currentSongStems =
    currentSong?.id && !signal?.aborted ? await getSongAudioStems(ownerId, currentSong.id) : [];

  return { matchedSongCount, currentSongStems };
}

export function formatStemDownloadFileName(fileName: string, songTitle?: string): string {
  const cleanTitle = (songTitle ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  if (!cleanTitle) return fileName;
  const normTitle = normalizeAudioName(cleanTitle);
  const normFile = normalizeAudioName(fileName);
  if (normTitle && normFile.startsWith(normTitle)) return fileName;
  return `${cleanTitle} - ${fileName}`;
}

export async function saveFilesToDeviceDownloads(files: File[], songTitle?: string): Promise<void> {
  if (typeof document === "undefined" || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const downloadName = formatStemDownloadFileName(file.name, songTitle);
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (i < files.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }
}

export async function saveStemsZipToDeviceDownloads(
  sourceFiles: File[],
  extractedStems: File[],
  songTitle?: string,
): Promise<void> {
  if (typeof document === "undefined" || extractedStems.length === 0) return;

  const cleanTitle = (songTitle ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const archiveFile =
    sourceFiles.length === 1 && isZipFile(sourceFiles[0])
      ? sourceFiles[0]
      : await createZipFromFiles(extractedStems, `${cleanTitle || "stems"}.zip`);

  const downloadName = formatStemDownloadFileName(archiveFile.name, songTitle);
  const url = URL.createObjectURL(archiveFile);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function syncFolderFilesToSongStems(
  ownerId: string,
  songId: string,
  files: File[],
  signal?: AbortSignal,
): Promise<StoredAudioStem[]> {
  const generation = assertOwner(ownerId);
  const existing = await getSongAudioStems(ownerId, songId);
  if (signal?.aborted) return existing;

  const byRole = new Map<StemRole, StoredAudioStem>();
  for (const stem of existing) {
    if (!byRole.has(stem.role)) byRole.set(stem.role, stem);
  }

  const usedRoles = new Set<StemRole>();
  for (const file of files) {
    if (signal?.aborted) return existing;
    const role = inferStemRole(file.name);
    if (usedRoles.has(role)) continue;
    usedRoles.add(role);

    const current = byRole.get(role);
    if (current && current.fileName === file.name && current.blob.size === file.size) {
      continue;
    }
    const stemId = current?.stemId ?? crypto.randomUUID();
    await saveSongAudioStem(
      {
        key: `${ownerId}:${songId}:${stemId}`,
        ownerId,
        songId,
        stemId,
        label: file.name,
        role,
        fileName: file.name,
        mimeType: file.type,
        blob: file,
        updatedAt: new Date().toISOString(),
      },
      generation,
    );
  }

  return getSongAudioStems(ownerId, songId);
}

export async function resolveSongAudioStems(
  ownerId: string,
  songId: string,
  songTitle: string,
  signal?: AbortSignal,
): Promise<StoredAudioStem[]> {
  try {
    const savedFolder = await getSavedAudioFolderHandle(ownerId);
    if (savedFolder?.handle && !signal?.aborted) {
      const permission = await savedFolder.handle.queryPermission({ mode: "read" });
      if (permission === "granted" && !signal?.aborted) {
        const folderFiles = await findSongAudioFiles(savedFolder.handle, songId, songTitle);
        if (folderFiles.length > 0 && !signal?.aborted) {
          return await syncFolderFilesToSongStems(ownerId, songId, folderFiles, signal);
        }
      }
    }
  } catch (error) {
    if (!signal?.aborted) {
      console.warn("Could not read linked stems folder; falling back to cached stems.", error);
    }
  }
  return getSongAudioStems(ownerId, songId);
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
