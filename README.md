# pi-extension-nvidia-nim

NVIDIA NIM exposes a lot of reasoning models through an OpenAI-compatible API, but their thinking controls are not actually compatible with each other. Pi's standard `--thinking` option may get ignored, or reasoning might need model-family-specific request fields.

`pi-extension-nvidia-nim` adds a model-aware `nvidia-nim` provider for Pi. It maps Pi thinking levels to the request format each NVIDIA NIM family expects, while keeping Pi's built-in `openai-completions` streaming path.

## Features

- ~83 curated models for chat, reasoning, code, and vision
- 123 scraped entries, filtered, deduplicated, and family-mapped
- 8 handler-based thinking formats: DeepSeek V4, DeepSeek NIM, thinking-budget, Nemotron system modes (3 variants), MiniMax inline, Qwen chat-template, plus native pi handling for reasoning-effort
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

**Option A: Environment variable**

```bash
export NVIDIA_NIM_API_KEY="nvapi-..."
```

PowerShell:

```powershell
$env:NVIDIA_NIM_API_KEY = "nvapi-..."
```

`NVIDIA_API_KEY` is accepted as a fallback for backward compatibility with pi's built-in `nvidia` provider.

**Option B: Auth file (`~/.pi/agent/auth.json`)**

Add an entry so pi resolves the key automatically for all NVIDIA providers:

```json
{
  "nvidia-nim": { "type": "api_key", "key": "nvapi-..." }
}
```

**Option C: Interactive login**

Run `/login nvidia-nim` in pi's interactive mode and select the API-key login. The key is stored under the `nvidia-nim` provider in `auth.json` and managed automatically. Selecting built-in `nvidia` authenticates a different provider.

### 3. Select a model and test reasoning

```bash
pi --provider nvidia-nim \
  --model deepseek-ai/deepseek-v4-flash \
  --thinking high \
  -p "Give me a short solution to this coding problem: reverse a linked list."
```

This smoke test should show Pi's structured reasoning indicator and a separate final answer. Do not copy private reasoning content into issue reports. You can also select models interactively with `/model` or `Ctrl+P`. Look for the `nvidia-nim/` prefix in the model picker.

## Design

- Uses pi's built-in `openai-completions` streaming. No custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are handled via `before_provider_request` and pi's `compat` system.
- Family-based config in `config/model-families.ts` (46 families, first-match-wins) drives thinking format routing and model metadata.
- All cost fields are `$0` because NVIDIA NIM is free tier.
- Works alongside pi's built-in `nvidia` provider. Use `nvidia-nim/...` for the full feature set, `nvidia/...` as a basic fallback.

## Comparison with pi's built-in `nvidia` provider

Pi ships a built-in `nvidia` provider with about 20 models. This extension (`nvidia-nim`) fills in the gaps with more models and thinking support:

| Aspect | Built-in `nvidia` | This extension `nvidia-nim` |
|--------|-------------------|-----------------------------|
| Models | ~20 curated | ~83 curated (full NIM catalog) |
| Thinking formats | None | 8 handler-based formats + reasoning-effort |
| Request normalization | No | Yes |
| Rate-limit warnings | No | Yes (429 handler) |
| API key | `NVIDIA_API_KEY` env | `NVIDIA_NIM_API_KEY` + `NVIDIA_API_KEY` fallback |

Use `nvidia-nim/...` for the full feature set, `nvidia/...` as a lightweight fallback.

### Models with thinking support

DeepSeek V4, Kimi K2.6, Qwen3, GLM-5.2, MiniMax M3, Seed OSS, Nemotron (Ultra, Super, 3-Super), GPT-OSS, StepFun, Inkling, and Laguna XS 2.1.

- GLM-5.2 exposes three Pi thinking choices: off, high, and max. It uses boolean NIM thinking control via `enable_thinking` and `clear_thinking`, plus top-level `reasoning_effort` (`high` or `max`). Nested effort inside `chat_template_kwargs` is ignored by hosted NIM.
- StepFun: live NIM probing confirmed `reasoning_effort` requests return separate `reasoning_content`. Step-3.7 Flash stays always-on on the hosted endpoint even when `enable_thinking: false` is sent.
- MiniMax M3 has a three-mode thinking toggle (disabled, adaptive, enabled) mapped from pi's thinking levels.
- Nemotron uses system-message-driven thinking modes (detailed think, /think, and reasoning budget variants).
- DeepSeek V4 Flash and Pro: live NIM requests confirmed content-only non-think and separate `reasoning_content` for high and max via `chat_template_kwargs`. Pi exposes only `off`, `high`, and `max` for these models.
- DeepSeek V4 puts `reasoning_effort` inside `chat_template_kwargs`, with `off` mapped to `none` and `max` mapped to `max`.

### Verified compatibility matrix

A `probe-passed` transport result means the request shape produced the expected response. It does not guarantee every tool or prompt combination works.

| Model | Reasoning control | Request | Response | Streaming | Tools |
|-------|-------------------|---------|----------|-----------|-------|
| DeepSeek V4 Flash | off / high / max | `chat_template_kwargs` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| GLM-5.2 | boolean toggle + high/max effort (probe-passed) | `chat_template_kwargs` + top-level `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | claimed |
| MiniMax M3 | disabled / adaptive / enabled | `thinking_mode` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Step-3.7 Flash | low / medium / high; always-on hosted | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | claimed |
| Inkling | always-on; no toggle | no control exposed | `reasoning_content` (probe-passed) | probe-passed | unknown |
| Laguna XS 2.1 | on / off toggle | `enable_thinking` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | unknown |

The remaining models work through their family rules, but don't call them live-verified unless they appear in this matrix or have a matching compatibility report.

### Additional capabilities

- Rate-limit warnings: shows HTTP 429 responses with retry-after info.
- Request content normalization: converts `[{type:"text"}]` to plain strings for older models that reject structured content arrays.
- 46-family regex routing: assigns thinking formats and compat settings across all ~83 models.
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
- If authentication fails, check `NVIDIA_NIM_API_KEY` first, then the `NVIDIA_API_KEY` fallback, and verify the variable is visible to the Pi process.
- Tool calling and reasoning are tracked separately. A reasoning-capable model is not automatically tool-call verified.
- Enable `NIM_DEBUG=1` only when needed. Avoid sharing payload logs without removing prompts and other sensitive data.

## Verification

The probe never runs on startup and does not write credentials, prompts, or full responses. Run it when you have an NVIDIA credential:

```bash
npm run probe -- --model=z-ai/glm-5.2 --output=glm-5.2-probe.json
```

Use `--cases` and `--timeout-ms` to skip models that are slow to respond.
