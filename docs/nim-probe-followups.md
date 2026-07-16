# NVIDIA NIM probe follow-ups

This file records models that were not fully probeable at the time of testing. These are availability observations, not conclusions about model request compatibility.

## Retry later

### `google/gemma-4-31b-it`

- NIM model page: https://build.nvidia.com/google/gemma-4-31b-it
- Probe result: every selected request timed out after 45 seconds without an HTTP response.
- Cases attempted: `baseline-stream`, `current-extension-off`, `current-extension-on`, `tools-thinking-on`
- Retry command:

  ```bash
  npx tsx tools/probe_nim.ts --model=google/gemma-4-31b-it --cases=baseline-stream,qwen-chat-template-off,qwen-chat-template-on,tools-thinking-on --timeout-ms=90000
  ```

### `moonshotai/kimi-k2.6`

- NIM model page: https://build.nvidia.com/moonshotai/kimi-k2.6
- Probe result: every selected request returned HTTP `404` from the hosted endpoint, including the follow-up with Kimi's correct boolean thinking shape.
- Cases attempted: `baseline-stream`, `deepseek-v4-nonthink`, `deepseek-v4-high`, `deepseek-v4-max`, followed by `deepseek-nim-off` and `deepseek-nim-on` (all returned 404 before the request shape was evaluated).
- Kimi's correct expected shape is boolean `chat_template_kwargs.thinking`; no distinct high/max effort values are currently documented in `models/metadata.json`.
- Retry command:

  ```bash
  npx tsx tools/probe_nim.ts --model=moonshotai/kimi-k2.6 --cases=baseline-stream,deepseek-nim-off,deepseek-nim-on --timeout-ms=90000
  ```

## Recently verified

These models returned usable responses during the same probe pass:

- `google/diffusiongemma-26b-a4b-it`: thinking off/on and tool-shaped thinking requests returned successfully; enabled responses used a `reasoning` field.
- `nvidia/nemotron-3-ultra-550b-a55b`: off, medium, and high effort-shaped requests returned successfully.
- `nvidia/nemotron-3-super-120b-a12b`: off, low, medium, and high effort-shaped requests returned successfully.
- `nvidia/llama-3.3-nemotron-super-49b-v1`: detailed thinking off/on returned successfully.
- `nvidia/llama-3.3-nemotron-super-49b-v1.5`: `/no_think` and `/think` returned successfully.
- `stepfun-ai/step-3.7-flash`: low, medium, and high effort requests returned `reasoning_content`.
- `deepseek-ai/deepseek-v4-pro`: non-thinking, high, and max requests returned successfully.
- `deepseek-ai/deepseek-v4-flash`: previously verified for non-thinking, high, and max requests.

The probe harness includes the model-specific cases used for the Nemotron and Qwen-style requests in `tools/probe_nim.ts`.
