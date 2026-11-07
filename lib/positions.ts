export const SERVICE_POSITIONS = [
  "Pastor",
  "Music Leader",
  "Musician",
  "Backup",
  "Tech & Media",
  "Usher / Greeter",
  "General Member",
] as const;

export type ServicePosition = (typeof SERVICE_POSITIONS)[number];

export function normalizeServicePosition(value: string | null | undefined): ServicePosition | null {
  if (!value) return null;
  return SERVICE_POSITIONS.find((position) => position === value) ?? null;
}

export function getCooldownRemainingMs(cooldownUntil: string | null, now = Date.now()): number {
  if (!cooldownUntil) return 0;
  const timestamp = Date.parse(cooldownUntil);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

export function formatCooldownDuration(remainingMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
