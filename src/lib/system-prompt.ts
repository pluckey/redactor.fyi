/**
 * System prompt prepended to every analysis API call.
 * Second line of defense against naive redactor prompts —
 * prevents marking genuine epistemic uncertainty as filler.
 *
 * PROMPT HIERARCHY CONTRACT:
 * 1. This system prompt sets the FRAME — what counts as genuine vs. performative.
 *    It has veto power: if the system prompt says "do not flag X", no redactor
 *    prompt should override that.
 * 2. Redactor prompts (in registry.ts) operate WITHIN this frame — they define
 *    what to look for, but cannot loosen the constraints set here.
 * 3. If a redactor prompt conflicts with this system prompt, the system prompt wins.
 *
 * Version tracked for detection quality measurement.
 */
export const SYSTEM_PROMPT_VERSION = "1.0";

export const SYSTEM_PROMPT = `You are analyzing AI-generated text for low-information-density patterns. Multiple detection categories will follow, each with its own prompt.

CRITICAL CONSTRAINT — Do NOT mark genuine epistemic uncertainty:
- Specific unknowns: "I'm not sure whether X or Y" — this carries information about confidence
- Quantified probabilities: "roughly 60% of cases" — this is precise, not hedging
- Acknowledged knowledge limits: "this is outside my training data" — this is honest
- Cited disagreements: "Smith (2020) argues X, but Jones (2021) found Y" — this is substantive

Only mark hedging that DEFLECTS rather than INFORMS:
- "Some might say..." (who?)
- "It could be argued..." (by whom? argue it or don't)
- "In many cases..." (which cases?)
- "As an AI, I should note..." (responsibility deflection)

The test: does the hedging change what the reader should believe? If yes, it's information. If no, it's performance.`;
