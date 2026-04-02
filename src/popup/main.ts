import { REDACTORS } from "../lib/registry";
import type { StorageSchema } from "../lib/types";
import { AI_DOMAINS, STORAGE_DEFAULTS } from "../lib/types";

const redactorsContainer = document.getElementById("redactors")!;
const domainsContainer = document.getElementById("domains")!;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const keyStatus = document.getElementById("keyStatus")!;

// Load settings
chrome.storage.local.get(
  ["schemaVersion", "displayMode", "enabledRedactors", "anthropicApiKey", "enabledDomains"] satisfies (keyof StorageSchema)[],
  (result: Partial<StorageSchema>) => {
  const mode = result.displayMode || STORAGE_DEFAULTS.displayMode;
  const enabled: Record<string, boolean> = result.enabledRedactors || { ...STORAGE_DEFAULTS.enabledRedactors };
  const domains: Record<string, boolean> = result.enabledDomains || { ...STORAGE_DEFAULTS.enabledDomains };

  // API key — show masked indicator, never load full key into DOM
  if (result.anthropicApiKey) {
    const k = result.anthropicApiKey;
    apiKeyInput.placeholder = k.slice(0, 7) + "..." + k.slice(-4);
    keyStatus.textContent = "Key saved";
    keyStatus.className = "key-status ok";
  }

  modeSelect.value = mode;

  // --- Redactor toggles ---
  for (const r of REDACTORS) {
    const isEnabled = r.id === "sycophancy" ? (enabled[r.id] !== false) : (enabled[r.id] === true);

    const item = document.createElement("div");
    item.className = "redactor-item";
    item.innerHTML = `
      <div class="redactor-dot" style="background:${r.color}"></div>
      <div class="redactor-info">
        <div class="redactor-name">${r.label}</div>
        <div class="redactor-desc">${r.description}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" data-id="${r.id}" ${isEnabled ? "checked" : ""}>
        <div class="toggle-track"></div>
      </label>
    `;
    redactorsContainer.appendChild(item);
  }

  redactorsContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const newEnabled: Record<string, boolean> = {};
      redactorsContainer.querySelectorAll('input[type="checkbox"]').forEach((c) => {
        const input = c as HTMLInputElement;
        newEnabled[input.dataset.id!] = input.checked;
      });
      chrome.storage.local.set({ enabledRedactors: newEnabled });
    });
  });

  // --- Domain toggles ---
  // "All pages" toggle first
  renderDomainToggle("all", "All pages", domains.all === true);

  // Known AI domains
  const seen = new Set<string>();
  for (const [domain, label] of Object.entries(AI_DOMAINS)) {
    if (seen.has(label)) continue; // skip dupes like chat.openai.com
    seen.add(label);
    const isOn = domains[domain] !== false; // on by default for AI domains
    renderDomainToggle(domain, label, isOn);
  }

  domainsContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      const allToggle = domainsContainer.querySelector('input[data-domain="all"]') as HTMLInputElement;

      // "All pages" requires runtime host permission
      if (allToggle?.checked) {
        const granted = await chrome.permissions.request({
          origins: ["<all_urls>"],
        });
        if (!granted) {
          allToggle.checked = false;
          return;
        }
      } else {
        // Revoke when unchecked
        chrome.permissions.remove({ origins: ["<all_urls>"] }).catch(() => {});
      }

      const newDomains: Record<string, boolean> = {};
      domainsContainer.querySelectorAll('input[type="checkbox"]').forEach((c) => {
        const input = c as HTMLInputElement;
        newDomains[input.dataset.domain!] = input.checked;
      });
      chrome.storage.local.set({ enabledDomains: newDomains });
    });
  });
});

function renderDomainToggle(domain: string, label: string, isOn: boolean) {
  const item = document.createElement("div");
  item.className = "redactor-item";
  item.innerHTML = `
    <div class="redactor-info">
      <div class="redactor-name">${label}</div>
      ${domain !== "all" ? `<div class="redactor-desc">${domain}</div>` : ""}
    </div>
    <label class="toggle">
      <input type="checkbox" data-domain="${domain}" ${isOn ? "checked" : ""}>
      <div class="toggle-track"></div>
    </label>
  `;
  domainsContainer.appendChild(item);
}

// Mode change
modeSelect.addEventListener("change", () => {
  chrome.storage.local.set({ displayMode: modeSelect.value });
});

// --- Error log panel ---
const logToggle = document.getElementById("logToggle")!;
const logArrow = document.getElementById("logArrow")!;
const logBadge = document.getElementById("logBadge")!;
const logPanel = document.getElementById("logPanel")!;
const logClear = document.getElementById("logClear")!;

function renderLog(entries: { ts: number; msg: string }[]) {
  logPanel.innerHTML = "";
  if (entries.length === 0) {
    logPanel.innerHTML = '<div class="log-empty">No errors</div>';
    logBadge.style.display = "none";
    return;
  }
  logBadge.textContent = String(entries.length);
  logBadge.style.display = "inline-block";
  // Show newest first
  for (const entry of [...entries].reverse()) {
    const row = document.createElement("div");
    row.className = "log-entry";
    const ts = new Date(entry.ts);
    const time = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    row.innerHTML = `<span class="log-ts">${time}</span>${escapeHtml(entry.msg)}`;
    logPanel.appendChild(row);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

chrome.storage.local.get(["errorLog"], (result) => {
  renderLog(result.errorLog || []);
});

logToggle.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "logClear") return;
  const isOpen = logPanel.classList.toggle("open");
  logArrow.classList.toggle("open", isOpen);
});

logClear.addEventListener("click", () => {
  chrome.storage.local.set({ errorLog: [] });
  renderLog([]);
});

// Live-update if errors come in while popup is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.errorLog) {
    renderLog(changes.errorLog.newValue || []);
  }
});

// API key — save on blur or Enter, then clear input
function saveKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    // Only clear storage if user explicitly blanked the field
    // (not if they just clicked away from an empty placeholder)
    chrome.storage.local.get(["anthropicApiKey"], (result) => {
      if (result.anthropicApiKey && apiKeyInput.value === "") {
        chrome.storage.local.set({ anthropicApiKey: "" });
        apiKeyInput.placeholder = "sk-ant-...";
        keyStatus.textContent = "No key configured";
        keyStatus.className = "key-status missing";
      }
    });
    return;
  }
  chrome.storage.local.set({ anthropicApiKey: key });
  apiKeyInput.value = "";
  apiKeyInput.placeholder = key.slice(0, 7) + "..." + key.slice(-4);
  keyStatus.textContent = "Key saved";
  keyStatus.className = "key-status ok";
}
apiKeyInput.addEventListener("blur", saveKey);
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { saveKey(); apiKeyInput.blur(); }
});
