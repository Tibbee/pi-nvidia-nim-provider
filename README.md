# pi-extension-nvidia-nim

Generate images and use NVIDIA NIM chat models in Pi.

The extension adds image generation with FLUX.2 Klein 4B and model-specific thinking controls for NVIDIA's hosted chat models. You can use it alongside Pi's built-in NVIDIA provider.

For image generation, you can keep your current chat model. Configure your NVIDIA key, enable codemode, and ask:

> Use NVIDIA NIM to generate a watercolor painting of a red fox in the snow.

## Features

- Generate images from text prompts and save them to your workspace.
- Choose from 16 curated chat models for reasoning, coding, and vision.
- Use Pi's thinking settings with model-specific request handling.
- Keep Pi's built-in `openai-completions` streaming implementation.

## Install

Requires Pi 1.0.0 or later, including `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` 1.0.0+. Pi 0.x does not support this extension's image registration and authentication.

```bash
pi install npm:pi-extension-nvidia-nim
```

## Configure your NVIDIA key

Get an API key from [build.nvidia.com](https://build.nvidia.com).

### Log in through Pi

In Pi, run:

```text
/login nvidia-nim
```

Choose API-key login and paste your key. Pi stores it under `nvidia-nim` in `~/.pi/agent/auth.json`. No environment variable is needed. Choosing `nvidia` in the login menu authenticates Pi's built-in provider instead.

### Use an environment variable

For headless setups, CI, or when you prefer environment configuration:

```bash
export NVIDIA_NIM_API_KEY="nvapi-..."
```

PowerShell:

```powershell
$env:NVIDIA_NIM_API_KEY = "nvapi-..."
```

`NVIDIA_API_KEY` is also accepted as a fallback.

### Configure the auth file directly

For scripted setup, add this entry to `~/.pi/agent/auth.json`:

```json
{
  "nvidia-nim": { "type": "api_key", "key": "nvapi-..." }
}
```

A stored credential takes precedence over environment variables. To switch back to environment-based authentication, remove the stored entry with `/logout nvidia-nim`.

## Quick start

### Generate an image

Pi's codemode tool is off by default. Enable it when starting Pi:

```bash
pi --tools +codemode
```

Then ask:

> Use NVIDIA NIM to generate a watercolor painting of a red fox in the snow.

To save the image:

> Use NVIDIA NIM to generate a landscape watercolor painting of a red fox in the snow. Discover the image-generation tool through codemode and save the image in ./out.

To enable codemode for every session, merge this into `~/.pi/agent/settings.json` or a project's `.pi/settings.json`:

```json
{
  "defaultTools": ["+codemode"]
}
```

This keeps Pi's default tools and adds codemode. If you already have a `defaultTools` list, add `codemode` to it instead of replacing your existing selection. Use `+codemode` if your list uses `+name` and `-name` entries. Start a new session after changing settings.

Image models do not appear in Pi's `/model` chat picker. Codemode accesses them through `models.generateImages()` or discovers the deferred `nim-generate-image` tool with `searchTools("image")`. You do not need to enable `tool_search` separately for discovery inside codemode.

Codemode is not required for chat or reasoning. You can also use the advanced image tool without codemode if you explicitly activate it.

### Try a reasoning model

Select a model through `/model` or `Ctrl+P`, or run:

```bash
pi --provider nvidia-nim \
  --model z-ai/glm-5.3 \
  --thinking high \
  -p "Explain how to reverse a linked list."
```

Look for the `nvidia-nim/` prefix when choosing a chat model. This example should show Pi's reasoning indicator and a separate final answer. Do not include private reasoning content in issue reports.

## Image generation

The extension currently supports FLUX.2 Klein 4B for text-to-image generation. You can request dimensions, an aspect ratio, and a seed through the `nim-generate-image` tool. Files are saved only when you provide a destination, and existing files are never overwritten.

Editing your own images is not currently supported. For setup and example prompts, see [Generate an image](#generate-an-image).

Image requests use a separate `nvidia-nim-images` adapter and go straight to NVIDIA's per-model `genai` endpoints. They do not pass through chat/completions or the chat thinking transforms.

### Supported image models

| Model | ID | Input | Output | Verified |
|-------|----|-------|--------|----------|
| FLUX.2 Klein 4B | `black-forest-labs/flux.2-klein-4b` | text | image | live requests 2026-10-02: square, landscape, portrait, and ultrawide RGB JPEGs |

`output: ["image"]` describes Klein's generative modality. The adapter can also append deterministic seed notes and dropped-artifact warnings as text blocks in the result; these are diagnostics, not model-generated text. Native callers should process those diagnostic blocks rather than assume every result block is an image.

Klein-only for now, deliberately: other catalog listings (Qwen Image, Stable Diffusion) carry examples pointing at FLUX.1 Dev and their hosted endpoints are not established, so no misleading model IDs are registered. Additional models require a capability record backed by successful hosted generation; timeout-only evidence cannot qualify registration. FLUX.1 Dev and Schnell are probe-only candidates, not registered models. Kontext's hosted preview supports only predefined `example_id` images, not arbitrary image uploads. Container documentation describes a different API contract. See [image evidence and probing](IMAGE_GENERATION.md).

### Verified parameters

| Parameter | Accepted | Default | Evidence |
|-----------|----------|---------|----------|
| `prompt` | non-empty text, maximum 10,000 characters | required | hosted-schema length limit |
| `width`, `height` | each 512–1568 inclusive, multiples of 16 | `1024×1024` | both hosted validator enums confirmed; no rounding or resizing; additional server combination constraints may apply |
| `aspect_ratio` | `1:1`, `4:3`, `16:9`, `9:16`, `21:9` | omitted (square) | fixed convenience mappings, not a NVIDIA field; 16:9 / 9:16 are approximate |
| `steps` | `1`–`4` | `4` | documented range; `4` tested |
| `samples` | `1` | `1` | documented `1` only; `1` tested |
| `seed` | integer `0`–`4294967295` (`0` = random) | omitted (random) | uint32 bound from hosted schema; `42` tested and echoed per artifact |
| `cfg_scale` | ≥ `1` | `1` | the live endpoint rejects `0` with HTTP 422 although the published schema says "0 to 0"; `1` tested; **upper limit unverified** |

Separate live hosted validation responses confirmed both width and height as 512–1568 inclusive in steps of 16. Generation now accepts these grids instead of a fixed pair whitelist. For example, `width: 1536, height: 864` is locally valid; `1000×750` is rejected without a request. Omitted (`undefined`) dimensions default independently to 1024; explicit `null` settings, including `aspect_ratio`, fail locally instead of silently requesting defaults. There is no silent rounding, cropping, or client resizing. Existing aspect-ratio aliases keep their dimension mappings and reject conflicting explicit dimensions. Representative outputs have been decoded, but not every grid combination has been generated; additional server restrictions are returned as structured errors, not hidden or automatically retried.

### Editing availability

The hosted Klein preview accepts predefined NVIDIA examples, not users' own images. Preset editing was removed in 1.14.2 because it does not meet that goal. The tool and native adapter now expose generation only for Klein; legacy `preset_example` values fail locally instead of silently generating a new image. Historical preset-probe findings remain in `IMAGE_GENERATION.md`.

Request translation: text becomes `prompt`; the URL identifies the model (no `model` body field). `aspect_ratio` resolves locally to width/height and is not sent. Conflicting explicit dimensions are rejected. `16:9` is landscape (`1344×768`), unlike the playground's reversed label. Model-card presets are not a generation whitelist; explicit dimensions are validated against the live hosted grid. Raster format descriptions do not establish a hosted output-format selector.

`mode` is **never** sent: it previously received HTTP 422. The playground's editing template adds an `image` array to the same endpoint instead. Our actual JPEG data-URL array and PNG data-URL string uploads both received 422; the PNG response contained a preset `example_id` hint. Arbitrary-image editing remains disabled. The `inputImage` option fails locally before reading/uploading a source for Klein. Shared data-URL transport plumbing is implemented for future verified models, but enabling it requires separate editing evidence. Negative-prompt, output-format, compression, and dedicated seamless-generation controls remain unsupported.

### Native usage (codemode)

```js
// @options: {"timeout_ms": 300000}
const painter = await models.getModelOfType("image", "nvidia-nim", "black-forest-labs/flux.2-klein-4b");
const result = await models.generateImages(painter, {
  input: [{ type: "text", text: "A watercolor painting of a red fox in the snow" }],
});
if (result.stopReason !== "stop") return result.errorMessage;
for (const block of result.output) {
  if (block.type === "image") image(block);
  else text(block.text);
}
```

The catalog endpoint is the default; requests honor the resolved model `baseUrl` and authentication-provided endpoint overrides. The advanced tool uses the same Pi runtime authentication path, including configured headers and header-only credentials. Pi's current `models.json` `modelOverrides` apply to chat models only, not image models.

Native generation returns images and **never saves them to disk**. Output blocks are base64 image blocks with the actual detected MIME type; the format is sniffed from magic bytes (JPEG, PNG, WebP) instead of assumed. Small text blocks report per-artifact seeds (`artifact 1: seed=42`) so a run can be reproduced.

### Advanced tool: `nim-generate-image`

Pi's `models.generateImages()` interface only accepts text/image input blocks, so the extension registers a `nim-generate-image` tool that exposes the verified settings and explicit file saving. It calls the same shared client as the native adapter with pi's credential resolution. It has `deferred` exposure: it is callable from `codemode` scripts (`tools.nim_generate_image(...)`) but is not listed in the `codemode` description, so it does not consume the inline declaration budget. Scripts discover it with `searchTools("image")`, `describeTool("nim-generate-image")`, or `ALL_TOOLS`; `tool_search` can load it as a declared tool, and `--tools nim-generate-image` or `"defaultTools"` in settings activate it explicitly.

```js
// @options: {"timeout_ms": 300000}
const result = await tools.nim_generate_image({
  prompt: "A watercolor painting of a red fox in the snow",
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
- NVIDIA returns **no usage or cost information** for image generation, and none is fabricated. The catalog cost fields are `$0` because pricing is **unreported; this does not mean free inference**: generated images consume NVIDIA trial credits / plan quota like any other hosted NIM call.

Diagnostic logs include only safe model/status/count information, never provider error details that might echo prompts or credentials.

### Trial / quota caveats

Image generation uses the same build.nvidia.com account and key as chat (40 requests/min free tier, 1,000 inference credits on signup). The per-image credit cost is not published and was not measured; the verified request completed in 3.62 s. Expect 429s under the free tier; the extension surfaces them with the retry-after value. Image operations make no automatic retries; Pi's global chat-turn retry settings do not automatically retry image-tool calls. Retry an image operation explicitly, accounting for quota and possible duplicate work.

## Chat models and thinking support

NVIDIA NIM models do not all use the same thinking controls. The extension translates Pi's thinking settings into the request format each model supports and handles compatibility fixes for older endpoints.

Models with thinking support include DeepSeek V4.1 Flash, GLM-5.3 and GLM-5.3 Flash, Kimi K3, Muse Glimmer, DiffusionGemma, Nemotron (3-Nano Omni, 3-Super, 3-Ultra, 3.5 Lightning), GPT-OSS 20B, and Laguna XS 2.1.

GLM-5.3 and GLM-5.3 Flash always use thinking and offer `low`, `high`, and `max`. DeepSeek V4.1 Flash offers `off`, `high`, and `max`. Other models use their own effort levels or on/off controls.

Hosted availability and response times vary. The dates below describe recorded tests, not a guarantee of current availability. See [chat model notes](docs/chat-model-notes.md) for detailed probe findings, endpoint retirements, and latency observations.

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

Probe dates: GLM-5.3 and GLM-5.3 Flash were probed on 2026-09-16 (effort-ladder depth, tools, streaming, vision for Flash) and re-probed on 2026-09-17 for latency; the remaining rows were verified in August 2026 releases. Kimi K3 on/off thinking, tools, streaming, and vision were probed on 2026-08-27, and its effort ladder follows NVIDIA's own build-card documentation (2026-08-28) with the depth difference between levels unverified due to endpoint capacity. DeepSeek V4.1 Flash was probed on 2026-09-25; baseline, `thinking: false`, `high`, `max`, and both top-level effort shapes; its ~198 s wait for a first byte is the latency to expect at the moment.

The remaining models work through their family rules, but don't call them live-verified unless they appear in this matrix or have a matching compatibility report.

## Which NVIDIA provider should I use?

| Provider | Use it when |
|----------|-------------|
| Built-in `nvidia` | You need basic NVIDIA chat access with minimal configuration |
| `nvidia-nim` | You want this extension's image generation, model-specific thinking controls, and NIM compatibility fixes |

This package registers a separate provider named `nvidia-nim`. It does not replace Pi's built-in `nvidia` provider. Both can be used side by side.

For the historical catalog and parameter comparison, see [provider comparison notes](docs/chat-model-notes.md#comparison-with-pis-built-in-nvidia-provider). This historical comparison snapshot used Pi 0.85.1 and is not the supported runtime baseline.

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
- If authentication fails, check for a stored credential first (`/login nvidia-nim` or the `auth.json` entry; a stored key overrides environment variables), then `NVIDIA_NIM_API_KEY`, then the `NVIDIA_API_KEY` fallback, and verify the variable is visible to the pi process.
- Tool calling and reasoning are tracked separately. A reasoning-capable model is not automatically tool-call verified.
- Enable `NIM_DEBUG=1` only when needed. Avoid sharing payload logs without removing prompts and other sensitive data.

### HTTP 404: `Function '<uuid>': Not found for account`

NVIDIA NIM maps every model ID to an NVCF (NVIDIA Cloud Functions) function, and function registration is scoped per account. This response means the model ID resolved to a function UUID, but that function is not provisioned for your NVIDIA account:

```json
{"status":404,"title":"Not Found","detail":"Function 'ee47df99-...': Not found for account '4bwJy-...'"}
```

Nothing about the request is wrong; it never reached an inference worker. Three NVIDIA responses look similar, but only the last is permanent:

| Response | Meaning |
|----------|---------|
| `404 page not found` (plain text, no UUID) | No such model ID; a typo or a renamed endpoint. |
| `404` + `Function '<uuid>': Not found for account '<id>'` | The model exists, but your account is not entitled to it, or the function was de-provisioned. |
| `410 Gone` + "has reached its end of life on ..." | NVIDIA retired the model. Permanent. |

`GET /v1/models` is a global catalog, not an entitlement list: it reports models your account cannot call, and callable models can be missing from it. Do not use it to confirm access.

Sometimes it is transient. Newly launched models can flip between 404 and 200 across attempts while the function registration propagates across the routing fleet, so retry a few times before concluding anything; Pi's retry policy covers 429 and 5xx, but not 404. If it persists, the fix is on NVIDIA's side, not in this extension:

- Request access from the model's page on `build.nvidia.com` when it is offered.
- If every model fails, ask NVIDIA to enable the **Public API Endpoints** service for your organization (NVIDIA Developer Forums → NVIDIA NIM → Access/Accounts). NVIDIA does not document this entitlement publicly and forum answers are inconsistent.
- Generating a new API key does not help: the account, not the key, lacks the entitlement.

Entitlements are per account, so a model can fail for you and work for someone else; `moonshotai/kimi-k2.6` and `google/gemma-3-12b-it` are listed in `/v1/models` but were not callable on the account this catalog is verified with (2026-09-16). That is why models are only shipped here after a live probe on the hosted endpoint.

## Development and verification

See [image evidence and probing](IMAGE_GENERATION.md) and [chat model notes](docs/chat-model-notes.md) for the recorded findings behind the supported models.

The provider registers chat and image models together through `PROVIDER_MODEL_CONFIGS` in `index.ts`. Any catalog refresh must rebuild that combined list.

### Implementation

- Uses pi's built-in `openai-completions` streaming. No custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are handled via `before_provider_request` and pi's `compat` system.
- Family-based config in `config/model-families.ts` (15 families, first-match-wins) drives thinking format routing and model metadata.
- Catalog cost fields are `$0` placeholders because pricing is not reported here; they do not promise free inference. NVIDIA may offer free-tier credits, but hosted requests consume quota/credits and actual pricing depends on the endpoint and account.
- Works alongside pi's built-in `nvidia` provider. Use `nvidia-nim/...` for NIM-family-specific thinking transforms and the full catalog, `nvidia/...` for pi's native handling.

### Probe a chat model

The probe never runs on startup and does not write credentials, prompts, or full responses. Run it when you have an NVIDIA credential:

```bash
npm run probe -- --model=z-ai/glm-5.3 --output=glm-5.3-probe.json
```

Use `--cases` and `--timeout-ms` to skip models that are slow to respond.

### Compare with Pi's built-in provider

From the extension checkout, generate a comparison against your installed Pi:

```bash
npm run compare:pi -- \
  --json-output=tools/output/pi-nvidia-compare.json \
  --markdown-output=tools/output/pi-nvidia-compare.md
```
