/**
 * Main content script — generic text block scanner.
 *
 * Runs on all pages. Checks domain toggles to decide whether to activate.
 * Scans for substantial text blocks via MutationObserver, analyzes them,
 * and renders marks. No site-specific selectors — works on any AI chat.
 *
 * Site-specific adapters (src/adapters/) are preserved for future use
 * but not wired up here.
 */

import { analyze } from "../lib/broker";
import { applyCeiling } from "../lib/ceiling";
import { resolveOverlaps } from "../lib/overlap";
import { renderMarks, clearAll as clearAllOverlays } from "./renderer";
import { setStatus } from "./status";
import type { DisplayMode, StorageSchema, OffsetEntry, Mark } from "../lib/types";
import { AI_DOMAINS, STORAGE_DEFAULTS } from "../lib/types";

/* ── Policy constants ─────────────────────────────────────────── */
const MIN_TEXT_LENGTH = 100;
const PROCESSED_ATTR = "data-redactor-len";
const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 5000;

/* ── State ────────────────────────────────────────────────────── */
let displayMode: DisplayMode = STORAGE_DEFAULTS.displayMode;
let enabledRedactors: Record<string, boolean> = { ...STORAGE_DEFAULTS.enabledRedactors };
let enabledDomains: Record<string, boolean> = { ...STORAGE_DEFAULTS.enabledDomains };
let active = false;
let lastUrl = location.href;

function activeRedactorIds(): string[] {
  return Object.entries(enabledRedactors)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/** Check if the current page's domain is enabled. */
function shouldActivate(): boolean {
  if (enabledDomains.all) return true;
  const host = location.hostname.replace(/^www\./, "");
  return !!enabledDomains[host];
}

/* ── Settings ─────────────────────────────────────────────────── */

chrome.storage.local.get(
  ["schemaVersion", "displayMode", "enabledRedactors", "enabledDomains"] satisfies (keyof StorageSchema)[],
  (result: Partial<StorageSchema>) => {
    if (result.displayMode) displayMode = result.displayMode;
    if (result.enabledRedactors) enabledRedactors = result.enabledRedactors;
    if (result.enabledDomains) enabledDomains = result.enabledDomains;
    active = shouldActivate();
    console.debug("[redactor] settings loaded:", {
      displayMode,
      redactors: activeRedactorIds(),
      domain: location.hostname,
      active,
    });
    if (active) {
      startObserver();
      scanTextBlocks();
    }
  }
);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.displayMode) displayMode = changes.displayMode.newValue;
  if (changes.enabledRedactors) enabledRedactors = changes.enabledRedactors.newValue;
  if (changes.enabledDomains) {
    enabledDomains = changes.enabledDomains.newValue;
    const wasActive = active;
    active = shouldActivate();
    if (active && !wasActive) {
      startObserver();
      scanTextBlocks();
    } else if (!active && wasActive) {
      stopObserver();
      resetAll();
    }
  }
  if (active) resetAll();
});

/* ── Generic text extraction ──────────────────────────────────── */

function extractText(container: Element): { text: string; entries: OffsetEntry[] } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const entries: OffsetEntry[] = [];
  let offset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent;
    if (!text) continue;
    entries.push({ node, start: offset, length: text.length });
    offset += text.length;
  }

  const text = entries.map((e) => e.node.textContent).join("");
  return { text, entries };
}

/**
 * Find substantial text blocks on the page.
 * Returns elements that contain enough text to be worth analyzing.
 */
function findTextBlocks(): Element[] {
  // Look for common content containers — paragraphs, articles, divs with prose
  const candidates = document.querySelectorAll(
    "article, [class*='message'], [class*='response'], [class*='answer'], " +
    "[class*='markdown'], [class*='prose'], [data-message-id], " +
    "[class*='Message'], [class*='Response'], [class*='conversation-turn']"
  );

  const blocks: Element[] = [];
  const seen = new Set<Element>();

  for (const el of candidates) {
    // Skip if a parent is already in the list
    let dominated = false;
    for (const s of seen) {
      if (s.contains(el)) { dominated = true; break; }
    }
    if (dominated) continue;

    // Skip tiny blocks
    const len = el.textContent?.length ?? 0;
    if (len < MIN_TEXT_LENGTH) continue;

    // Skip if this element is our own overlay
    if (el.classList.contains("redactor-overlay") || el.classList.contains("redactor-gutter")) continue;

    // Remove children that are already in the set (prefer larger containers)
    for (const s of seen) {
      if (el.contains(s)) {
        seen.delete(s);
        blocks.splice(blocks.indexOf(s), 1);
      }
    }

    seen.add(el);
    blocks.push(el);
  }

  // Fallback: if nothing found via classes, look for any large text containers
  if (blocks.length === 0) {
    const allDivs = document.querySelectorAll("main p, main div, section p, section div");
    for (const el of allDivs) {
      const len = el.textContent?.length ?? 0;
      if (len >= MIN_TEXT_LENGTH && el.children.length <= 3) {
        // Leaf-ish div with lots of text
        let dominated = false;
        for (const s of seen) {
          if (s.contains(el) || el.contains(s)) { dominated = true; break; }
        }
        if (!dominated) {
          seen.add(el);
          blocks.push(el);
        }
      }
      if (blocks.length >= 50) break; // sanity cap
    }
  }

  return blocks;
}

/* ── SPA navigation cleanup ───────────────────────────────────── */

function resetAll(): void {
  clearAllOverlays();
  document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => {
    el.removeAttribute(PROCESSED_ATTR);
  });
  if (active) scanTextBlocks();
}

function checkNavigation(): void {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.debug("[redactor] navigation detected, resetting");
    resetAll();
  }
}

/* ── Sentence chunking (Intl.Segmenter) ──────────────────────── */

const SENTENCES_PER_CHUNK = 4;
const MIN_CHUNK_TAIL = 60;

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

interface TextChunk {
  start: number;
  end: number;
  text: string;
}

/**
 * Split text into groups of ~4 sentences using Intl.Segmenter.
 * Handles abbreviations (Mr., Dr., U.S.), decimals, and ellipses
 * correctly — no false splits on "3.14" or "e.g.".
 */
function chunkText(text: string): TextChunk[] {
  const sentences = [...segmenter.segment(text)];

  if (sentences.length <= SENTENCES_PER_CHUNK) {
    return [{ start: 0, end: text.length, text }];
  }

  const chunks: TextChunk[] = [];

  for (let i = 0; i < sentences.length; i += SENTENCES_PER_CHUNK) {
    const group = sentences.slice(i, i + SENTENCES_PER_CHUNK);
    const start = group[0].index;
    const last = group[group.length - 1];
    const end = last.index + last.segment.length;
    chunks.push({ start, end, text: text.slice(start, end) });
  }

  // Merge short tail into preceding chunk
  if (chunks.length > 1) {
    const tail = chunks[chunks.length - 1];
    if (tail.text.trim().length < MIN_CHUNK_TAIL) {
      const prev = chunks[chunks.length - 2];
      prev.end = tail.end;
      prev.text = text.slice(prev.start, tail.end);
      chunks.pop();
    }
  }

  return chunks;
}

/* ── Analysis pipeline ────────────────────────────────────────── */

async function analyzeBlock(container: Element): Promise<void> {
  try {
    const { text, entries } = extractText(container);
    if (text.length < MIN_TEXT_LENGTH) return;

    const prevLen = container.getAttribute(PROCESSED_ATTR);
    const currentLen = text.length;

    // Skip if already processed at roughly the same length
    if (prevLen && parseInt(prevLen) > currentLen * 0.9) return;

    const blockId = container.getAttribute("data-message-id")
      || container.id
      || container.tagName.toLowerCase() + ":" + text.slice(0, 20).replace(/\s+/g, "_");

    container.setAttribute(PROCESSED_ATTR, currentLen.toString());
    setStatus(container, "analyzing");

    const retry = () => {
      container.removeAttribute(PROCESSED_ATTR);
      analyzeBlock(container);
    };

    const chunks = chunkText(text);
    const redactors = activeRedactorIds();

    console.debug(`[redactor] analyzing "${blockId}" (${text.length} chars, ${chunks.length} chunk${chunks.length > 1 ? "s" : ""})`);

    // Analyze all chunks — broker queue handles concurrency
    const results = await Promise.all(
      chunks.map((chunk) =>
        analyze(chunk.text, redactors).then((result) => ({ chunk, result }))
      )
    );

    // Merge marks, shifting offsets to full-text coordinate space
    const allMarks: Mark[] = [];
    let anyError = false;

    for (const { chunk, result } of results) {
      if (result.status === "marks") {
        for (const mark of result.marks) {
          allMarks.push({
            ...mark,
            start: mark.start + chunk.start,
            end: mark.end + chunk.start,
          });
        }
      } else if (result.status === "error" || result.status === "circuit-open") {
        anyError = true;
      }
    }

    if (allMarks.length > 0) {
      let marks = resolveOverlaps(allMarks);
      marks = applyCeiling(marks, text.length);
      console.debug(`[redactor] ${blockId}: ${marks.length} marks`, marks.map(m => `${m.redactorId}:${m.category} "${m.text.slice(0, 40)}"`));
      renderMarks(container, marks, entries, displayMode);
      setStatus(container, "marked");
    } else if (anyError) {
      console.debug(`[redactor] ${blockId}: error in ${results.filter(r => r.result.status === "error" || r.result.status === "circuit-open").length}/${chunks.length} chunks`);
      setStatus(container, "error", retry);
    } else {
      console.debug(`[redactor] ${blockId}: clean`);
      setStatus(container, "clean");
    }
  } catch (err) {
    console.error("[redactor] analyzeBlock error:", err);
    setStatus(container, "error", () => {
      container.removeAttribute(PROCESSED_ATTR);
      analyzeBlock(container);
    });
  }
}

function scanTextBlocks(): void {
  try {
    checkNavigation();
    const blocks = findTextBlocks();
    if (blocks.length > 0) {
      console.debug(`[redactor] scan: ${blocks.length} text block(s) found`);
    }
    for (const el of blocks) {
      const prevLen = el.getAttribute(PROCESSED_ATTR);
      const currentLen = el.textContent?.length ?? 0;
      if (!prevLen || currentLen > parseInt(prevLen) * 1.1) {
        analyzeBlock(el);
      }
    }
  } catch (err) {
    console.error("[redactor] scanTextBlocks error:", err);
  }
}

/* ── Observer with debounce + max wait ────────────────────────── */

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastScanTime = 0;
let observer: MutationObserver | null = null;

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);

    const now = Date.now();
    if (now - lastScanTime > MAX_WAIT_MS) {
      lastScanTime = now;
      scanTextBlocks();
      return;
    }

    debounceTimer = setTimeout(() => {
      lastScanTime = Date.now();
      scanTextBlocks();
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  lastScanTime = Date.now();
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
}

console.log("[redactor] content script loaded —", location.hostname);
