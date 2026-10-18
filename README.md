# pi-extension-nvidia-nim

Generate images and use NVIDIA NIM chat models in Pi.

The extension adds image generation with FLUX 3 Image Klein (default) and FLUX.2 Klein 4B, plus model-specific thinking controls for NVIDIA's hosted chat models. You can use it alongside Pi's built-in NVIDIA provider.

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

The extension supports FLUX 3 Image Klein (default) and FLUX.2 Klein 4B for text-to-image generation. Select a model explicitly to use FLUX.2; omitted model selections keep FLUX 3. You can request dimensions, an aspect ratio, and a seed through the `nim-generate-image` tool. Files are saved only when you provide a destination, and existing files are never overwritten.

Editing your own images is not currently supported. For setup and example prompts, see [Generate an image](#generate-an-image).

Image requests use a separate `nvidia-nim-images` adapter and go straight to NVIDIA's per-model `genai` endpoints. They do not pass through chat/completions or the chat thinking transforms.

### Supported image models

| Model | ID | Input | Output | Verified |
|-------|----|-------|--------|----------|
| FLUX 3 Image Klein | `black-forest-labs/flux-3-image-klein` | text | image | live request 2026-10-17: fully decoded 1024×1024 JPEG; hosted validation confirms both dimension axes |
| FLUX.2 Klein 4B | `black-forest-labs/flux.2-klein-4b` | text | image | fresh decoded 1024×1024 JPEG on 2026-10-17; additional sizes verified 2026-10-02 |

`output: ["image"]` describes Klein's generative modality. The adapter can also append deterministic seed notes and dropped-artifact warnings as text blocks in the result; these are diagnostics, not model-generated text. Native callers should process those diagnostic blocks rather than assume every result block is an image.

Klein-only for now, deliberately: Qwen Image/Edit listings carry examples pointing at FLUX.1 Dev and independent hosted Qwen endpoints are not established. Stable Diffusion XL and Stable Diffusion 3 Medium hosted endpoints are explicitly deprecated, so no misleading model IDs are registered. Additional models require a capability record backed by successful hosted generation; timeout-only evidence cannot qualify registration. FLUX.1 Dev and Schnell are probe-only candidates, not registered models. Kontext's hosted preview supports only predefined `example_id` images, not arbitrary image uploads. Container documentation describes a different API contract. See [image evidence and probing](IMAGE_GENERATION.md).

### Choose between the Klein models

Both models use the same `nim-generate-image` tool and Pi authentication. The tool's `model` field lists both IDs. Omit `model` for FLUX 3, or set `model: "black-forest-labs/flux.2-klein-4b"` for FLUX.2. Native callers pass the desired ID to `models.getModelOfType("image", "nvidia-nim", id)`. Image models remain outside the chat `/model` picker.

| Setting | FLUX 3 Image Klein | FLUX.2 Klein 4B |
|---|---|---|
| Selection | Default | Explicit `model` selection |
| Prompt limit | 2000 characters | **800 characters** (current hosted validation; published 10000-character schema is stale) |
| Steps | 1–50; default 50 | 1–4; default 4 |
| Guidance | >1 through 20; default 3.5 | ≥1; default 1; upper bound unknown |
| Dimensions | Each 512–1568 in increments of 16; total ≤1,062,400 pixels | Same grid and combined limit |
| Structured layout guidance | Optional `layout` rows, approximate placement | Disabled: layout swap was unreliable |
| Arbitrary-image editing | Disabled | Disabled |

Omit `steps` and `cfg_scale` to use the selected model's defaults. Explicit values are validated for that model; they are never silently adjusted or retried against a different model.

```js
// FLUX.2: resolves steps 4 and guidance 1 independently of FLUX 3.
const result = await tools.nim_generate_image({
  model: "black-forest-labs/flux.2-klein-4b",
  prompt: "A watercolor fox in the snow",
  saveDir: "out",
});
```

### Layout guidance with FLUX 3

Use a full scene caption and name each element as `<id>`. Optional `layout` rows contain the matching `id`, a `[top,left,bottom,right]` box on a 0–1000 grid, and `desc`. The extension validates the rows and appends their JSON to the caption inside `prompt`; it sends no `layout` body field. The caption and rows together must fit the 2000-character limit. It preserves your text and row order without automatic rewriting or truncation.

```js
const result = await tools.nim_generate_image({
  prompt: "A clean flat graphic on white with a red square <red_square> and a blue circle <blue_circle>.",
  layout: [
    { id: "red_square", bbox: [300, 75, 625, 400], desc: "One solid red square." },
    { id: "blue_circle", bbox: [300, 600, 625, 925], desc: "One solid blue circle." },
  ],
  seed: 42,
  saveDir: "out",
});
```

Fixed-seed hosted probes moved the elements to opposite sides when their boxes were swapped. This is **approximate layout guidance**, not a mask or a guarantee of exact geometry: some tested shapes stretched or clipped. FLUX.2 did not follow the swap reliably and rejects the structured option locally. The 20-row maximum is a local input limit. Native adapter callers with access to `ImagesOptions` can pass the same rows through `metadata.layout`; use the tool for advanced options in codemode.

Describe framing, subjects, background, lighting and style in your caption. Prompt expansion by an LLM can be done before calling the tool; the extension does not silently rewrite prompts or claim to run NVIDIA/BFL's separate prompt upsampler.

### FLUX 3 parameters


| Parameter | Accepted | Default | Evidence |
|-----------|----------|---------|----------|
| `prompt` | non-empty text, maximum 2,000 characters | required | hosted-schema limit confirmed by live 422 |
| `width`, `height` | each 512–1568 inclusive, multiples of 16; **width × height ≤1,062,400** | `1024×1024` | axis grids and combined ceiling confirmed; 800×1328 boundary fully decoded for both models |
| `layout` | optional rows `{id,bbox,desc}`; caption must include every `<id>` | omitted | approximate FLUX 3 placement observed in opposite-layout probes; compiles into prompt |
| `aspect_ratio` | `1:1`, `4:3`, `16:9`, `9:16`, `21:9` | omitted (square) | fixed convenience mappings, not a NVIDIA field; 16:9 / 9:16 are approximate |
| `steps` | `1`–`50` | `50` | hosted maximum confirmed by 422; `50` tested |
| `samples` | `1` | `1` | documented `1` only; `1` tested |
| `seed` | integer `0`–`4294967295` (`0` = random) | omitted (random) | uint32 bound from hosted schema; `42` tested and echoed per artifact |
| `cfg_scale` | > `1` and ≤ `20` | `3.5` | hosted-schema bounds; only `3.5` generation-tested |

Both Klein endpoints require the per-axis grid **and** the combined pixel ceiling. For example, 1536×672 is locally valid, while 1536×864 and 1568×1568 exceed 1,062,400 pixels and fail before dispatch. Square 1024×1024 and boundary 800×1328 outputs fully decoded for both models; other FLUX.2 sizes have earlier evidence. Not every admitted combination has been generated. Omitted (`undefined`) dimensions default independently to 1024; explicit `null` settings fail locally. There is no rounding, cropping, resizing or retry at a different size. Existing aspect-ratio aliases retain their mappings and conflict checks.

### Editing availability

The hosted Klein preview accepts predefined NVIDIA examples, not users' own images. Preset editing was removed in 1.14.2 because it does not meet that goal. The tool and native adapter now expose generation only for Klein; legacy `preset_example` values fail locally instead of silently generating a new image. Historical preset-probe findings remain in `IMAGE_GENERATION.md`.

Request translation: text becomes `prompt`; the URL identifies the model (no `model` body field). `aspect_ratio` resolves locally to width/height and is not sent. Conflicting explicit dimensions are rejected. `16:9` is landscape (`1344×768`). Model-card presets are not a generation whitelist; explicit dimensions are validated against the live hosted grid. Raster format descriptions do not establish a hosted output-format selector.

`mode` is **never** sent: the verified FLUX 3 generation request follows the build playground, which omits it. The endpoint is `https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein`. The reference documentation instead spells the URL `flux.3-image-klein`; that dotted URL returned HTTP 404 while the hyphenated playground URL generated successfully.

Fresh hosted probes rejected both PNG data-URL arrays and strings for each Klein model. FLUX 3 explicitly answered that it expected a preset `example_id` instead of actual image data. Arbitrary-image editing stays disabled; `inputImage` fails locally before reading/uploading a source, and multi-reference input is not exposed. Preset editing is not reintroduced. Negative prompts, output-format selection, compression, and dedicated seamless-generation controls remain unsupported.

### Native usage (codemode)

```js
// @options: {"timeout_ms": 300000}
const painter = await models.getModelOfType("image", "nvidia-nim", "black-forest-labs/flux-3-image-klein");
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
  steps: 50,
  cfg_scale: 3.5,
  saveDir: "out",
});
if (result.isError) return result.errorMessage ?? result.saveError;
return result.savedPaths;
```

Codemode receives the tool’s structured result, including `isError`: generation failures provide `errorMessage`, while save failures provide `saveError` and preserve the generated images. Input validation throws and can be handled with `try`/`catch`; runtime authentication failures return structured error results.

Parameters: `prompt` (required), `model`, `width`, `height`, `aspect_ratio`, `layout` (FLUX 3 guidance), `inputImage` (gated; no currently registered model supports arbitrary-image editing), `seed`, `steps`, `cfg_scale`, `saveDir`, `fileName`. The structured result reports the operation and resolved settings, including actual requested dimensions. Saving rules:

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

Image generation uses the same build.nvidia.com account and key as chat (40 requests/min free tier, 1,000 inference credits on signup). The per-image credit cost is not published and was not measured; the FLUX 3 verification request completed in 5.05 s. Expect 429s under the free tier; the extension surfaces them with the retry-after value. Image operations make no automatic retries; Pi's global chat-turn retry settings do not automatically retry image-tool calls. Retry an image operation explicitly, accounting for quota and possible duplicate work.

## Chat models and thinking support

NVIDIA NIM models do not all use the same thinking controls. The extension translates Pi's thinking settings into the request format each model supports and handles compatibility fixes for older endpoints.

Models with thinking support include DeepSeek V4.1 Flash, GLM-5.3 and GLM-5.3 Flash, Step 5 Preview, Muse Glimmer, DiffusionGemma, Nemotron (3-Nano Omni, 3-Super, 3-Ultra, 3.5 Lightning, 3.5 Super VL), GPT-OSS 20B, and Laguna XS 2.1.

GLM-5.3 and GLM-5.3 Flash always use thinking and offer `low`, `high`, and `max`. DeepSeek V4.1 Flash offers `off`, `high`, and `max`. Step 5 Preview always reasons and exposes one on level, with no effort/disable control. Nemotron 3.5 Super VL offers `off`, `low`, and `high`; the extension translates them into the playground's chat-template flags. Other models use their own effort levels or on/off controls.

The 2026-10-17 retirement audit removed **Mistral Nemotron** (notice: September 27/28) and **Kimi K3** (October 14/15), both confirmed by explicit HTTP 410 responses. **GLM-5.3 stays registered**: its announced October 27/28 retirement is still in the future. All timeout/503 results remain registered; availability failures do not prove deprecation. See the [full audit](docs/chat-model-notes.md#catalog-audit-2026-10-17).

Hosted availability and response times vary. The dates below describe recorded tests, not a guarantee of current availability. See [chat model notes](docs/chat-model-notes.md) for detailed probe findings, endpoint retirements, and latency observations.

### Verified compatibility matrix

A `probe-passed` transport result means the request shape produced the expected response. It does not guarantee every tool or prompt combination works.

| Model | Reasoning control | Request | Response | Streaming | Tools |
|-------|-------------------|---------|----------|-----------|-------|
| Step 5 Preview | always-on; one on level, no effort controls | server defaults (probe-passed) | `reasoning_content` (probe-passed) | probe-passed 2026-10-17 | documented |
| Nemotron 3.5 Super VL | off / low / high | `enable_thinking` / `low_effort` (probe-passed) | separate `reasoning_content`; none when off (probe-passed) | probe-passed 2026-10-17 | documented |
| DeepSeek V4.1 Flash | off / high / max | `chat_template_kwargs` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| GLM-5.3 | low / high / max (exactly three levels); always-on | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| GLM-5.3 Flash | low / high / max (exactly three levels); always-on; image input (up to 8/request) | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| Laguna XS 2.1 | on / off toggle | `enable_thinking` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | unknown |
| Muse Glimmer 30B | none / minimal / low / medium / high / max | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Nemotron 3.5 Lightning 30B | enable_thinking on/off | `enable_thinking` + `reasoning_budget` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |

Probe dates: GLM-5.3 and GLM-5.3 Flash were probed on 2026-09-16 (effort-ladder depth, tools, streaming, vision for Flash) and re-probed on 2026-09-17 for latency; Step 5 Preview and Super VL were probed on 2026-10-17; the older remaining rows were verified in August 2026 releases. Kimi K3's historical findings remain in the source records, but it is no longer registered. DeepSeek V4.1 Flash was probed on 2026-09-25; baseline, `thinking: false`, `high`, `max`, and both top-level effort shapes; its ~198 s wait for a first byte is the latency to expect at the moment.

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

Entitlements are per account, so a model can fail for you and work for someone else; `moonshotai/kimi-k2.6` and `google/gemma-3-12b-it` are listed in `/v1/models` but were not callable on the account this catalog is verified with (2026-09-16). New model verification records distinguish successful hosted probes from documentation and inconclusive access failures.

## Development and verification

See [image evidence and probing](IMAGE_GENERATION.md) and [chat model notes](docs/chat-model-notes.md) for the recorded findings behind the supported models.

The provider registers chat and image models together through `PROVIDER_MODEL_CONFIGS` in `index.ts`. Any catalog refresh must rebuild that combined list.

### Implementation

- Uses pi's built-in `openai-completions` streaming. No custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are handled via `before_provider_request` and pi's `compat` system.
- Family-based config in `config/model-families.ts` (17 families, first-match-wins) drives thinking format routing and model metadata.
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

### Audit retirements without treating outages as removal evidence

```bash
npm run audit:retirements -- --output=tools/output/retirement-audit.json
```

The audit makes one tiny request per chat model, without retries. Only an explicit retirement response qualifies a model for removal. HTTP 404/429/5xx and timeouts are inconclusive. After updating the generator's evidence-backed retired-ID list, `npx tsx tools/fetch_nim_metadata.ts --prune-retired` removes those rows from generated metadata without refreshing unrelated entries. Future-dated notices stay documented until effective retirement.
