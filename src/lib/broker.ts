import type { Mark, AnalysisResponse } from "./types";

/**
 * Analysis broker — manages API communication, two-tier cache (in-memory L1
 * + chrome.storage L2), circuit breaker, and request queue with concurrency
 * control.
 *
 * Content script calls broker.analyze(), broker handles the rest.
 */

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

const MAX_L1_SIZE = 128;
const MAX_L2_SIZE = 512;
const L2_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CONCURRENT = 2;
const INTER_REQUEST_MS = 500;

const L2_STORAGE_KEY = "analysisCache";

let failureCount = 0;
let circuitOpenUntil = 0;

/* ── L1: in-memory cache (session-lived) ─────────────────────── */

const l1 = new Map<string, Mark[]>();

function l1Set(key: string, value: Mark[]) {
  if (l1.size >= MAX_L1_SIZE) {
    const oldest = l1.keys().next().value;
    if (oldest !== undefined) l1.delete(oldest);
  }
  l1.set(key, value);
}

/* ── L2: chrome.storage persistent cache ─────────────────────── */

interface L2Entry {
  marks: Mark[];
  ts: number;
}

async function l2Get(hash: string): Promise<Mark[] | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get([L2_STORAGE_KEY], (result) => {
      const store: Record<string, L2Entry> = result[L2_STORAGE_KEY] || {};
      const entry = store[hash];
      if (!entry) return resolve(undefined);
      if (Date.now() - entry.ts > L2_TTL_MS) return resolve(undefined);
      resolve(entry.marks);
    });
  });
}

function l2Set(hash: string, marks: Mark[]): void {
  chrome.storage.local.get([L2_STORAGE_KEY], (result) => {
    const store: Record<string, L2Entry> = result[L2_STORAGE_KEY] || {};
    store[hash] = { marks, ts: Date.now() };

    // Evict oldest if over limit
    const keys = Object.keys(store);
    if (keys.length > MAX_L2_SIZE) {
      keys
        .sort((a, b) => store[a].ts - store[b].ts)
        .slice(0, keys.length - MAX_L2_SIZE)
        .forEach((k) => delete store[k]);
    }

    chrome.storage.local.set({ [L2_STORAGE_KEY]: store });
  });
}

/* ── Request queue ───────────────────────────────────────────── */

interface QueueEntry {
  text: string;
  redactors: string[];
  hash: string;
  resolve: (result: BrokerResult) => void;
}

const queue: QueueEntry[] = [];
let inflight = 0;

function drain(): void {
  while (inflight < MAX_CONCURRENT && queue.length > 0) {
    const entry = queue.shift()!;
    inflight++;
    executeRequest(entry)
      .then(entry.resolve)
      .finally(() => {
        inflight--;
        if (queue.length > 0) {
          setTimeout(drain, INTER_REQUEST_MS);
        }
      });
  }
}

/* ── Helpers ─────────────────────────────────────────────────── */

async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type BrokerResult =
  | { status: "marks"; marks: Mark[] }
  | { status: "clean" }
  | { status: "circuit-open" }
  | { status: "error"; message: string };

function marksResult(marks: Mark[]): BrokerResult {
  return marks.length > 0 ? { status: "marks", marks } : { status: "clean" };
}

/* ── Core request execution (no queuing) ─────────────────────── */

async function executeRequest(entry: QueueEntry): Promise<BrokerResult> {
  try {
    const response: AnalysisResponse = await chrome.runtime.sendMessage({
      type: "analyze",
      text: entry.text,
      redactors: entry.redactors,
    });

    if (response.error) {
      failureCount++;
      if (failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      }
      return { status: "error", message: response.error };
    }

    failureCount = 0;

    const marks = response.marks || [];
    l1Set(entry.hash, marks);
    l2Set(entry.hash, marks);

    return marksResult(marks);
  } catch (err: unknown) {
    failureCount++;
    if (failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    }
    return { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

/* ── Public API ──────────────────────────────────────────────── */

export async function analyze(
  text: string,
  redactors: string[]
): Promise<BrokerResult> {
  // Circuit breaker check
  if (failureCount >= CIRCUIT_BREAKER_THRESHOLD && Date.now() < circuitOpenUntil) {
    return { status: "circuit-open" };
  }

  const hash = await hashText(text);

  // L1 check (sync, fast)
  const l1Hit = l1.get(hash);
  if (l1Hit) return marksResult(l1Hit);

  // L2 check (async, survives refresh)
  const l2Hit = await l2Get(hash);
  if (l2Hit) {
    l1Set(hash, l2Hit); // promote to L1
    return marksResult(l2Hit);
  }

  // Cache miss — enqueue API call
  return new Promise<BrokerResult>((resolve) => {
    queue.push({ text, redactors, hash, resolve });
    drain();
  });
}
