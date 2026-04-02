/**
 * Tooltip module — owns creation, positioning, content, show/hide.
 * Anchored below the hovered mark, left-aligned to it.
 */

import type { Mark } from "../lib/types";
import { getRedactor } from "../lib/registry";

const TOOLTIP_ID = "redactor-tooltip";
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function getEl(): HTMLElement {
  let el = document.getElementById(TOOLTIP_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOOLTIP_ID;
    document.body.appendChild(el);
  }
  return el;
}

export function showTooltip(mark: Mark, color: string, anchor: DOMRect): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  const tip = getEl();
  tip.textContent = "";

  const def = getRedactor(mark.redactorId);
  const source = def?.sources?.[mark.category];

  // Label — bold, colored (matches website: category name first)
  const label = document.createElement("div");
  label.className = "redactor-tooltip-label";
  label.style.color = color;
  label.textContent = def?.label ?? mark.redactorId;
  tip.appendChild(label);

  // Source citation
  if (source) {
    const src = document.createElement("div");
    src.className = "redactor-tooltip-source";
    src.textContent = (mark.category || "") + " \u00B7 " + source;
    tip.appendChild(src);
  }

  // Reason — muted
  const reason = document.createElement("div");
  reason.className = "redactor-tooltip-reason";
  reason.textContent = mark.reason;
  tip.appendChild(reason);

  // Show to measure, then position
  tip.style.display = "block";
  const tipRect = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Below the mark, left-aligned
  let left = anchor.left;
  let top = anchor.bottom + 6;

  // Flip above if it would overflow the viewport bottom
  if (top + tipRect.height > vh - 8) {
    top = anchor.top - tipRect.height - 6;
  }

  // Shift left if it would overflow the viewport right
  if (left + tipRect.width > vw - 8) {
    left = vw - tipRect.width - 8;
  }

  if (left < 8) left = 8;

  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

export function hideTooltip(): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  hideTimer = setTimeout(() => {
    getEl().style.display = "none";
    hideTimer = null;
  }, 80);
}

export function hideTooltipImmediate(): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  getEl().style.display = "none";
}

/** Lightweight tooltip for gutter status legend. */
export function showGutterTooltip(text: string, anchor: DOMRect): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  const tip = getEl();
  tip.textContent = "";

  const msg = document.createElement("div");
  msg.className = "redactor-tooltip-reason";
  msg.textContent = text;
  tip.appendChild(msg);

  tip.style.display = "block";
  const tipRect = tip.getBoundingClientRect();
  const vw = window.innerWidth;

  let left = anchor.right + 8;
  let top = anchor.top;

  if (left + tipRect.width > vw - 8) {
    left = anchor.left - tipRect.width - 8;
  }
  if (left < 8) left = 8;

  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

export const hideGutterTooltip = hideTooltip;
