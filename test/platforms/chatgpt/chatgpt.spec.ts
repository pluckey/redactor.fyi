/**
 * Integration test — loads a saved ChatGPT conversation HTML and verifies
 * the Redactor extension detects text blocks, analyzes them, and renders marks.
 *
 * Uses a real saved ChatGPT page to test against actual DOM structure
 * without needing a live ChatGPT session or dealing with Cloudflare.
 *
 * Run: npx playwright test test/platforms/chatgpt/chatgpt.spec.ts
 * Full pipeline (with API): ANTHROPIC_API_KEY=sk-... npx playwright test test/platforms/chatgpt/chatgpt.spec.ts
 */

import path from "path";
import http from "http";
import fs from "fs";
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";

const EXTENSION_PATH = path.resolve(__dirname, "..", "..", "..");
const USER_DATA_DIR = path.join(EXTENSION_PATH, ".test-profile-chatgpt");
const CHATGPT_HTML = path.join(__dirname, "Effective Study Methods.html");

// Serve the saved HTML over localhost so the content script can inject
// (manifest matches don't include file:// URLs)
let server: http.Server;
let serverUrl: string;

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  // Serve the saved HTML over localhost
  const html = fs.readFileSync(CHATGPT_HTML, "utf-8");
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  serverUrl = `http://localhost:${addr.port}`;

  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
    viewport: { width: 1280, height: 800 },
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 5000 });
  }
  extensionId = sw.url().split("/")[2];

  // Enable localhost domain so content script activates on test server
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({
        enabledDomains: {
          all: true,
          "chatgpt.com": true, "claude.ai": true,
          "gemini.google.com": true, "copilot.microsoft.com": true, "poe.com": true,
        },
      }, resolve);
    });
  });
  await popup.waitForTimeout(300);
  await popup.close();
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

async function openConversation(): Promise<Page> {
  const page = await context.newPage();
  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[redactor]")) consoleLogs.push(msg.text());
  });

  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });

  // Wait for content script
  await page.waitForEvent("console", {
    predicate: (msg) => msg.text().includes("[redactor] content script loaded"),
    timeout: 10000,
  }).catch(() => null);

  await page.waitForTimeout(500);
  (page as any).__consoleLogs = consoleLogs;
  return page;
}

// ── Tests ────────────────────────────────────────────────────────

test("saved HTML has expected ChatGPT DOM structure", async () => {
  const page = await openConversation();

  const structure = await page.evaluate(() => ({
    assistantMessages: document.querySelectorAll('[data-message-author-role="assistant"]').length,
    userMessages: document.querySelectorAll('[data-message-author-role="user"]').length,
    messageIds: document.querySelectorAll("[data-message-id]").length,
    markdownBlocks: document.querySelectorAll(".markdown.prose").length,
  }));

  expect(structure.assistantMessages).toBeGreaterThanOrEqual(1);
  expect(structure.userMessages).toBeGreaterThanOrEqual(1);
  expect(structure.messageIds).toBeGreaterThanOrEqual(2);
  expect(structure.markdownBlocks).toBeGreaterThanOrEqual(1);

  await page.close();
});

test("content script activates and finds text blocks", async () => {
  const page = await openConversation();

  // Give the scanner time to run (debounce 1.5s + scan)
  await page.waitForTimeout(3000);

  const consoleLogs = (page as any).__consoleLogs as string[];

  // Content script should have loaded
  const loaded = consoleLogs.some((l) => l.includes("content script loaded"));
  expect(loaded).toBe(true);

  // Should report active
  const settings = consoleLogs.find((l) => l.includes("settings loaded"));
  expect(settings).toContain("active: true");

  // Should find text blocks
  const scan = consoleLogs.find((l) => l.includes("scan:"));
  expect(scan).toBeTruthy();

  // Should have processed at least one block
  const processed = await page.locator("[data-redactor-len]").count();
  expect(processed).toBeGreaterThan(0);

  await page.close();
});

test("status dots appear on detected blocks", async () => {
  const page = await openConversation();
  await page.waitForTimeout(3000);

  const statusDots = page.locator(".redactor-gutter");
  const count = await statusDots.count();
  expect(count).toBeGreaterThan(0);

  // Each gutter should have a state class
  const firstGutter = statusDots.first();
  const hasState = await firstGutter.evaluate((el) =>
    el.classList.contains("redactor-gutter--analyzing") ||
    el.classList.contains("redactor-gutter--clean") ||
    el.classList.contains("redactor-gutter--marked") ||
    el.classList.contains("redactor-gutter--error")
  );
  expect(hasState).toBe(true);

  await page.close();
});

test.describe("full pipeline (requires ANTHROPIC_API_KEY)", () => {
  let page: Page;
  let consoleLogs: string[];

  test.beforeAll(async ({ }, testInfo) => {
    testInfo.setTimeout(90_000);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    // Save API key via chrome.storage directly
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.evaluate((key) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({ anthropicApiKey: key }, resolve);
      });
    }, apiKey);
    await popup.waitForTimeout(300);
    await popup.close();

    // Open conversation page — shared across pipeline tests
    consoleLogs = [];
    page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.text().includes("[redactor]")) consoleLogs.push(msg.text());
    });
    await page.goto(serverUrl, { waitUntil: "domcontentloaded" });

    // Wait for full pipeline: scan + chunk analysis + render
    // Wait for actual marks, not just the overlay container
    const mark = page.locator(".redactor-mark").first();
    await expect(mark).toBeVisible({ timeout: 60000 });

    // Let remaining chunks and console logs settle
    await page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    // Reset display mode to highlight
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator("#mode").selectOption("highlight");
    await popup.waitForTimeout(300);
    await popup.close();

    await page?.close();
  });

  test("marks render on assistant responses", async () => {
    if (!process.env.ANTHROPIC_API_KEY) { test.skip(); return; }

    // Should have mark elements on the page
    const allMarks = page.locator(".redactor-mark");
    const markCount = await allMarks.count();
    expect(markCount).toBeGreaterThan(0);

    // Console should show marks found
    const marksLog = consoleLogs.find((l) => l.includes("marks"));
    expect(marksLog).toBeTruthy();
  });

  test("tooltip appears on mark hover", async () => {
    if (!process.env.ANTHROPIC_API_KEY) { test.skip(); return; }

    // Hover over a mark element
    const markEl = page.locator(".redactor-mark").first();
    await markEl.hover();

    // Tooltip should appear
    const tooltip = page.locator("#redactor-tooltip");
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    // Tooltip should have content
    const tooltipText = await tooltip.textContent();
    expect(tooltipText!.length).toBeGreaterThan(0);

    // Move away — tooltip should hide (80ms debounce + render)
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await expect(tooltip).not.toBeVisible();
  });

  test("display mode switch re-renders overlays", async () => {
    if (!process.env.ANTHROPIC_API_KEY) { test.skip(); return; }

    // Switch to underline mode
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator("#mode").selectOption("underline");
    await popup.waitForTimeout(500);
    await popup.close();

    // Wait for marks to re-render in underline mode
    const underlineMark = page.locator(".redactor-mark--underline").first();
    await expect(underlineMark).toBeVisible({ timeout: 30000 });
  });
});
