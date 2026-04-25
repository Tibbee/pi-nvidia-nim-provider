# NVIDIA NIM Provider Extension — Research & Implementation Plan

## Table of Contents

- [1. Overview](#1-overview)
- [2. NVIDIA NIM API Analysis](#2-nvidia-nim-api-analysis)
- [3. Pi Extension Architecture](#3-pi-extension-architecture)
- [4. Key Design Decisions](#4-key-design-decisions)
  - [4.1 Use `openai-completions` API (NOT `streamSimple`)](#41-use-openai-completions-api-not-streamsimple)
  - [4.2 Use `before_provider_request` for `extra_body`](#42-use-before_provider_request-for-extra_body)
  - [4.3 Static Model List with Curated Metadata](#43-static-model-list-with-curated-metadata)
  - [4.4 Model Family-Based Compat Configuration](#44-model-family-based-compat-configuration)
- [5. The `streamSimple` Problem — Root Cause Analysis](#5-the-streamsimple-problem--root-cause-analysis)
- [6. Model Curation Strategy](#6-model-curation-strategy)
  - [6.1 Include List (~45 LLMs)](#61-include-list-45-llms)
  - [6.2 Exclude List (Non-LLM / Non-Coding Models)](#62-exclude-list-non-llm--non-coding-models)
- [7. Model Family Compat Reference](#7-model-family-compat-reference)
  - [7.1 Family Definitions](#71-family-definitions)
  - [7.2 `extra_body` Per-Family Details](#72-extra_body-per-family-details)
  - [7.3 How `qwen-chat-template` Works in pi-ai](#73-how-qwen-chat-template-works-in-pi-ai)
- [8. Directory Structure](#8-directory-structure)
- [9. Implementation Phases](#9-implementation-phases)
  - [Phase 1: Core Extension Structure](#phase-1-core-extension-structure)
  - [Phase 2: Model Registry](#phase-2-model-registry)
  - [Phase 3: Family Compat Configuration](#phase-3-family-compat-configuration)
  - [Phase 4: `before_provider_request` Handler](#phase-4-before_provider_request-handler)
  - [Phase 5: Gathering Model Metadata](#phase-5-gathering-model-metadata)
  - [Phase 6: Optional Dynamic Model Discovery](#phase-6-optional-dynamic-model-discovery)
- [10. Pi Framework Reference](#10-pi-framework-reference)
  - [10.1 Relevant Documentation Files](#101-relevant-documentation-files)
  - [10.2 Relevant Example Extensions](#102-relevant-example-extensions)
  - [10.3 Provider Registration API](#103-provider-registration-api)
  - [10.4 Model Definition Reference](#104-model-definition-reference)
  - [10.5 Compat Flags Reference](#105-compat-flags-reference)
  - [10.6 `before_provider_request` Event](#106-before_provider_request-event)
  - [10.7 Thinking Format Options](#107-thinking-format-options)
- [11. Open Questions & Decisions Needed](#11-open-questions--decisions-needed)
- [12. NVIDIA NIM API Reference](#12-nvidia-nim-api-reference)
  - [12.1 Base URL & Auth](#121-base-url--auth)
  - [12.2 `/v1/models` Endpoint](#122-v1models-endpoint)
  - [12.3 Model Card URLs](#123-model-card-urls)
  - [12.4 Example API Call (GLM-5.1)](#124-example-api-call-glm-51)

---

## 1. Overview

This document captures the full research and implementation plan for a **pi coding agent extension** that connects NVIDIA NIM (NVIDIA Inference Microservices) as a custom model provider. The extension will register a `nvidia-nim` provider, making NVIDIA NIM's chat, coding, reasoning, and vision LLMs available through pi's `/model` picker.

The key insight driving this design: **NVIDIA NIM exposes an OpenAI-compatible API**, so we can use pi's built-in `openai-completions` streaming handler — no custom `streamSimple` implementation needed. This avoids the bug that a previous `streamSimple`-based approach caused, where other providers (like OpenRouter) stopped working.

---

## 2. NVIDIA NIM API Analysis

NVIDIA NIM provides inference microservices at:

```
https://integrate.api.nvidia.com/v1
```

**Key properties:**

| Property | Value |
|----------|-------|
| API format | OpenAI Chat Completions compatible |
| Auth | `Authorization: Bearer $NVIDIA_API_KEY` |
| Models endpoint | `GET /v1/models` |
| Chat endpoint | `POST /v1/chat/completions` |
| Streaming | SSE with `stream: true` |
| Free tier | Available with rate limits |
| `extra_body` | Some models need additional parameters beyond the OpenAI spec |

**Example raw `/v1/models` response (truncated):**

```json
{
  "object": "list",
  "data": [
    { "id": "deepseek-ai/deepseek-v4-flash", "object": "model", "created": 735790403, "owned_by": "deepseek-ai" },
    { "id": "z-ai/glm-5.1", "object": "model", "created": 735790403, "owned_by": "z-ai" },
    { "id": "meta/llama-3.1-70b-instruct", "object": "model", "created": 735790403, "owned_by": "meta" },
    ...
  ]
}
```

**Important:** The `/v1/models` endpoint returns **all** models (150+), including embeddings, ASR, TTS, OCR, image generation, protein folding, etc. Most are not useful for a coding agent. The endpoint also doesn't return metadata like `contextWindow`, `maxTokens`, or cost — only the model ID and owner.

---

## 3. Pi Extension Architecture

Pi extensions that register custom providers follow this pattern:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("provider-name", {
    baseUrl: "https://api.example.com/v1",
    apiKey: "ENV_VAR_NAME",     // pi resolves the env var automatically
    api: "openai-completions",  // built-in streaming handler
    models: [...],              // ProviderModelConfig[]
  });
}
```

The extension can also be `async` (for dynamic model discovery):

```typescript
export default async function (pi: ExtensionAPI) {
  const response = await fetch("https://api.example.com/v1/models");
  const data = await response.json();
  pi.registerProvider("provider-name", { ...models from data... });
}
```

Pi waits for the factory to complete before startup continues, so registered models are available immediately — including for `pi --list-models`.

---

## 4. Key Design Decisions

### 4.1 Use `openai-completions` API (NOT `streamSimple`)

**Decision:** Register the provider with `api: "openai-completions"`.

**Rationale:** NVIDIA NIM's API is OpenAI-compatible. Using the built-in `openai-completions` handler means:
- Correct request serialization and streaming out of the box
- No risk of interfering with other providers (the `streamSimple` bug)
- Access to all `compat` flags pi-ai supports (thinking formats, developer role, etc.)
- Less code to maintain

The alternative — implementing a custom `streamSimple` — is only needed for providers with non-standard APIs (like Anthropic's Messages API or GitLab Duo's proxy). NVIDIA NIM doesn't need it.

**Supporting evidence:** The `custom-provider-qwen-cli` example uses `api: "openai-completions"` for DashScope (Qwen's API), which is also OpenAI-compatible. It works perfectly alongside other providers.

### 4.2 Use `before_provider_request` for `extra_body`

**Decision:** Use the `before_provider_request` event hook to inject `extra_body` parameters for models that need them.

**Rationale:** Some NVIDIA NIM models require parameters beyond the standard OpenAI spec. For example, GLM-5.1 needs:

```json
{
  "extra_body": {
    "chat_template_kwargs": {
      "enable_thinking": true,
      "clear_thinking": false
    }
  }
}
```

Pi's `openai-completions` handler doesn't have a native `extra_body` field in its model config. However:
- The `thinkingFormat: "qwen-chat-template"` compat flag already handles `chat_template_kwargs.enable_thinking` injection natively in pi-ai
- For any **additional** `extra_body` fields beyond what `qwen-chat-template` covers, we use `before_provider_request` to merge them into the outgoing payload

**Subtlety:** We may discover that `qwen-chat-template` handles most of what we need, making the `before_provider_request` hook unnecessary for most models. This needs testing.

### 4.3 Static Model List with Curated Metadata

**Decision:** Ship a statically curated model list with hand-verified metadata.

**Rationale:**
- The `/v1/models` endpoint returns 150+ models, most useless for coding
- The endpoint doesn't provide `contextWindow`, `maxTokens`, or `cost`
- A curated list ensures correct `reasoning`, `input`, and `compat` flags
- Avoids startup latency from API calls
- A supplementary dynamic discovery mode can be added as an opt-in feature

### 4.4 Model Family-Based Compat Configuration

**Decision:** Group models by **family** and define compat at the family level, not per-model.

**Rationale:** Many NVIDIA NIM models share the same compat requirements. For example, all Llama models need `supportsDeveloperRole: false`. All Qwen models need `thinkingFormat: "qwen-chat-template"`. Defining this per-model for 45+ models is error-prone and verbose. Family-based config is DRY and maintainable.

---

## 5. The `streamSimple` Problem — Root Cause Analysis

**Symptom:** When using `streamSimple` with a custom API name, other providers (like OpenRouter) stopped working.

**Root cause:** When you call:

```typescript
pi.registerProvider("nvidia-nim", {
  api: "some-custom-api",
  streamSimple: streamMyProvider,
  ...
});
```

pi registers a **custom API type** and a **global stream handler** for it. The problems this can cause:

1. **API type collision**: If the custom `api` string accidentally matches or interferes with another provider's API type resolution, requests get routed incorrectly.

2. **Handler registration side effects**: The `streamSimple` registration is global. If your handler throws errors during initialization (e.g., because `NVIDIA_API_KEY` isn't set), it can corrupt the handler chain for other providers.

3. **Payload serialization mismatch**: The `api` field determines how pi serializes the request payload. A custom API type bypasses pi's built-in serialization, which means `before_provider_request` handlers from other extensions might receive malformed payloads, and the response parsing may not match what other providers expect.

4. **Provider isolation failure**: Pi's internal routing assumes that providers with standard API types (`openai-completions`, `anthropic-messages`, etc.) are handled by the built-in stream handlers. A custom API type creates a separate code path that may not be fully isolated from the standard ones.

**The fix:** Use `api: "openai-completions"` (matching NVIDIA NIM's actual API format) and handle model-specific quirks through `compat` flags and `before_provider_request`. This is exactly what the Qwen CLI example does successfully.

---

## 6. Model Curation Strategy

From the 159 models scraped from build.nvidia.com, we filter to only **LLMs suitable for a coding agent**.

### 6.1 Include List (~45 LLMs)

**Chat / Instruction Following:**

| Model ID | Category | Notes |
|----------|----------|-------|
| `meta/llama-3.1-8b-instruct` | Chat | Small, fast |
| `meta/llama-3.1-70b-instruct` | Chat | Good general purpose |
| `meta/llama-3.1-405b-instruct` | Synthetic Data / Chat | Largest Llama 3.1 |
| `meta/llama-3.2-1b-instruct` | Chat | Tiny |
| `meta/llama-3.2-3b-instruct` | Chat | Small |
| `meta/llama-3.3-70b-instruct` | Instruction Following | Improved over 3.1 |
| `meta/llama-4-maverick-17b-128e-instruct` | Language Generation | MoE architecture |
| `google/gemma-2-2b-it` | Chat | Small |
| `google/gemma-3-27b-it` | Vision Assistant | Vision-capable |
| `google/gemma-3n-e2b-it` | Language Generation | Efficient |
| `google/gemma-3n-e4b-it` | Language Generation | Efficient |
| `google/gemma-4-31b-it` | Coding | Good code model |
| `microsoft/phi-4-mini-instruct` | Chat | Small, efficient |
| `microsoft/phi-4-multimodal-instruct` | Speech/Vision | Multimodal |
| `mistralai/mistral-7b-instruct-v0.3` | Chat | Small |
| `nvidia/nemotron-mini-4b-instruct` | Chat | Small NVIDIA model |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | Math | Nemotron-tuned Llama |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Math | Updated Nemotron |
| `nvidia/nvidia-nemotron-nano-9b-v2` | Thinking Budget | Small reasoning model |
| `nvidia/nemotron-nano-12b-v2-vl` | Language Generation | Vision-capable |
| `upstage/solar-10.7b-instruct` | Chat | Korean-optimized |
| `stockmark/stockmark-2-100b-instruct` | Sovereign AI | Japanese-optimized |

**Coding / Agentic:**

| Model ID | Category | Notes |
|----------|----------|-------|
| `deepseek-ai/deepseek-v4-flash` | Coding | 284B MoE, fast |
| `deepseek-ai/deepseek-v4-pro` | Coding | 284B MoE, heavy |
| `qwen/qwen2.5-coder-32b-instruct` | Code Completion | Qwen coder |
| `qwen/qwen3-coder-480b-a35b-instruct` | Agentic Coding | Largest Qwen coder |
| `mistralai/devstral-2-123b-instruct-2512` | Coding | Agentic coding model |
| `mistralai/magistral-small-2506` | Coding | Small reasoning coder |
| `moonshotai/kimi-k2-instruct` | Coding | Kimi K2 |
| `moonshotai/kimi-k2-instruct-0905` | Long Context | Updated Kimi K2 |
| `minimaxai/minimax-m2.7` | Coding | MiniMax latest |
| `z-ai/glm-5.1` | Agentic AI | Flagship GLM |
| `z-ai/glm-4.7` | Tool Calling | GLM with tool use |
| `stepfun-ai/step-3.5-flash` | Agentic | StepFun agentic |
| `abacusai/dracarys-llama-3.1-70b-instruct` | Code Generation | Fine-tuned Llama |
| `mistralai/mistral-small-4-119b-2603` | Code Generation | Mistral small v4 |
| `sarvamai/sarvam-m` | Coding | Indian languages |

**Reasoning / Thinking:**

| Model ID | Category | Notes |
|----------|----------|-------|
| `deepseek-ai/deepseek-v3.1-terminus` | Tool Calling | DeepSeek V3.1 |
| `deepseek-ai/deepseek-v3.2` | Long Context | DeepSeek V3.2 |
| `openai/gpt-oss-120b` | Reasoning | Large OSS GPT |
| `openai/gpt-oss-20b` | Reasoning | Small OSS GPT |
| `qwen/qwen3-next-80b-a3b-instruct` | Text Generation | Qwen3 Next |
| `qwen/qwen3-next-80b-a3b-thinking` | Reasoning | Thinking variant |
| `qwen/qwen3.5-122b-a10b` | Tool Calling | Qwen 3.5 MoE |
| `qwen/qwen3.5-397b-a17b` | MoE | Largest Qwen 3.5 |
| `minimaxai/minimax-m2.5` | Reasoning | MiniMax reasoning |
| `moonshotai/kimi-k2-thinking` | Conversational | Thinking K2 |
| `moonshotai/kimi-k2.5` | Multimodal | Latest Kimi |
| `bytedance/seed-oss-36b-instruct` | Thinking Budget | ByteDance Seed |
| `mistralai/mistral-large-3-675b-instruct-2512` | Language Generation | Largest Mistral |
| `mistralai/mistral-medium-3-instruct` | Language Generation | Mistral medium |
| `mistralai/mistral-nemotron` | Language Generation | Nemotron-tuned Mistral |
| `mistralai/mistral-small-3.1-24b-instruct-2503` | Language Generation | Small Mistral v3.1 |
| `mistralai/ministral-14b-instruct-2512` | Language Generation | Ministral |

**Vision:**

| Model ID | Category | Notes |
|----------|----------|-------|
| `meta/llama-3.2-11b-vision-instruct` | Image-Text Retrieval | Small vision Llama |
| `meta/llama-3.2-90b-vision-instruct` | Image-Text Retrieval | Large vision Llama |
| `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | Doc Intelligence | Small vision Nemotron |

### 6.2 Exclude List (Non-LLM / Non-Coding Models)

These categories should be **excluded** from the extension:

| Category | Example Models | Reason |
|----------|---------------|--------|
| ASR (Automatic Speech Recognition) | `conformer-ctc-asr`, `parakeet-*`, `whisper-large-v3`, `canary-1b-asr`, `nemotron-asr-streaming` | Not text LLMs |
| TTS (Text-to-Speech) | `magpie-tts-flow`, `magpie-tts-multilingual`, `magpie-tts-zeroshot` | Not text LLMs |
| Translation | `riva-translate-*`, `megatron-1b-nmt` | Not chat LLMs |
| Embeddings | `bge-m3`, `nv-embed-*`, `nv-embedqa-*`, `llama-nemotron-embed-*`, `nv-embedcode-7b-v1` | Not generative |
| Reranking | `rerank-qa-mistral-4b`, `llama-nemotron-rerank-*`, `nv-rerankqa-*`, `llama-3.2-nemoretriever-500m-rerank-v2` | Not generative |
| OCR / Doc Intelligence | `nemoretriever-parse`, `nemotron-parse`, `nemotron-ocr-v1`, `paddleocr`, `page-elements-*`, `table-structure-*`, `graphic-elements-*` | Not chat LLMs |
| Safety / Guardrails | `nemoguard-*`, `nemotron-3-content-safety`, `content-safety-reasoning-4b`, `llama-guard-4-12b`, `safety-guard-*`, `gliner-pii`, `jailbreak-detect` | Not coding assistants |
| Image Generation | `FLUX.*`, `stable-diffusion-*`, `cosmos-transfer*`, `cosmos-predict1-*` | Diffusion models, not LLMs |
| Video / Vision Processing | `cosmos-reason2-8b`, `synthetic-video-detector`, `Active Speaker Detection`, `LipSync`, `Background Noise Removal`, `eyecontact`, `vista-3d` | Not chat LLMs |
| Science / Biology | `alphafold2*`, `esm*`, `proteinmpnn`, `rfdiffusion`, `openfold*`, `Boltz-2`, `diffdock`, `genmol`, `molmim`, `msa-search`, `evo2-40b` | Domain-specific |
| Autonomous Vehicles | `bevformer`, `sparsedrive`, `streampetr` | Not LLMs |
| Utilities | `cuopt`, `ising-calibration-*`, `fourcastnet`, `usdcode`, `usdvalidate`, `TRELLIS` | Not chat LLMs |
| Other NVIDIA infra | `studiovoice`, `parakeet-tdt-*`, `magpie-tts-*`, `riva-translate-*` | Not chat LLMs |

---

## 7. Model Family Compat Reference

### 7.1 Family Definitions

| Family | Pattern | `supportsDeveloperRole` | `supportsReasoningEffort` | `thinkingFormat` | `maxTokensField` | Extra Body (reasoning on) |
|--------|---------|------------------------|--------------------------|-----------------|------------------|---------------------------|
| `deepseek` | `deepseek-ai/deepseek-v[34]` | `false` | — | `"deepseek"` | — | — |
| `qwen3-coder` | `qwen/qwen3-coder` | `false` | — | `"qwen-chat-template"` | — | `chat_template_kwargs.enable_thinking: true` |
| `qwen3-next` | `qwen/qwen3-next` | `false` | — | `"qwen-chat-template"` | — | `chat_template_kwargs.enable_thinking: true` |
| `qwen3.5` | `qwen/qwen3.5` | `false` | — | `"qwen-chat-template"` | — | `chat_template_kwargs.enable_thinking: true` |
| `qwen2.5-coder` | `qwen/qwen2.5-coder` | `false` | — | — | — | — |
| `glm` | `z-ai/glm` | `false` | — | `"qwen-chat-template"` | — | `chat_template_kwargs: { enable_thinking: true, clear_thinking: false }` |
| `minimax` | `minimaxai/minimax` | `false` | — | `"qwen-chat-template"` | — | — |
| `kimi` | `moonshotai/kimi` | `false` | — | `"qwen-chat-template"` | — | — |
| `gpt-oss` | `openai/gpt-oss` | `false` | `false` | — | — | — |
| `llama` | `meta/llama` | `false` | `false` | — | — | — |
| `mistral` | `mistralai/` | `false` | — | — | — | — |
| `nemotron` | `nvidia/.*nemotron` | `false` | `false` | — | — | — |
| `gemma` | `google/gemma` | `false` | `false` | — | — | — |
| `phi` | `microsoft/phi` | `false` | — | — | — | — |
| `seed` | `bytedance/seed` | `false` | — | `"qwen-chat-template"` | — | — |
| `step` | `stepfun-ai/` | `false` | — | — | — | — |
| `solar` | `upstage/solar` | `false` | `false` | — | — | — |
| `stockmark` | `stockmark/` | `false` | `false` | — | — | — |
| `dracarys` | `abacusai/` | `false` | `false` | — | — | — |
| `sarvam` | `sarvamai/` | `false` | — | — | — | — |

### 7.2 `extra_body` Per-Family Details

Some NVIDIA NIM models require parameters that go beyond the standard OpenAI Chat Completions spec. These are passed as `extra_body` in the Python OpenAI SDK, which translates to additional top-level JSON fields in the HTTP request body.

**GLM-5.1 (from build.nvidia.com code snippet):**

```python
extra_body={
    "chat_template_kwargs": {
        "enable_thinking": True,
        "clear_thinking": False
    }
}
```

The `clear_thinking: False` is **GLM-specific** and not handled by pi-ai's `qwen-chat-template` format (which only sets `enable_thinking`). This is a case where `before_provider_request` is needed to inject the additional field.

**Qwen3-Coder / Qwen3-Next / Qwen3.5 (typical pattern):**

```python
extra_body={
    "chat_template_kwargs": {
        "enable_thinking": True
    }
}
```

This is exactly what `thinkingFormat: "qwen-chat-template"` handles natively in pi-ai. No `before_provider_request` needed.

**DeepSeek V3/V4:**

```python
# DeepSeek uses its own thinking format
thinking={"type": "enabled"}  # handled by thinkingFormat: "deepseek"
```

No `extra_body` needed.

### 7.3 How `qwen-chat-template` Works in pi-ai

From the pi-ai type definitions:

```typescript
/**
 * Format for reasoning/thinking parameter.
 * "qwen-chat-template" uses chat_template_kwargs.enable_thinking.
 * Default: "openai".
 */
thinkingFormat?: "openai" | "openrouter" | "deepseek" | "zai" | "qwen" | "qwen-chat-template";
```

When `thinkingFormat: "qwen-chat-template"` is set and reasoning is enabled for a request, pi-ai's `openai-completions` stream handler **automatically** injects:

```json
{
  "chat_template_kwargs": {
    "enable_thinking": true
  }
}
```

into the request body. This means:
- **Most Qwen-family and GLM models**: No `before_provider_request` hook needed for `enable_thinking`
- **GLM-5.1 specifically**: Needs `before_provider_request` to add `clear_thinking: false` in addition to the auto-injected `enable_thinking`

**This needs verification testing** — if pi-ai merges `chat_template_kwargs` fields correctly (i.e., our `before_provider_request` adding `clear_thinking` doesn't overwrite the `enable_thinking` that pi-ai already set), then the approach works cleanly.

---

## 8. Directory Structure

```
NvidiaProvider/
├── IMPLEMENTATION_PLAN.md      # This document
├── package.json                # Pi package manifest
├── index.ts                    # Extension entry point
├── models/
│   ├── registry.ts             # Model registry — combines & exports all models
│   ├── chat-models.ts          # Chat / instruction-following models
│   ├── coding-models.ts        # Coding / agentic models
│   ├── reasoning-models.ts     # Reasoning / thinking models
│   ├── vision-models.ts        # Vision / multimodal models
│   └── types.ts                # NimModelConfig type definition
├── config/
│   ├── model-families.ts       # Per-family compat & extra_body config
│   └── defaults.ts             # Default provider-level settings
├── tools/
│   ├── extract_models_by_category.py  # (existing) Python scraper
│   ├── nvidia_nim_models.txt          # (existing) Flat model list
│   ├── nvidia_nim_models_by_category.txt  # (existing) Categorized list
│   ├── nvidia_scrape_raw.txt          # (existing) Raw scrape data
│   └── fetch_nim_models.ts            # (future) TS model metadata fetcher
└── README.md                   # Usage documentation
```

---

## 9. Implementation Phases

### Phase 1: Core Extension Structure

**Step 1.1 — `package.json`**

```json
{
  "name": "pi-extension-nvidia-nim",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "typebox": "*"
  }
}
```

No runtime `dependencies` needed — the extension only uses pi's built-in `openai-completions` handler and pi-ai's built-in types. All imports from `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, and `typebox` are bundled by pi and should be listed as `peerDependencies` with `"*"` range per the packages.md doc.

**Step 1.2 — `index.ts` (Entry Point)**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MODELS } from "./models/registry";
import { MODEL_FAMILIES } from "./config/model-families";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("nvidia-nim", {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: "NVIDIA_API_KEY",    // pi resolves env var automatically
    api: "openai-completions",
    authHeader: true,            // adds Authorization: Bearer header
    models: MODELS,
  });

  // Inject extra_body for models that need additional parameters
  pi.on("before_provider_request", (event, ctx) => {
    if (event.provider !== "nvidia-nim") return;

    const family = MODEL_FAMILIES.find(f => f.pattern.test(event.modelId));
    if (!family?.extraBody) return;

    // Merge extra_body fields into the payload
    return {
      ...event.payload,
      extra_body: {
        ...(event.payload.extra_body ?? {}),
        ...family.extraBody,
      },
    };
  });
}
```

### Phase 2: Model Registry

**Step 2.1 — `models/types.ts`**

```typescript
import type { ProviderModelConfig } from "@mariozechner/pi-ai";

/**
 * Extended model config for internal use.
 * The `family` and `extraBody` fields are used by the registry
 * to apply family-based compat, and by before_provider_request
 * to inject extra_body. They are NOT passed to pi.registerProvider.
 */
export interface NimModelConfig extends ProviderModelConfig {
  family?: string;       // model family name for compat lookup
  extraBody?: Record<string, any>;  // extra_body to inject via before_provider_request
}
```

**Step 2.2–2.5 — Model Definition Files**

Each file exports an array of `NimModelConfig` objects. Example for `coding-models.ts`:

```typescript
import type { NimModelConfig } from "./types";

export const CODING_MODELS: NimModelConfig[] = [
  {
    id: "deepseek-ai/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    family: "deepseek",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.27, output: 1.10, cacheRead: 0.07, cacheWrite: 0.27 },
    contextWindow: 1000000,
    maxTokens: 65536,
  },
  {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    name: "Qwen3 Coder 480B",
    family: "qwen3-coder",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  },
  // ... more models
];
```

**Step 2.6 — `models/registry.ts`**

```typescript
import type { ProviderModelConfig } from "@mariozechner/pi-ai";
import type { NimModelConfig } from "./types";
import { CHAT_MODELS } from "./chat-models";
import { CODING_MODELS } from "./coding-models";
import { REASONING_MODELS } from "./reasoning-models";
import { VISION_MODELS } from "./vision-models";
import { applyFamilyCompat } from "../config/model-families";

const ALL_MODELS: NimModelConfig[] = [
  ...CHAT_MODELS,
  ...CODING_MODELS,
  ...REASONING_MODELS,
  ...VISION_MODELS,
];

// Apply family-based compat and strip internal fields
export const MODELS: ProviderModelConfig[] = applyFamilyCompat(ALL_MODELS);
```

### Phase 3: Family Compat Configuration

**Step 3.1 — `config/model-families.ts`**

```typescript
import type { ProviderModelConfig } from "@mariozechner/pi-ai";
import type { NimModelConfig } from "../models/types";

export interface ModelFamily {
  name: string;
  pattern: RegExp;
  compat: NonNullable<ProviderModelConfig["compat"]>;
  extraBody?: Record<string, any>;
}

export const MODEL_FAMILIES: ModelFamily[] = [
  {
    name: "deepseek",
    pattern: /deepseek-ai\/deepseek-v[34]/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
    },
  },
  {
    name: "qwen3-coder",
    pattern: /qwen\/qwen3-coder/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
    },
    extraBody: {
      chat_template_kwargs: { enable_thinking: true },
    },
  },
  {
    name: "glm",
    pattern: /z-ai\/glm/,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "qwen-chat-template",
    },
    extraBody: {
      chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
    },
  },
  {
    name: "llama",
    pattern: /meta\/llama/,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  },
  // ... more families
];

/**
 * Apply family-based compat to models.
 * Strips internal `family` and `extraBody` fields from the output.
 */
export function applyFamilyCompat(models: NimModelConfig[]): ProviderModelConfig[] {
  return models.map((model) => {
    const family = MODEL_FAMILIES.find((f) => f.pattern.test(model.id));
    const { family: _f, extraBody: _e, ...providerModel } = model;

    if (family) {
      // Merge family compat with any model-level compat (model-level wins)
      providerModel.compat = { ...family.compat, ...model.compat };
    }

    return providerModel;
  });
}
```

### Phase 4: `before_provider_request` Handler

This is the critical piece for injecting `extra_body` parameters. The handler:

1. **Checks the provider** — only modifies `nvidia-nim` requests
2. **Finds the model's family** — looks up the family config
3. **Checks if reasoning is active** — only injects thinking-related `extra_body` when appropriate
4. **Merges extra_body** — deep-merges into the outgoing payload

```typescript
pi.on("before_provider_request", (event, ctx) => {
  // Only modify requests for nvidia-nim provider
  if (event.provider !== "nvidia-nim") return;

  // Find the model's family config
  const family = MODEL_FAMILIES.find((f) => f.pattern.test(event.modelId));
  if (!family?.extraBody) return;

  // Merge extra_body into the payload
  // Note: pi-ai's openai-completions handler may already have set
  // chat_template_kwargs.enable_thinking via qwen-chat-template.
  // We need to deep-merge to avoid overwriting.
  const payload = { ...event.payload };

  for (const [key, value] of Object.entries(family.extraBody)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      payload[key] = {
        ...(payload[key] ?? {}),
        ...value,
      };
    } else {
      payload[key] = value;
    }
  }

  return payload;
});
```

**Important consideration:** We should only inject `chat_template_kwargs.enable_thinking: true` when the user has **reasoning/thinking enabled** in pi. If thinking is off, we should either omit the field or set `enable_thinking: false`. The `before_provider_request` event payload should contain information about whether reasoning is active — we need to verify what fields pi-ai sets in the payload for `qwen-chat-template` when thinking is enabled vs disabled.

### Phase 5: Gathering Model Metadata

The hardest part is getting accurate `contextWindow`, `maxTokens`, and `cost` for each model. Strategies:

**5.1 — Static curated data (primary approach)**

Manually curate metadata from:
- NVIDIA NIM model cards at `https://docs.api.nvidia.com/nim/reference/{model-slug}`
- build.nvidia.com model pages (code snippets reveal parameters)
- HuggingFace model cards
- Official model documentation / papers

**5.2 — Automated scraping tool (supplementary)**

Build a Node.js script that:
1. Fetches `/v1/models` for the full model ID list
2. For each relevant model, fetches `https://docs.api.nvidia.com/nim/reference/{slug}-infer` for parameter info
3. Fetches `https://build.nvidia.com/{publisher}/{model}` for code snippets revealing `extra_body` parameters
4. Uses the Tavily Extract skill for clean content extraction
5. Outputs a JSON file with discovered metadata

**5.3 — Sensible defaults (fallback)**

| Field | Default | Rationale |
|-------|---------|-----------|
| `contextWindow` | `128000` | Common for modern LLMs |
| `maxTokens` | `16384` | pi's built-in default |
| `cost` | `{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }` | NVIDIA NIM free tier |
| `reasoning` | `false` | Safe default; override per model |
| `input` | `["text"]` | Safe default; upgrade to `["text", "image"]` when confirmed |

### Phase 6: Optional Dynamic Model Discovery

An opt-in async factory mode that fetches `/v1/models` at startup, filters against a curated allowlist, and merges with static metadata:

```typescript
export default async function (pi: ExtensionAPI) {
  let models: ProviderModelConfig[];

  if (process.env.NIM_DYNAMIC_MODELS === "1") {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    });
    const data = await response.json();
    models = filterAndEnrichModels(data.data);
  } else {
    models = STATIC_MODELS;
  }

  pi.registerProvider("nvidia-nim", {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: "NVIDIA_API_KEY",
    api: "openai-completions",
    authHeader: true,
    models,
  });
}
```

---

## 10. Pi Framework Reference

### 10.1 Relevant Documentation Files

| File | Key Content |
|------|-------------|
| `docs/custom-provider.md` | Provider registration, `streamSimple` pattern, compat flags, model definition reference |
| `docs/models.md` | `models.json` format, per-model compat overrides, supported APIs |
| `docs/providers.md` | API key resolution, auth file format, provider resolution order |
| `docs/extensions.md` | Extension lifecycle, event hooks, `before_provider_request`, tool registration |
| `docs/packages.md` | Package structure, `peerDependencies` for pi packages, npm/git distribution |
| `docs/sdk.md` | Programmatic agent access, `createAgentSession`, model registry |

### 10.2 Relevant Example Extensions

| Example | Key Takeaways |
|---------|---------------|
| `custom-provider-anthropic/` | Full `streamSimple` implementation with OAuth. **Overkill for our use case** — we don't need custom streaming. |
| `custom-provider-gitlab-duo/` | Multi-backend provider (Anthropic + OpenAI). Uses `streamSimpleAnthropic` and `streamSimpleOpenAIResponses` from pi-ai. Interesting pattern but not needed for NVIDIA NIM. |
| `custom-provider-qwen-cli/` | **Closest to our approach.** Uses `api: "openai-completions"` with `compat` flags. Has OAuth with device code flow. Simple and clean. |
| `provider-payload.ts` | Minimal `before_provider_request` example. Shows how to log and/or replace the payload. |

### 10.3 Provider Registration API

```typescript
interface ProviderConfig {
  baseUrl?: string;           // API endpoint URL
  apiKey?: string;            // Env var name or literal value
  api?: Api;                  // API type for streaming
  streamSimple?: StreamFn;    // Custom streaming (we DON'T need this)
  headers?: Record<string, string>;  // Custom headers
  authHeader?: boolean;       // Add Authorization: Bearer header
  models?: ProviderModelConfig[];    // Model definitions
  oauth?: OAuthConfig;        // OAuth provider config
}
```

### 10.4 Model Definition Reference

```typescript
interface ProviderModelConfig {
  id: string;               // Model ID (passed to API)
  name: string;              // Display name
  api?: Api;                 // Override provider's API for this model
  reasoning: boolean;        // Supports extended thinking
  input: ("text" | "image")[];  // Supported input types
  cost: {                    // Per million tokens
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;     // Max context window in tokens
  maxTokens: number;         // Max output tokens
  headers?: Record<string, string>;  // Custom headers per model
  compat?: { ... };          // OpenAI compatibility settings
}
```

### 10.5 Compat Flags Reference

| Field | Type | Description |
|-------|------|-------------|
| `supportsStore` | `boolean` | Provider supports `store` field |
| `supportsDeveloperRole` | `boolean` | Use `developer` vs `system` role |
| `supportsReasoningEffort` | `boolean` | Support for `reasoning_effort` parameter |
| `reasoningEffortMap` | `Record<ThinkingLevel, string>` | Map pi thinking levels to provider values |
| `supportsUsageInStreaming` | `boolean` | Supports `stream_options: { include_usage: true }` (default: `true`) |
| `maxTokensField` | `"max_completion_tokens" \| "max_tokens"` | Which field name to use |
| `requiresToolResultName` | `boolean` | Include `name` on tool result messages |
| `requiresAssistantAfterToolResult` | `boolean` | Insert assistant message after tool results |
| `requiresThinkingAsText` | `boolean` | Convert thinking blocks to plain text |
| `requiresReasoningContentOnAssistantMessages` | `boolean` | Include `reasoning_content` on all replayed assistant messages |
| `thinkingFormat` | `"openai" \| "deepseek" \| "zai" \| "qwen" \| "qwen-chat-template"` | Thinking parameter format |
| `cacheControlFormat` | `"anthropic"` | Anthropic-style cache_control markers |
| `supportsStrictMode` | `boolean` | Include `strict` field in tool definitions |

### 10.6 `before_provider_request` Event

```typescript
pi.on("before_provider_request", (event, ctx) => {
  // event.provider - provider name (e.g., "nvidia-nim")
  // event.modelId - model ID (e.g., "z-ai/glm-5.1")
  // event.payload - the raw request body that will be sent
  // event.api - the API type (e.g., "openai-completions")

  // Return undefined to keep payload unchanged
  // Return a modified payload to replace it
  return { ...event.payload, extra_field: "value" };
});
```

**Key behaviors:**
- Handlers run in extension load order
- Returning `undefined` keeps the payload unchanged
- Returning any other value replaces the payload for later handlers and for the actual request
- This hook can rewrite provider-level system instructions or remove them entirely
- Changes are NOT reflected by `ctx.getSystemPrompt()` (which reports Pi's system prompt string, not the serialized payload)

### 10.7 Thinking Format Options

| Format | How It Enables Thinking | When to Use |
|--------|------------------------|-------------|
| `"openai"` | Sends `reasoning_effort` parameter | OpenAI and direct OpenAI-compatible APIs |
| `"deepseek"` | Sends `thinking: { type: "enabled" }` + `reasoning_effort` | DeepSeek V3/V4 models |
| `"zai"` | Sends top-level `enable_thinking: boolean` | ZAI (Zhipu) API |
| `"qwen"` | Sends top-level `enable_thinking: boolean` | DashScope-style Qwen API |
| `"qwen-chat-template"` | Sends `chat_template_kwargs.enable_thinking` | Local Qwen-compatible servers and models that use chat template kwargs (including GLM, Kimi K2, MiniMax on NVIDIA NIM) |

---

## 11. Open Questions & Decisions Needed

1. **Verify `qwen-chat-template` in pi-ai**: Does pi-ai's built-in `qwen-chat-template` handling already inject `chat_template_kwargs.enable_thinking: true` into the request body? If yes, most of our `extraBody` config is redundant — only GLM's `clear_thinking: false` would need `before_provider_request`. **Action: Test with a qwen3-coder model on NVIDIA NIM.**

2. **Deep-merge behavior**: When `before_provider_request` adds `chat_template_kwargs: { clear_thinking: false }`, does it correctly deep-merge with pi-ai's already-injected `chat_template_kwargs: { enable_thinking: true }`? Or does one overwrite the other? **Action: Test and verify the merge behavior.**

3. **Dynamic vs static model list**: Do you want the optional dynamic model discovery (`NIM_DYNAMIC_MODELS=1`), or just a static list that you update manually when NVIDIA adds new models? **Recommendation: Start with static, add dynamic as a Phase 6 enhancement.**

4. **Cost data**: NVIDIA NIM has a free tier with rate limits. Should we set all costs to 0, or do you have pricing info for paid tiers / API credits? **Default: Set to 0 for now, update later if pricing info becomes available.**

5. **Model metadata accuracy**: The `contextWindow` and `maxTokens` values need verification. Many NVIDIA NIM model cards don't clearly state these. **Action: Manual research for the top ~20 most important models; use sensible defaults for the rest.**

6. **Non-reasoning `extra_body`**: Should the `before_provider_request` hook inject `chat_template_kwargs.enable_thinking: false` when reasoning is off? Or should we only inject when reasoning is on and leave the field absent otherwise? **Recommendation: Only inject when reasoning is on — absent fields default to the model's default behavior (which is usually thinking-off).**

7. **Model slugs for NVIDIA NIM docs**: The docs.api.nvidia.com URLs use a slug format (e.g., `z-ai-glm5.1` not `z-ai/glm-5.1`). We need a mapping or slugification function for the automated metadata fetcher. **Action: Build slug derivation from model ID.**

---

## 12. NVIDIA NIM API Reference

### 12.1 Base URL & Auth

```
Base URL: https://integrate.api.nvidia.com/v1
Auth:     Authorization: Bearer $NVIDIA_API_KEY
```

### 12.2 `/v1/models` Endpoint

```
GET /v1/models
Authorization: Bearer $NVIDIA_API_KEY
```

Returns a standard OpenAI-compatible model list. Each entry has only `id`, `object`, `created`, and `owned_by` — no metadata about context windows, pricing, or capabilities.

### 12.3 Model Card URLs

NVIDIA NIM provides two documentation URLs per model:

| URL Pattern | Content |
|-------------|---------|
| `https://docs.api.nvidia.com/nim/reference/{slug}` | Model card (description, capabilities, examples) |
| `https://docs.api.nvidia.com/nim/reference/{slug}-infer` | Inference parameters (temperature, top_p, max_tokens, etc.) |
| `https://build.nvidia.com/{publisher}/{model}` | Interactive playground with code snippets revealing `extra_body` parameters |

**Slug derivation:** The slug format in docs.api.nvidia.com differs from the model ID. Examples:
- `z-ai/glm-5.1` → `z-ai-glm5.1`
- `deepseek-ai/deepseek-v4-flash` → `deepseek-ai-deepseek-v4-flash`
- `meta/llama-3.1-70b-instruct` → `meta-llama-3.1-70b-instruct`

The slug appears to replace `/` with `-` and may remove version dots. **This needs investigation for a reliable mapping.**

### 12.4 Example API Call (GLM-5.1)

From the build.nvidia.com code snippet:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="$NVIDIA_API_KEY"
)

completion = client.chat.completions.create(
    model="z-ai/glm-5.1",
    messages=[{"role": "user", "content": ""}],
    temperature=1,
    top_p=1,
    max_tokens=32768,
    extra_body={"chat_template_kwargs": {"enable_thinking": True, "clear_thinking": False}},
    stream=True
)

for chunk in completion:
    if not getattr(chunk, "choices", None):
        continue
    if len(chunk.choices) == 0 or getattr(chunk.choices[0], "delta", None) is None:
        continue
    delta = chunk.choices[0].delta
    reasoning = getattr(delta, "reasoning_content", None)
    if reasoning:
        print(reasoning, end="")  # Thinking/reasoning content
    if getattr(delta, "content", None) is not None:
        print(delta.content, end="")  # Regular content
```

**Key observations:**
- Standard OpenAI Chat Completions API format
- `extra_body` passes `chat_template_kwargs` — these become top-level JSON fields in the HTTP body
- Reasoning content comes via `delta.reasoning_content` (same as DeepSeek's streaming format)
- `max_tokens=32768` — this is the max output for GLM-5.1
- `temperature=1` and `top_p=1` — defaults for this model
