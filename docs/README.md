# NVIDIA NIM Provider Extension — Complete Documentation

> **Last updated:** 2026-04-28
> **Project:** `E:/Munka/Programming/TypeJavaScript/NvidiaProvider`

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Architecture & Design Decisions](#2-architecture--design-decisions)
  - [2.1 Why `openai-completions` Not `streamSimple`](#21-why-openai-completions-not-streamsimple)
  - [2.2 Family-Based Compat Configuration](#22-family-based-compat-configuration)
  - [3. Directory Structure](#3-directory-structure)
- [4. Model Curation](#4-model-curation)
  - [4.1 Included Models (~80 LLMs)](#41-included-models)
  - [4.2 Excluded Categories](#42-excluded-categories)
  - [4.3 Model Family Compat Reference](#43-model-family-compat-reference)
- [5. Thinking Format Handling](#5-thinking-format-handling)
  - [5.1 `qwen-chat-template` (Native)](#51-qwen-chat-template-native)
  - [5.2 `deepseek-v4` (Handler)](#52-deepseek-v4-handler)
  - [5.3 `deepseek-nim` (Handler)](#53-deepseek-nim-handler)
  - [5.4 `stepfun-parallel` (Handler)](#54-stepfun-parallel-handler)
  - [5.5 `minimax-inline` (Native)](#55-minimax-inline-native)
  - [5.6 `reasoning-effort` (Native)](#56-reasoning-effort-native)
- [6. `before_provider_request` Handler](#6-before_provider_request-handler)
  - [6.1 Critical Bug Fix From Old Extension](#61-critical-bug-fix-from-old-extension)
  - [6.2 Handler Implementation](#62-handler-implementation)
- [7. Implementation Status](#7-implementation-status)
- [8. Test Plan](#8-test-plan)
- [9. Known Issues & Remaining Work](#9-known-issues--remaining-work)
- [10. Quick Reference](#10-quick-reference)
- [Appendix: Old Extension Audit](#appendix-old-extension-audit)

---

## 1. Overview

This extension registers **NVIDIA NIM** as a custom model provider (`nvidia-nim`) in the pi coding agent. It makes 50+ chat, coding, reasoning, and vision LLMs available through pi's `/model` picker, using NVIDIA's free-tier inference API at:

```
https://integrate.api.nvidia.com/v1
```

**Key design insight:** NVIDIA NIM exposes an OpenAI-compatible API, so we use pi's built-in `openai-completions` streaming handler — no custom streaming implementation needed. This avoids a critical bug in the previous extension where a custom `streamSimple` handler broke other providers (like OpenRouter).

**Key architectural decision:** Model-specific quirks (thinking formats, extra body parameters, compat flags) are handled through pi's `compat` system and a `before_provider_request` event hook, not custom streaming code.

---

## 2. Architecture & Design Decisions

### 2.1 Why `openai-completions` Not `streamSimple`

| Approach | Status | Rationale |
|----------|--------|-----------|
| `api: "openai-completions"` | ✅ **Used** | Native OpenAI-compatible streaming, no custom code, access to all pi `compat` flags, no risk of breaking other providers |
| Custom `streamSimple` | ❌ **Rejected** | Previous extension used this and broke OpenRouter due to global handler registration side effects, API type collisions, and payload serialization mismatches |

### 2.2 Family-Based Compat Configuration

Models are grouped by **family** (e.g., `deepseek`, `qwen`, `mistral`, `llama`). Each family defines `compat` flags (`thinkingFormat`, `supportsDeveloperRole`, `requiresToolResultName`, etc.) once, rather than repeating per-model.

This is defined in `config/model-families.ts` with 30+ families covering ~80 models.

### 2.3 Static Model List

| Mode | How | When |
|------|-----|------|
| **Static** | Hand-curated model list with verified metadata | Startup — no API calls, instant |

Model list is maintained via the `tools/fetch_nim_metadata.ts` metadata gathering tool and manual curation.

---

## 3. Directory Structure

```
NvidiaProvider/
├── index.ts                          # Extension entry + before_provider_request handler
├── package.json                      # Pi package manifest
├── models/
│   ├── types.ts                      # NimModelConfig type + NimThinkingFormat enum
│   ├── registry.ts                   # Loads from metadata.json, applies family compat
│   └── metadata.json                 # ~87 models with discovered metadata
├── config/
│   ├── model-families.ts             # 30+ families with compat + thinking format classification
│   └── defaults.ts                   # NIM_BASE_URL, NIM_API_KEY_ENV
├── tools/
│   └── fetch_nim_metadata.ts         # Comprehensive metadata fetcher (API + docs scraping)
└── docs/
    └── README.md                     # This file
```

---

## 4. Model Curation

### 4.1 Included Models

From 159 models on NVIDIA NIM, we filter to ~80 **LLMs suitable for a coding agent**:

**Chat / Instruction:**
`meta/llama-3.1-8b-instruct`, `meta/llama-3.3-70b-instruct`, `meta/llama-4-maverick-17b-128e-instruct`, `google/gemma-3-27b-it`, `google/gemma-4-31b-it`, `microsoft/phi-4-mini-instruct`, `microsoft/phi-4-multimodal-instruct`, `mistralai/mistral-7b-instruct-v0.3`, `nvidia/nemotron-mini-4b-instruct`, `nvidia/llama-3.3-nemotron-super-49b-v1`, `nvidia/nvidia-nemotron-nano-9b-v2`, `upstage/solar-10.7b-instruct`, `stockmark/stockmark-2-100b-instruct`

**Coding / Agentic:**
`deepseek-ai/deepseek-v4-flash`, `deepseek-ai/deepseek-v4-pro`, `qwen/qwen2.5-coder-32b-instruct`, `qwen/qwen3-coder-480b-a35b-instruct`, `mistralai/devstral-2-123b-instruct-2512`, `mistralai/magistral-small-2506`, `moonshotai/kimi-k2-instruct`, `minimaxai/minimax-m2.7`, `z-ai/glm-5.1`, `z-ai/glm-4.7`, `stepfun-ai/step-3.5-flash`, `abacusai/dracarys-llama-3.1-70b-instruct`, `mistralai/mistral-small-4-119b-2603`, `sarvamai/sarvam-m`

**Reasoning / Thinking:**
`deepseek-ai/deepseek-v3.1-terminus`, `deepseek-ai/deepseek-v3.2`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3-next-80b-a3b-instruct`, `qwen/qwen3.5-122b-a10b`, `qwen/qwen3.5-397b-a17b`, `minimaxai/minimax-m2.5`, `moonshotai/kimi-k2-thinking`, `moonshotai/kimi-k2.5`, `bytedance/seed-oss-36b-instruct`, `mistralai/mistral-large-3-675b-instruct-2512`, `mistralai/mistral-nemotron`

**Vision:**
`meta/llama-3.2-11b-vision-instruct`, `meta/llama-3.2-90b-vision-instruct`, `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`

All models have `cost: $0` (NVIDIA NIM free tier).

### 4.2 Excluded Categories

These are filtered out from the NIM catalog:

| Category | Examples | Reason |
|----------|----------|--------|
| ASR (Speech Recognition) | `whisper-large-v3`, `canary-1b-asr`, `nemotron-asr-streaming` | Not text LLMs |
| TTS (Text-to-Speech) | `magpie-tts-flow`, `magpie-tts-multilingual` | Not text LLMs |
| Embeddings | `bge-m3`, `nv-embed-*`, `llama-nemotron-embed-*` | Not generative |
| Reranking | `rerank-qa-mistral-4b`, `nv-rerankqa-*` | Not generative |
| OCR / Doc Intelligence | `nemoretriever-parse`, `nemotron-ocr-v1`, `paddleocr` | Not chat LLMs |
| Safety / Guardrails | `nemoguard-*`, `llama-guard-4-12b`, `jailbreak-detect` | Not coding assistants |
| Image Generation | `FLUX.*`, `stable-diffusion-*`, `cosmos-transfer*` | Diffusion models |
| Video / Vision Processing | `cosmos-reason2-8b`, `synthetic-video-detector` | Not chat LLMs |
| Science / Biology | `alphafold2*`, `esm*`, `proteinmpnn`, `diffdock` | Domain-specific |
| Autonomous Vehicles | `bevformer`, `sparsedrive`, `streampetr` | Not LLMs |

### 4.3 Model Family Compat Reference

| Family | Pattern | `supportsDeveloperRole` | `thinkingFormat` | Extra Notes |
|--------|---------|------------------------|-----------------|-------------|
| `deepseek` | `deepseek-ai/deepseek-v[34]` | `false` | `"deepseek"` | — |
| `qwen3-coder` | `qwen/qwen3-coder` | `false` | `"qwen-chat-template"` | — |
| `qwen3-next` | `qwen/qwen3-next` | `false` | `"qwen-chat-template"` | — |
| `qwen3.5` | `qwen/qwen3.5` | `false` | `"qwen-chat-template"` | — |
| `qwen2.5-coder` | `qwen/qwen2.5-coder` | `false` | — | — |
| `glm` | `z-ai/glm` | `false` | `"qwen-chat-template"` | `clear_thinking: false` injected via handler |
| `minimax` | `minimaxai/minimax` | `false` | `"qwen-chat-template"` | — |
| `kimi` | `moonshotai/kimi` | `false` | `"qwen-chat-template"` | — |
| `gpt-oss` | `openai/gpt-oss` | `false` | `"reasoning-effort"` | `minimal→low` mapping |
| `llama` | `meta/llama` | `false` | — | — |
| `mistral` | `mistralai/` | `false` | — | `requiresToolResultName: true` |
| `nemotron` | `nvidia/.*nemotron` | `false` | — | — |
| `gemma` | `google/gemma` | `false` | — | — |
| `phi` | `microsoft/phi` | `false` | — | — |
| `seed` | `bytedance/seed` | `false` | `"qwen-chat-template"` | — |
| `step` | `stepfun-ai/` | `false` | — | Handler injects `parallel_reasoning_mode` |
| `solar` | `upstage/solar` | `false` | — | — |
| `stockmark` | `stockmark/` | `false` | — | — |
| `dracarys` | `abacusai/` | `false` | — | — |
| `sarvam` | `sarvamai/` | `false` | — | — |

All families also set `maxTokensField: "max_tokens"`.

---

## 5. Thinking Format Handling

This is the most complex part of the extension. Different model families on NVIDIA NIM require different parameter structures to enable reasoning/thinking. We handle this through a combination of pi's native `compat.thinkingFormat` and our `before_provider_request` handler.

### 5.1 `qwen-chat-template` (Native)

**Models:** Qwen3, GLM, Phi-4-Mini-Flash, Magistral, Seed, Nemotron-Nano-9B

**How it works:** Pi's `openai-completions` handler natively injects:

```json
{
  "chat_template_kwargs": {
    "enable_thinking": true,
    "preserve_thinking": true
  }
}
```

when `thinkingFormat: "qwen-chat-template"` is set and reasoning is enabled. No custom handler code needed.

**GLM-5.1 exception:** Our handler additionally injects `clear_thinking: false` into `chat_template_kwargs` (see §6.2).

### 5.2 `deepseek-v4` (Handler)

**Models:** `deepseek-ai/deepseek-v4-flash`, `deepseek-ai/deepseek-v4-pro`

**How it works:**
1. `thinkingFormat: "deepseek"` tells pi to send top-level `thinking: { type: "enabled" }` and `reasoning_effort`
2. Our `before_provider_request` handler **converts** both into:

```json
{
  "chat_template_kwargs": {
    "thinking": true,
    "reasoning_effort": "none" | "high" | "max"
  }
}
```

3. Removes the original top-level `thinking` and `reasoning_effort`

**Mapping:**
| Pi thinking level | `chat_template_kwargs.reasoning_effort` |
|-------------------|----------------------------------------|
| Off | `"none"` |
| Low | `"high"` |
| Medium | `"high"` |
| High | `"max"` |

### 5.3 `deepseek-nim` (Handler)

**Models:** DeepSeek V3.x, R1, Kimi K2-Thinking, K2.5, Nemotron Ultra/Super

**How it works:**
1. `thinkingFormat: "deepseek"` tells pi to send top-level `thinking: { type: "enabled" }`
2. Our handler converts to:

```json
{
  "chat_template_kwargs": {
    "thinking": true
  }
}
```

3. Removes original top-level `thinking` and `reasoning_effort`

Unlike `deepseek-v4`, these models do NOT support `reasoning_effort` inside `chat_template_kwargs`.

### 5.4 `stepfun-parallel` (Handler)

**Models:** `stepfun-ai/step-3.5-flash`

**How it works:**
1. `thinkingFormat: "deepseek"` (closest match) makes pi send top-level `reasoning_effort`
2. Our handler maps `reasoning_effort` → `chat_template_kwargs.parallel_reasoning_mode`:

```json
{
  "chat_template_kwargs": {
    "parallel_reasoning_mode": "none" | "low" | "medium" | "heavy"
  }
}
```

**Mapping:**
| Pi thinking level | `parallel_reasoning_mode` |
|-------------------|------------------------|
| Off | `"none"` |
| Low | `"low"` |
| Medium | `"medium"` |
| High | `"heavy"` |

### 5.5 `minimax-inline` (Native)

**Models:** `minimaxai/minimax-m2.7`, `minimaxai/minimax-m2.5`

**How it works:** MiniMax always thinks inline using `<antha>...</antha>` tags. We set `requiresThinkingAsText: true` so pi strips these tags from the conversation history (they appear in the thinking panel but don't leak into the main response).

No `chat_template_kwargs` injection needed — the model always reasons inline.

### 5.6 `reasoning-effort` (Native)

**Models:** `openai/gpt-oss-120b`, `openai/gpt-oss-20b`

**How it works:** Standard OpenAI-style `reasoning_effort` parameter. Pi handles natively. We add `reasoningEffortMap: { minimal: "low" }` so the "minimal" thinking level maps to `"low"` (since NIM doesn't accept `"minimal"`).

---

## 6. `before_provider_request` Handler

### 6.1 Critical Bug Fix From Old Extension

**The previous extension (`nvidiaNim.ts`) had a fatal bug:**

```typescript
// OLD (broken):
const fullModelId = payload.model as string | undefined;
if (!fullModelId?.startsWith(`${PROVIDER_NAME}/`)) return;  // "nvidia-nim/"
const model = fullModelId.slice(PROVIDER_NAME.length + 1);
```

`payload.model` contains the **raw model ID** (e.g., `"deepseek-ai/deepseek-v4-flash"`), NOT `"nvidia-nim/deepseek-ai/deepseek-v4-flash"`. The `startsWith("nvidia-nim/")` check **always failed**, making the entire handler dead code.

**Result:** None of the custom thinking format conversions worked. DeepSeek V4, V3, Kimi, Nemotron, and StepFun thinking modes were all broken.

**Fix:** Check `payload.model` directly without a provider prefix:

```typescript
// NEW (fixed):
const modelId = payload.model as string | undefined;
if (!modelId) return;
const family = classifyThinkingFormat(modelId);
```

### 6.2 Handler Implementation

Located in `index.ts`, the handler:

1. **Early return** for non-NIM providers (`event.provider !== "nvidia-nim"`)
2. **Classifies** the model by family using regex patterns from `config/model-families.ts`
3. **Converts** thinking parameters based on the classified format:
   - `deepseek-v4`: Move `thinking` + `reasoning_effort` → `chat_template_kwargs`
   - `deepseek-nim`: Move `thinking` → `chat_template_kwargs` (drop `reasoning_effort`)
   - `stepfun-parallel`: Map `reasoning_effort` → `parallel_reasoning_mode`
   - `glm`: Inject `clear_thinking: false` alongside pi's native `enable_thinking`
4. **Cleans up** top-level `thinking` and `reasoning_effort` after conversion
5. **Deep-merges** `chat_template_kwargs` to avoid overwriting pi's native injections

```typescript
pi.on("before_provider_request", (event, ctx) => {
  if (event.provider !== "nvidia-nim") return;
  const modelId = event.payload.model as string | undefined;
  if (!modelId) return;

  const format = classifyThinkingFormat(modelId);
  const payload = { ...event.payload };

  switch (format) {
    case "deepseek-v4": {
      const reasoningEffort = mapThinkingLevelToReasoningEffort(payload.reasoning_effort);
      payload.chat_template_kwargs = {
        ...payload.chat_template_kwargs,
        thinking: true,
        reasoning_effort: reasoningEffort,
      };
      delete payload.thinking;
      delete payload.reasoning_effort;
      break;
    }
    case "deepseek-nim": {
      payload.chat_template_kwargs = {
        ...payload.chat_template_kwargs,
        thinking: true,
      };
      delete payload.thinking;
      delete payload.reasoning_effort;
      break;
    }
    // ... etc
  }

  return payload;
});
```

---

## 7. Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Core extension structure (`package.json`, `index.ts`) | ✅ Complete |
| **Phase 2** | Model registry (`types.ts`, `registry.ts`, `metadata.json`) | ✅ Complete (~87 models from NIM API) |
| **Phase 3** | Family compat configuration (`model-families.ts`, `defaults.ts`) | ✅ Complete (30+ families) |
| **Phase 4** | `before_provider_request` handler | ✅ Complete (6 thinking formats) |
| **Phase 5** | Model metadata gathering | ⚠️ Partial (`fetch_nim_metadata.ts` works but needs improvement) |

### What's Missing

| Item | Status | Notes |
|------|--------|-------|
| Cost data research | ❌ Not done | All costs set to $0 (free tier). Update if paid tiers appear. |
| `fetch_nim_metadata.ts` improvements | ⚠️ Needs work | Only 13/87 context windows detected. Reasoning detection misses many models. |

### Extra Features (Not in Original Plan)

| Feature | Description |
|---------|-------------|
| `deepseek-v4` format | Special V4 Flash/Pro handling with `reasoning_effort` in `chat_template_kwargs` |
| `stepfun-parallel` format | Step 3.5 Flash `parallel_reasoning_mode` injection |
| `minimax-inline` format | MiniMax M2.x `<antha>` tag handling |
| GLM-5.1 `clear_thinking` | Extra injection beyond pi's native handling |
| Mistral `requiresToolResultName` | Tool result messages must include `name` field |
| Documentation scraper | `fetch_nim_metadata.ts` scrapes NVIDIA docs pages directly, no external API needed |

---

## 8. Test Plan

### Pre-Test Setup

```bash
# 1. Disable old extension (if it exists)
mv ~/.pi/agent/extensions/nvidiaNim.ts ~/.pi/agent/extensions/nvidiaNim.ts.disabled

# 2. Start pi with the new extension
pi -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider

# 3. Verify model list
pi --list-models -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider | grep nvidia-nim
```

### Test Categories

| # | Category | Models | Priority |
|---|----------|--------|----------|
| 1 | **Model list verification** | All ~80 | P0 |
| 2 | **Basic streaming** | Llama-3.3-70b, Gemma-3-12b, Mistral-Large-2, Nemotron-4-340b, Granite-3.3-8b | P0 |
| 3 | **DeepSeek V4 thinking** | `deepseek-v4-flash`, `deepseek-v4-pro` | **P0** |
| 4 | **DeepSeek V3/Kimi/Nemotron thinking** | `deepseek-v3.1`, `deepseek-v3.2`, `kimi-k2-thinking`, `nemotron-ultra-253b` | P0 |
| 5 | **Qwen-chat-template thinking** | `qwen3-coder-480b`, `glm-5.1`, `magistral-small-2506`, `seed-oss-36b` | P1 |
| 6 | **StepFun parallel thinking** | `step-3.5-flash` | P1 |
| 7 | **MiniMax inline thinking** | `minimax-m2.7` | P1 |
| 8 | **GPT-OSS reasoning effort** | `gpt-oss-120b` | P2 |
| 9 | **Vision models** | `llama-3.2-11b-vision`, `gemma-3-27b-it` | P2 |
| 10 | **Non-NVIDIA regression** | Any OpenRouter/OpenAI model | **P0** |
| 12 | **Error handling** | Invalid model, no API key | P2 |
| 13 | **Tool calling** | `deepseek-v4-flash`, `qwen3-coder-480b` | P1 |

### Critical Path (Test First)

1. **Category 10** — Non-NVIDIA regression (must not break existing setup)
2. **Category 3** — DeepSeek V4 thinking panel (the known bug we fixed)
3. **Category 4** — DeepSeek V3/Kimi/Nemotron thinking (same handler, different format)
4. **Category 2** — Basic streaming sanity check
5. **Category 5** — Qwen-chat-template (most models use this)

### Per-Category Test Prompts

**Basic streaming:** *"What is 2+2? Reply in one word."*

**DeepSeek V4 thinking:** *"What is 15% of 847? Think step by step."* → Verify thinking appears in pi's **thinking panel** (separate collapsible section), NOT in main response text.

**DeepSeek V3/Kimi/Nemotron:** *"Is 9.11 bigger than 9.9? Think carefully."* → Verify thinking panel shows reasoning.

**Qwen-chat-template:** *"Explain why the sky is blue in 2 sentences. Think about it first."*

**StepFun:** *"Write a Python function to find the longest palindromic substring. Think through your approach first."* → Verify `chat_template_kwargs.parallel_reasoning_mode` is set.

**MiniMax:** *"What is the capital of France? Think about it."* → Verify `<antha>` tags don't leak into main response.

**Vision:** Attach any image, ask *"Describe what you see in this image."*

**Tool calling:** Ask the model to read a file or run a bash command.

---

## 9. Known Issues & Remaining Work

### High Priority (Blocking)

- [ ] **DeepSeek V4 thinking panel** — Fix applied (`thinkingFormat: "deepseek"` + handler conversion), but **not yet tested**. Needs verification that reasoning content appears in pi's thinking panel, not as regular text.
- [ ] **Verify all thinking formats** — Each of the 6 formats needs manual testing.

### Medium Priority

- [ ] **Improve `fetch_nim_metadata.ts`** — Context window detection only works for 13/87 models. Reasoning detection misses many.

### Low Priority / Future

- [ ] **Cost data** — Research paid tier pricing if available.
- [ ] **Automated testing** — Script that verifies `before_provider_request` output for each thinking format.
- [ ] **Model card caching** — Cache documentation page results to avoid re-fetching.
- [ ] **GitHub repo** — Create public repo and push.

---

## 10. Quick Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | API key from https://build.nvidia.com/ |

### Running the Extension

```bash
# Basic usage
pi -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider


# List models
pi --list-models -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider | grep nvidia-nim
```

### Fetching Metadata

```bash
# Basic mode
npx tsx tools/fetch_nim_metadata.ts --output models/metadata.json

# Full mode (with documentation page scraping)
npx tsx tools/fetch_nim_metadata.ts --cards --verbose --output models/metadata.json
```

### Key Architecture Points

1. **No custom streaming** — Uses `api: "openai-completions"`
2. **Family-based config** — `config/model-families.ts` groups models by regex pattern
3. **Handler fixes old bug** — `before_provider_request` checks raw model ID, not prefixed ID
4. **6 thinking formats** — 2 native (qwen-chat-template, reasoning-effort, minimax-inline) + 4 handler-based (deepseek-v4, deepseek-nim, stepfun-parallel, glm-clear_thinking)
5. **All costs = $0** — NVIDIA NIM free tier

---

## Appendix: Old Extension Audit

The previous extension at `~/.pi/agent/extensions/nvidiaNim.ts` had these bugs that the new extension fixes:

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| 1 | `before_provider_request` checked `payload.model.startsWith("nvidia-nim/")` | Handler never fired — all thinking formats broken | Check raw model ID directly |
| 2 | `requiresMistralToolIds` is not a real compat field | Silently ignored, no runtime error but feature didn't work | Removed, using `requiresToolResultName` instead |
| 3 | DeepSeek V4 `reasoning_effort` sent as top-level parameter | NIM expects it inside `chat_template_kwargs` | Handler moves it into `chat_template_kwargs` |
| 4 | DeepSeek V3 `supportsReasoningEffort` without `thinkingFormat` | Top-level `reasoning_effort` meaningless to NIM | Handler converts to `chat_template_kwargs.thinking` |
| 5 | Kimi K2 / StepFun same problem as DeepSeek V3 | Thinking never activated | Same handler fix |
| 6 | `console.log` on every startup/request | Noise in production | Removed |
| 7 | Flat Sets/Records for classification | Hard to maintain when NVIDIA adds models | Regex-based family patterns |
| 8 | Always fetches `/v1/models` on startup | 1-2s startup latency | Removed dynamic discovery entirely — static list only |

---

*End of documentation.*
