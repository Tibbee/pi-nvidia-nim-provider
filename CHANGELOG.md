# Changelog

All notable changes to `pi-extension-nvidia-nim` are documented here.

## [1.1.0] - 2026-07-16

### Added

- Added Thinking Machines Inkling (`thinkingmachines/inkling`) with always-on reasoning support.
- Added Poolside Laguna XS 2.1 (`poolside/laguna-xs-2.1`) with native thinking on/off routing.
- Added model capability records and `/nim-doctor` verification diagnostics.
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
