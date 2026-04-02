# redactor.fyi extension

Chrome extension that detects sycophancy, vacuity, and hedging in AI chat responses — inline, as you read them.

Part of [redactor.fyi](https://redactor.fyi). See the [website](https://redactor.fyi) for the research grounding and full project context.

## What it does

Monitors AI chat pages for new responses, runs three independent detectors against each one, and renders inline marks directly on the page. Hover a mark to see the classification and rationale.

| Detector | Catches |
|---|---|
| **Sycophancy** | Flattery, false agreement, inflated validation |
| **Vacuity** | Filler phrases, semantic nulls, zero-information padding |
| **Hedging** | Weasel words, false balance, non-committal qualifiers |

## Supported sites

ChatGPT, Claude, Gemini, Copilot, Poe — plus any site you enable via the popup.

## Setup

```sh
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. Click the extension icon, enter your Anthropic API key
5. Toggle which sites to scan

## How it works

- A `MutationObserver` watches for new message elements on the page
- Text blocks over 100 characters are extracted and sent to the Anthropic API (Claude Haiku)
- Three detector prompts run in parallel, each returning flagged spans with classifications
- Overlapping marks are resolved and a ceiling is applied to avoid over-marking
- Marks are rendered as inline overlays on the original DOM

The extension calls the Anthropic API directly from the browser using your own key. Nothing is routed through a server.

## License

MIT
