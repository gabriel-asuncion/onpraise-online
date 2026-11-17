export type AudioSourceMode = "youtube" | "local";
export type AudioSource = AudioSourceMode;

const storageKey = (userId: string) => `onpraise_audio_source_pref:${userId}`;
const pendingKey = (userId: string) => `onpraise_audio_source_pending:${userId}`;
const writes = new Map<string, Promise<void>>();

function assertUserId(userId: string): void {
  if (!userId.trim()) throw new Error("An account is required to save an audio source.");
}

function parseSource(value: unknown): AudioSourceMode | null {
  return value === "youtube" || value === "local" ? value : null;
}

function syncSource(userId: string, source: AudioSource): Promise<void> {
  const previous = writes.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const { createClient } = await import("../utils/supabase/client");
    const { error } = await createClient().from("user_control_preferences").upsert(
      { user_id: userId, audio_source: source },
      { onConflict: "user_id", defaultToNull: false },
    );
    if (error) throw new Error(`Could not sync audio source preference: ${error.message}`);
  });
  writes.set(userId, next);
  void next.finally(() => {
    if (writes.get(userId) === next) writes.delete(userId);
  }).catch(() => undefined);
  return next;
}

export function getSavedAudioSource(userId: string | null | undefined): AudioSourceMode {
  if (!userId?.trim() || typeof localStorage === "undefined") return "youtube";
  return parseSource(localStorage.getItem(storageKey(userId))) ?? "youtube";
}

export function resolveEffectiveAudioSource(savedSource: AudioSourceMode, isOnline: boolean): AudioSourceMode {
  return isOnline ? savedSource : "local";
}

export async function refreshSavedAudioSource(userId: string): Promise<AudioSourceMode | null> {
  assertUserId(userId);
  const local = parseSource(localStorage.getItem(storageKey(userId)));
  if (!navigator.onLine) return local;
  const pending = localStorage.getItem(pendingKey(userId));
  if (local && pending) {
    await syncSource(userId, local);
    if (localStorage.getItem(pendingKey(userId)) === pending) localStorage.removeItem(pendingKey(userId));
    return local;
  }
  const { createClient } = await import("../utils/supabase/client");
  const { data, error } = await createClient().from("user_control_preferences")
    .select("audio_source").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Could not load audio source preference: ${error.message}`);
  if (localStorage.getItem(pendingKey(userId)) || localStorage.getItem(storageKey(userId)) !== local) {
    return parseSource(localStorage.getItem(storageKey(userId)));
  }
  const remote = parseSource(data?.audio_source);
  if (remote) localStorage.setItem(storageKey(userId), remote);
  return remote ?? local;
}

export async function saveAudioSourcePreference(userId: string | null | undefined, source: AudioSourceMode): Promise<void> {
  if (!userId) throw new Error("An account is required to save an audio source.");
  assertUserId(userId);
  if (!parseSource(source)) throw new Error("Invalid audio source.");
  const revision = crypto.randomUUID();
  localStorage.setItem(storageKey(userId), source);
  localStorage.setItem(pendingKey(userId), revision);
  if (!navigator.onLine) return;
  await syncSource(userId, source);
  if (localStorage.getItem(pendingKey(userId)) === revision) localStorage.removeItem(pendingKey(userId));
}
