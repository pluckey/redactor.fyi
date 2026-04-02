import type { SiteAdapter, ExtractionResult, OffsetEntry } from "../lib/types";

/**
 * ChatGPT site adapter — the ONLY file that touches ChatGPT's DOM.
 * When ChatGPT changes their UI, this is the one file to update.
 */
export const chatgptAdapter: SiteAdapter = {
  responseSelector: '[data-message-author-role="assistant"]',
  processedAttr: "data-redactor-len",

  extractText(container: Element): ExtractionResult {
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
  },
};
