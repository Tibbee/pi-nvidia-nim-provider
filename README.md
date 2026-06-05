# pi-extension-nvidia-nim

NVIDIA NIM provider for the pi coding agent — access **100+ models** hosted on
NVIDIA's inference microservice platform, including DeepSeek, Llama Nemotron,
Qwen, GLM, Mistral, MiniMax, and more.

Registers the **`nvidia-nim`** provider with pi, backed by
`https://integrate.api.nvidia.com/v1`.

## Features

- **100+ curated models** — chat, reasoning, code, and vision
- **6 thinking/reasoning format handlers** — DeepSeek V4, DeepSeek NIM, Qwen
  chat-template, MiniMax inline, reasoning-effort, and Nemotron system modes
- **Model-specific quirks handled automatically** — GLM `clear_thinking`,
  Nemotron reasoning budget, content array normalization for older models
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
- Family-based config in `config/model-families.ts` (36 families, first-match-wins)
  drives thinking format routing and model metadata.
