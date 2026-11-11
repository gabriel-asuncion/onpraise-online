interface MidiControl {
  actionId: string;
  type: "cc" | "note" | "pitchbend";
  channel: number;
  noteOrCcNumber: number;
}

export function findMidiConflicts<T extends MidiControl>(
  bindings: Array<{ primary: T; alternatives: T[] }>,
  candidate: T,
  index: number,
): T[] {
  return bindings.flatMap(({ primary, alternatives }) =>
    [primary, ...alternatives].filter((_, existingIndex) =>
      primary.actionId !== candidate.actionId || existingIndex !== index),
  ).filter((existing) =>
    existing.type === candidate.type &&
    (existing.type === "pitchbend" || existing.noteOrCcNumber === candidate.noteOrCcNumber) &&
    (existing.channel === -1 || candidate.channel === -1 || existing.channel === candidate.channel),
  );
}

export function updateMidiBinding<T>(
  primary: T | undefined,
  alternatives: T[],
  candidate: T,
  index: number,
): { primary: T; alternatives: T[] } {
  if (!primary || index <= 0) return { primary: candidate, alternatives };
  const updated = [...alternatives];
  if (index - 1 >= updated.length) updated.push(candidate);
  else updated[index - 1] = candidate;
  return { primary, alternatives: updated };
}
