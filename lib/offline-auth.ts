import type { createClient } from "../utils/supabase/client";

const SNAPSHOT_KEY = "onpraise_offline_auth";

export interface CachedAuthSnapshot {
  userId: string;
  email: string | null;
  activeRole: string;
  userTeamId: string | null;
  primaryTeamId: string | null;
  secondaryTeamIds: string[];
  setupComplete: boolean;
  lastVerifiedAt: string;
}

export function saveAuthSnapshot(snapshot: CachedAuthSnapshot): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function clearAuthSnapshot(): void {
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem("onpraise_offline_midi");
}

export function isNetworkFailure(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown; details?: unknown };
  return candidate.name === "AuthRetryableFetchError" ||
    (typeof candidate.message === "string" && /failed to fetch|networkerror|network request failed/i.test(candidate.message)) ||
    (typeof candidate.details === "string" && /failed to fetch|networkerror|network request failed/i.test(candidate.details));
}

export async function getOfflineAuthSnapshot(supabase: ReturnType<typeof createClient>): Promise<CachedAuthSnapshot | null> {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  let snapshot: CachedAuthSnapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch (error) {
    console.error("Could not read the offline account snapshot.", error);
    return null;
  }
  if (!snapshot || typeof snapshot.userId !== "string" || !snapshot.userId ||
      typeof snapshot.activeRole !== "string" || !snapshot.activeRole ||
      (snapshot.email !== null && typeof snapshot.email !== "string") ||
      (snapshot.userTeamId !== null && typeof snapshot.userTeamId !== "string") ||
      (snapshot.primaryTeamId !== null && typeof snapshot.primaryTeamId !== "string") ||
      !Array.isArray(snapshot.secondaryTeamIds) || !snapshot.secondaryTeamIds.every((id) => typeof id === "string") ||
      typeof snapshot.setupComplete !== "boolean" ||
      typeof snapshot.lastVerifiedAt !== "string" || !Number.isFinite(Date.parse(snapshot.lastVerifiedAt))) return null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let sessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>> | null;
  try {
    sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), 3000); }),
    ]);
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    console.warn("Could not reach the authentication service; using the verified account snapshot.", error);
    return localStorage.getItem(SNAPSHOT_KEY) === raw ? snapshot : null;
  } finally {
    clearTimeout(timeout);
  }
  if (!sessionResult) {
    console.warn("Offline session restoration timed out; using the verified account snapshot.");
    return localStorage.getItem(SNAPSHOT_KEY) === raw ? snapshot : null;
  }
  const { data, error } = sessionResult;
  if (error && !isNetworkFailure(error)) {
    console.error("Could not restore the offline session.", error);
    return null;
  }
  if (localStorage.getItem(SNAPSHOT_KEY) !== raw) return null;
  if (data.session && data.session.user.id !== snapshot.userId) return null;
  return snapshot;
}
