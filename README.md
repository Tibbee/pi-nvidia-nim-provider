# pi-extension-nvidia-nim

NVIDIA NIM exposes many reasoning models through an OpenAI-compatible API,
but their thinking controls are not actually compatible with one another. Pi's
standard `--thinking` option may be ignored, or reasoning may require
model-family-specific request fields.

`pi-extension-nvidia-nim` adds a model-aware **`nvidia-nim`** provider for Pi.
It translates Pi thinking levels into the request format expected by each
supported NVIDIA NIM family while retaining Pi's built-in
`openai-completions` streaming path.

## Features

- **~83 curated models** — chat, reasoning, code, and vision
- **123 scraped entries** filtered, deduplicated, and family-mapped
- **8 handler-based thinking formats** — DeepSeek V4, DeepSeek NIM,
  thinking-budget, Nemotron system modes (3 variants), MiniMax inline,
  and Qwen chat-template — plus native pi handling for reasoning-effort
- **Model-specific quirks handled automatically** — per-model `chat_template_kwargs`
  injection (thinking effort, budgets, system-message toggles), and request
  content-array normalization for older models
- **No custom streaming** — uses pi's built-in `openai-completions`

## Which NVIDIA provider?

| Provider | Use it when |
|----------|-------------|
| Built-in `nvidia` | You need basic NVIDIA model access with minimal configuration |
| `nvidia-nim` | You need model-family-aware reasoning controls and NIM-specific compatibility |

Install the npm package `pi-extension-nvidia-nim`. It registers the separate
Pi provider named `nvidia-nim`; it does not replace Pi's built-in `nvidia`
provider. Both providers can be installed and used side by side.

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

PowerShell:

```powershell
$env:NVIDIA_NIM_API_KEY = "nvapi-..."
```

`NVIDIA_API_KEY` is accepted as a fallback for backward compatibility with
pi's built-in `nvidia` provider.

**Option B — Auth file (`~/.pi/agent/auth.json`):**

Add an entry so pi resolves the key automatically for all NVIDIA providers:

```json
{
  "nvidia-nim": { "type": "api_key", "key": "nvapi-..." }
}
```

**Option C — Interactive login:**

Run `/login nvidia-nim` in pi's interactive mode and select the API-key
login. The key is stored under the `nvidia-nim` provider in `auth.json` and
managed automatically. Selecting built-in `nvidia` authenticates a different
provider.

### 3. Select a model and test reasoning

```bash
pi --provider nvidia-nim \
  --model deepseek-ai/deepseek-v4-flash \
  --thinking high \
  -p "Give me a short solution to this coding problem: reverse a linked list."
```

This smoke test should show Pi's structured reasoning indicator and a separate
final answer. Do not copy private reasoning content into issue reports.

You can also select models interactively with `/model` or `Ctrl+P`. Look for
the `nvidia-nim/` prefix in the model picker.

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
| **Models** | ~20 curated | ~83 curated (full NIM catalog) |
| **Thinking formats** | None | 8 handler-based formats + reasoning-effort |
| **Request normalization** | No | Yes |
| **Rate-limit warnings** | No | Yes (429 handler) |
| **API key** | `NVIDIA_API_KEY` env | `NVIDIA_NIM_API_KEY` + `NVIDIA_API_KEY` fallback |

Both can coexist. Use `nvidia-nim/...` for the full feature set,
`nvidia/...` as a lightweight fallback.

### Models with thinking support

DeepSeek V4, Kimi K2.6, Qwen3, GLM-5.2, MiniMax M3, Seed OSS, Nemotron
(Ultra, Super, 3-Super), GPT-OSS, StepFun, Inkling, and Laguna XS 2.1.

Notable:
- **GLM-5.2** — boolean NIM thinking control via `enable_thinking` and
  `clear_thinking`. Upstream and self-hosted vLLM documentation describe
  high/max effort modes, but the hosted NIM transport remains unverified.
- **StepFun** — live NIM probing confirmed `reasoning_effort` requests return
  separate `reasoning_content`; Step-3.7 Flash remains always-on on the hosted
  endpoint even when `enable_thinking: false` is sent
- **MiniMax M3** — three-mode thinking toggle (disabled/adaptive/enabled)
  mapped from pi's thinking levels
- **Nemotron** — system-message-driven thinking modes (detailed think, /think,
  and reasoning budget variants)
- **DeepSeek V4 Flash** — live NIM requests confirmed content-only non-think
  and separate `reasoning_content` for high/max via `chat_template_kwargs`
- **DeepSeek V4** — `reasoning_effort` inside `chat_template_kwargs` with
  off→none and xhigh→max mapping

### Verified compatibility matrix

This table separates documented behavior from live hosted-NIM observations. A
`probe-passed` transport result means the request shape produced the observed
response; it does not guarantee every tool or prompt combination works.

| Model | Reasoning control | Request | Response | Streaming | Tools |
|-------|-------------------|---------|----------|-----------|-------|
| DeepSeek V4 Flash | off / high / max | `chat_template_kwargs` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| GLM-5.2 | boolean toggle (probe-passed); effort unverified | Qwen template (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | claimed |
| MiniMax M3 | disabled / adaptive / enabled | `thinking_mode` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | documented |
| Step-3.7 Flash | low / medium / high; always-on hosted | `reasoning_effort` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | claimed |
| Inkling | always-on; no toggle | no control exposed | `reasoning_content` (probe-passed) | probe-passed | unknown |
| Laguna XS 2.1 | on / off toggle | `enable_thinking` (probe-passed) | `reasoning_content` (probe-passed) | probe-passed | unknown |

The remaining curated models are usable through their configured family rules,
but should not be described as live-verified unless they appear in this
matrix or have a corresponding compatibility report.

### Additional capabilities

- **Rate-limit warnings** — surfaces HTTP 429 responses with retry-after info
- **Request content normalization** — converts `[{type:"text"}]` to plain
  strings for older models that reject structured content arrays
- **46-family regex routing** — accurate thinking format and compat assignment
  across all ~83 models
- **Per-model reasoning effort mapping** — non-standard effort values are
  handled automatically (e.g. `off→none`, `minimal→low`)
- **Architecturally clean** — uses `before_provider_request` event hook with no
  custom `streamSimple`, avoiding provider conflicts

## Troubleshooting

- Confirm that the selected model starts with `nvidia-nim/`; Pi's built-in
  `nvidia/` provider uses a different catalog and compatibility path.
- If `--thinking` appears ignored, run `npm run probe -- --model=...` from the
  extension checkout and check the selected model's family and verification status.
- If a model is missing, refresh the catalog and confirm the exact NIM model ID
  still exists on its NVIDIA model page.
- If authentication fails, check `NVIDIA_NIM_API_KEY` first, then the
  `NVIDIA_API_KEY` fallback, and verify that the variable is visible to the Pi
  process.
- Tool calling and reasoning are tracked separately; a reasoning-capable model
  is not automatically tool-call verified.
- Enable `NIM_DEBUG=1` only when needed and avoid sharing the resulting payload
  logs without removing prompts and other sensitive data.

## Verification

The extension keeps upstream model semantics separate from NVIDIA-hosted wire
encoding. Run the opt-in probe when an NVIDIA credential is available:

```bash
npm run probe -- --model=z-ai/glm-5.2 --output=glm-5.2-probe.json
```

The probe never runs during startup and does not write credentials, prompts, or
complete responses to its report. Use `--cases` and `--timeout-ms` to avoid
waiting on a busy hosted model.
