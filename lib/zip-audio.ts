const AUDIO_EXT_REGEX = /\.(wav|mp3|m4a|aac|ogg|flac|aiff?|opus)$/i;
const INSTRUMENTAL_TOKEN_REGEX = /(?:^|[\s._\-([\]])instrum(?:ental)?(?=$|[\s._\-)\]])/i;

export function isZipFile(file: File): boolean {
  return (
    /\.zip$/i.test(file.name) ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.type === "multipart/x-zip"
  );
}

export function isAudioFileName(fileName: string): boolean {
  return AUDIO_EXT_REGEX.test(fileName);
}

export function isInstrumentalAudioFile(fileName: string): boolean {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const stemWithoutExt = baseName.replace(/\.[^.]+$/, "").trim();
  return INSTRUMENTAL_TOKEN_REGEX.test(stemWithoutExt);
}

function inferAudioMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "aac":
      return "audio/mp4";
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "aif":
    case "aiff":
      return "audio/aiff";
    default:
      return "application/octet-stream";
  }
}

async function inflateRaw(compressed: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("ZIP decompression is not supported in this browser. Extract the ZIP and import the audio files.");
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).arrayBuffer();
}

export async function extractAudioFilesFromZip(zipFile: File, signal?: AbortSignal): Promise<File[]> {
  const buffer = await zipFile.arrayBuffer();
  if (signal?.aborted) return [];

  const view = new DataView(buffer);
  const minEocdOffset = Math.max(0, buffer.byteLength - 65557);
  let eocdOffset = -1;

  for (let offset = buffer.byteLength - 22; offset >= minEocdOffset; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error(`"${zipFile.name}" is not a valid ZIP archive.`);
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const extracted: File[] = [];
  let cursor = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (signal?.aborted) return [];
    if (cursor + 46 > buffer.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error(`Corrupted central directory in "${zipFile.name}".`);
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraFieldLength = view.getUint16(cursor + 30, true);
    const fileCommentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const rawPath = decoder.decode(new Uint8Array(buffer, cursor + 46, fileNameLength));
    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;

    if (rawPath.endsWith("/")) continue;
    const segments = rawPath.split("/");
    if (segments.some((seg) => seg === "__MACOSX" || seg.startsWith("._"))) continue;

    const baseName = segments[segments.length - 1]?.trim() ?? "";
    if (!baseName || !isAudioFileName(baseName) || isInstrumentalAudioFile(baseName)) continue;

    if (localHeaderOffset + 30 > buffer.byteLength || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Corrupted entry header for "${baseName}" in "${zipFile.name}".`);
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

    if (dataOffset + compressedSize > buffer.byteLength) {
      throw new Error(`Truncated audio data for "${baseName}" in "${zipFile.name}".`);
    }

    const compressedBytes = new Uint8Array(buffer, dataOffset, compressedSize);
    let audioBuffer: ArrayBuffer;

    if (compressionMethod === 0) {
      audioBuffer = buffer.slice(dataOffset, dataOffset + compressedSize);
    } else if (compressionMethod === 8) {
      audioBuffer = await inflateRaw(compressedBytes);
    } else {
      throw new Error(`Unsupported ZIP compression method (${compressionMethod}) for "${baseName}".`);
    }

    extracted.push(new File([audioBuffer], baseName, { type: inferAudioMimeType(baseName) }));
  }

  return extracted.sort((a, b) => a.name.localeCompare(b.name));
}

export async function expandAndFilterStemFiles(files: File[], signal?: AbortSignal): Promise<File[]> {
  const result: File[] = [];
  for (const file of files) {
    if (signal?.aborted) return [];
    if (isZipFile(file)) {
      const zippedAudio = await extractAudioFilesFromZip(file, signal);
      result.push(...zippedAudio);
    } else if (!isInstrumentalAudioFile(file.name)) {
      result.push(file);
    }
  }
  return result;
}