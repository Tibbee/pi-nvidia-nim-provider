# NVIDIA NIM Provider Extension for Pi

A [pi](https://pi.dev) extension that connects [NVIDIA NIM](https://build.nvidia.com/) as a custom model provider, making 50+ chat, coding, reasoning, and vision LLMs available through pi's model picker.

## Features

- **50+ curated models** — DeepSeek V4, Qwen3 Coder, GLM-5.1, Llama 4, Kimi K2, and more
- **Correct thinking/reasoning support** — Per-family compat with custom `before_provider_request` handlers for models that use non-standard thinking formats
- **Dynamic model discovery** — Opt-in fetch from NVIDIA NIM API at startup (`NIM_DYNAMIC_MODELS=1`)
- **Zero cost tracking** — All models set to $0 (NVIDIA NIM free tier)
- **No custom streaming** — Uses pi's built-in `openai-completions` handler, avoiding conflicts with other providers

## Quick Start

1. **Get an NVIDIA API key** from [build.nvidia.com](https://build.nvidia.com/)
2. **Set the environment variable:**
   ```bash
   export NVIDIA_API_KEY="nvapi-..."
   ```
3. **Install the extension:**
   ```bash
   pi install /path/to/NvidiaProvider
   ```
4. **Select a model** in pi with `/model` or `Ctrl+P`

## Thinking/Reasoning Formats

NVIDIA NIM models use different `chat_template_kwargs` structures for thinking. This extension handles all of them:

| Format | Models | Mechanism |
|--------|--------|-----------|
| `qwen-chat-template` | Qwen3, GLM, Phi-4-Mini-Flash, Magistral, Seed, Nemotron-Nano-9B | Pi handles natively via `thinkingFormat: "qwen-chat-template"` |
| `deepseek-v4` | DeepSeek V4 Flash/Pro | `chat_template_kwargs: { reasoning_effort: "none"|"high"|"max" }` via before_provider_request |
| `deepseek-nim` | DeepSeek V3.x, R1, Kimi K2 Thinking, K2.5, Nemotron Ultra/Super | `chat_template_kwargs: { thinking: true/false }` via before_provider_request |
| `stepfun-parallel` | Step 3.5 Flash | `chat_template_kwargs: { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }` via before_provider_request |
| `minimax-inline` | MiniMax M2.x | Always thinks inline with `<antha>` tags, no kwargs control, `requiresThinkingAsText: true` |
| `reasoning-effort` | GPT-OSS 120B/20B | Standard OpenAI `reasoning_effort` with `minimal→low` mapping, pi handles natively |

## Bug Fixes from Previous Extension

The previous `nvidiaNim.ts` extension had critical bugs that are fixed here:

- **`before_provider_request` never fired** — The handler checked `payload.model.startsWith("nvidia-nim/")` but the model ID in the payload is just the raw ID like `"deepseek-ai/deepseek-v4-flash"` with no provider prefix. All custom thinking format handling was dead code.
- **`requiresMistralToolIds`** — Not a real pi-ai compat field. Silently ignored. Removed.
- **Top-level `reasoning_effort` not cleaned up** — DeepSeek V4/V3 models had `reasoning_effort` left at top level after pi injected it, but NIM expects it inside `chat_template_kwargs`. Now properly removed and moved.
- **Debug `console.log` in production** — Removed.

## Architecture

```
index.ts                          # Extension entry point + before_provider_request
├── models/
│   ├── types.ts                  # NimModelConfig type
│   ├── registry.ts               # Combines models, applies family compat, deduplicates
│   ├── chat-models.ts            # Chat/instruction models
│   ├── coding-models.ts          # Code/agentic/reasoning models
│   ├── reasoning-models.ts       # Dedicated reasoning/thinking models
│   └── vision-models.ts          # Vision/multimodal models
├── config/
│   ├── model-families.ts         # Per-family compat + thinking format classification
│   └── defaults.ts               # Base URL, API key env, filter patterns
└── tools/
    └── fetch_nim_models.ts       # Standalone model fetcher script
```
