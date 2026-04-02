/**
 * Corpus annotation schema.
 *
 * Each fixture is an AI response with human-annotated spans marking
 * low-density patterns. The corpus is the quality backbone:
 * new redactor prompts are measured against it before merge.
 */

export interface Annotation {
  /** Start character offset */
  start: number;
  /** End character offset */
  end: number;
  /** Which redactor should catch this */
  redactorId: "sycophancy" | "vacuity" | "hedging";
  /** Human-assigned category label */
  category: string;
}

export interface CorpusFixture {
  /** Unique identifier */
  id: string;
  /** Source description (e.g., "ChatGPT-4o, March 2026") */
  source: string;
  /** The full AI response text */
  text: string;
  /** Human-annotated spans */
  annotations: Annotation[];
  /** Tags for filtering (e.g., "genuine-hedging", "code-block", "mixed-format") */
  tags: string[];
}
