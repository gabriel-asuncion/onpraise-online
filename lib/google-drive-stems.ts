import { normalizeAudioName } from "./offline-audio";
import { isAudioFileName, isInstrumentalAudioFile } from "./zip-audio";

export interface DriveStemFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";

function getDriveConfig(): { apiKey: string; folderId: string } {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY?.trim() ?? "";
  const folderId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_STEMS_FOLDER_ID?.trim() ?? "";
  if (!apiKey || !folderId) {
    throw new Error(
      "Google Drive is not configured. Set NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY and NEXT_PUBLIC_GOOGLE_DRIVE_STEMS_FOLDER_ID."
    );
  }
  return { apiKey, folderId };
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_GOOGLE_DRIVE_STEMS_FOLDER_ID?.trim()
  );
}

function isSupportedStemAsset(file: DriveStemFile): boolean {
  if (file.mimeType === "application/vnd.google-apps.folder") return false;
  if (/\.zip$/i.test(file.name) || file.mimeType === "application/zip" || file.mimeType === "application/x-zip-compressed") {
    return true;
  }
  return isAudioFileName(file.name) && !isInstrumentalAudioFile(file.name);
}

async function parseDriveError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    if (payload?.error?.message) return payload.error.message;
  } catch {
    // Ignore non-JSON error bodies
  }
  return `${fallback} (HTTP ${response.status})`;
}

export async function listPublicDriveStems(signal?: AbortSignal): Promise<DriveStemFile[]> {
  const { apiKey, folderId } = getDriveConfig();
  const escapedFolderId = folderId.replace(/'/g, "\\'");
  const query = `'${escapedFolderId}' in parents and trashed = false`;
  const collected: DriveStemFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
      orderBy: "name",
      pageSize: "200",
      key: apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${DRIVE_API_BASE}?${params.toString()}`, { signal });
    if (!response.ok) {
      throw new Error(await parseDriveError(response, "Could not list files from Google Drive"));
    }

    const data = (await response.json()) as { files?: DriveStemFile[]; nextPageToken?: string };
    for (const file of data.files ?? []) {
      if (isSupportedStemAsset(file)) collected.push(file);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return collected.sort((a, b) => a.name.localeCompare(b.name));
}

export function findMatchingDriveStemFiles(files: DriveStemFile[], songTitle?: string): DriveStemFile[] {
  const normalizedTitle = normalizeAudioName(songTitle ?? "");
  if (!normalizedTitle) return [];

  const exactMatches: DriveStemFile[] = [];
  const prefixMatches: DriveStemFile[] = [];
  const partialMatches: DriveStemFile[] = [];

  for (const file of files) {
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const normalizedFile = normalizeAudioName(baseName);
    if (!normalizedFile) continue;

    if (normalizedFile === normalizedTitle) {
      exactMatches.push(file);
    } else if (normalizedFile.startsWith(normalizedTitle)) {
      prefixMatches.push(file);
    } else if (normalizedTitle.length >= 4 && normalizedFile.includes(normalizedTitle)) {
      partialMatches.push(file);
    }
  }

  const best = exactMatches.length ? exactMatches : prefixMatches.length ? prefixMatches : partialMatches;
  // Prefer .zip archive first if both a .zip and loose audio files match
  return [...best].sort((a, b) => Number(/\.zip$/i.test(b.name)) - Number(/\.zip$/i.test(a.name)));
}

export interface DriveDownloadProgress {
  loadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export async function downloadPublicDriveStemFile(
  file: DriveStemFile,
  signal?: AbortSignal,
  onProgress?: (progress: DriveDownloadProgress) => void,
): Promise<File> {
  const { apiKey } = getDriveConfig();
  const params = new URLSearchParams({ alt: "media", key: apiKey });
  const response = await fetch(`${DRIVE_API_BASE}/${encodeURIComponent(file.id)}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(await parseDriveError(response, `Could not download "${file.name}" from Google Drive`));
  }

  const headerLength = Number(response.headers.get("Content-Length"));
  const fallbackSize = Number(file.size);
  const totalBytes =
    Number.isFinite(headerLength) && headerLength > 0
      ? headerLength
      : Number.isFinite(fallbackSize) && fallbackSize > 0
        ? fallbackSize
        : null;

  let blob: Blob;
  if (response.body && onProgress) {
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let loadedBytes = 0;
    onProgress({ loadedBytes: 0, totalBytes, percent: totalBytes ? 0 : null });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as Uint8Array<ArrayBuffer>);
        loadedBytes += value.byteLength;
        const percent = totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null;
        onProgress({ loadedBytes, totalBytes, percent });
      }
    }
    blob = new Blob(chunks);
  } else {
    blob = await response.blob();
    onProgress?.({ loadedBytes: blob.size, totalBytes: blob.size, percent: 100 });
  }

  const mimeType =
    /\.zip$/i.test(file.name)
      ? "application/zip"
      : file.mimeType && file.mimeType !== "application/octet-stream"
        ? file.mimeType
        : blob.type || "application/octet-stream";

  return new File([blob], file.name, { type: mimeType });
}

export function formatDriveFileSize(sizeBytes?: string): string | null {
  const bytes = Number(sizeBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}