# pi-extension-nvidia-nim

NVIDIA NIM exposes a lot of reasoning models through an OpenAI-compatible API, but their thinking controls are not actually compatible with each other. Pi's standard `--thinking` option may get ignored, or reasoning might need model-family-specific request fields.

`pi-extension-nvidia-nim` adds a model-aware `nvidia-nim` provider for Pi. It maps Pi thinking levels to the request format each NVIDIA NIM family expects, while keeping Pi's built-in `openai-completions` streaming path.

## Features

- 16 curated models for chat, reasoning, code, and vision — every one verified live against hosted NIM as of 2026-09-16
- Native image generation through a separate `nvidia-nim-images` adapter (FLUX.2 Klein 4B, verified 2026-10-02) plus an advanced `nim-generate-image` tool with explicit file saving
- 55 scraped entries, filtered, deduplicated, and family-mapped
- 5 handler-based thinking formats: DeepSeek V4, Kimi, MiniMax inline, Nemotron 3 effort, Qwen chat-template, plus native pi handling for reasoning-effort
- Per-model `chat_template_kwargs` injection (thinking effort, budgets, system-message toggles) and request content-array normalization for older models
- No custom streaming. Uses pi's built-in `openai-completions`.

## Which NVIDIA provider?

| Provider | Use it when |
|----------|-------------|
| Built-in `nvidia` | You need basic NVIDIA model access with minimal configuration |
| `nvidia-nim` | You need model-family-aware reasoning controls and NIM-specific compatibility |

Install the npm package `pi-extension-nvidia-nim`. It registers a separate Pi provider named `nvidia-nim`; it does not replace Pi's built-in `nvidia` provider. Both can be installed and used side by side.

## Install

**Requires Pi 1.0.0 or later**, including `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` 1.0.0+. The mixed chat/image provider registration and authenticated image runtime are not supported on Pi 0.x.

```bash
pi install npm:pi-extension-nvidia-nim
```

## Configure

### 1. Get an API key

Sign up at [build.nvidia.com](https://build.nvidia.com) (free tier, 40 requests per minute, 1,000 inference credits on signup, no credit card required).

### 2. Set the credential (pick one)

**Option A: Interactive login (recommended)**

In pi's interactive mode, run `/login nvidia-nim`, pick the API-key login, and paste your key — pi stores it under the `nvidia-nim` provider in `~/.pi/agent/auth.json` and manages it from then on. No environment variables needed. Selecting built-in `nvidia` in the same menu authenticates a different provider.

**Option B: Environment variable**

For headless setups, CI, or when you prefer env configuration:

```bash
export NVIDIA_NIM_API_KEY="nvapi-..."
```

PowerShell:

```powershell
$env:NVIDIA_NIM_API_KEY = "nvapi-..."
```

`NVIDIA_API_KEY` is accepted as a fallback for backward compatibility with pi's built-in `nvidia` provider.

**Option C: Manual auth file (`~/.pi/agent/auth.json`)**

Equivalent to what `/login` writes — add the entry by hand if you script your setup:

```json
{
  "nvidia-nim": { "type": "api_key", "key": "nvapi-..." }
}
```

**Precedence:** a stored credential (from `/login` or the auth file) wins over environment variables. To switch back to env-based auth, remove the entry with `/logout nvidia-nim`.

### 3. Select a model and test reasoning

```bash
pi --provider nvidia-nim \
  --model z-ai/glm-5.3 \
  --thinking high \
  -p "Give me a short solution to this coding problem: reverse a linked list."
```

This smoke test should show Pi's structured reasoning indicator and a separate final answer. Do not copy private reasoning content into issue reports. You can also select models interactively with `/model` or `Ctrl+P`. Look for the `nvidia-nim/` prefix in the model picker.

## Design

- Uses pi's built-in `openai-completions` streaming. No custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are handled via `before_provider_request` and pi's `compat` system.
- Family-based config in `config/model-families.ts` (15 families, first-match-wins) drives thinking format routing and model metadata.
- Catalog cost fields are `$0` placeholders because pricing is not reported here; they do not promise free inference. NVIDIA may offer free-tier credits, but hosted requests consume quota/credits and actual pricing depends on the endpoint and account.
- Works alongside pi's built-in `nvidia` provider. Use `nvidia-nim/...` for NIM-family-specific thinking transforms and the full catalog, `nvidia/...` for pi's native handling.

## Comparison with Pi's built-in `nvidia` provider

**Historical comparison snapshot (Pi 0.85.1), not the supported runtime baseline.** That bundled provider exposed 20 NVIDIA models in the comparison (21 at runtime, which additionally listed `z-ai/glm-5.3-flash`), versus this extension's 16. Counts below describe that snapshot. Generate an updated comparison against your installed Pi with:

```bash
npm run compare:pi -- \
  --json-output=tools/output/pi-nvidia-compare.json \
  --markdown-output=tools/output/pi-nvidia-compare.md
```

That historical report contains:

- 11 shared model IDs
- 9 official-only models
- 5 extension-only models
- 9 shared models with at least one parameter or compatibility difference
- 2 exact shared matches: both Llama 3.2 vision models

| Aspect | Built-in `nvidia` | This extension `nvidia-nim` |
|--------|-------------------|-----------------------------|
| Models | 20 curated | 16 curated |
| Shared catalog | 11 models | 11 models |
| Thinking control | Basic metadata; DeepSeek has a native `deepseek` map, but no NIM-specific Kimi, GLM, or Nemotron transforms | Family-specific thinking maps and request transforms |
| Compatibility baseline | `supportsStrictMode: false`, `supportsLongCacheRetention: false`, `supportsStore: false` | Same baseline on every model, plus NIM-specific flags |
| Request normalization | No | Content arrays, `max_tokens`, reasoning replay, and model-specific extras |
| API key | `NVIDIA_API_KEY` | `NVIDIA_NIM_API_KEY` with `NVIDIA_API_KEY` fallback |

The comparison includes headers, reasoning/input declarations, cost, context window, output limit, reasoning budget, thinking-level maps, example request extras, and every compatibility key. Provider-level fields such as `api`, `provider`, and `baseUrl` are intentionally reported separately rather than treated as per-model differences.

The remaining differences are not all defects. Pi's official catalog supplies its own limits and prices for models such as Kimi K3, Nemotron 3 Super/Ultra, and GPT-OSS 20B. The extension retains card-derived or probe-verified values where the hosted NIM request contract differs. It also adds `reasoningBudget`, `thinkingFormat`, `requiresReasoningContentOnAssistantMessages`, `supportsUsageInStreaming`, and `exampleRequestExtra` fields that the official catalog does not carry.

Official-only models are Gemma 3 4B/12B, Mistral 7B Instruct v0.3, Kimi K2.6, Cosmos Reason2 8B, and the two legacy Llama 3.1 Nemotron entries — every one of them answers 404 "Function not found for account", so the built-in catalog advertises entries that cannot be called. Extension-only models are DeepSeek V4.1 Flash, DiffusionGemma 26B, Gemma 4 31B, and Mistral Nemotron. The comparison reads pi-ai's bundled catalog snapshot, which now also carries `z-ai/glm-5.3` and `z-ai/glm-5.3-flash`, so those two count as shared.

Use `nvidia-nim/...` when you need the NIM-specific thinking transforms and compatibility flags. Use `nvidia/...` for Pi's native handling of its curated catalog.

### Models with thinking support

DeepSeek V4.1 Flash, GLM-5.3 and GLM-5.3 Flash, Kimi K3, Muse Glimmer, DiffusionGemma, Nemotron (3-Nano Omni, 3-Super, 3-Ultra, 3.5 Lightning), GPT-OSS 20B, and Laguna XS 2.1.

- GLM-5.3 and GLM-5.3 Flash keep thinking permanently on — both build cards state the generation prompt opens a think block unconditionally, and live requests with `enable_thinking: false` or `thinking: {"type":"disabled"}` still returned `reasoning_content`. The effort ladder is `low` / `high` / `max` (default `max`; any other value falls back to `max`), so pi offers exactly those three levels: `off`, `minimal`, `medium`, and `xhigh` map to `null` and are hidden rather than aliased onto a neighbouring effort. `clear_thinking` defaults to `false` in the chat template, so the extension injects `chat_template_kwargs.clear_thinking: true` for chat turns.
- DeepSeek V4: live NIM requests confirmed content-only non-think and separate `reasoning_content` for high and max via `chat_template_kwargs`. Pi exposes only `off`, `high`, and `max` for these models; `reasoning_effort` travels inside `chat_template_kwargs`.
- The extension ships one DeepSeek V4 endpoint: `deepseek-ai/deepseek-v4.1-flash`. The older IDs are all gone — the unsuffixed `deepseek-v4-flash`/`deepseek-v4-pro` and `deepseek-ai/deepseek-v4-pro-0813` reached end of life on 2026-08-07 and 2026-09-14, and `deepseek-ai/deepseek-v4-flash-0731` (shipped by 1.8.1) followed on **2026-09-21**: it now answers `410 Gone` with that date and has dropped from `/v1/models`. Its build card still returns 200, as all three earlier ones do, so only the live sweep proves liveness.
- DeepSeek V4.1 Flash (`deepseek-ai/deepseek-v4.1-flash`, build-listed 2026-09-18) is a text/image Mixture-of-Experts release with a **combined** 1,048,576-token input+output window, OpenAI-format tool calls, and a 262,144-token output cap — the card's own `max_tokens` default. The card publishes `max_tokens.maximum` = 1,048,576, i.e. the whole context; the extension ships the documented default instead, because prompt and completion share that window — a cap equal to it is a parameter bound, not an output budget. Although the release declares no Jinja chat template and its documented schema lists no thinking parameter, the hosted endpoint implements the same `chat_template_kwargs` protocol as V4 Flash: probes on 2026-09-25 showed `thinking: false` suppressing reasoning entirely (0 reasoning chars vs 74 for the unparameterised baseline), `reasoning_effort: "max"` deepening it (122), and `"high"` matching the default, so pi offers the same off/high/max ladder. Top-level `reasoning_effort` — string `"none"` and numeric `100`, DeepSeek's documented 1–100 reference encoding — answered `504` with no usable body. Expect heavy queueing: `/v1/models` answers in ~200 ms, while an accepted completion waited ~198 s for its first byte; when the queue is saturated the gateway answers `504` after roughly 300 s with an empty body, which is admission pressure rather than a parameter problem (requests with a 1,024-token cap fail the same way at the same moment).
- GLM-5.3 Flash has its own build card now (`build.nvidia.com/z-ai/glm-5-3-flash`, published mid-September 2026), which confirms text/image input up to 8 images per request, structured output, OpenAI-format tool calls, and the same 1,048,576-token context and `low`/`high`/`max` ladder as GLM-5.3. Earlier it was shipped from live probes alone, and during that rollout roughly one request in three answered `404 Function ...: Not found for account` — those 404s did not reproduce on 2026-09-17. Both GLM endpoints are currently slow rather than unavailable: re-probes measured 57–123 s to first byte with occasional 150 s+ stalls, so retry long before concluding the endpoint is down (pi does not retry 404).
- Retired on the hosted endpoint: Step-3.7 Flash (2026-08-28), Nemotron 3 Nano 30B (2026-09-01), GPT-OSS 120B (2026-09-03), MiniMax M3 (2026-09-09), DeepSeek V4 Pro 0813 (2026-09-14), DeepSeek V4 Flash 0731 (2026-09-21). All six answer `410 Gone` with an explicit end-of-life date, but their build-page cards still return 200, so the live aliveness sweep — not the card — is the liveness signal.
- Kimi K3 (`moonshotai/kimi-k3`) is the newest Moonshot model on NIM: text/image input, 1,048,576-token context (NVIDIA's official card value), 65,536-token output, OpenAI-format tool calls, a boolean `chat_template_kwargs.thinking` toggle plus card-documented `reasoning_effort` levels (`low` / `high` / `max`), and separate `reasoning_content`. The card became officially listed on the build page on 2026-08-28; before that the extension carried it from live probes alone. **Practical warning: it is near unusable at times** — probe latency ranged from 1 s to 46 s for the same request and the free-tier endpoint repeatedly rate-limits (429) in bursts, so expect intermittent multi-minute-feeling turns; treat it as a capacity-constrained endpoint.
- Muse Glimmer 30B supports text and image input with a 131,072-token context. Hosted NIM accepts top-level `reasoning_effort` and streams separate `reasoning_content`; `none` was accepted but still produced reasoning in live probes.
- Nemotron 3.5 Lightning 30B has a 1,048,576-token context with text input. NVIDIA documents no `reasoning_effort`; thinking is toggled via `enable_thinking` with a top-level `reasoning_budget` (default 16384, max 32768). Live probes confirmed `enable_thinking: false` and `reasoning_effort: none` both stop reasoning, and tool calls work.

### Verified compatibility matrix

A `probe-passed` transport result means the request shape produced the expected response. It does not guarantee every tool or prompt combination works.

| Model | Reasoning control | Request | Response | Streaming | Tools |
|-------|-------------------|---------|----------|-----------|-------|
| DeepSeek V4.1 Flash | off / high / max | `chat_template_kwargs` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| GLM-5.3 | low / high / max (exactly three levels); always-on | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| GLM-5.3 Flash | low / high / max (exactly three levels); always-on; image input (up to 8/request) | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| Kimi K3 | off / low / high / max | `chat_template_kwargs.thinking` + top-level `reasoning_effort` (card-documented; on/off probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| Laguna XS 2.1 | on / off toggle | `enable_thinking` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | unknown |
| Muse Glimmer 30B | none / minimal / low / medium / high / max | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Nemotron 3.5 Lightning 30B | enable_thinking on/off | `enable_thinking` + `reasoning_budget` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |

Probe dates: GLM-5.3 and GLM-5.3 Flash were probed on 2026-09-16 (effort-ladder depth, tools, streaming, vision for Flash) and re-probed on 2026-09-17 for latency; the remaining rows were verified in August 2026 releases. Kimi K3 on/off thinking, tools, streaming, and vision were probed on 2026-08-27, and its effort ladder follows NVIDIA's own build-card documentation (2026-08-28) with the depth difference between levels unverified due to endpoint capacity. DeepSeek V4.1 Flash was probed on 2026-09-25 — baseline, `thinking: false`, `high`, `max`, and both top-level effort shapes; its ~198 s wait for a first byte is the latency to expect at the moment.

The remaining models work through their family rules, but don't call them live-verified unless they appear in this matrix or have a matching compatibility report.

### Additional capabilities

- Rate-limit warnings: shows HTTP 429 responses with retry-after info.
- Request content normalization: converts `[{type:"text"}]` to plain strings for older models that reject structured content arrays.
- 15-family regex routing: assigns thinking formats and compat settings across all 16 models.
- Per-model reasoning effort mapping: non-standard values like off or minimal are mapped automatically to what the model expects.
- No custom `streamSimple`: uses `before_provider_request` event hook, avoiding provider conflicts.

## Image generation

The `nvidia-nim` provider also registers **image** models (`type: "image"`) on a dedicated `nvidia-nim-images` API adapter. Image requests go straight to NVIDIA's per-model `genai` endpoints — never through chat/completions and never through the chat thinking transforms. The chat catalog is untouched: the provider registers the mixed chat + image catalog at once, so a refresh that replaces models must rebuild the combined list (`PROVIDER_MODEL_CONFIGS` in `index.ts`).

### Supported image models

| Model | ID | Input | Output | Verified |
|-------|----|-------|--------|----------|
| FLUX.2 Klein 4B | `black-forest-labs/flux.2-klein-4b` | text | image | live requests 2026-10-02: square, landscape, portrait, and ultrawide RGB JPEGs |

`output: ["image"]` describes Klein\'s generative modality. The adapter can also append deterministic seed notes and dropped-artifact warnings as text blocks in the result; these are diagnostics, not model-generated text. Native callers should process those diagnostic blocks rather than assume every result block is an image.

Klein-only for now, deliberately: other catalog listings (Qwen Image, Stable Diffusion) carry examples pointing at FLUX.1 Dev and their hosted endpoints are not established, so no misleading model IDs are registered. Additional models require a capability record backed by successful hosted generation; timeout-only evidence cannot qualify registration. FLUX.1 Dev and Schnell are probe-only candidates, not registered models. Kontext's hosted preview supports only predefined `example_id` images, not arbitrary image uploads. Container documentation describes a different API contract. See [image evidence and probing](IMAGE_GENERATION.md).

### Verified parameters

| Parameter | Accepted | Default | Evidence |
|-----------|----------|---------|----------|
| `prompt` | non-empty text, maximum 10,000 characters | — | hosted-schema length limit |
| `width`, `height` | each 512–1568 inclusive, multiples of 16 | `1024×1024` | both hosted validator enums confirmed; no rounding or resizing; additional server combination constraints may apply |
| `aspect_ratio` | `1:1`, `4:3`, `16:9`, `9:16`, `21:9` | omitted (square) | fixed convenience mappings, not a NVIDIA field; 16:9 / 9:16 are approximate |
| `steps` | `1`–`4` | `4` | documented range; `4` tested |
| `samples` | `1` | `1` | documented `1` only; `1` tested |
| `seed` | integer `0`–`4294967295` (`0` = random) | omitted (random) | uint32 bound from hosted schema; `42` tested and echoed per artifact |
| `cfg_scale` | ≥ `1` | `1` | the live endpoint rejects `0` with HTTP 422 although the published schema says "0 to 0"; `1` tested; **upper limit unverified** |

Separate live hosted validation responses confirmed both width and height as 512–1568 inclusive in steps of 16. Generation now accepts these grids instead of a fixed pair whitelist. For example, `width: 1536, height: 864` is locally valid; `1000×750` is rejected without a request. Omitted (`undefined`) dimensions default independently to 1024; explicit `null` settings, including `aspect_ratio`, fail locally instead of silently requesting defaults. There is no silent rounding, cropping, or client resizing. Existing aspect-ratio aliases keep their dimension mappings and reject conflicting explicit dimensions. Representative outputs have been decoded, but not every grid combination has been generated; additional server restrictions are returned as structured errors, not hidden or automatically retried.

### Editing availability

The hosted Klein preview accepts predefined NVIDIA examples, not users\' own images. Preset editing was removed in 1.14.2 because it does not meet that goal. The tool and native adapter now expose generation only for Klein; legacy `preset_example` values fail locally instead of silently generating a new image. Historical preset-probe findings remain in `IMAGE_GENERATION.md`.

Request translation: text becomes `prompt`; the URL identifies the model (no `model` body field). `aspect_ratio` resolves locally to width/height and is not sent. Conflicting explicit dimensions are rejected. `16:9` is landscape (`1344×768`), unlike the playground's reversed label. Model-card presets are not a generation whitelist; explicit dimensions are validated against the live hosted grid. Raster format descriptions do not establish a hosted output-format selector.

`mode` is **never** sent: it previously received HTTP 422. The playground's editing template adds an `image` array to the same endpoint instead. Our actual JPEG data-URL array and PNG data-URL string uploads both received 422; the PNG response contained a preset `example_id` hint. Arbitrary-image editing remains disabled. The `inputImage` option fails locally before reading/uploading a source for Klein. Shared data-URL transport plumbing is implemented for future verified models, but enabling it requires separate editing evidence. Negative-prompt, output-format, compression, and dedicated seamless-generation controls remain unsupported.

### Native usage (codemode)

```js
// @options: {"timeout_ms": 300000}
const painter = await models.getModelOfType("image", "nvidia-nim", "black-forest-labs/flux.2-klein-4b");
const result = await models.generateImages(painter, {
  input: [{ type: "text", text: "A studio product photograph of a red fox in the snow, watercolor" }],
});
if (result.stopReason !== "stop") return result.errorMessage;
for (const block of result.output) {
  if (block.type === "image") image(block);
  else text(block.text);
}
```

The catalog endpoint is the default; requests honor the resolved model `baseUrl` and authentication-provided endpoint overrides. The advanced tool uses the same Pi runtime authentication path, including configured headers and header-only credentials. Pi's current `models.json` `modelOverrides` apply to chat models only, not image models.

Native generation returns images and **never saves them to disk**. Output blocks are base64 image blocks with the actual detected MIME type — the format is sniffed from magic bytes (JPEG, PNG, WebP) instead of assumed. Small text blocks report per-artifact seeds (`artifact 1: seed=42`) so a run can be reproduced.

### Advanced tool: `nim-generate-image`

Pi's `models.generateImages()` interface only accepts text/image input blocks, so the extension registers a `nim-generate-image` tool that exposes the verified settings and explicit file saving. It calls the same shared client as the native adapter with pi's credential resolution. It has `codemode` exposure: it is listed for `codemode` scripts (`tools.nim_generate_image(...)`) and is not declared to the model unless activated (`--tools nim-generate-image` or `"defaultTools"` in settings).

```js
// @options: {"timeout_ms": 300000}
const result = await tools.nim_generate_image({
  prompt: "A studio product photograph of a red fox in the snow, watercolor",
  aspect_ratio: "16:9", // landscape 1344x768; omit for square
  seed: 42,
  steps: 4,
  cfg_scale: 1,
  saveDir: "out",
});
if (result.isError) return result.errorMessage ?? result.saveError;
return result.savedPaths;
```

Codemode receives the tool’s structured result, including `isError`: generation failures provide `errorMessage`, while save failures provide `saveError` and preserve the generated images. Input validation throws and can be handled with `try`/`catch`; runtime authentication failures return structured error results.

Parameters: `prompt` (required), `model`, `width`, `height`, `aspect_ratio`, `inputImage` (gated; no currently registered model supports arbitrary-image editing), `seed`, `steps`, `cfg_scale`, `saveDir`, `fileName`. The structured result reports the operation and resolved settings, including actual requested dimensions. Saving rules:

- Nothing is written to disk unless `saveDir` is given. Relative directories resolve against pi’s session workspace (`ctx.cwd`); saved paths are absolute.
- Files keep the **original encoded bytes** (no re-encoding); the extension corrects a mismatched filename extension to the detected format (`.jpg` / `.png` / `.webp`, with matching `.jpeg` preserved). Multi-image suffixes precede the extension: `shot-1.jpg`, `shot-2.jpg`.
- Existing files are **never overwritten**: an existing target is refused and reported, and the generated images are still returned. Directory-creation and write failures likewise return `saveError` without discarding images.
- Every saved path is reported in the result (`savedPaths`, `structuredContent.images[].savedPath`).

### Output, errors, and cost

- Each artifact must be an object with `finishReason: "SUCCESS"`, canonical base64, an allowed detected MIME type, and a structurally complete JPEG/PNG/static WebP container. Malformed, filtered, unsupported, and obviously truncated artifacts are dropped independently; valid siblings remain available. These lightweight checks are **not full pixel decoding**. A run with no usable image is an error result listing why; the advanced tool also reports dropped-artifact warnings.
- HTTP errors are mapped explicitly: 401/403 authentication, 422 validation (with the server's field detail), 429 rate limit (with `retry-after` when present), 5xx server errors (with the request ID). Cancellation returns `stopReason: "aborted"`; a client-side timeout (default 5 minutes) is a distinct error. Both settle promptly even if instrumentation hooks or a custom fetch ignore cancellation; hooks themselves cannot be forcibly terminated. There are **no automatic retries**.
- NVIDIA returns **no usage or cost information** for image generation, and none is fabricated. The catalog cost fields are `$0` because pricing is **unreported — this does not mean free inference**: generated images consume NVIDIA trial credits / plan quota like any other hosted NIM call.

Diagnostic logs include only safe model/status/count information, never provider error details that might echo prompts or credentials.

### Trial / quota caveats

Image generation uses the same build.nvidia.com account and key as chat (40 requests/min free tier, 1,000 inference credits on signup). The per-image credit cost is not published and was not measured; the verified request completed in 3.62 s. Expect 429s under the free tier — the extension surfaces them with the retry-after value. Image operations make no automatic retries; Pi's global chat-turn retry settings do not automatically retry image-tool calls. Retry an image operation explicitly, accounting for quota and possible duplicate work.

## Troubleshooting

### Handling transient NIM 429 errors

This extension relies on Pi's built-in retry handling. For occasional NVIDIA NIM rate-limit responses, I currently use the following global setting in `~/.pi/agent/settings.json` as a practical starting point:

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 4,
    "baseDelayMs": 2000,
    "provider": {
      "maxRetries": 1,
      "maxRetryDelayMs": 60000
    }
  }
}
```

Pi retries the failed turn after approximately 2, 4, 8, and 16 seconds. The single provider retry can help with an immediately transient 429, while keeping the retry count limited. This configuration applies globally to Pi and is not required by the extension. Persistent 429 responses usually indicate throttling or exhausted quota; wait or select another NIM model instead of continually increasing retries.

- Confirm the selected model starts with `nvidia-nim/`. Pi's built-in `nvidia/` provider uses a different catalog and compatibility path.
- If `--thinking` appears ignored, run `npm run probe -- --model=...` from the extension checkout and check the selected model's family and verification status.
- If a model is missing, refresh the catalog and confirm the exact NIM model ID still exists on its NVIDIA model page.
- If authentication fails, check for a stored credential first (`/login nvidia-nim` or the `auth.json` entry — a stored key overrides environment variables), then `NVIDIA_NIM_API_KEY`, then the `NVIDIA_API_KEY` fallback, and verify the variable is visible to the pi process.
- Tool calling and reasoning are tracked separately. A reasoning-capable model is not automatically tool-call verified.
- Enable `NIM_DEBUG=1` only when needed. Avoid sharing payload logs without removing prompts and other sensitive data.

### HTTP 404: `Function '<uuid>': Not found for account`

NVIDIA NIM maps every model ID to an NVCF (NVIDIA Cloud Functions) function, and function registration is scoped per account. This response means the model ID resolved to a function UUID, but that function is not provisioned for your NVIDIA account:

```json
{"status":404,"title":"Not Found","detail":"Function 'ee47df99-...': Not found for account '4bwJy-...'"}
```

Nothing about the request is wrong — it never reached an inference worker. Three NVIDIA responses look similar, but only the last is permanent:

| Response | Meaning |
|----------|---------|
| `404 page not found` (plain text, no UUID) | No such model ID — a typo or a renamed endpoint. |
| `404` + `Function '<uuid>': Not found for account '<id>'` | The model exists, but your account is not entitled to it, or the function was de-provisioned. |
| `410 Gone` + "has reached its end of life on ..." | NVIDIA retired the model. Permanent. |

`GET /v1/models` is a global catalog, not an entitlement list: it reports models your account cannot call, and callable models can be missing from it. Do not use it to confirm access.

Sometimes it is transient. Newly launched models can flip between 404 and 200 across attempts while the function registration propagates across the routing fleet, so retry a few times before concluding anything — Pi's retry policy covers 429 and 5xx, but not 404. If it persists, the fix is on NVIDIA's side, not in this extension:

- Request access from the model's page on `build.nvidia.com` when it is offered.
- If every model fails, ask NVIDIA to enable the **Public API Endpoints** service for your organization (NVIDIA Developer Forums → NVIDIA NIM → Access/Accounts). NVIDIA does not document this entitlement publicly and forum answers are inconsistent.
- Generating a new API key does not help: the account, not the key, lacks the entitlement.

Entitlements are per account, so a model can fail for you and work for someone else — `moonshotai/kimi-k2.6` and `google/gemma-3-12b-it` are listed in `/v1/models` but were not callable on the account this catalog is verified with (2026-09-16). That is why models are only shipped here after a live probe on the hosted endpoint.

## Verification

The probe never runs on startup and does not write credentials, prompts, or full responses. Run it when you have an NVIDIA credential:

```bash
npm run probe -- --model=z-ai/glm-5.3 --output=glm-5.3-probe.json
```

Use `--cases` and `--timeout-ms` to skip models that are slow to respond.
