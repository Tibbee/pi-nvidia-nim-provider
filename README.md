# pi-extension-nvidia-nim

NVIDIA NIM provider for the pi coding agent — access **100+ models** hosted on
NVIDIA's inference microservice platform, including DeepSeek, Llama Nemotron,
Qwen, GLM, Mistral, MiniMax, and more.

Registers the **`nvidia-nim`** provider with pi, backed by
`https://integrate.api.nvidia.com/v1`.

## Features

- **~81 curated models** — chat, reasoning, code, and vision
- **121 scraped entries** filtered, deduplicated, and family-mapped
- **8 handler-based thinking formats** — DeepSeek V4, DeepSeek NIM,
  thinking-budget, Nemotron system modes (3 variants), MiniMax inline,
  and Qwen chat-template — plus native pi handling for reasoning-effort
- **Model-specific quirks handled automatically** — per-model `chat_template_kwargs`
  injection (thinking effort, budgets, system-message toggles), content array
  normalization for older models
- **No custom streaming** — uses pi's built-in `openai-completions`

## Install

```bash
pi install npm:pi-extension-nvidia-nim
```

## Configure

### 1. Get an API key

Sign up at [build.nvidia.com](https://build.nvidia.com) (free tier:
40 requests/minute, 1,000 inference credits on signup, no credit card required).

### 2. Set the credential (pick one)

**Option A — Environment variable:**

```bash
export NVIDIA_NIM_API_KEY="nvapi-..."
```

`NVIDIA_API_KEY` is accepted as a fallback for backward compatibility with
pi's built-in `nvidia` provider.

**Option B — Auth file (`~/.pi/agent/auth.json`):**

Add an entry so pi resolves the key automatically for all NVIDIA providers:

```json
{
  "nvidia": { "type": "api_key", "key": "nvapi-..." }
}
```

**Option C — Interactive login:**

Run `/login` in pi's interactive mode and select **NVIDIA** from the list.
The key is stored in `auth.json` and managed automatically.

### 3. Run pi with the extension

Install from npm:

```bash
pi install npm:pi-extension-nvidia-nim
```

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
- Family-based config in `config/model-families.ts` (46 families, first-match-wins)
  drives thinking format routing and model metadata.
- All cost fields are `$0` — NVIDIA NIM free tier.
- Coexists with pi's built-in `nvidia` provider — use `nvidia-nim/...` for
  the full experience, `nvidia/...` as a basic fallback.

## Comparison with pi's built-in `nvidia` provider

Pi ships a built-in `nvidia` provider with ~20 models. This
extension (`nvidia-nim`) complements it with a wider model selection and
thinking/reasoning support:

| Aspect | Built-in `nvidia` | This extension `nvidia-nim` |
|--------|-------------------|-----------------------------|
| **Models** | ~20 curated | ~81 curated (full NIM catalog) |
| **Thinking formats** | None | 8 handler-based formats + reasoning-effort |
| **Content normalization** | No | Yes |
| **Rate-limit warnings** | No | Yes (429 handler) |
| **API key** | `NVIDIA_API_KEY` env | `NVIDIA_NIM_API_KEY` + `NVIDIA_API_KEY` fallback |

Both can coexist. Use `nvidia-nim/...` for the full feature set,
`nvidia/...` as a lightweight fallback.

### Models with thinking support

DeepSeek V4, Kimi K2.6, Qwen3, GLM-5.2, MiniMax M3, Seed OSS, Nemotron
(Ultra, Super, 3-Super), GPT-OSS, and StepFun.

Notable:
- **GLM-5.2** — full reasoning effort control (high/max) via `enable_thinking`
  and `clear_thinking` kwargs
- **MiniMax M3** — three-mode thinking toggle (disabled/adaptive/enabled)
  mapped from pi's thinking levels
- **Nemotron** — system-message-driven thinking modes (detailed think, /think,
  and reasoning budget variants)
- **DeepSeek V4** — `reasoning_effort` inside `chat_template_kwargs` with
  off→none and xhigh→max mapping

### Additional capabilities

- **Rate-limit warnings** — surfaces HTTP 429 responses with retry-after info
- **Content array normalization** — converts `[{type:"text"}]` to plain strings
  for older models that reject structured content arrays
- **46-family regex routing** — accurate thinking format and compat assignment
  across all ~81 models
- **Per-model reasoning effort mapping** — non-standard effort values are
  handled automatically (e.g. `off→none`, `minimal→low`)
- **Architecturally clean** — uses `before_provider_request` event hook with no
  custom `streamSimple`, avoiding provider conflicts
