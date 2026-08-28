# pi-extension-nvidia-nim

NVIDIA NIM exposes a lot of reasoning models through an OpenAI-compatible API, but their thinking controls are not actually compatible with each other. Pi's standard `--thinking` option may get ignored, or reasoning might need model-family-specific request fields.

`pi-extension-nvidia-nim` adds a model-aware `nvidia-nim` provider for Pi. It maps Pi thinking levels to the request format each NVIDIA NIM family expects, while keeping Pi's built-in `openai-completions` streaming path.

## Features

- 19 curated models for chat, reasoning, code, and vision — every one verified live against hosted NIM as of 2026-08-27
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
  --model deepseek-ai/deepseek-v4-pro-0813 \
  --thinking high \
  -p "Give me a short solution to this coding problem: reverse a linked list."
```

This smoke test should show Pi's structured reasoning indicator and a separate final answer. Do not copy private reasoning content into issue reports. You can also select models interactively with `/model` or `Ctrl+P`. Look for the `nvidia-nim/` prefix in the model picker.

## Design

- Uses pi's built-in `openai-completions` streaming. No custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are handled via `before_provider_request` and pi's `compat` system.
- Family-based config in `config/model-families.ts` (17 families, first-match-wins) drives thinking format routing and model metadata.
- All cost fields are `$0` because NVIDIA NIM is free tier.
- Works alongside pi's built-in `nvidia` provider. Use `nvidia-nim/...` for NIM-family-specific thinking transforms and the full catalog, `nvidia/...` for pi's native handling.

## Comparison with pi's built-in `nvidia` provider

Pi ships a built-in `nvidia` provider with 32 curated models (pi 0.84.2). This extension (`nvidia-nim`) fills in the gaps with a live-verified NIM catalog and NIM-family-specific thinking transforms:

| Aspect | Built-in `nvidia` | This extension `nvidia-nim` |
|--------|-------------------|-----------------------------|
| Models | 32 curated (several dead per the 2026-08-27 sweep) | 19 curated (live-verified NIM catalog) |
| Thinking formats | None sent; the selected level is dropped | 5 handler-based formats + reasoning-effort |
| Request normalization | No | Yes |
| Rate-limit warnings | No | Yes (429 handler) |
| API key | `NVIDIA_API_KEY` env | `NVIDIA_NIM_API_KEY` + `NVIDIA_API_KEY` fallback |

Use `nvidia-nim/...` for the full feature set, `nvidia/...` for pi's native handling of its 32 built-in models.

### Deep dive: what the built-in provider leaves on the table

Pi's built-in `nvidia` provider flags most of its 30 models as reasoning models, and the model picker happily shows thinking levels for them. But every one of those models ships with `supportsReasoningEffort: false`, no `thinkingFormat`, and no `thinkingLevelMap`. When pi assembles the request, none of its thinking branches match, so the level you picked is dropped before the request goes out. `--thinking off` and `--thinking high` produce the exact same payload. The model then runs at whatever the hosted endpoint defaults to, which for most reasoning models means thinking on, with no way to turn it off or scale it.

You do see the reasoning. Pi's stream parser recognizes `reasoning_content` deltas, renders them in the thinking panel, and replays them on assistant messages. That is a display feature, though. Nothing about the request changes.

This extension exists to close that gap. The thinking level you choose is converted into the control each NIM family actually understands:

- GLM-5.2 gets `enable_thinking` and `clear_thinking` plus top-level `reasoning_effort` (`high` or `max`). Hosted NIM ignores effort nested inside `chat_template_kwargs`, so the handler sends it at the top level.
- Nemotron 3 Super, Ultra, and 3.5 Lightning get `chat_template_kwargs.enable_thinking`, a `low_effort` flag when you pick low, and a top-level `reasoning_budget` of 32768.
- DeepSeek V4 Flash and Pro get `chat_template_kwargs` with the effort values NVIDIA actually accepts: `none`, `high`, `max`.
- Kimi K3 gets a boolean `chat_template_kwargs.thinking` toggle plus a top-level `reasoning_effort` pass-through (`low` / `high` / `max`, card-documented by NVIDIA; on/off is probe-passed, the depth difference between levels is not yet verified).
- MiniMax M3 gets a three-way `thinking_mode` toggle: disabled, adaptive, enabled.
- Laguna and DiffusionGemma get qwen-chat-template kwargs, handled natively by pi.

Each family also carries its own `thinkingLevelMap`, so non-standard pi levels land somewhere sensible: `minimal` maps to `low` on GPT-OSS, `xhigh` and `max` map to `max` on Muse Glimmer, and so on. The built-in provider never even offers xhigh or max, because those levels require a map its catalog never defines.

Coverage is the other difference. The extension carries 19 models — every one verified live against hosted NIM — including the latest endpoints the built-in catalog lacks: DeepSeek V4 Pro 0813, Kimi K3, DiffusionGemma 26B, and Mistral Nemotron. The built-in list, meanwhile, still ships 10 models that sweeps proved dead or ghost (gemma-3 ×2, mistral-7b, kimi-k2.6, cosmos-reason2, nemotron-70b, ultra-253b, llama-3.1-70b/8b, llama-3.3-70b); they fail on hosted NIM today.

A note on NVIDIA NIM availability: hosted NIM is volatile. Models retire with HTTP 410 at short notice (fourteen did in the 2026-08-27 wave alone), some staged endpoints answer only intermittently, and latency per model can swing between 1 s and 45 s depending on backend capacity. The extension ships what was verified working at release time; if a model stops responding, that is NVIDIA's side, not the request shape.

There are also request-shape fixes the built-in does not attempt. Some older NIM models reject `[{type:"text"}]` content arrays, so the extension flattens text-only arrays to plain strings. Some reject requests without `max_tokens`, so the extension sets a sensible default per model. And when NVIDIA answers with a 429 or a 5xx, the extension surfaces retry-after info or the request ID, which makes rate limits easier to diagnose.

None of this means the built-in provider is broken. For a quick chat with a mainstream model it is fine, and the response side of reasoning works there too. What it cannot do is control reasoning, and that control is the point of this extension. The transports are probe-verified where the matrix above says so; where they are not, the matrix says that as well, instead of leaving you to guess.

### Models with thinking support

DeepSeek V4 (Flash 0731 and Pro 0813), Kimi K3, MiniMax M3, Muse Glimmer, DiffusionGemma, Nemotron (3-Nano Omni, 3-Super, 3-Ultra, 3.5 Lightning), GPT-OSS, StepFun, and Laguna XS 2.1.

- StepFun: live NIM probing confirmed `reasoning_effort` requests return separate `reasoning_content`. Step-3.7 Flash stays always-on on the hosted endpoint even when `enable_thinking: false` is sent.
- MiniMax M3 has a three-mode thinking toggle (disabled, adaptive, enabled) mapped from pi's thinking levels.
- DeepSeek V4: live NIM requests confirmed content-only non-think and separate `reasoning_content` for high and max via `chat_template_kwargs`. Pi exposes only `off`, `high`, and `max` for these models.
- The extension ships the current live DeepSeek V4 Pro endpoint, `deepseek-ai/deepseek-v4-pro-0813`, alongside DeepSeek V4 Flash `deepseek-ai/deepseek-v4-flash-0731`. NVIDIA retired the unsuffixed `deepseek-v4-flash` and `deepseek-v4-pro` IDs on 2026-08-07. As of 2026-08-27 the Flash 0731 endpoint returns 404 on chat requests; it is kept in the catalog as a suspected temporary outage, so pin `deepseek-v4-pro-0813` for reliable V4 access meanwhile.
- DeepSeek V4 puts `reasoning_effort` inside `chat_template_kwargs`, with `off` mapped to `none` and `max` mapped to `max`.
- Kimi K3 (`moonshotai/kimi-k3`) is the newest Moonshot model on NIM: text/image input, 1,048,576-token context (NVIDIA's official card value), 65,536-token output, OpenAI-format tool calls, a boolean `chat_template_kwargs.thinking` toggle plus card-documented `reasoning_effort` levels (`low` / `high` / `max`), and separate `reasoning_content`. The card became officially listed on the build page on 2026-08-28; before that the extension carried it from live probes alone. **Practical warning: it is near unusable at times** — probe latency ranged from 1 s to 46 s for the same request and the free-tier endpoint repeatedly rate-limits (429) in bursts, so expect intermittent multi-minute-feeling turns; treat it as a capacity-constrained endpoint.
- Muse Glimmer 30B supports text and image input with a 131,072-token context. Hosted NIM accepts top-level `reasoning_effort` and streams separate `reasoning_content`; `none` was accepted but still produced reasoning in live probes.
- Nemotron 3.5 Lightning 30B has a 1,048,576-token context with text input. NVIDIA documents no `reasoning_effort`; thinking is toggled via `enable_thinking` with a top-level `reasoning_budget` (default 16384, max 32768). Live probes confirmed `enable_thinking: false` and `reasoning_effort: none` both stop reasoning, and tool calls work.

### Verified compatibility matrix

A `probe-passed` transport result means the request shape produced the expected response. It does not guarantee every tool or prompt combination works.

| Model | Reasoning control | Request | Response | Streaming | Tools |
|-------|-------------------|---------|----------|-----------|-------|
| DeepSeek V4 Flash 0731 | off / high / max | `chat_template_kwargs` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| DeepSeek V4 Pro 0813 | off / high / max | `chat_template_kwargs` (same transport as Flash) | `reasoning_content` (claimed) | claimed | documented |
| Kimi K3 | off / low / high / max | `chat_template_kwargs.thinking` + top-level `reasoning_effort` (card-documented; on/off probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |
| MiniMax M3 | disabled / adaptive / enabled | `thinking_mode` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Step-3.7 Flash | low / medium / high; always-on hosted | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | claimed |
| Laguna XS 2.1 | on / off toggle | `enable_thinking` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | unknown |
| Muse Glimmer 30B | none / minimal / low / medium / high / max | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Nemotron 3.5 Lightning 30B | enable_thinking on/off | `enable_thinking` + `reasoning_budget` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | probe-passed |

Probe dates: all rows except Kimi K3 were verified in earlier releases (August 2026); Kimi K3 on/off thinking, tools, streaming, and vision were probed on 2026-08-27, and the effort ladder follows NVIDIA's own build-card documentation (2026-08-28) with the depth difference between levels unverified due to endpoint capacity. DeepSeek V4 Flash 0731 passed those probes but currently returns 404 on chat (treated as a temporary outage); DeepSeek V4 Pro 0813 answered live on 2026-08-27.

The remaining models work through their family rules, but don't call them live-verified unless they appear in this matrix or have a matching compatibility report.

### Additional capabilities

- Rate-limit warnings: shows HTTP 429 responses with retry-after info.
- Request content normalization: converts `[{type:"text"}]` to plain strings for older models that reject structured content arrays.
- 17-family regex routing: assigns thinking formats and compat settings across all 19 models.
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

## Verification

The probe never runs on startup and does not write credentials, prompts, or full responses. Run it when you have an NVIDIA credential:

```bash
npm run probe -- --model=z-ai/glm-5.2 --output=glm-5.2-probe.json
```

Use `--cases` and `--timeout-ms` to skip models that are slow to respond.
