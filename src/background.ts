// Service worker — calls Anthropic Messages API directly with user's BYOK key.
//
// WHY THIS PROXY EXISTS: Content scripts run in the page's origin (chatgpt.com).
// Even with host_permissions, Manifest V3 content scripts cannot make cross-origin
// fetches — the request is subject to the page's CSP. The service worker runs in
// the extension's own origin and is exempt from page CSP.

import { REDACTORS } from "./lib/registry";
import { SYSTEM_PROMPT } from "./lib/system-prompt";
import type { Mark } from "./lib/types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "analyze") return false;

  console.debug(`[redactor] sw: analyze request (${message.text.length} chars, redactors: ${message.redactors})`);

  chrome.storage.local.get(["anthropicApiKey"], (result) => {
    const apiKey = result.anthropicApiKey;
    if (!apiKey) {
      console.debug("[redactor] sw: no API key configured");
      logError("No API key configured");
      sendResponse({ marks: [], error: "No API key configured. Open the Redactor popup to add your Anthropic key." });
      return;
    }
    console.debug("[redactor] sw: calling Anthropic API...");
    analyzeWithAnthropic(apiKey, message.text, message.redactors)
      .then((marks) => {
        console.debug(`[redactor] sw: got ${marks.length} marks`);
        sendResponse({ marks });
      })
      .catch((err) => {
        console.debug("[redactor] sw: API error:", err.message);
        logError(err.message);
        sendResponse({ marks: [], error: err.message });
      });
  });

  return true; // async response
});

async function analyzeWithAnthropic(
  apiKey: string,
  text: string,
  redactorIds: string[]
): Promise<Mark[]> {
  const activeRedactors = REDACTORS.filter((r) => redactorIds.includes(r.id));
  if (activeRedactors.length === 0) return [];

  // Build a single prompt combining all active redactors
  const redactorInstructions = activeRedactors
    .map((r) => `## ${r.label} (id: "${r.id}")\n\n${r.prompt}`)
    .join("\n\n---\n\n");

  const userPrompt = `Analyze the following AI response for ALL categories above. For each match, include a "redactorId" field with the detector's id.

Return a single JSON array combining results from all categories. Each item: {"redactorId": "...", "text": "exact substring", "category": "...", "reason": "one sentence", "confidence": 0.0-1.0}

If clean, return []. Return ONLY the JSON array, no markdown fences.

---

${text}`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT + "\n\n" + redactorInstructions,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("Invalid API key");
    if (response.status === 429) throw new Error("Rate limited");
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "[]";

  // Extract JSON array — handle markdown fences, preamble text, or bare JSON
  let raw: unknown;
  try {
    // Try direct parse first (fastest path)
    raw = JSON.parse(content);
  } catch {
    // Strip markdown fences
    const defenced = content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    try {
      raw = JSON.parse(defenced);
    } catch {
      // Last resort: find first [ ... ] substring
      const start = content.indexOf("[");
      const end = content.lastIndexOf("]");
      if (start >= 0 && end > start) {
        try {
          raw = JSON.parse(content.slice(start, end + 1));
        } catch {
          logError("Unparseable response: " + content.slice(0, 200));
          throw new Error("API returned invalid JSON");
        }
      } else {
        logError("No JSON array in response: " + content.slice(0, 200));
        throw new Error("API returned invalid JSON");
      }
    }
  }

  if (!Array.isArray(raw)) {
    // If it's an object wrapping an array (e.g. {"results": [...]}), try to extract
    if (raw && typeof raw === "object") {
      const values = Object.values(raw as Record<string, unknown>);
      const arr = values.find(Array.isArray);
      if (arr) { raw = arr; }
      else { throw new Error("API response is not an array"); }
    } else {
      throw new Error("API response is not an array");
    }
  }

  // Convert to Mark[] with character offsets, validating each item
  const marks: Mark[] = [];
  let searchFrom = 0;

  for (const item of raw) {
    if (
      typeof item !== "object" || item === null ||
      typeof item.text !== "string" || item.text.length === 0 ||
      typeof item.category !== "string" ||
      typeof item.reason !== "string"
    ) continue; // skip malformed entries

    const idx = text.indexOf(item.text, searchFrom);
    if (idx === -1) continue;

    marks.push({
      redactorId: typeof item.redactorId === "string" ? item.redactorId : activeRedactors[0].id,
      start: idx,
      end: idx + item.text.length,
      text: item.text,
      category: item.category,
      reason: item.reason,
      confidence: typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.7,
    });

    searchFrom = idx + item.text.length;
  }

  return marks;
}

/** Append to the rolling error log in chrome.storage (max 50 entries). */
function logError(message: string): void {
  chrome.storage.local.get(["errorLog"], (result) => {
    const log: { ts: number; msg: string }[] = result.errorLog || [];
    log.push({ ts: Date.now(), msg: message });
    if (log.length > 50) log.splice(0, log.length - 50);
    chrome.storage.local.set({ errorLog: log });
  });
}

console.log("[redactor] service worker loaded");
