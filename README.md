# pi-extension-nvidia-nim

NVIDIA NIM exposes a lot of reasoning models through an OpenAI-compatible API, but their thinking controls are not actually compatible with each other. Pi's standard `--thinking` option may get ignored, or reasoning might need model-family-specific request fields.

`pi-extension-nvidia-nim` adds a model-aware `nvidia-nim` provider for Pi. It maps Pi thinking levels to the request format each NVIDIA NIM family expects, while keeping Pi's built-in `openai-completions` streaming path.

## Features

- 16 curated models for chat, reasoning, code, and vision — every one verified live against hosted NIM as of 2026-09-16
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
- All cost fields are `$0` because NVIDIA NIM is free tier.
- Works alongside pi's built-in `nvidia` provider. Use `nvidia-nim/...` for NIM-family-specific thinking transforms and the full catalog, `nvidia/...` for pi's native handling.

## Comparison with Pi's built-in `nvidia` provider

The installed Pi 0.85.1 provider currently exposes 20 NVIDIA models in the bundled catalog used by the comparison (21 at runtime, which additionally lists `z-ai/glm-5.3-flash`). This extension exposes 16. The comparison is reproducible with:

```bash
npm run compare:pi -- \
  --json-output=tools/output/pi-nvidia-compare.json \
  --markdown-output=tools/output/pi-nvidia-compare.md
```

At this revision the report contains:

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

Official-only models are DeepSeek V4 Pro 0813, MiniMax M3, Gemma 3 4B/12B, Mistral 7B Instruct v0.3, Kimi K2.6, Cosmos Reason2 8B, and the two legacy Llama 3.1 Nemotron entries — the first two are retired on the hosted endpoint, and the rest answer 404 "Function not found for account", so the built-in catalog advertises entries that cannot be called. Extension-only models are DiffusionGemma 26B, Gemma 4 31B, Mistral Nemotron, GLM-5.3, and GLM-5.3 Flash. The comparison reads pi-ai's bundled catalog snapshot, so `z-ai/glm-5.3-flash` shows as extension-only here even though pi's runtime listing already includes it.

Use `nvidia-nim/...` when you need the NIM-specific thinking transforms and compatibility flags. Use `nvidia/...` for Pi's native handling of its curated catalog.

### Models with thinking support

DeepSeek V4 Flash 0731, GLM-5.3 and GLM-5.3 Flash, Kimi K3, Muse Glimmer, DiffusionGemma, Nemotron (3-Nano Omni, 3-Super, 3-Ultra, 3.5 Lightning), GPT-OSS 20B, and Laguna XS 2.1.

- GLM-5.3 and GLM-5.3 Flash keep thinking permanently on — NVIDIA's card states the generation prompt opens a think block unconditionally, and live requests with `enable_thinking: false` or `thinking: {"type":"disabled"}` still returned `reasoning_content`. The effort ladder is `low` / `high` / `max` (default `max`; any other value falls back to `max`), so pi exposes no `off` level. `clear_thinking` defaults to `false` in the chat template, so the extension injects `chat_template_kwargs.clear_thinking: true` for chat turns.
- DeepSeek V4: live NIM requests confirmed content-only non-think and separate `reasoning_content` for high and max via `chat_template_kwargs`. Pi exposes only `off`, `high`, and `max` for these models; `reasoning_effort` travels inside `chat_template_kwargs`.
- The extension ships `deepseek-ai/deepseek-v4-flash-0731` as its only DeepSeek V4 endpoint. NVIDIA retired the unsuffixed `deepseek-v4-flash`/`deepseek-v4-pro` IDs on 2026-08-07 and `deepseek-ai/deepseek-v4-pro-0813` reached end of life on 2026-09-14 (HTTP 410). The Flash 0731 endpoint is live but intermittent: probe requests have answered in a few seconds and also hung past 150 s without a first byte.
- GLM-5.3 Flash is **live on the API but has no NVIDIA build-page card** (the card exists only for GLM-5.3) and is not in the comparison snapshot's official catalog. It is also the flakiest endpoint here: roughly one request in three answered `404 Function ...: Not found for account` before succeeding on retry. Pi does not retry 404, so occasional hard failures are expected — prefer GLM-5.3 when you need stability.
- Retired on the hosted endpoint: Step-3.7 Flash (2026-08-28), Nemotron 3 Nano 30B (2026-09-01), GPT-OSS 120B (2026-09-03), MiniMax M3 (2026-09-09), DeepSeek V4 Pro 0813 (2026-09-14). All five answer `410 Gone` with an explicit end-of-life date, but their build-page cards still return 200, so the live aliveness sweep — not the card — is the liveness signal.
- Kimi K3 (`moonshotai/kimi-k3`) is the newest Moonshot model on NIM: text/image input, 1,048,576-token context (NVIDIA's official card value), 65,536-token output, OpenAI-format tool calls, a boolean `chat_template_kwargs.thinking` toggle plus card-documented `reasoning_effort` levels (`low` / `high` / `max`), and separate `reasoning_content`. The card became officially listed on the build page on 2026-08-28; before that the extension carried it from live probes alone. **Practical warning: it is near unusable at times** — probe latency ranged from 1 s to 46 s for the same request and the free-tier endpoint repeatedly rate-limits (429) in bursts, so expect intermittent multi-minute-feeling turns; treat it as a capacity-constrained endpoint.
- Muse Glimmer 30B supports text and image input with a 131,072-token context. Hosted NIM accepts top-level `reasoning_effort` and streams separate `reasoning_content`; `none` was accepted but still produced reasoning in live probes.
- Nemotron 3.5 Lightning 30B has a 1,048,576-token context with text input. NVIDIA documents no `reasoning_effort`; thinking is toggled via `enable_thinking` with a top-level `reasoning_budget` (default 16384, max 32768). Live probes confirmed `enable_thinking: false` and `reasoning_effort: none` both stop reasoning, and tool calls work.

### Verified compatibility matrix

A `probe-passed` transport result means the request shape produced the expected response. It does not guarantee every tool or prompt combination works.

| Model | Reasoning control | Request | Response | Streaming | Tools |
|-------|-------------------|---------|----------|-----------|-------|
| DeepSeek V4 Flash 0731 | off / high / max | `chat_template_kwargs` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| GLM-5.3 | low / high / max; always-on | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| GLM-5.3 Flash | low / high / max; always-on; image input | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| Kimi K3 | off / low / high / max | `chat_template_kwargs.thinking` + top-level `reasoning_effort` (card-documented; on/off probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| Laguna XS 2.1 | on / off toggle | `enable_thinking` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | unknown |
| Muse Glimmer 30B | none / minimal / low / medium / high / max | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Nemotron 3.5 Lightning 30B | enable_thinking on/off | `enable_thinking` + `reasoning_budget` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |

Probe dates: GLM-5.3 and GLM-5.3 Flash were probed on 2026-09-16 (effort-ladder depth, tools, streaming, vision for Flash); the remaining rows were verified in August 2026 releases. Kimi K3 on/off thinking, tools, streaming, and vision were probed on 2026-08-27, and its effort ladder follows NVIDIA's own build-card documentation (2026-08-28) with the depth difference between levels unverified due to endpoint capacity.

The remaining models work through their family rules, but don't call them live-verified unless they appear in this matrix or have a matching compatibility report.

### Additional capabilities

- Rate-limit warnings: shows HTTP 429 responses with retry-after info.
- Request content normalization: converts `[{type:"text"}]` to plain strings for older models that reject structured content arrays.
- 15-family regex routing: assigns thinking formats and compat settings across all 16 models.
- Per-model reasoning effort mapping: non-standard values like off or minimal are mapped automatically to what the model expects.
- No custom `streamSimple`: uses `before_provider_request` event hook, avoiding provider conflicts.

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
