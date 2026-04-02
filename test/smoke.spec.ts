/**
 * Integration test — loads the Redactor extension in Chromium and verifies
 * the full pipeline using injected DOM elements.
 *
 * Uses a local HTML page to avoid Cloudflare bot detection on live sites.
 * Tests the generic text block scanner, popup UI, and API pipeline.
 *
 * Requires: `npx playwright test test/smoke.spec.ts`
 */

import path from "path";
import http from "http";
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";

const EXTENSION_PATH = path.resolve(__dirname, "..");
const USER_DATA_DIR = path.join(EXTENSION_PATH, ".test-profile-smoke");

let server: http.Server;
let serverUrl: string;

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  // Serve a minimal page over localhost (content script matches http://localhost/*)
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body><main></main></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://localhost:${(server.address() as { port: number }).port}`;

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

  // Enable "all pages" so the content script activates on example.com
  await enableAllPages();
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

/** Enable "all pages" domain toggle via chrome.storage directly. */
async function enableAllPages(): Promise<void> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForTimeout(500);
  // Set storage directly to avoid toggle visibility issues
  await popup.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.get(["enabledDomains"], (result) => {
        const domains = result.enabledDomains || {};
        domains.all = true;
        chrome.storage.local.set({ enabledDomains: domains }, resolve);
      });
    });
  });
  await popup.waitForTimeout(300);
  await popup.close();
}

/** Open a page where the content script will activate. */
async function setupPage(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });

  // Wait for content script to load and activate
  await page.waitForEvent("console", {
    predicate: (msg) => msg.text().includes("[redactor] content script loaded"),
    timeout: 10000,
  }).catch(() => null);

  await page.waitForTimeout(500);
  return page;
}

// ── Tests ────────────────────────────────────────────────────────

test("service worker loads", async () => {
  const sw = context.serviceWorkers()[0];
  expect(sw).toBeTruthy();
  expect(sw.url()).toContain("background.js");
});

test("popup renders all sections", async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // Header
  await expect(popup.locator("h1")).toHaveText("redactor.fyi");

  // Mode select
  const options = await popup.locator("#mode option").allTextContents();
  expect(options).toEqual(["Highlight", "Underline", "Redact"]);

  // Three redactor toggles
  await expect(popup.locator('#redactors input[type="checkbox"]')).toHaveCount(3);
  await expect(popup.locator('input[data-id="sycophancy"]')).toBeChecked();

  // Domain toggles — "All pages" + known AI domains
  const domainToggles = popup.locator('#domains input[type="checkbox"]');
  const count = await domainToggles.count();
  expect(count).toBeGreaterThanOrEqual(5); // all + chatgpt + claude + gemini + copilot + poe

  // Inputs are visually hidden (CSS toggle pattern), check they exist
  await expect(popup.locator('input[data-domain="all"]')).toBeAttached();
  await expect(popup.locator('input[data-domain="chatgpt.com"]')).toBeAttached();
  await expect(popup.locator('input[data-domain="claude.ai"]')).toBeAttached();

  // API key
  await expect(popup.locator("#apiKey")).toBeVisible();

  // Privacy notice
  await expect(popup.locator(".privacy")).toContainText("api.anthropic.com");

  await popup.close();
});

test("content script detects injected text blocks", async () => {
  const page = await setupPage();

  // Inject a text block that matches the generic scanner
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `<p>Great question! You really have a knack for getting to the heart of complex topics.
    Let me break this down for you step by step. It's important to note that this is a nuanced area
    with many factors to consider. I'd be happy to explore this further.</p>`;
    document.body.appendChild(div);
  });

  // Wait for debounce + analysis attempt
  const statusDot = page.locator(".redactor-gutter").first();
  await expect(statusDot).toBeVisible({ timeout: 10000 });

  // Processed attr should be set
  const processed = await page.locator("[data-redactor-len]").count();
  expect(processed).toBeGreaterThan(0);

  await page.close();
});

test("API key flow: saves and shows status", async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const keyInput = popup.locator("#apiKey");
  const ks = popup.locator("#keyStatus");

  await keyInput.fill("sk-ant-test-key-12345");
  await keyInput.blur();
  await expect(ks).toHaveText("Key saved");
  await expect(ks).toHaveClass(/ok/);

  await keyInput.fill("");
  await keyInput.blur();
  await expect(ks).toHaveText("No key configured");
  await expect(ks).toHaveClass(/missing/);

  await popup.close();
});

test("full pipeline with API key", async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    test.skip();
    return;
  }

  // Save key
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator("#apiKey").fill(apiKey);
  await popup.locator("#apiKey").blur();
  await popup.waitForTimeout(500);
  await popup.close();

  const page = await setupPage();

  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[redactor]")) consoleLogs.push(msg.text());
  });

  // Inject sycophantic text
  await page.evaluate(() => {
    const div = document.createElement("article");
    div.innerHTML = `<p>Great question! You really have a knack for getting to the heart of complex topics.
    Let me break this down for you step by step. It's important to note that this is a nuanced area
    with many factors to consider. I'd be happy to explore this further if you'd like me to dive deeper.
    You're definitely on the right track with your thinking here.</p>`;
    document.body.appendChild(div);
  });

  // Wait for full pipeline
  const overlay = page.locator(".redactor-overlay").first();
  await expect(overlay).toBeVisible({ timeout: 20000 });

  // Should have mark elements
  const markEls = overlay.locator(".redactor-mark");
  const markCount = await markEls.count();
  expect(markCount).toBeGreaterThan(0);

  // Console should show marks
  const marksLog = consoleLogs.find((l) => l.includes("marks"));
  expect(marksLog).toBeTruthy();

  await page.close();
});
