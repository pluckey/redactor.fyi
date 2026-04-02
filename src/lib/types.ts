/**
 * Shared types for the Redactor extension.
 *
 * OFFSET INVARIANT: `start` and `end` are zero-indexed character offsets
 * into the plain text string returned by SiteAdapter.extractText().
 * All components (extractor, API, renderer) share this coordinate system.
 */

// --- Redactor definitions ---

export interface RedactorDefinition {
  id: string;
  label: string;
  prompt: string;
  category: string;
  color: string;
  description: string;
  /** Maps category → citation source for tooltip display */
  sources?: Record<string, string>;
}

// --- Marks ---

export interface Mark {
  redactorId: string;
  /** Start character offset into extracted plain text */
  start: number;
  /** End character offset into extracted plain text */
  end: number;
  text: string;
  category: string;
  reason: string;
  /** 0-1 confidence score. Higher = more confident detection. */
  confidence: number;
}

// --- Text extraction ---

export interface OffsetEntry {
  node: Text;
  /** Character offset where this text node begins in the full extracted text */
  start: number;
  length: number;
}

export interface ExtractionResult {
  text: string;
  entries: OffsetEntry[];
}

// --- Site adapter ---

export interface SiteAdapter {
  /** CSS selector for AI response containers */
  responseSelector: string;
  /** Extract plain text + offset map from a response container */
  extractText(container: Element): ExtractionResult;
  /** Attribute name used to track processed state */
  processedAttr: string;
}

// --- API communication ---

export interface AnalysisRequest {
  text: string;
  redactors: string[];
}

export interface AnalysisResponse {
  marks: Mark[];
  error?: string;
}

// --- Extension state ---

export type DisplayMode = "underline" | "highlight" | "redact";

export type AnalysisStatus = "pending" | "analyzing" | "clean" | "marked" | "error" | "rate-limited";

/** Known AI domains that auto-activate scanning. */
export const AI_DOMAINS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "poe.com": "Poe",
};

/** Shape of chrome.storage.local — shared by popup and content script. */
export interface StorageSchema {
  schemaVersion: number;
  displayMode: DisplayMode;
  enabledRedactors: Record<string, boolean>;
  anthropicApiKey: string;
  /** Which domains are enabled — keys from AI_DOMAINS plus "all" */
  enabledDomains: Record<string, boolean>;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const STORAGE_DEFAULTS: StorageSchema = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  displayMode: "highlight",
  enabledRedactors: { sycophancy: true },
  anthropicApiKey: "",
  enabledDomains: {
    "chatgpt.com": true,
    "claude.ai": true,
    "gemini.google.com": true,
    "copilot.microsoft.com": true,
    "poe.com": true,
    all: false,
  },
};

// --- Message passing (content script <-> service worker) ---

export interface AnalyzeMessage {
  type: "analyze";
  text: string;
  redactors: string[];
}

export type ExtensionMessage = AnalyzeMessage;
