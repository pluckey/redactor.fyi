import type { Mark, OffsetEntry, DisplayMode } from "../lib/types";
import { getRedactor } from "../lib/registry";
import { injectStyles } from "./styles";
import { showTooltip, hideTooltip, hideTooltipImmediate } from "./tooltip";

/**
 * Mark renderer — creates a shadow overlay layer per response.
 * NEVER modifies ChatGPT's DOM tree.
 *
 * Tracks render args per container so overlays can be re-rendered
 * when layout changes (resize, scroll, streaming).
 */

const OVERLAY_CLASS = "redactor-overlay";

interface RenderState {
  container: Element;
  marks: Mark[];
  entries: OffsetEntry[];
  mode: DisplayMode;
}

const renderRegistry = new Map<Element, RenderState>();

function createDOMRange(entries: OffsetEntry[], start: number, end: number): Range | null {
  const range = document.createRange();
  let startSet = false;

  for (const entry of entries) {
    const entryEnd = entry.start + entry.length;

    if (!startSet && start >= entry.start && start < entryEnd) {
      range.setStart(entry.node, start - entry.start);
      startSet = true;
    }

    if (startSet && end > entry.start && end <= entryEnd) {
      range.setEnd(entry.node, end - entry.start);
      return range;
    }
  }

  return startSet ? range : null;
}

interface PlacedMark {
  el: HTMLElement;
  mark: Mark;
  color: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const REVEALED_CLASS = "redactor-mark--revealed";

function rectsOverlap(a: PlacedMark, b: PlacedMark): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function paintOverlay(state: RenderState): void {
  const { container, marks, entries, mode } = state;

  hideTooltipImmediate();

  // Remove existing overlay
  const existing = container.querySelector(`.${OVERLAY_CLASS}`);
  if (existing) existing.remove();

  if (!marks || marks.length === 0) return;

  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;

  const containerRect = container.getBoundingClientRect();
  const placed: PlacedMark[] = [];

  // First pass: create all mark divs and record positions
  for (const mark of marks) {
    const domRange = createDOMRange(entries, mark.start, mark.end);
    if (!domRange) continue;

    const rects = domRange.getClientRects();
    const color = getRedactor(mark.redactorId)?.color ?? "#888";

    for (const rect of rects) {
      const el = document.createElement("div");
      el.className = `redactor-mark redactor-mark--${mode}`;

      const left = rect.left - containerRect.left;
      const top = rect.top - containerRect.top;

      el.style.cssText =
        `left:${left}px;` +
        `top:${top}px;` +
        `width:${rect.width}px;` +
        `height:${rect.height}px;` +
        `--redact-color:${color};`;

      overlay.appendChild(el);
      placed.push({ el, mark, color, left, top, right: left + rect.width, bottom: top + rect.height });
    }
  }

  // Second pass: compute overlap neighbors and wire up events
  for (const pm of placed) {
    const neighbors = placed.filter((other) => other !== pm && rectsOverlap(pm, other));

    pm.el.addEventListener("mouseenter", () => {
      for (const n of neighbors) n.el.classList.add(REVEALED_CLASS);
      showTooltip(pm.mark, pm.color, pm.el.getBoundingClientRect());
    });
    pm.el.addEventListener("mouseleave", () => {
      for (const n of neighbors) n.el.classList.remove(REVEALED_CLASS);
      hideTooltip();
    });
  }

  (container as HTMLElement).style.position = "relative";
  container.appendChild(overlay);
}

// --- Layout change detection ---

let rerenderRaf: number | null = null;

function scheduleRerender() {
  if (rerenderRaf) return;
  rerenderRaf = requestAnimationFrame(() => {
    rerenderRaf = null;
    for (const state of renderRegistry.values()) {
      // Prune containers removed from DOM (SPA navigation)
      if (!state.container.isConnected) {
        renderRegistry.delete(state.container);
        resizeObserver.unobserve(state.container);
        contentObservers.get(state.container)?.disconnect();
        contentObservers.delete(state.container);
        continue;
      }
      paintOverlay(state);
    }
  });
}

const resizeObserver = new ResizeObserver(scheduleRerender);

// Per-container MutationObserver — catches DOM changes inside responses
// (code block expand/collapse, image lazy-load, "Show more" expansion)
const contentObservers = new Map<Element, MutationObserver>();

function observeContent(container: Element): void {
  if (contentObservers.has(container)) return;
  const mo = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own overlay manipulation
    const dominated = mutations.every((m) => {
      if (m.type === "childList") {
        const isOverlay = (n: Node) =>
          n instanceof HTMLElement && n.classList.contains(OVERLAY_CLASS);
        return [...m.addedNodes].every(isOverlay) || [...m.removedNodes].every(isOverlay);
      }
      return false;
    });
    if (!dominated) scheduleRerender();
  });
  mo.observe(container, { childList: true, subtree: true, characterData: true });
  contentObservers.set(container, mo);
}

// Attach scroll listener once to the main scroll container
let scrollBound = false;
function bindScroll() {
  if (scrollBound) return;
  scrollBound = true;
  const scrollContainer = document.querySelector("main") || document.body;
  scrollContainer.addEventListener("scroll", scheduleRerender, { passive: true });
}

// --- Public API ---

export function renderMarks(
  container: Element,
  marks: Mark[],
  entries: OffsetEntry[],
  displayMode: DisplayMode = "underline"
): void {
  injectStyles();
  const state: RenderState = { container, marks, entries, mode: displayMode };
  renderRegistry.set(container, state);
  resizeObserver.observe(container);
  observeContent(container);
  bindScroll();
  paintOverlay(state);
}

export function clearMarks(container: Element): void {
  renderRegistry.delete(container);
  resizeObserver.unobserve(container);
  contentObservers.get(container)?.disconnect();
  contentObservers.delete(container);
  const existing = container.querySelector(`.${OVERLAY_CLASS}`);
  if (existing) existing.remove();
}

/** Remove all overlays and release all observers. Used on SPA navigation. */
export function clearAll(): void {
  for (const [container] of renderRegistry) {
    resizeObserver.unobserve(container);
    const existing = container.querySelector(`.${OVERLAY_CLASS}`);
    if (existing) existing.remove();
  }
  renderRegistry.clear();
  for (const mo of contentObservers.values()) mo.disconnect();
  contentObservers.clear();
}
