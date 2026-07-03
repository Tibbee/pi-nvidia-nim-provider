# pi-extension-nvidia-nim

NVIDIA NIM provider for the pi coding agent — access **100+ models** hosted on
NVIDIA's inference microservice platform, including DeepSeek, Llama Nemotron,
Qwen, GLM, Mistral, MiniMax, and more.

Registers the **`nvidia-nim`** provider with pi, backed by
`https://integrate.api.nvidia.com/v1`.

## Features

- **100+ curated models** — chat, reasoning, code, and vision
- **7 thinking/reasoning format handlers** — DeepSeek V4, DeepSeek NIM, Qwen
  chat-template, MiniMax inline, reasoning-effort, and Nemotron system modes
- **Model-specific quirks handled automatically** — per-model `chat_template_kwargs`
  injection (thinking effort, budgets, system-message toggles), content array
  normalization for older models
- **No custom streaming** — uses pi's built-in `openai-completions`

## Install

```bash
pi install npm:pi-extension-nvidia-nim
```

## Configure

1. Get an API key from [build.nvidia.com](https://build.nvidia.com) (free tier:
   1000 requests/month, no credit card required)
2. Set the environment variable:

```bash
export NVIDIA_NIM_API_KEY="nvapi-..."
```

`NVIDIA_API_KEY` is accepted as a fallback for backward compatibility.

## Usage

```bash
pi
/model
# or Ctrl+P to pick a model
```

Look for the `nvidia-nim/` prefix in the model picker.

## Design

- Uses pi's built-in **`openai-completions`** streaming — no custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are
  handled via `before_provider_request` and pi's `compat` system.
- Family-based config in `config/model-families.ts` (37 families, first-match-wins)
  drives thinking format routing and model metadata.
- All cost fields are `$0` — NVIDIA NIM free tier.
- Coexists with pi's built-in `nvidia` provider — use `nvidia-nim/...` for
  the full experience, `nvidia/...` as a basic fallback.

## Comparison with alternative NVIDIA extensions

Several pi extensions provide NVIDIA model access. Here is how this one compares:

| Aspect | This extension | `nvidia` (official, built-in) | Other community NVIDIA extensions |
|--------|----------------|-------------------------------|----------------------------------|
| **Provider ID** | `nvidia-nim` | `nvidia` | Varies (`nvidia-build`, `nvidia-nim`, or multi-provider) |
| **Model count** | ~100 curated | ~20 curated | Varies (dynamic fetch or static + enrichment) |
| **Thinking support** | **7 formats** ✅ | **None (broken)** ❌ | Limited or none |
| **Per-model effort mapping** | ✅ (high/max, low/medium, etc.) | ❌ | ❌ |
| **Content normalization** | ✅ | ❌ | Some implement via custom streaming |
| **Rate-limit warnings** | ✅ (429 handler) | ❌ | ❌ |
| **Streaming approach** | Built-in `openai-completions` | Built-in `openai-completions` | Built-in or custom `streamSimple` |
| **API key source** | `NVIDIA_NIM_API_KEY` + fallback | `NVIDIA_API_KEY` env | Varies (env, OAuth, config file) |
| **Scope** | Single provider | Single provider (pi built-in) | Single or multi-provider |

**Why this extension?**

- **Full thinking support** — 7 format handlers covering DeepSeek V4, DeepSeek
  NIM, Qwen, MiniMax, Nemotron, and reasoning-effort models (pi's built-in
  `nvidia` provider has no thinking format handling, so reasoning models
  don't work there)
- **5× more models than pi's built-in** — ~100 curated vs ~20, including
  DeepSeek, Kimi, GLM, MiniMax, Qwen3-Coder, and many more
- **Per-model effort level mapping** — translates pi thinking levels to each
  model's native effort values (e.g. high/max for GLM, low/high for GPT-OSS,
  none/high/max for DeepSeek V4)
- **Architecturally clean** — no custom streaming override; everything goes
  through pi's standard `before_provider_request` event hook, avoiding
  conflicts with other providers
- **Static curated model list** — no startup latency from API calls, no risk
  of dynamic fetches failing due to auth or rate limits
- **Content array normalization and rate-limit warnings** — small touches that
  make the experience smoother
