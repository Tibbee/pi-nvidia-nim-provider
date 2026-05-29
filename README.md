# pi-extension-nvidia-nim

NVIDIA NIM provider for the pi coding agent.

Registers **`nvidia-nim`** as a model provider backed by `https://integrate.api.nvidia.com/v1`, exposing chat, coding, reasoning, and vision models through pi's `/model` picker.

## Install

```bash
pi install nvidia-nim
```

## Configure

Set the API key:

```bash
export NVIDIA_API_KEY="nvapi-..."
```

The provider also accepts `NVIDIA_NIM_API_KEY` as the primary env var, with `NVIDIA_API_KEY` as fallback.

## Usage

```bash
pi
/model
# or Ctrl+P to pick a model
```

## Models

The extension ships with a curated static model list. New models are added through release updates; refresh with `pi update --extensions`.

## Design

- Uses pi's built-in **`openai-completions`** streaming — no custom `streamSimple`.
- Model-specific quirks (thinking formats, extra body kwargs, compat flags) are handled via `before_provider_request` and pi's `compat` system.

## Maintainer docs

Internal docs (`config/`, `handlers/`, `models/`, `docs/`) describe the family-based compat configuration, the model pipeline, and the thinking-format handlers.
