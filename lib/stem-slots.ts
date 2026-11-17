import type { StemRole } from "./offline-audio";

export const STEM_SLOTS = [
  "drums", "bass", "keys", "other", "guitars", "vocals",
] as const;

export type StemSlot = typeof STEM_SLOTS[number];

export function getStemSlot(role: StemRole): StemSlot {
  switch (role) {
    case "drums":
    case "bass":
    case "keys":
    case "guitars":
    case "vocals":
      return role;
    case "track":
    case "guide":
    case "other":
      return "other";
  }
}

export function groupStemSlots<T extends { role: StemRole }>(items: readonly T[]): Record<StemSlot, T[]> {
  const slots: Record<StemSlot, T[]> = {
    drums: [], bass: [], keys: [], other: [], guitars: [], vocals: [],
  };
  for (const item of items) slots[getStemSlot(item.role)].push(item);
  return slots;
}
