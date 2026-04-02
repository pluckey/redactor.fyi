import type { Mark } from "./types";

/**
 * Overlap resolver — when two marks from different redactors overlap,
 * keeps the higher-confidence mark. Splits partially overlapping marks
 * rather than discarding entire marks.
 */
export function resolveOverlaps(marks: Mark[]): Mark[] {
  if (marks.length <= 1) return marks;

  // Sort by start position
  const sorted = [...marks].sort((a, b) => a.start - b.start || b.confidence - a.confidence);
  const result: Mark[] = [];

  for (const mark of sorted) {
    if (result.length === 0) {
      result.push(mark);
      continue;
    }

    const last = result[result.length - 1];

    // No overlap
    if (mark.start >= last.end) {
      result.push(mark);
      continue;
    }

    // Overlap — higher confidence wins the overlapping region
    if (mark.confidence > last.confidence) {
      // Truncate the previous mark to end where this one starts
      if (mark.start > last.start) {
        last.end = mark.start;
      } else {
        // Complete overlap, remove last
        result.pop();
      }
      result.push(mark);
    } else {
      // Previous mark wins — truncate new mark if it extends beyond
      if (mark.end > last.end) {
        result.push({
          ...mark,
          start: last.end,
          text: mark.text.slice(last.end - mark.start),
        });
      }
      // Otherwise new mark is fully contained, drop it
    }
  }

  return result.filter((m) => m.end > m.start);
}
