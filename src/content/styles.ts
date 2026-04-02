/**
 * Injected stylesheet for all redactor UI — marks, tooltips, status dots.
 * Uses .redactor- namespace to avoid collisions with host page styles.
 * Injected once into <head> on first render.
 */

const STYLE_ID = "redactor-styles";

const CSS = /* css */ `
/* ── Overlay container ────────────────────────────────────── */
.redactor-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}

/* ── Mark base ────────────────────────────────────────────── */
.redactor-mark {
  position: absolute;
  pointer-events: auto;
  cursor: help;
}

/* ── Display modes ────────────────────────────────────────── */
.redactor-mark--highlight {
  background: var(--redact-color);
  opacity: 0.25;
  transition: opacity 0.15s;
}
.redactor-mark--highlight:hover {
  opacity: 0.4;
}

.redactor-mark--redact {
  background: var(--redact-color);
  opacity: 1;
  transition: opacity 0.15s;
}
.redactor-mark--redact:hover,
.redactor-mark--redact.redactor-mark--revealed {
  opacity: 0;
}

.redactor-mark--highlight.redactor-mark--revealed {
  opacity: 0.4;
}

.redactor-mark--underline {
  border-bottom: 2px solid var(--redact-color);
  box-sizing: border-box;
}

/* ── Tooltip ──────────────────────────────────────────────── */
#redactor-tooltip {
  position: fixed;
  background: #1a1a1a;
  color: #aaa;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  max-width: 300px;
  z-index: 10000;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  display: none;
}

.redactor-tooltip-label {
  font-weight: 600;
  font-size: 11px;
  margin-bottom: 2px;
}

.redactor-tooltip-source {
  font-size: 9px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.redactor-tooltip-reason {
  color: #ccc;
  font-size: 11px;
  line-height: 1.5;
}

/* ── Status gutter ────────────────────────────────────────── */
.redactor-gutter {
  position: absolute;
  top: 0;
  left: -6px;
  width: 3px;
  height: 100%;
  border-radius: 2px;
  z-index: 1001;
  transition: opacity 0.3s, background 0.3s;
}

.redactor-gutter--analyzing {
  background: repeating-linear-gradient(
    -45deg,
    #d4a017 0px,
    #d4a017 4px,
    transparent 4px,
    transparent 8px
  );
  background-size: 11.3px 11.3px;
  animation: redactor-barber 0.6s linear infinite;
}

.redactor-gutter--clean {
  background: #27ae60;
  opacity: 0.35;
}

.redactor-gutter--marked {
  background: #d4a017;
  opacity: 0.5;
}

.redactor-gutter--error {
  background: repeating-linear-gradient(
    -45deg,
    #d4a017 0px,
    #d4a017 4px,
    #111 4px,
    #111 8px
  );
  background-size: 11.3px 11.3px;
  cursor: pointer;
  pointer-events: auto;
}

.redactor-gutter--error:hover {
  opacity: 1;
}

@keyframes redactor-barber {
  0% { background-position: 0 0; }
  100% { background-position: 11.3px 0; }
}
`;

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
}
