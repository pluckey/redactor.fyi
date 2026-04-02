/**
 * Corpus scoring harness.
 *
 * Runs each redactor against the corpus fixtures via the API,
 * compares output marks to human annotations, reports precision,
 * recall, and consistency.
 *
 * Usage: ANTHROPIC_API_KEY=... npx tsx redactor.fyi/test/score.ts
 */

import { CORPUS } from "./corpus/fixtures";
import type { Annotation } from "./corpus/schema";

const API_URL = process.env.API_URL || "http://localhost:3000/api/analyze";

interface ApiMark {
  redactorId: string;
  start: number;
  end: number;
  text: string;
  category: string;
  reason: string;
  confidence: number;
}

async function analyzeText(text: string, redactors: string[]): Promise<ApiMark[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, redactors }),
  });
  const data = await res.json();
  return data.marks || [];
}

function overlapRatio(a: { start: number; end: number }, b: { start: number; end: number }): number {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);
  if (overlapStart >= overlapEnd) return 0;
  const overlapLen = overlapEnd - overlapStart;
  const unionLen = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return overlapLen / unionLen;
}

function matchMarks(
  apiMarks: ApiMark[],
  annotations: Annotation[]
): { truePos: number; falsePos: number; falseNeg: number } {
  const matched = new Set<number>();
  let truePos = 0;
  let falsePos = 0;

  for (const mark of apiMarks) {
    let found = false;
    for (let i = 0; i < annotations.length; i++) {
      if (matched.has(i)) continue;
      if (mark.redactorId !== annotations[i].redactorId) continue;
      if (overlapRatio(mark, annotations[i]) > 0.3) {
        truePos++;
        matched.add(i);
        found = true;
        break;
      }
    }
    if (!found) falsePos++;
  }

  const falseNeg = annotations.length - matched.size;
  return { truePos, falsePos, falseNeg };
}

async function main() {
  const redactors = ["sycophancy", "vacuity", "hedging"];
  let totalTP = 0, totalFP = 0, totalFN = 0;

  for (const fixture of CORPUS) {
    const marks = await analyzeText(fixture.text, redactors);
    const { truePos, falsePos, falseNeg } = matchMarks(marks, fixture.annotations);
    totalTP += truePos;
    totalFP += falsePos;
    totalFN += falseNeg;

    const precision = truePos + falsePos > 0 ? truePos / (truePos + falsePos) : 1;
    const recall = truePos + falseNeg > 0 ? truePos / (truePos + falseNeg) : 1;
    const status = falsePos === 0 && falseNeg === 0 ? "PASS" :
                   fixture.annotations.length === 0 && marks.length > 0 ? "FALSE_POS" :
                   falseNeg > 0 ? "MISS" : "EXTRA";

    console.log(`[${status}] ${fixture.id}: P=${precision.toFixed(2)} R=${recall.toFixed(2)} (TP=${truePos} FP=${falsePos} FN=${falseNeg})`);

    if (falsePos > 0) {
      const unmatched = marks.filter((m) =>
        !fixture.annotations.some((a) => a.redactorId === m.redactorId && overlapRatio(m, a) > 0.3)
      );
      for (const u of unmatched) {
        console.log(`  EXTRA: [${u.redactorId}] "${u.text.slice(0, 60)}"`);
      }
    }
    if (falseNeg > 0) {
      const missed = fixture.annotations.filter((a, i) =>
        !marks.some((m) => m.redactorId === a.redactorId && overlapRatio(m, a) > 0.3)
      );
      for (const m of missed) {
        console.log(`  MISSED: [${m.redactorId}] chars ${m.start}-${m.end}`);
      }
    }
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`CORPUS: ${CORPUS.length} fixtures`);
  console.log(`PRECISION: ${(precision * 100).toFixed(1)}% (${totalTP}/${totalTP + totalFP})`);
  console.log(`RECALL: ${(recall * 100).toFixed(1)}% (${totalTP}/${totalTP + totalFN})`);
  console.log(`TARGET: Precision >= 70%, Recall informational`);
  console.log(`${"=".repeat(50)}`);
}

main().catch(console.error);
