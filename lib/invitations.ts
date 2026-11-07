const JOIN_CODE_PATTERN = /^[A-Z]{4}-[0-9]{5}$/;

export function normalizeJoinCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}[0-9]{5}$/.test(clean)) return null;
  const code = `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return JOIN_CODE_PATTERN.test(code) ? code : null;
}

export function createInvitationUrl(origin: string, joinCode: string | null | undefined): string | null {
  const code = normalizeJoinCode(joinCode);
  if (!code) return null;
  const url = new URL("/", origin);
  url.searchParams.set("invite", code);
  return url.toString();
}

export function getInvitationPath(joinCode: string): string {
  const code = normalizeJoinCode(joinCode);
  if (!code) throw new Error("A valid invitation code is required.");
  return `/onboarding?invite=${encodeURIComponent(code)}`;
}
