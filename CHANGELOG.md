# Changelog

All notable changes to `pi-extension-nvidia-nim` are documented here.

## [Unreleased]

### Changed

- Pointed DeepSeek V4 at `deepseek-ai/deepseek-v4-flash-0731` after NVIDIA retired the unsuffixed `deepseek-v4-flash` and `deepseek-v4-pro` endpoints (end of life 2026-08-07). The same `chat_template_kwargs` thinking transport was re-verified on the new endpoint for none/high/max modes.

### Removed

- Removed the dead `deepseek-ai/deepseek-v4-flash` and `deepseek-ai/deepseek-v4-pro` metadata entries, which now return HTTP 410. Sessions pinned to the old IDs must switch to `deepseek-ai/deepseek-v4-flash-0731`.

## [1.4.0] - 2026-08-12

### Added

- Added NVIDIA Nemotron 3.5 Lightning 30B (`nvidia/nemotron-3.5-lightning-30b-a3b`) with text input, a 1,048,576-token context, and 32,768-token output.
- Nemotron 3.5 Lightning routes through the `nemotron-3-super-effort` handler (`enable_thinking` + `reasoning_budget`); NVIDIA documents no `reasoning_effort` for this model.

### Verified

- Hosted NIM accepted `enable_thinking`, `reasoning_budget`, streamed separate `reasoning_content`, and emitted live tool calls. Both `enable_thinking: false` and `reasoning_effort: none` stopped reasoning; all documented reasoning-effort values were accepted.

## [1.3.0] - 2026-08-11

### Added

- Added Meta Muse Glimmer 30B (`meta/muse-glimmer-30b`) with text/image input, a 131,072-token context, top-level reasoning-effort mapping, and separate reasoning-content streaming.
- Added generated single-model metadata updates and a fallback scraper for NVIDIA's ReadMe-powered API reference pages.

### Verified

- Hosted NIM accepted Muse Glimmer streaming, usage, documented reasoning-effort values, and tool payloads. Tool-call emission was not observed, and `reasoning_effort: "none"` still returned reasoning content.

## [1.2.1] - 2026-07-16

### Fixed

- Restricted DeepSeek V4 Flash thinking levels to off, high, and max — the only choices verified on hosted NIM. Intermediate levels (minimal, low, medium, xhigh) are no longer mapped.

## [1.2.0] - 2026-07-16

### Added

- Exposed DeepSeek max reasoning level and expanded probe coverage for additional models.

### Fixed

- Restored hosted NIM reasoning effort mapping for GLM-5.2.

## [1.1.3] - 2026-07-16

### Changed

- Refined README for clarity and consistent formatting.

## [1.1.2] - 2026-07-16

### Changed

- Removed interactive `/nim-doctor` command; diagnostics are now handled through the extension's standard capabilities reports.

## [1.1.1] - 2026-07-16

### Fixed

- Verified GLM-5.2 and MiniMax M3 transport behavior updated capabilities records.

## [1.1.0] - 2026-07-16

### Added

- Added Thinking Machines Inkling (`thinkingmachines/inkling`) with always-on reasoning support.
- Added Poolside Laguna XS 2.1 (`poolside/laguna-xs-2.1`) with native thinking on/off routing.
- Added model capability records and opt-in live probe tooling.
- Added opt-in live probes for request, response, streaming, usage, and tool behavior.

### Changed

- Expanded request regression coverage for Kimi, MiniMax, Nemotron, Inkling, and Laguna families.
- Applied `supportsStore: false` to all NIM model compatibility merges.
- Improved documentation for provider selection, authentication, compatibility evidence, and troubleshooting.
- Kept response streaming on Pi's built-in `openai-completions` path; no custom stream implementation was added.

### Verification

- `npm test`
- `npm pack --dry-run`
- Live streaming and usage probes for GLM-5.2, MiniMax M3, Inkling, and Laguna XS 2.1

Tool-call support remains model-specific and is not claimed unless a live probe
observes a tool-call and tool-result round trip.
