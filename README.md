# pi-extension-nvidia-nim

NVIDIA NIM provider for the pi coding agent — access **100+ models** hosted on
NVIDIA's inference microservice platform, including DeepSeek, Llama Nemotron,
Qwen, GLM, Mistral, MiniMax, and more.

Registers the **`nvidia-nim`** provider with pi, backed by
`https://integrate.api.nvidia.com/v1`.

## Features

- **100+ curated models** — chat, reasoning, code, and vision
- **7 thinking/reasoning format handlers** — DeepSeek V4, DeepSeek NIM, Qwen
  chat-template, GLM chat-template, MiniMax inline, reasoning-effort, and
  Nemotron system modes
- **Model-specific quirks handled automatically** — GLM `clear_thinking` with
  effort level mapping (high/max), Nemotron reasoning budget, system-message
  thinking toggles, content array normalization for older models
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

## Comparison with other NVIDIA extensions

Several pi extensions provide NVIDIA model access. Here is how they differ:

| Aspect | This extension | `nvidia-build` | `pi-nvidia-nim` (xRyul) | `pi-free` suite |
|--------|----------------|----------------|------------------------|-----------------|
| **Provider ID** | `nvidia-nim` | `nvidia-build` | `nvidia-nim` | `nvidia` (among many) |
| **Model list** | Static (~100 curated) | Dynamic (`/v1/models`) | Static + dynamic enrich | Dynamic + 404 probe |
| **Streaming** | Built-in `openai-completions` | Built-in `openai-completions` | **Custom `streamSimple`** | Built-in `openai-completions` |
| **Thinking formats** | **7** (all major families) | None | **5** (no GLM effort levels) | None (general provider) |
| **GLM effort levels** | ✅ high / max | ❌ | ❌ | ❌ |
| **API key source** | Env var only | OAuth `/login` + env | Env var + auth.json | Env var + config file |
| **Model age filter** | Curated release | Fresh daily | Fresh on session start | 404-probed |
| **Scope** | Single provider | Single provider | Single provider | Multi-provider suite |

**Why this extension?**

- **Only extension with full thinking support** — 7 format handlers covering
  DeepSeek V4, DeepSeek NIM, Qwen, GLM (with effort level mapping), MiniMax,
  Nemotron, and reasoning-effort models
- **Architecturally clean** — no custom `streamSimple` that can break other
  providers; everything goes through pi's standard `before_provider_request`
  event hook
- **Static curated model list** — no startup latency from API calls, no risk of
  dynamic fetches failing due to auth issues
- **GLM-5.2 effort levels** — the only extension that maps pi thinking levels
  (low/medium/high/xhigh) to GLM's native effort values (high/max)
