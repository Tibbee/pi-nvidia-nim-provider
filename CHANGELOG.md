# Changelog

All notable changes to `pi-extension-nvidia-nim` are documented here.

## [1.14.0] - 2026-10-02

### Added

- Grid-based Klein generation: width and height independently accept 512–1568 inclusive in increments of 16, with 1024 defaults. Replace the six-pair whitelist using both live hosted validator enums; do not round, crop, or resize requests. Existing aspect-ratio mappings and conflict checks are unchanged.
- One approved height-validation request returned 422 and the full 67-value enum, matching the previously captured width enum. Axis admission does not guarantee every combination or exclude additional server constraints; errors remain structured, without retries.
- Offline validation of all 4,489 grid combinations, boundary/alignment/type rejection, exact payload dimensions, and native installed-Pi dispatch regressions. Preserve unrelated model pair restrictions and preset-0's 1024×1024-only gate.

## [1.13.0] - 2026-10-02

### Added

- Verified non-preset generation resolutions: 1024×768 and 1008×752, plus the exact `4:3` alias for 1024×768. Six tested generation pairs are enabled. Record the hosted width validator's 512–1568 / 16-pixel grid without claiming every combination or promoting container-only height bounds.
- Explicit `preset_example: 0` editing of NVIDIA's predefined green frog, verified at 1024×1024. Shared adapter sends an example-ID array with no `mode`, `model`, or selector body field. Tool/native metadata dispatch retain full Pi auth, cancellation, artifact validation, and non-overwriting saves.
- Separate per-preset evidence and dimension gates. Unknown/unverified IDs, non-square preset edits, and conflicts with file/image-block input fail locally. Arbitrary `inputImage` uploads stay disabled; preset editing does not advertise generic image input or reuse arbitrary-upload evidence.
- Dry-run-first preset probe option, offline regressions, and installed-Pi integration checks for preset dispatch, header-only authentication, endpoint overrides, 4:3 resolution, and quota-free validation failures.

### Evidence

- Approved probes returned the hosted width enum and successfully changed the source frog from green to red with its pose/scene visually preserved. Full decoding and comparison against NVIDIA's public source/output were performed. Scalar fallback was not needed or run. No further inference was performed during implementation; existing texture files were left unchanged.

## [1.12.0] - 2026-10-02

### Added

- Aspect-ratio awareness: `aspect_ratio` maps locally to verified Klein resolutions — 1:1 (1024×1024), landscape 16:9 (1344×768), portrait 9:16 (768×1344), and 21:9 (1568×672). Reject contradictory explicit dimensions and unsupported combinations; never send ratio fields to NVIDIA. Preserve square defaults and report resolved dimensions.
- Evidence-gated reference-image plumbing for future editing models: native Pi image blocks, data-URL array/string transports, bounded local-file reads, strict MIME/base64/container checks, and a local 10 MiB safety ceiling. `inputImage` is available only when model records establish successful editing; current Klein remains text-only and rejects this option before reading/uploading.
- Probe-only model-card/playground resolution sets and explicit reference-image transport probes. No automatic registration or inference retries; source files and private image data stay out of evidence reports. Successful decoding does not automatically establish semantic editing.
- Aspect/edit regressions and installed-Pi checks, including orientation, conflict detection, input validation, source preservation, editing-evidence gates, and candidate isolation. Enforce the hosted 10,000-character prompt limit.

### Verification and limitations

- Five approved hosted requests: 1344×768, 768×1344, and 1568×672 generations succeeded and fully decoded at requested dimensions. Both reference-upload encodings returned HTTP 422; the PNG rejection contained a preset `example_id` hint. Arbitrary-image editing is therefore not enabled or claimed functional.
- Correct stale 1024-only guidance and reversed playground ratio labels. Other upstream model-card resolutions remain probe-only, and raster output descriptions do not establish an API output-format selector.

## [1.11.0] - 2026-10-02

### Fixed

- Normalize artifacts independently: malformed/null siblings no longer discard valid images. Require `SUCCESS`, canonical base64, allowed MIME types, and structurally complete JPEG/PNG/static WebP containers; do not claim these checks fully decode pixels.
- Enforce the hosted uint32 seed bound. Guidance's unknown upper bound is no longer represented by an invented limit.
- Merge headers case-insensitively, including null suppression of authorization defaults and differently cased overrides.
- Timeout/cancellation races now settle stalled payload/response hooks, custom fetch, and body reading, while handling late rejections safely. Validate timeout values before scheduling timers.
- Advanced image tools dispatch through Pi's authenticated runtime, preserving complete auth headers, header-only credentials, and auth-provided endpoint overrides. Runtime authentication failures retain structured errors.
- Correct saved filename extensions and place multi-image suffixes before extensions, without weakening exclusive-create overwrite protection or save-failure image retention. Expose dropped-artifact warnings in tool text.
- Correct README retry claims: global chat retries do not automatically retry image operations. Document the hosted Kontext preset-only restriction and distinguish hosted schemas from container schemas.

### Added

- Evidence-aware per-model settings: names, numeric enums/ranges, exclusive bounds, multiples, required/optional fields, dimension pairs, and explicit input transports. Tool schemas no longer enforce Klein constraints globally; model validation remains authoritative. Unimplemented transports fail locally rather than dropping inputs.
- Maintained dry-run-first `probe:images` tooling, with explicit single-request live opt-in, mandatory pixel decoding for qualification, sanitized exclusive-create reports, and no automatic registration. Dev/Schnell are probe-only candidates; the registered catalog remains 16 chat models plus Klein.
- Genuine encoded image fixtures, hardening/probe regressions, and optional installed-Pi runtime/argument-validator tests using dummy credentials and fail-closed network stubs.

### Verification

- No live inference requests for this release. Candidate availability and new-model generation remain unverified.

## [1.10.1] - 2026-10-02

### Fixed

- Cancellation during asynchronous payload hooks now prevents image requests; hook exceptions become image error results, and cancellation is checked again before accepting response output.
- Image requests honor pi’s resolved model `baseUrl` instead of hard-coding the capability endpoint, preserving endpoint/proxy overrides.
- Relative image save directories resolve against the session workspace; reported saved paths are absolute. Directory-creation failures now return `saveError` while preserving generated images, just like write failures.
- Advanced tool structured results explicitly expose `isError`, so codemode’s documented error check handles generation and save failures correctly.
- Diagnostic logs no longer include caller/provider error messages that may echo prompts, image data, or credentials. HTTP failures retain only safe model/status information in logs.
- Added regression tests for all six review findings, including hook failures and cancellation during response handling.

## [1.10.0] - 2026-10-02

### Added

- Native image generation under the existing `nvidia-nim` provider. `black-forest-labs/flux.2-klein-4b` registers as a `type: "image"` model on a dedicated `nvidia-nim-images` API identifier with its own adapter (`lib/nim-images.ts`), so image requests go straight to `POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b` and never through chat/completions or the `before_provider_request` thinking transforms. The provider now registers the mixed chat + image catalog (`PROVIDER_MODEL_CONFIGS`); all 16 chat models and their hooks are unchanged.
- Per-model image capability records (`models/image-models.ts`): verified bounds only — 1024×1024, `steps` 1–4 (default 4), `samples` 1, `seed` ≥ 0 (0/omitted = random), `cfg_scale` ≥ 1 (default 1). Text input becomes the `prompt` field; the model is identified by the endpoint URL; `mode` is never sent (the live schema is `extra_forbidden` and rejects the documented `mode: "Image Generation"` with HTTP 422). Image input/editing, negative prompts, output-format selection, compression controls, and seamless-texture generation are unverified and rejected locally.
- Response normalization to pi base64 image blocks with the format **sniffed from magic bytes** (JPEG/PNG/WebP) instead of assumed. Per-artifact `finishReason`/`seed` are honored: non-`SUCCESS` artifacts (e.g. content-filtered) and artifacts without decodable image data are dropped and reported with NVIDIA's own `finishReason` quoted verbatim; a run without a usable image is an error. Artifacts also report their seeds as text blocks so runs are reproducible.
- Explicit error handling: HTTP 401/403 authentication, 422 with the server's field detail (the Pydantic `detail[]` shape), 429 with `retry-after`, 5xx with the request ID, malformed JSON, missing `artifacts`, cancellation (`stopReason: "aborted"`), and a distinct client-side timeout (default 5 min, `ImagesOptions.timeoutMs` honored). `onPayload`/`onResponse` instrumentation hooks are honored per the image API contract. No automatic retries.
- Advanced `nim-generate-image` tool (codemode exposure) that reuses the same shared client with pi's credential resolution (`ctx.modelRegistry`). It exposes `width`/`height`/`seed`/`steps`/`cfg_scale` plus optional `saveDir`/`fileName` saving: original encoded bytes preserved (no re-encoding), extension follows the detected format, existing files are never overwritten (exclusive create), and every saved path is reported. Without `saveDir` nothing touches disk — native generation never saves silently.
- Mocked test suite (`test/image-generation-tests.ts`) covering image-model registration and catalog visibility, chat models/hooks staying functional, exact endpoint/auth/request translation, `mode` omission, input/capability validation, JPEG/PNG/WebP sniffing, successful/missing/malformed/filtered/partial artifacts, HTTP 401/403/422/429/5xx, abort/timeout behavior, unknown usage handling, and explicit saving with overwrite protection.

### Notes

- NVIDIA returns **no usage or cost information** for image generation and none is fabricated. The zeroed cost metadata means **unreported pricing, not free inference** — images consume NVIDIA trial credits/plan quota. `cfg_scale: 1` is verified; the live endpoint rejects `0` (published schema says "0 to 0") and the upper limit is unverified. Only 1024×1024 is established despite the wider published dimension enum. The initial implementation was not deployed separately; it is included in the 1.10.1 live deployment.

## [1.9.0] - 2026-09-25

### Added

- Added DeepSeek V4.1 Flash (`deepseek-ai/deepseek-v4.1-flash`, build-listed 2026-09-18): text/image input, a 1,048,576-token **combined** input+output window, OpenAI-format tool calls, and a 262,144-token output cap — the card's own `max_tokens` default.
- Routed it through the existing `deepseek-v4` family. The dotted release declares no Jinja chat template of its own and its documented request schema lists no thinking parameter, but NVIDIA's serving stack implements the same protocol: a controlled probe set on 2026-09-25 (temperature 0, seed 42) measured `thinking: false` + `reasoning_effort: "none"` suppressing reasoning entirely (0 reasoning chars vs 74 for the unparameterised baseline), `"high"` matching the default, and `"max"` deepening it to 122 chars — so pi offers the same off/high/max ladder, and `reasoning_effort` travels inside `chat_template_kwargs`. `"low"` also completed (67 chars) but stays hidden: the delta is within single-sample noise.

### Fixed

- The metadata scraper now recognizes `ImageContentPart` schema names as image input. DeepSeek V4.1 Flash uses that spelling where other cards use `ContentPartImage`, which had left the multimodal release marked text-only.

### Changed

- Added a documented `max_tokens` override to the scraper: when a card's `max_tokens.maximum` spans the whole context window (V4.1 Flash publishes 1,048,576), the card's own default is recorded instead. Prompt and completion share that window, so a cap equal to it bounds the parameter rather than describing an output budget — a client asking for it leaves no room for the prompt it must accompany. Pi sizes each request with its own `contextWindow - prompt - safety` clamp, and the 1M value would also advertise `max-out: 1M` in `pi --list-models`.
- Extended the probe matrix with numeric `reasoning_effort` cases (100 and 50). Both answered `504` on V4.1 Flash, as did the string-valued top-level effort, so DeepSeek's documented 1–100 reference-encoding effort is not reachable through the hosted API.

### Removed

- Removed `deepseek-ai/deepseek-v4-flash-0731`, which NVIDIA retired on **2026-09-21**: it answers `410 Gone` with that end-of-life date on every attempt (confirmed three times, ~120–440 ms), has dropped from `/v1/models`, and its build card still answers 200 — exactly the pattern the triage table says to trust the sweep for. It was the extension's last Dash-suffixed V4 endpoint; `deepseek-ai/deepseek-v4.1-flash` now carries the `deepseek-v4` family. The ID was added to `RETIRED_MODEL_IDS`, so a full metadata refresh cannot resurrect it, and the request-snapshot and registry tests now assert it stays out of the catalog while the family itself is still covered through V4.1.
- The extension ships 16 models again; `npm run compare:pi` reports `deepseek-ai/deepseek-v4.1-flash` as extension-only.

### Verification

- `npm test` (refactor checks, request snapshots, Pi-provider comparison)
- `npx tsx tools/probe_nim.ts --model=deepseek-ai/deepseek-v4.1-flash --cases=baseline-stream,reasoning-effort-numeric-100,reasoning-effort-none-only,deepseek-v4-nonthink` and a follow-up run with `deepseek-v4-high,deepseek-v4-max,nested-effort-low`
- Expect heavy queueing on this endpoint: `/v1/models` answers in ~200 ms, while an accepted completion waited ~198 s for its first byte. When the queue saturates, the gateway answers `504` after ~300 s with an empty body — an end-to-end request with the shipped 262,144-token cap hit that once, and a 1,024-token request hit it at the same moment minutes later, so the cap is not the cause (262,144 is the card's own default, i.e. the value the endpoint uses when the client omits `max_tokens`). The cap A/B therefore stays unresolved until the endpoint admits requests consistently again.

## [1.8.1] - 2026-09-17

### Fixed

- GLM-5.3 and GLM-5.3 Flash now expose exactly the three efforts the hosted endpoint accepts — `low`, `high` and `max`. The derived effort map used to alias pi's `minimal`, `medium` and `xhigh` levels onto the nearest supported value, so the picker showed six levels for a model that supports three. Metadata can now carry an explicit `thinkingLevelMap`, and the scraper emits the verbatim ladder for GLM 5.3+; other `reasoning-effort` models are unchanged, so gpt-oss keeps its intentional `minimal` → `low` alias.
- `tools/fetch_nim_metadata.ts` now reads structured-output support from the model card's capability list, so a full metadata refresh records `true` for the GLM-5.3 endpoints instead of falling back to ID heuristics. The field is informational (full-mode metadata only) and does not change the shipped catalog.

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
