export function getTimelineMeter(sectionTimings: unknown): {
  numerator: number;
  denominator: number;
  unitQuarterBeats: number;
  quarterBeatsPerMeasure: number;
} {
  let timingsValue = sectionTimings;
  if (typeof timingsValue === "string") {
    try {
      timingsValue = JSON.parse(timingsValue);
    } catch {
      timingsValue = null;
    }
  }

  const rawTimeline = timingsValue && typeof timingsValue === "object"
    ? (timingsValue as Record<string, unknown>).__timeline
    : null;
  let timelineValue = rawTimeline;
  if (typeof timelineValue === "string") {
    try {
      timelineValue = JSON.parse(timelineValue);
    } catch {
      timelineValue = null;
    }
  }

  const timeline = timelineValue && typeof timelineValue === "object"
    ? timelineValue as Record<string, unknown>
    : {};
  const configuredNumerator = Number(timeline.meterNumerator);
  const configuredDenominator = Number(timeline.meterDenominator);
  const numerator = [2, 3, 4, 5, 6, 7, 9, 12].includes(configuredNumerator) ? configuredNumerator : 4;
  const denominator = [2, 4, 8, 16].includes(configuredDenominator) ? configuredDenominator : 4;

  return {
    numerator,
    denominator,
    unitQuarterBeats: 4 / denominator,
    quarterBeatsPerMeasure: numerator * (4 / denominator)
  };
}

export function getTimelineMeasureBeat(absoluteQuarterBeat: number, meter: ReturnType<typeof getTimelineMeter>) {
  const measurePosition = ((absoluteQuarterBeat % meter.quarterBeatsPerMeasure) + meter.quarterBeatsPerMeasure) % meter.quarterBeatsPerMeasure;
  const beatIndex = Math.floor((measurePosition + 0.000001) / meter.unitQuarterBeats) + 1;
  return {
    beatIndex: Math.min(meter.numerator, beatIndex),
    measureLength: meter.numerator
  };
}

export function getNextTimelineBeat(absoluteQuarterBeat: number, meter: ReturnType<typeof getTimelineMeter>) {
  const beatUnit = meter.unitQuarterBeats;
  return (Math.floor((absoluteQuarterBeat + 0.000001) / beatUnit) + 1) * beatUnit;
}

export function getYoutubeTimeForTimeline(
  absoluteQuarterBeat: number,
  elapsedTimelineMs: number,
  tempo: number,
  syncOffsetMs: number,
) {
  const beatDurationMs = 60_000 / (tempo || 75);
  return Math.max(0, (absoluteQuarterBeat * beatDurationMs + elapsedTimelineMs + syncOffsetMs) / 1000);
}

export function compileTimelineBeatMap(
  sections: Array<{ id: string; section_name: string }>,
  sectionTimings: unknown,
  lineCounts: number[],
  defaultStructure?: unknown,
  spacerDurationOverrides?: Record<string, number>,
) {
  const meter = getTimelineMeter(sectionTimings);
  const timingRoot = parseRecord(sectionTimings);
  const nodes: Array<{
    absoluteBeatIndex: number;
    measureBeatIndex: number;
    measureLength: number;
    sectionIndex: number;
    isDownbeat: boolean;
  }> = [];
  const sectionStartBeats: number[] = [];
  let currentAbsoluteBeat = 0;

  const stampBeats = (duration: number, sectionIndex: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const endBeat = currentAbsoluteBeat + duration;
    const unit = meter.unitQuarterBeats;
    let beatPosition = Math.ceil((currentAbsoluteBeat - 0.000001) / unit) * unit;
    while (beatPosition < endBeat - 0.000001) {
      const { beatIndex, measureLength } = getTimelineMeasureBeat(beatPosition, meter);
      nodes.push({
        absoluteBeatIndex: beatPosition,
        measureBeatIndex: beatIndex,
        measureLength,
        sectionIndex,
        isDownbeat: beatIndex === 1
      });
      beatPosition += unit;
    }
    currentAbsoluteBeat = endBeat;
  };

  sections.forEach((section, sectionIndex) => {
    sectionStartBeats.push(currentAbsoluteBeat);
    if (section.section_name.toLowerCase().startsWith("spacer")) {
      stampBeats(
        spacerDurationOverrides?.[section.id] ??
          getTimelineDurationBeats(sectionTimings, sectionIndex, section.id, defaultStructure) ??
          0.5,
        sectionIndex
      );
      return;
    }

    const rawTiming = timingRoot[section.section_name];
    const timings = parseRecord(rawTiming);
    const repeats = Math.max(0, Number(timings.repeats) || 0);
    const sectionMultiplier = repeats + 1;
    const headBeats = Math.max(0, Number(timings.head_m) || 0) * meter.quarterBeatsPerMeasure;
    const tailBeats = Math.max(0, Number(timings.tail_m) || 0) * meter.quarterBeatsPerMeasure;
    const sectionMeasures = getNonNegativeNumber(timings, "measures", 4);
    const sectionBeats = getNonNegativeNumber(timings, "beats", 0);
    const baseLoopBeats =
      (sectionMeasures * meter.quarterBeatsPerMeasure) + sectionBeats;

    const lineTimings = parseRecord(timings.line_timings);
    const hasLineOverrides = Object.keys(lineTimings).length > 0;
    const lineBeats: number[] = [];
    if (hasLineOverrides) {
      for (let lineIndex = 0; lineIndex < (lineCounts[sectionIndex] || 1); lineIndex++) {
        const line = parseRecord(lineTimings[String(lineIndex)]);
        const lineMultiplier = Math.max(0, Number(line.repeats) || 0) + 1;
        const duration =
          (getNonNegativeNumber(line, "measures", 0) * meter.quarterBeatsPerMeasure +
            getNonNegativeNumber(line, "beats", 0)) *
          lineMultiplier;
        lineBeats.push(duration);
      }
    }

    stampBeats(headBeats, sectionIndex);
    for (let pass = 0; pass < sectionMultiplier; pass++) {
      let passDuration = 0;
      if (hasLineOverrides) {
        for (const duration of lineBeats) {
          if (duration > 0) {
            stampBeats(duration, sectionIndex);
            passDuration += duration;
          }
        }
      }
      if (!hasLineOverrides || passDuration <= 0) stampBeats(baseLoopBeats, sectionIndex);
    }
    stampBeats(tailBeats, sectionIndex);
  });

  return { totalBeats: currentAbsoluteBeat, nodes, sectionStartBeats };
}

export function getTimelineLineStartBeat(
  sectionTimings: unknown,
  sectionName: string,
  lineCount: number,
  lineIndex: number
) {
  const safeLineCount = Math.max(1, Math.floor(lineCount));
  const safeLineIndex = Math.max(0, Math.min(safeLineCount - 1, Math.floor(lineIndex)));
  const meter = getTimelineMeter(sectionTimings);
  const timingRoot = parseRecord(sectionTimings);
  const timings = parseRecord(timingRoot[sectionName]);
  const headBeats = getNonNegativeNumber(timings, "head_m", 0) * meter.quarterBeatsPerMeasure;
  const baseLoopBeats =
    getNonNegativeNumber(timings, "measures", 4) * meter.quarterBeatsPerMeasure +
    getNonNegativeNumber(timings, "beats", 0);
  const lineTimings = parseRecord(timings.line_timings);
  const hasLineOverrides = Object.keys(lineTimings).length > 0;
  const lineBeats = Array.from({ length: safeLineCount }, (_, index) => {
    const line = parseRecord(lineTimings[String(index)]);
    const repeats = Math.max(0, Number(line.repeats) || 0);
    return (
      getNonNegativeNumber(line, "measures", 0) * meter.quarterBeatsPerMeasure +
      getNonNegativeNumber(line, "beats", 0)
    ) * (repeats + 1);
  });

  if (!hasLineOverrides || lineBeats.every((beats) => beats <= 0)) {
    return headBeats + (baseLoopBeats / safeLineCount) * safeLineIndex;
  }

  return headBeats + lineBeats.slice(0, safeLineIndex).reduce((total, beats) => total + beats, 0);
}

function parseRecord(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function getNonNegativeNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record[key];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

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
