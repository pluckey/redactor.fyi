import type { Mark } from "./types";

/**
 * Density ceiling — drops lowest-confidence marks until total character
 * coverage is below maxCoverage. Prevents wall-to-wall marking that
 * collapses the figure/ground distinction.
 */
export function applyCeiling(
  marks: Mark[],
  textLength: number,
  maxCoverage: number = 0.4
): Mark[] {
  if (marks.length === 0 || textLength === 0) return marks;

  const totalCoverage = marks.reduce((s, m) => s + (m.end - m.start), 0);
  if (totalCoverage / textLength <= maxCoverage) return marks;

  // Sort by confidence ascending — drop lowest first
  const sorted = [...marks].sort((a, b) => a.confidence - b.confidence);
  const kept: Mark[] = [];
  let coverage = 0;
  const maxChars = textLength * maxCoverage;

  // Add marks from highest confidence down
  for (let i = sorted.length - 1; i >= 0; i--) {
    const mark = sorted[i];
    const markLen = mark.end - mark.start;
    if (coverage + markLen <= maxChars) {
      kept.push(mark);
      coverage += markLen;
    }
  }

  return kept.sort((a, b) => a.start - b.start);
}
