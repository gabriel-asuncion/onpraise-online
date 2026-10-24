export function getTimelineDurationBeats(
  sectionTimings: unknown,
  sectionIndex: number,
  sectionId?: string,
  defaultStructure?: unknown,
): number | null {
  let timingsValue = sectionTimings;
  if (typeof timingsValue === "string") {
    try {
      timingsValue = JSON.parse(timingsValue);
    } catch {
      return null;
    }
  }
  if (!timingsValue || typeof timingsValue !== "object") return null;

  let timelineValue = (timingsValue as Record<string, unknown>).__timeline;
  if (typeof timelineValue === "string") {
    try {
      timelineValue = JSON.parse(timelineValue);
    } catch {
      return null;
    }
  }
  if (!timelineValue || typeof timelineValue !== "object") return null;

  const durations = (timelineValue as Record<string, unknown>).durationBeats;
  if (!Array.isArray(durations)) return null;

  const timelineSectionIds = (timelineValue as Record<string, unknown>).sectionIds;
  let durationIndex = sectionIndex;
  let hasMatchedSectionId = false;
  if (sectionId && Array.isArray(timelineSectionIds)) {
    const matchingIndex = timelineSectionIds.findIndex((id) => id === sectionId);
    if (matchingIndex >= 0) {
      durationIndex = matchingIndex;
      hasMatchedSectionId = true;
    }
  }
  if (sectionId && !hasMatchedSectionId && Array.isArray(defaultStructure)) {
    const matchingIndex = defaultStructure.findIndex(
      (section) => Boolean(section) && typeof section === "object" && (section as Record<string, unknown>).id === sectionId,
    );
    if (matchingIndex >= 0) {
      durationIndex = matchingIndex;
      hasMatchedSectionId = true;
    }
  }

  const duration = Number(durations[durationIndex]);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}
