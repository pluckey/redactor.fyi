import type { AnalysisStatus } from "../lib/types";
import { injectStyles } from "./styles";
import { showGutterTooltip, hideGutterTooltip } from "./tooltip";

/**
 * Per-response status gutter — a thin vertical bar on the left edge
 * of each analyzed block. Animated barber-pole stripe while analyzing,
 * yellow-black caution stripe on error (click to retry),
 * settles to a solid bar when done.
 */

const GUTTER_CLASS = "redactor-gutter";

const STATE_CLASSES: Record<AnalysisStatus, string> = {
  pending: "",
  analyzing: "redactor-gutter--analyzing",
  clean: "redactor-gutter--clean",
  marked: "redactor-gutter--marked",
  error: "redactor-gutter--error",
  "rate-limited": "redactor-gutter--error",
};

const LEGENDS: Record<AnalysisStatus, string> = {
  pending: "Waiting to analyze",
  analyzing: "Analyzing for sycophancy, vacuity, and hedging",
  clean: "No patterns detected",
  marked: "Patterns detected — hover marks for details",
  error: "Analysis failed — click to retry",
  "rate-limited": "Rate limited — click to retry",
};

export function setStatus(
  container: Element,
  status: AnalysisStatus,
  onRetry?: () => void,
): void {
  injectStyles();
  let gutter = container.querySelector(`.${GUTTER_CLASS}`) as HTMLElement | null;

  if (!gutter) {
    gutter = document.createElement("div");
    gutter.className = GUTTER_CLASS;
    (container as HTMLElement).style.position = "relative";
    container.appendChild(gutter);

    // Tooltip on hover
    gutter.addEventListener("mouseenter", () => {
      const currentStatus = gutter!.dataset.status as AnalysisStatus | undefined;
      if (currentStatus) {
        showGutterTooltip(LEGENDS[currentStatus], gutter!.getBoundingClientRect());
      }
    });
    gutter.addEventListener("mouseleave", hideGutterTooltip);
  }

  // Replace state class
  for (const cls of Object.values(STATE_CLASSES)) {
    if (cls) gutter.classList.remove(cls);
  }
  const cls = STATE_CLASSES[status];
  if (cls) gutter.classList.add(cls);

  gutter.dataset.status = status;

  // Click-to-retry on error states
  if ((status === "error" || status === "rate-limited") && onRetry) {
    const handler = () => {
      gutter!.removeEventListener("click", handler);
      onRetry();
    };
    gutter.addEventListener("click", handler);
  }
}
