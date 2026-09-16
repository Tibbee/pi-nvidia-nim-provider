# Changelog

All notable changes to `pi-extension-nvidia-nim` are documented here.

## [1.8.0] - 2026-09-16

### Added

- Added NVIDIA GLM-5.3 (`z-ai/glm-5.3`, text input) and GLM-5.3 Flash (`z-ai/glm-5.3-flash`, text/image input). Both carry a 1,048,576-token context and a 131,072-token output budget, and route through metadata alone: `thinkingFormat: reasoning-effort` with `reasoningEffortValues: low, high, max` produces `supportsReasoningEffort` with no `off` level, and `exampleRequestExtra` injects `chat_template_kwargs.clear_thinking: true`.
- Added a reproducible comparison against Pi's built-in `nvidia` provider. `npm run compare:pi` now reports shared, official-only, and extension-only models plus all parameter and compatibility differences.

### Fixed

- Applied Pi's official NVIDIA compatibility baseline (`supportsStrictMode: false` and `supportsLongCacheRetention: false`) to every model family, including specific families that bypass the default catch-all.
- Aligned both Llama 3.2 vision entries with Pi's official hosted catalog: text/image input, 128K context, and 4K/8K output limits.

### Changed

- Documented the HTTP 404 `Function '<uuid>': Not found for account` response in Troubleshooting. It comes from NVIDIA's NVCF routing layer when a model's function is not entitled for the caller's account, it is distinguishable from a retired model (`410 Gone`), and the fix is an NVIDIA-side access request rather than a client change.
- Generalized build-page slug resolution in the metadata scraper: dotted model IDs now resolve through a dashed slug (`z-ai/glm-5.3` → `z-ai/glm-5-3`) using the markdown card as the existence check, so future `x.y` IDs work without a per-model special case.
- Taught the scraper the GLM 5.3+ pattern (version-aware `/^z-ai\/glm-5\.[3-9]/`), including version-aware context/output fallbacks (1,048,576 / 131,072), the `low|high|max` effort ladder, `clear_thinking`, tool calling, and Flash's image input.
- Stopped treating `max_tokens.default` as a maximum. It is the playground prefill (usually 1024); only a published `maximum` is now recorded, so a model with a 128K output budget can no longer be written down as 1024.
- Added a retired/ghost ID guard to the scraper so a full refresh cannot resurrect models that are gone or unentitled, and refused single-model regeneration for those IDs.

### Removed

- Removed five end-of-life models that answer `410 Gone` on every request: `stepfun-ai/step-3.7-flash`, `nvidia/nemotron-3-nano-30b-a3b`, `openai/gpt-oss-120b`, `minimaxai/minimax-m3`, and `deepseek-ai/deepseek-v4-pro-0813`. The extension now ships 16 models, and the compatibility matrix no longer lists MiniMax M3, StepFun, or DeepSeek V4 Pro 0813.
- Removed the orphaned `minimax-m3` and `stepfun` families, the unreachable `minimax-inline` handler branch and thinking format, and the MiniMax M3 / Step-3.7 Flash capability records.

## [1.7.1] - 2026-08-28

### Added

- Kimi K3 thinking-effort ladder: pi now offers off / low / high / max for `moonshotai/kimi-k3`. The `kimi` handler keeps the mapped top-level `reasoning_effort` when thinking is on (defaults `"high"` when absent) and deletes it when off, alongside the probe-verified boolean `chat_template_kwargs.thinking` toggle. NVIDIA's build card documents exactly this transport (`reasoningEffortValues: low, high, max`; the canonical example sends top-level `reasoning_effort` with no kwargs and runs clean on the hosted endpoint). The depth difference between effort levels is not yet measured under the free tier's capacity limits (429 bursts).

### Changed

- Kimi K3 is officially listed on the build page as of 2026-08-28; the catalog entry was refreshed through the scraper instead of estimates: official `contextWindow` 1,048,576 (was the 1M upstream-spec estimate), and the card-provided `reasoningEffortValues` and `exampleRequestExtra` now ride on the entry. The scraper fallback map mirrors the official values. README corrected accordingly (listing status, context size, effort ladder, matrix row).

## [1.7.0] - 2026-08-27

### Added

- Added Kimi K3 (`moonshotai/kimi-k3`), the newest Moonshot model on NIM: text/image input, 1M context, 65,536-token output, OpenAI-format tool calls, and a boolean `chat_template_kwargs.thinking` toggle with separate `reasoning_content`. It is live on the API but unlisted from the build page catalog and undocumented in the API reference; vision, tools, on/off thinking, and streaming are probe-verified (2026-08-27). Context is the upstream Moonshot 1M spec; max output is a lineage estimate from Kimi K2.6. **Practical warning: near unusable at times — probe latency ranged 1-46 s for the same request.**
- New `kimi` handler format and family routing; the level map collapses every non-off pi level onto the single hosted on-mode.

### Removed

- Removed 14 models confirmed HTTP 410 Gone in the 2026-08-27 aliveness sweep: Llama 3.1 70B/8B, Llama 3.2 1B/3B, Llama 3.3 70B, Nemotron Nano 8B v1 + VL 8B, Nemotron Super 49B v1/v1.5, Nemotron Mini 4B, Nemotron Nano 12B v2 VL, Nemotron Nano 9B v2, Inkling, and GLM-5.2. Sessions pinned to any of these must switch to a current model.
- Dropped the families and handler branches that only served removed models: `glm` (`zai` transport), `inkling`, `nemotron-super-detailed` (`nemotron-system-detailed`), and `nemotron-system-think`. The GLM request-contract test file was removed with them.

### Changed

- Kept DeepSeek V4 Flash 0731 despite it returning instant 404 "function not found" on chat requests across five attempts — judged a temporary outage (the build-page card is still present). Pin `deepseek-ai/deepseek-v4-pro-0813` for reliable DeepSeek V4 access meanwhile; the Pro endpoint answered live.
- Documented NIM availability volatility in the README: models retire at short notice, staged endpoints answer intermittently, and per-model latency swings between 1 s and 45 s.

## [1.6.0] - 2026-08-27

### Added

- Added DeepSeek V4 Pro (`deepseek-ai/deepseek-v4-pro-0813`) with text input, a 1,000,000-token context, and 16,384-token output. It routes through the existing `deepseek-v4` family: `chat_template_kwargs` thinking transport with `none`/`high`/`max` efforts (default `max`), matching the probe-verified V4 Flash handling.

## [1.5.1] - 2026-08-15

### Changed

- Documented in the README that the extension ships the current live DeepSeek V4 Flash endpoint, `deepseek-ai/deepseek-v4-flash-0731`, and that NVIDIA retired the unsuffixed `deepseek-v4-flash` and `deepseek-v4-pro` IDs on 2026-08-07.

## [1.5.0] - 2026-08-15

### Changed

- Pointed DeepSeek V4 at `deepseek-ai/deepseek-v4-flash-0731` after NVIDIA retired the unsuffixed `deepseek-v4-flash` and `deepseek-v4-pro` endpoints (end of life 2026-08-07). The same `chat_template_kwargs` thinking transport was re-verified on the new endpoint for none/high/max modes.

### Removed

- Removed the dead `deepseek-ai/deepseek-v4-flash` and `deepseek-ai/deepseek-v4-pro` metadata entries, which now return HTTP 410. Sessions pinned to the old IDs must switch to `deepseek-ai/deepseek-v4-flash-0731`.
- Removed 25 additional retired NIM models confirmed HTTP 410 Gone against the live catalog: Dracarys Llama 3.1, Seed OSS 36B, Gemma 2 2B, Gemma 3N e2b/e4b, Llama 4 Maverick, Phi-4 Mini/Multimodal, MiniMax M2.7, Ministral 14B, Mistral Large 3 675B, Mistral Medium 3.5, Mistral Small 4, Mixtral 8x7B, GLiNER PII, Ising Calibration 1-35b, both retired content-safety models, Qwen3 Next 80B, Qwen3.5 122B/397B, Sarvam M, Step 3.5 Flash, Stockmark 2, Solar 10.7B.
- Dropped families and handler branches that only served retired models: Seed OSS `thinking-budget` transport, MiniMax M2 family, and 15 other zero-match family patterns.
- Removed 32 further models that are still listed in the `/v1/models` catalog but return an instant 404 "Function not found for account" on chat requests (verified across three sweeps spanning hours, with healthy controls in the same runs): Yi Large, Jamba 1.5, DBRX, DeepSeek Coder 6.7B, Gemma 2B/3, Granite 3.0, Codellama 70B, Llama 2 70B, Phi-3 Vision/MoE, Codestral 22B, Mistral 7B/Large/Large 2, Mixtral 8x22B, Kimi K2.6, Mistral Nemo, Llama 3.1 Nemotron 51B/70B/Ultra 253B, Mistral Nemo Minitron, Nemotron 4 340B, Nemotron Nano 3 30B, VILA, all four Palmyra models, Zamba 2.
- Dropped the `deepseek-nim` handler format entirely (Kimi K2.6 and Nemotron Ultra were its last consumers) and 11 zero-match families (kimi-k2.6, kimi, mixtral, phi, writer, granite, jamba, yi, dbrx, zamba, nemotron-ultra).

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
