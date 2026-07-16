# NVIDIA NIM Provider Extension — Complete Documentation

> **Last updated:** 2026-07-16
> **Project:** `E:/Munka/Programming/TypeJavaScript/NvidiaProvider`
> **pi version:** v0.73.0 (with built-in `nvidia` provider)

---

## Table of Contents

- [1. Overview](#1-overview)
  - [1.5 Quick Start](#15-quick-start)
  - [1.6 Thinking/Reasoning Formats](#16-thinkingreasoning-formats)
- [2. Architecture & Design Decisions](#2-architecture--design-decisions)
  - [2.1 Why `openai-completions` Not `streamSimple`](#21-why-openai-completions-not-streamsimple)
  - [2.2 Family-Based Compat Configuration](#22-family-based-compat-configuration)
  - [2.3 Model Pipeline](#23-model-pipeline)
- [3. Directory Structure](#3-directory-structure)
- [4. Model Curation](#4-model-curation)
  - [4.1 Included Models (~83 LLMs)](#41-included-models)
  - [4.2 Excluded Categories](#42-excluded-categories)
  - [4.3 Model Family Compat Reference](#43-model-family-compat-reference)
- [5. Thinking Format Handling](#5-thinking-format-handling)
  - [5.1 `qwen-chat-template` (Native)](#51-qwen-chat-template-native)
  - [5.2 `deepseek-v4` (Handler)](#52-deepseek-v4-handler)
  - [5.3 `deepseek-nim` (Handler)](#53-deepseek-nim-handler)
  - [5.4 `minimax-inline` (Native)](#54-minimax-inline-native)
  - [5.5 `minimax-m3` (Handler)](#55-minimax-m3-handler)
  - [5.6 `reasoning-effort` (Native)](#56-reasoning-effort-native)
- [6. `before_provider_request` Handler](#6-before_provider_request-handler)
  - [6.1 Critical Bug Fix From Old Extension](#61-critical-bug-fix-from-old-extension)
  - [6.2 Handler Implementation](#62-handler-implementation)
- [7. Implementation Status](#7-implementation-status)
- [8. Test Plan](#8-test-plan)
- [9. Known Issues & Remaining Work](#9-known-issues--remaining-work)
- [10. Quick Reference](#10-quick-reference)
- [11. Coexistence with Official `nvidia` Provider](#11-coexistence-with-official-nvidia-provider)
- [Appendix: Old Extension Audit](#appendix-old-extension-audit)

---

## 1. Overview

This extension registers **NVIDIA NIM** as a custom model provider (`nvidia-nim`) in the pi coding agent. It makes ~83 chat, coding, reasoning, and vision LLMs available through pi's `/model` picker, using NVIDIA's free-tier inference API at:

```
https://integrate.api.nvidia.com/v1
```

**Key design insight:** NVIDIA NIM exposes an OpenAI-compatible API, so we use pi's built-in `openai-completions` streaming handler - no custom streaming implementation needed.

**Key architectural decision:** Model-specific quirks (thinking formats, extra body parameters, compat flags) are handled through pi's `compat` system and a `before_provider_request` event hook, not custom streaming code.

**Model pipeline:** `metadata.json` (123 scraped entries) → `isLLMModel()` filter → dedup → `metadataToModelConfig()` → `applyFamilyCompat()` → `STATIC_MODELS[]` (~83 models). Family patterns are applied **first match wins** in a specific-to-general ordering.

### 1.5 Quick Start

1. **Get an NVIDIA API key** from [build.nvidia.com](https://build.nvidia.com/)
   (free tier: 40 requests/minute, 1,000 inference credits on signup).
2. **Set the credential** (pick one):
   - **Environment variable:**
     ```bash
     export NVIDIA_NIM_API_KEY="nvapi-..."
     ```
     `NVIDIA_API_KEY` works as a fallback (compatible with pi's built-in `nvidia` provider).
   - **Auth file:** Add to `~/.pi/agent/auth.json`:
     ```json
     { "nvidia-nim": { "type": "api_key", "key": "nvapi-..." } }
     ```
   - **Interactive login:** Run `/login` in pi and select **NVIDIA NIM**.
3. **Run pi with the extension:**
   ```bash
   pi -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider
   ```
   Or install from npm:
   ```bash
   pi install npm:pi-extension-nvidia-nim
   ```
4. **Select a model** in pi with `/model` or `Ctrl+P` — look for the
   `nvidia-nim/` prefix.

### 1.6 Thinking/Reasoning Formats

NVIDIA NIM models use different `chat_template_kwargs` structures for thinking. This extension handles all of them:

| Format | Models | Mechanism |
|--------|--------|-----------|
| `qwen-chat-template` | Qwen3, GLM, Phi-4-Mini-Flash, Nemotron-Nano-9B, Seed | Pi handles natively via `thinkingFormat: "qwen-chat-template"` |
| `deepseek-v4` | DeepSeek V4 Flash/Pro | `chat_template_kwargs: { reasoning_effort: "none"\|"high"\|"max" }` via before_provider_request |
| `inkling` | Thinking Machines Inkling | Always-on hosted reasoning; no thinking control is sent |
| `laguna-xs-2.1` | Poolside Laguna XS 2.1 | Native `qwen-chat-template`; toggles `chat_template_kwargs.enable_thinking` |
| `deepseek-nim` | Kimi K2.6, Nemotron Ultra/Super | `chat_template_kwargs: { thinking: true/false }` via before_provider_request |
| `minimax-inline` | MiniMax M2.x | Always thinks inline with `<antha>` tags, no kwargs control, `requiresThinkingAsText: true` |
| `minimax-m3` | MiniMax M3 | `chat_template_kwargs: { thinking_mode: "enabled"|"disabled" }` via before_provider_request |
| `thinking-budget` | Seed OSS | `chat_template_kwargs: { thinking_budget }` extracted from pi's reasoning_effort via before_provider_request |
| `nemotron-system-detailed` | Nemotron Super v1/v1.5 | Injects "think detailed" as system message + `chat_template_kwargs.thinking: true` via before_provider_request |
| `nemotron-system-think` | Nemotron Ultra 253B | Injects "think" as system message + `chat_template_kwargs.thinking: true` via before_provider_request |
| `nemotron-3-super-effort` | Nemotron 3 Super 120B, Nemotron 3 Ultra 550B | Extracts `thinking_budget` from reasoning_effort into `chat_template_kwargs` via before_provider_request |
| `reasoning-effort` | GPT-OSS 120B/20B | Standard OpenAI `reasoning_effort` with `minimal→low` mapping, pi handles natively |

---

## 2. Architecture & Design Decisions

### 2.1 Why `openai-completions` Not `streamSimple`

| Approach | Status | Rationale |
|----------|--------|-----------|
| `api: "openai-completions"` | ✅ **Used** | Native OpenAI-compatible streaming, no custom code, access to all pi `compat` flags, no risk of breaking other providers |
| Custom `streamSimple` | ❌ **Rejected** | Previous extension used this and broke OpenRouter due to global handler registration side effects, API type collisions, and payload serialization mismatches |

### 2.2 Family-Based Compat Configuration

Models are grouped by **family** (e.g., `deepseek`, `qwen`, `mistral`, `llama`). Each family defines `compat` flags (`thinkingFormat`, `supportsDeveloperRole`, `requiresToolResultName`, etc.) once, rather than repeating per-model.

This is defined in `config/model-families.ts` with 46 families covering ~83 models.

### 2.3 Model Pipeline

Models are built at module init time from `metadata.json`:

```
metadata.json (123 raw entries)
    │  isLLMModel() - excludes embeddings, TTS, ASR, guardrails, etc.
    ▼
~83 LLM entries
    │  deduplicate by ID
    ▼
unique LLM entries
    │  metadataToModelConfig() - compat flags, thinkingLevelMap, display name
    ▼
NimModelConfig[]
    │  applyFamilyCompat() - merges family compat { ...family.compat, ...model.compat }
    ▼
STATIC_MODELS[] + STATIC_MODEL_MAP<id, config>
```

**Merge order:** Family defaults under model overrides. Model-level values from `metadata.json` take priority over family-level defaults. Family patterns in `MODEL_FAMILIES` are ordered **specific → general**, first match wins. Insert new patterns before broader catch-alls like `/^nvidia\//` or `/.*/`.

All models have `cost: $0` (NVIDIA NIM free tier).

---

## 3. Directory Structure

```
NvidiaProvider/
├── index.ts                          # Extension entry + before_provider_request handler
├── package.json                      # Pi package manifest
├── handlers/
│   └── thinking.ts                   # applyCustomThinkingFormat(), hasEnabledThinking()
├── models/
│   ├── types.ts                      # NimModelConfig, NimThinkingFormat
│   ├── registry.ts                   # STATIC_MODELS pipeline (metadata → family compat)
│   ├── metadata.ts                   # Back-compat re-export shim for registry.ts
│   └── metadata.json                 # ~123 models with scraped metadata (DO NOT edit manually)
├── config/
│   ├── model-families.ts             # 46 families (first match wins) + classifyThinkingFormat()
│   └── defaults.ts                   # NIM_BASE_URL, NIM_API_KEY_REF, dual-env fallback
├── tools/
│   ├── fetch_nim_metadata.ts         # NVIDIA docs scraper (API + build pages)
│   ├── fetch_modelsdev_nvidia.ts     # Comparison tool against models.dev public API
│   └── probe_nim.ts                  # Opt-in live request/stream probe
├── test/
│   ├── refactor-checks.ts            # Regression tests for core routing
│   └── before-provider-request-snapshots.ts  # Snapshot tests for payload rewrites
└── docs/
    ├── README.md                     # This file
    └── audit-findings.md             # Current pi library API comparison audit
```

---

## 4. Model Curation

### 4.1 Included Models

From the NIM catalog, we filter to ~83 **LLMs suitable for a coding agent**:

**Chat / Instruction (representative):**
`meta/llama-3.1-8b-instruct`, `meta/llama-3.3-70b-instruct`, `meta/llama-4-maverick-17b-128e-instruct`, `google/gemma-3-12b-it`, `google/gemma-4-31b-it`, `microsoft/phi-4-mini-instruct`, `microsoft/phi-4-multimodal-instruct`, `mistralai/mistral-7b-instruct-v0.3`, `nvidia/nemotron-mini-4b-instruct`, `nvidia/llama-3.3-nemotron-super-49b-v1`, `nvidia/nvidia-nemotron-nano-9b-v2`, `upstage/solar-10.7b-instruct`, `stockmark/stockmark-2-100b-instruct`, `01-ai/yi-large`, `ai21labs/jamba-1.5-large-instruct`, `ibm/granite-3.0-8b-instruct`, `writer/palmyra-creative-122b`, `zyphra/zamba2-7b-instruct`

**Coding / Agentic:**
`deepseek-ai/deepseek-v4-flash`, `deepseek-ai/deepseek-v4-pro`, `bytedance/seed-oss-36b-instruct`, `mistralai/codestral-22b-instruct-v0.1`, `mistralai/mistral-nemotron`, `mistralai/mistral-small-4-119b-2603`, `moonshotai/kimi-k2.6`, `minimaxai/minimax-m2.7`, `nvidia/llama-3.1-nemotron-51b-instruct`, `nvidia/llama-3.1-nemotron-70b-instruct`, `abacusai/dracarys-llama-3.1-70b-instruct`, `sarvamai/sarvam-m`

**Reasoning / Thinking:**
`deepseek-ai/deepseek-v4-flash`, `deepseek-ai/deepseek-v4-pro`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3-next-80b-a3b-instruct`, `qwen/qwen3.5-122b-a10b`, `qwen/qwen3.5-397b-a17b`, `minimaxai/minimax-m3`, `z-ai/glm-5.2`, `moonshotai/kimi-k2.6`, `bytedance/seed-oss-36b-instruct`, `mistralai/mistral-large-3-675b-instruct-2512`, `mistralai/mistral-nemotron`, `nvidia/llama-3.1-nemotron-ultra-253b-v1`, `nvidia/llama-3.3-nemotron-super-49b-v1`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/nemotron-3-ultra-550b-a55b`, `stepfun-ai/step-3.5-flash`, `stepfun-ai/step-3.7-flash`, `thinkingmachines/inkling`, `poolside/laguna-xs-2.1`

**Vision:**
`meta/llama-3.2-11b-vision-instruct`, `meta/llama-3.2-90b-vision-instruct`, `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`, `nvidia/nemotron-nano-12b-v2-vl`

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

All families set `supportsDeveloperRole: false` and `maxTokensField: "max_tokens"`. The table shows only unique fields per family.

| Family | Pattern | `thinkingFormat` | `supportsReasoningEffort` | Extra Notes |
|--------|---------|-----------------|--------------------------|-------------|
| `deepseek-v4` | `deepseek-ai/deepseek-v4` | `"deepseek"` | - | `thinkingLevelMap`: off→none, xhigh→max |
| `inkling` | `thinkingmachines/inkling` | - | `false` | Always-on reasoning; no thinking control |
| `laguna-xs-2.1` | `poolside/laguna-xs-2.1` | `"qwen-chat-template"` | `false` | `chat_template_kwargs.enable_thinking` toggle |
| `qwen3-coder` | `qwen/qwen3-coder` | `"qwen-chat-template"` | - | - |
| `qwen3-next` | `qwen/qwen3-next` | `"qwen-chat-template"` | - | - |
| `qwen3.5` | `qwen/qwen3.5` | `"qwen-chat-template"` | - | - |
| `qwen3` | `qwen/qwen3-` | `"qwen-chat-template"` | - | - |
| `qwq` | `qwen/qwq` | `"qwen-chat-template"` | - | - |
| `glm` | `z-ai/glm` | `"qwen-chat-template"` | - | `exampleRequestExtra` injects `clear_thinking: false` |
| `minimax-m3` | `minimaxai/minimax-m3` | `"deepseek"` | `false` | Uses `chat_template_kwargs.thinking_mode`, no inline tags |
| `minimax-m2` | `minimaxai/minimax-m2` | - | - | `requiresThinkingAsText: true`, inline `<antha>` tags |
| `kimi-thinking` | `moonshotai/kimi-k2-thinking` | `"deepseek"` | - | - |
| `kimi` | `moonshotai/kimi` | - | - | Non-thinking base models |
| `gpt-oss` | `openai/gpt-oss` | - | `true` | `thinkingLevelMap: { minimal: "low" }` |
| `stepfun` | `stepfun-ai/` | - | `true` | Native `reasoning_effort` (low/medium/high); hosted Step-3.7 is always-on |
| `seed` | `bytedance/` | `"qwen-chat-template"` | - | - |
| `nemotron-3-super-effort` | `nvidia/nemotron-3-super-120b-a12b` | - | - | `thinkingLevelMap`: off→none, low→low, medium/high→high |
| `nemotron-3-ultra-effort` | `nvidia/nemotron-3-ultra-550b-a55b` | - | - | `thinkingLevelMap`: off→none, minimal/low/medium→medium, high/xhigh→high |
| `nemotron-nano` | `nvidia/nvidia-nemotron-nano` | `"qwen-chat-template"` | - | - |
| `nemotron` | `nvidia/.*nemotron` | - | `false` | `reasoningBudget: 32768` |
| `mistral` | `mistralai/` | - | - | `requiresToolResultName: true`, `requiresThinkingAsText: true` |
| `mixtral` | `mistralai/mixtral` | - | `false` | `requiresToolResultName: true` |
| `llama` | `meta/llama` | - | `false` | - |
| `gemma` | `google/gemma` | - | `false` | - |
| `phi` | `microsoft/phi` | - | - | - |

All models: `cost: $0`, `supportsDeveloperRole: false`, `supportsStore: false`, `maxTokensField: "max_tokens"`.

---

## 5. Thinking Format Handling

This is the most complex part of the extension. Different model families on NVIDIA NIM require different parameter structures to enable reasoning/thinking. We handle this through a combination of pi's native `compat.thinkingFormat` and our `before_provider_request` handler.

### 5.1 `qwen-chat-template` (Native)

**Models:** Qwen3, GLM, Phi-4-Mini-Flash, Nemotron-Nano-9B

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
| Pi thinking level | Behavior |
|-------------------|----------|
| Off | `"none"` |
| Minimal | `"high"` |
| Low | `"high"` |
| Medium | `"high"` |
| High | `"high"` |
| XHigh | `"max"` |

### 5.3 `deepseek-nim` (Handler)

**Models:** Kimi K2.6, Nemotron Ultra 253B, Nemotron Super 49B

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

Unlike `deepseek-v4`, these models do NOT support `reasoning_effort` inside `chat_template_kwargs`. On NVIDIA NIM, they always do full thinking when enabled.

### 5.4 `minimax-inline` (Native) — M2.x

**Models:** `minimaxai/minimax-m2.7`

**How it works:** MiniMax M2.x always thinks inline using `<antha>...</antha>` tags. We set `requiresThinkingAsText: true` so pi strips these tags from the conversation history (they appear in the thinking panel but don't leak into the main response).

No `chat_template_kwargs` injection needed — the model always reasons inline.

### 5.5 `minimax-m3` (Handler)

**Models:** `minimaxai/minimax-m3`

**How it works:** Unlike M2.x, MiniMax M3 uses `chat_template_kwargs.thinking_mode` to control reasoning:

```json
{
  "chat_template_kwargs": {
    "thinking_mode": "enabled"  // or "disabled"
  }
}
```

1. The family sets `thinkingFormat: "deepseek"` so pi injects standard `thinking: {type: "enabled"|"disabled"}` params.
2. The `before_provider_request` handler converts those into `chat_template_kwargs.thinking_mode`.
3. Pi's native `thinking: {type: ...}` is deleted from the payload.

M3 returns structured `reasoning_content` in responses (not inline `<antha>` tags), so `requiresThinkingAsText` is **not** set.

**Mapping:**

| Pi thinking level | `thinking_mode` value |
|-------------------|-----------------------|
| Off | `"disabled"` |
| Minimal — XHigh | `"enabled"` |

### 5.6 `reasoning-effort` (Native)

**Models:** `openai/gpt-oss-120b`, `openai/gpt-oss-20b`

**How it works:** Standard OpenAI-style `reasoning_effort` parameter. Pi handles natively. We add model-level `thinkingLevelMap: { minimal: "low" }` so the "minimal" thinking level maps to `"low"` (since NIM doesn't accept `"minimal"`).

### 5.7 `thinking-budget` (Handler)

**Models:** `bytedance/seed-oss-36b-instruct`

**How it works:** Seed OSS uses NIM's `thinking_budget` parameter inside `chat_template_kwargs` to control reasoning depth:

1. The family sets `thinkingFormat: "qwen-chat-template"` so pi natively injects `enable_thinking` and `preserve_thinking`.
2. Our `before_provider_request` handler additionally extracts the reasoning level from pi's `reasoning_effort` and converts it into a `thinking_budget` value using a family-specific `thinkingLevelMap: { medium: 8192, high: 16384, xhigh: 32768 }`.
3. The resulting `chat_template_kwargs.thinking_budget` is injected into the payload.

### 5.8 `nemotron-system-detailed` (Handler)

**Models:** `nvidia/llama-3.3-nemotron-super-49b-v1`, `nvidia/llama-3.3-nemotron-super-49b-v1.5`

**How it works:** Nemotron Super models support a "detailed" thinking mode via a system-message instruction:

1. The family sets `thinkingFormat: "deepseek"` so pi injects standard `thinking: {type: "enabled"}`.
2. Our handler **converts** the thinking toggle into a system message: prepends `"You must think very detailed. Never skip a single detail."` to the message list.
3. Also sets `chat_template_kwargs.thinking: true` in the payload.
4. Removes the original `thinking` and `reasoning_effort` from payload top-level.

### 5.9 `nemotron-system-think` (Handler)

**Models:** `nvidia/llama-3.1-nemotron-ultra-253b-v1`

**How it works:** Nemotron Ultra 253B uses a simpler system-message approach:

1. Like 5.8, `thinkingFormat: "deepseek"` triggers pi to inject `thinking: {type: "enabled"}`.
2. Our handler **converts** the thinking toggle into prepending the system message `"You must think."`.
3. Sets `chat_template_kwargs.thinking: true`.
4. Removes original `thinking` and `reasoning_effort`.

### 5.10 `nemotron-3-super-effort` (Handler)

**Models:** `nvidia/nemotron-3-super-120b-a12b`, `nvidia/nemotron-3-ultra-550b-a55b`

**How it works:** Nemotron 3 Super and Ultra use `enable_thinking` + `low_effort` flag + `reasoning_budget` in the payload:

1. Pi injects `reasoning_effort` via `supportsReasoningEffort: true`.
2. Our handler converts `reasoning_effort` into `chat_template_kwargs.enable_thinking` (boolean)
   and optionally `chat_template_kwargs.low_effort` (only when effort is `"low"`).
3. Removes original `thinking` and `reasoning_effort`.
4. `index.ts` injects `payload.reasoning_budget = 32768`.

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

Located in `index.ts`, the handler performs these steps in order:

1. **Early return** for non-NIM providers (checks `STATIC_MODEL_MAP.has(modelId)`)
2. **Looks up** model config from `STATIC_MODEL_MAP.get(modelId)` (O(1))
3. **Classifies** thinking format via `classifyThinkingFormat(modelId)`
4. **Applies custom thinking transform** via `applyCustomThinkingFormat(payload, format)` - defined in `handlers/thinking.ts`
5. **Injects model-specific extra kwargs** from `modelConfig.exampleRequestExtra.chat_template_kwargs` (e.g., GLM-5.1 `clear_thinking: false`) - only keys not already present, only when thinking is enabled
6. **Injects reasoning budget** from `modelConfig.reasoningBudget` (e.g., nemotron `32768`) - only when thinking enabled
7. **Returns** modified payload if any step changed it, `undefined` otherwise (pi keeps original)

The actual thinking transforms are implemented in `handlers/thinking.ts`:

| Format | Transform |
|--------|-----------|
| `deepseek-v4` | `thinking` + `reasoning_effort` → `chat_template_kwargs { thinking, reasoning_effort }`, deletes originals |
| `deepseek-nim` | `thinking` → `chat_template_kwargs { thinking }`, deletes `thinking` + `reasoning_effort` |
| `thinking-budget` | Extracts `thinking_budget` from `reasoning_effort` via `thinkingLevelMap`, injects into `chat_template_kwargs` |
| `qwen-chat-template` | No-op (pi handles natively) |
| `minimax-inline` | No-op for M2.x (pi handles natively) |
| `minimax-m3` | `thinking` → `chat_template_kwargs { thinking_mode }`, deletes originals |
| `nemotron-system-detailed` | `thinking` → system message `"think detailed"` + `chat_template_kwargs.thinking: true`, deletes originals |
| `nemotron-system-think` | `thinking` → system message `"think"` + `chat_template_kwargs.thinking: true`, deletes originals |
| `nemotron-3-super-effort` | Extracts `thinking_budget` from `reasoning_effort` via `thinkingLevelMap`, injects into `chat_template_kwargs` |
| `reasoning-effort` | No-op (pi handles natively) |

---

## 7. Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Core extension structure (`package.json`, `index.ts`) | ✅ Complete |
| **Phase 2** | Model registry (`types.ts`, `registry.ts`, `metadata.json`) | ✅ Complete (123 raw entries, ~83 LLMs) |
| **Phase 3** | Family compat configuration (`model-families.ts`, `defaults.ts`) | ✅ Complete (46 families) |
| **Phase 4** | `before_provider_request` handler + thinking transforms | ✅ Complete (8 handler-based formats) |
| **Phase 5** | Model metadata scraping (`fetch_nim_metadata.ts`) | ✅ Complete (context window, output tokens, reasoning budget, effort values, exampleRequestExtra) |
| **Phase 6** | Comparison tool (`fetch_modelsdev_nvidia.ts`) | ✅ Complete (cross-reference against models.dev) |
| **Phase 7** | Debug capture tool (`capture_raw.ts`) | ❌ Removed (superseded by Phase 5) |
| **Phase 8** | Pi library API audit | ✅ Complete; follow-ups tracked in `docs/audit-findings.md` |
| **Phase 9** | Capability records and live probes | 🟡 Selected models verified; broader coverage remains |
| **Phase 10** | Public documentation and release readiness | 🟡 README updated; tracked docs and release workflow remain |

### Extra Features (Not in Original Plan)

| Feature | Description |
|---------|-------------|
| `deepseek-v4` format | Special V4 Flash/Pro handling with `reasoning_effort` in `chat_template_kwargs` |
| `minimax-inline` format | MiniMax M2.x `<antha>` tag handling |
| GLM-5.1 `clear_thinking` | Extra injection via `exampleRequestExtra` beyond pi's native handling |
| Mistral `requiresToolResultName` | Tool result messages must include `name` field |
| Mistral `requiresThinkingAsText` | Thinking blocks converted to `<thinking>` delimited text |
| Nemotron `reasoningBudget: 32768` | Reasoning budget injected on payload |
| DeepSeek V4 `thinkingLevelMap` | Custom mapping: off→none, xhigh→max |
| GPT-OSS `thinkingLevelMap` | Partial override: `{ minimal: "low" }` |
| Documentation scraper | `fetch_nim_metadata.ts` scrapes NVIDIA build pages + docs, no external API needed |
| Comparison tool | `fetch_modelsdev_nvidia.ts` cross-references against models.dev public API |
| Live probe and capability evidence | `tools/probe_nim.ts` plus static capability records for verification state |
| Debug capturer | `test/capture_raw.ts` (removed - superseded by `fetch_nim_metadata.ts`) |

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
| 1 | **Model list verification** | All ~83 | P0 |
| 2 | **Basic streaming** | Llama-3.3-70b, Gemma-3-12b, Mistral-Large-2, Nemotron-4-340b, Granite-3.0-8b | P0 |
| 3 | **DeepSeek V4 thinking** | `deepseek-v4-flash`, `deepseek-v4-pro` | **P0** |
| 4 | **DeepSeek NIM / Kimi / StepFun / Nemotron thinking** | `kimi-k2.6`, `step-3.5-flash`, `nemotron-ultra-253b`, `nemotron-super-49b-v1` | P0 |
| 5 | **Qwen-chat-template thinking** | `glm-5.2`, `seed-oss-36b`, `nemotron-nano-9b-v2`, `qwen3-next-80b`, `laguna-xs-2.1` | P1 |
| 6 | **MiniMax inline thinking** | `minimax-m2.7` | P1 |
| 7 | **MiniMax M3 thinking** | `minimax-m3` | P1 |
| 8 | **GPT-OSS reasoning effort** | `gpt-oss-120b` | P2 |
| 8 | **Vision models** | `llama-3.2-11b-vision`, `gemma-4-31b-it` | P2 |
| 10 | **Non-NVIDIA regression** | Any OpenRouter/OpenAI model | **P0** |
| 12 | **Error handling** | Invalid model, no API key | P2 |
| 13 | **Tool calling** | `deepseek-v4-flash`, `qwen3.5-122b` | P1 |

### Current verification snapshot

- **Probe-passed:** DeepSeek V4 Flash, GLM-5.2, MiniMax M3, Step-3.7 Flash, Inkling, and Laguna XS 2.1 request/response/streaming paths.
- **Request-contract tested:** Kimi K2.6 and Nemotron routing cases.
- **Still unknown:** reliable tool-call emission, tool-result replay, and full non-NIM regression behavior.

### Critical Path (Test First)

1. **Category 10** - Non-NVIDIA regression (must not break existing setup)
2. **Category 3** - DeepSeek V4 thinking panel (the known bug we fixed)
3. **Category 4** - DeepSeek NIM / Kimi / StepFun / Nemotron thinking (handler-based and native reasoning-effort paths)
4. **Category 2** - Basic streaming sanity check
5. **Category 5** - Qwen-chat-template thinking (Seed OSS, GLM, Qwen3, Nemotron-Nano)

### Per-Category Test Prompts

**Basic streaming:** *"What is 2+2? Reply in one word."*

**DeepSeek V4 thinking:** *"What is 15% of 847? Think step by step."* → Verify thinking appears in pi's **thinking panel** (separate collapsible section), NOT in main response text.

**DeepSeek NIM/Kimi/StepFun/Nemotron:** *"Is 9.11 bigger than 9.9? Think carefully."* → Verify thinking panel shows reasoning.

**Qwen-chat-template/Seed OSS:** *"Explain why the sky is blue in 2 sentences. Think about it first."* → For Seed OSS, vary thinking level to verify `thinking_budget` injection.

**MiniMax M2.x:** *"What is the capital of France? Think about it."* → Verify `<antha>` tags don't leak into main response.

**MiniMax M3:** *"Explain quantum entanglement in simple terms."* → Verify `thinking_mode: "enabled"` is sent in kwargs (use NIM_DEBUG=1 to check). Test both with thinking on and off.

**Vision:** Attach any image, ask *"Describe what you see in this image."*

**Tool calling:** Use a prompt that explicitly requires a provided tool. Treat tool support as unverified until the probe produces a tool call and a tool-result round trip succeeds.

---

## 9. Known Issues & Remaining Work

### Completed implementation

- [x] Inkling and Laguna XS 2.1 are in the generated catalog and family routing.
- [x] Capability records and opt-in probes cover both new models.
- [x] Request snapshots cover the configured custom thinking formats.
- [x] The provider is scoped to `nvidia-nim` and uses Pi's built-in `openai-completions` streaming.
- [x] `supportsStore: false` is applied at the registry merge point for every NIM model.
- [x] `stream_options.include_usage` was accepted by live probes for Inkling and Laguna.

### Remaining implementation

- [~] **Broader live verification** — Extend capability records/probes beyond the currently verified representative models.
- [ ] **Tool-call round trips** — Force a tool invocation, then verify tool-result replay and streamed tool-call deltas. Current probes accepted tool payloads but did not produce a tool call.
- [ ] **Pi integration coverage** — Add non-NIM regression checks and stream fixtures for reasoning deltas, replayed assistant messages, and tool calls. The extension intentionally does not add a custom response parser.
- [ ] **Build checks** — Add a typecheck/lint/build command; `npm test` and `npm pack --dry-run` are currently the available automated checks.
- [ ] **Catalog drift checks** — Add CI or scheduled metadata refresh/comparison checks.
- [ ] **Release documentation** — Add a changelog/release notes and issue templates before publishing a compatibility-focused release.

### Open compatibility questions

- GLM effort-level mappings remain unverified; boolean thinking transport and streaming are probe-passed.
- Tool support, preserved thinking, and interleaved thinking remain model-specific and should not be inferred from reasoning support.
- Long cache retention behavior is not live-verified; keep it disabled unless NIM support is demonstrated.

See `docs/audit-findings.md` for the detailed Pi API audit and current statuses.


### Current test commands

- [x] `npm test` — refactor checks, request snapshots, and GLM request contracts.
- [x] `npm pack --dry-run` — package contents and publishability check.
- [ ] Non-NIM regression testing in a full Pi installation.

---

## 10. Quick Reference

### Credentials

The extension resolves the API key in this order (first match wins):

| Method | How |
|--------|-----|
| Auth file (`~/.pi/agent/auth.json`) | `{ "nvidia-nim": { "type": "api_key", "key": "nvapi-..." } }` |
| Environment variable (primary) | `NVIDIA_NIM_API_KEY` |
| Environment variable (fallback) | `NVIDIA_API_KEY` (pi's built-in `nvidia` provider env var) |

You can also use `/login` in pi's interactive mode and select **NVIDIA NIM** —
this stores the key under the `nvidia-nim` provider in `auth.json` automatically.

### Commands

```bash
# Run with extension
pi -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider

# List models
pi --list-models -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider | grep nvidia-nim

# Fetch/update metadata (DO NOT edit metadata.json by hand)
npx tsx tools/fetch_nim_metadata.ts --cards --output models/metadata.json

# Resume metadata fetch from where it left off (after rate limits)
npx tsx tools/fetch_nim_metadata.ts --cards --output models/metadata.json --resume=models/metadata.json

# Force re-fetch all metadata
npx tsx tools/fetch_nim_metadata.ts --cards --output models/metadata.json --force

# Compare against models.dev
npx tsx tools/fetch_modelsdev_nvidia.ts --compare

# Run regression tests
npm test

# Run an opt-in live probe (requires NVIDIA_NIM_API_KEY)
npm run probe -- --model=thinkingmachines/inkling --cases=stream-with-usage

# Check the publishable package contents
npm pack --dry-run
```

### Key Architecture Points

1. **No custom streaming** — Uses `api: "openai-completions"`, pi handles API calls
2. **Family-based config** — 46 families in `MODEL_FAMILIES`, ordered specific→general, first match wins
3. **Two-tier merge** — Family `compat` under model-level `compat` from metadata, with `supportsStore: false` applied at the registry merge point
4. **Handler fixes old bug** — `before_provider_request` looks up raw model ID, not provider-prefixed
5. **8 handler-based thinking formats** — deepseek-v4, deepseek-nim, thinking-budget, nemotron-3-super-effort, nemotron-system-detailed, nemotron-system-think, minimax-inline, and qwen-chat-template (GLM and Laguna) — plus native pi handling for reasoning-effort
6. **All costs = $0** — NVIDIA NIM free tier
7. **`metadata.json` autogenerated** — Edit via `fetch_nim_metadata.ts`, never by hand
8. **Coexists with official `nvidia` provider** — See §11 for details
9. **Full docs** — `docs/README.md` (design), `AGENTS.md` (quick ref), `docs/audit-findings.md` (pi API comparison)

---

## 11. Coexistence with Official `nvidia` Provider

pi v0.73.0 now ships a **built-in `nvidia` provider** with ~20 curated models. This extension provides `nvidia-nim` with ~83 models and model-family-aware reasoning controls.

### Key Differences

| Aspect | Official `nvidia` | This extension `nvidia-nim` |
|--------|-------------------|---------------------------|
| Model count | ~20 | ~83 |
| Thinking support | None (no `thinkingFormat` in compat) | 8 handler-based formats |
| `NVCF-POLL-SECONDS` header | ✅ Yes | ✅ **Set on every model** (`models/registry.ts:90`) |
| `supportsStrictMode` | Explicitly `false` | Explicitly `false` |
| Request normalization | ❌ No | ✅ Yes |
| Rate-limit warnings | ❌ No | ✅ Yes (429 handler) |

### Thinking coverage at a glance

Models with configured thinking support: DeepSeek V4, Kimi K2.6, Qwen3,
GLM-5.2, MiniMax M3, Seed OSS, Nemotron (Ultra, Super, 3-Super), GPT-OSS,
StepFun, Inkling, and Laguna XS 2.1. Live verification is narrower; see the
compatibility matrix in the root README.

Notable:
- **GLM-5.2** — boolean NIM thinking control via `enable_thinking` and
  `clear_thinking`; upstream effort levels remain unverified on hosted NIM
- **StepFun** — hosted NIM probing confirmed `reasoning_effort` plus separate
  `reasoning_content`; Step-3.7 Flash did not honor `enable_thinking: false`
- **MiniMax M3** — three-mode thinking toggle (disabled/adaptive/enabled)
  mapped from pi's thinking levels
- **Nemotron** — system-message-driven thinking modes (detailed think, /think,
  and reasoning budget variants)
- **DeepSeek V4** — `reasoning_effort` inside `chat_template_kwargs` with
  off→none and xhigh→max mapping
- **Inkling** — hosted reasoning is always on; no thinking control is sent
- **Laguna XS 2.1** — `chat_template_kwargs.enable_thinking` toggles reasoning;
  streaming probes returned `reasoning_content` when enabled

### Additional capabilities

- **Rate-limit warnings** — surfaces HTTP 429 responses with retry-after info
- **Request content normalization** — converts structured `[{type:"text"}]` content
  arrays to plain strings for older models
- **46-family regex routing** — accurate thinking format and compat assignment
  across all ~83 models
- **Per-model reasoning effort mapping** — non-standard effort values handled
  automatically (e.g. `off→none`, `minimal→low`)
- **Architecturally clean** — uses `before_provider_request` event hook, no custom
  `streamSimple`, stays compatible with other pi providers

### Usage alongside the built-in provider

If both are loaded, the model picker shows:
- `nvidia/llama-3.3-70b-instruct` (built-in provider)
- `nvidia-nim/meta/llama-3.3-70b-instruct` (this extension)

The built-in `nvidia` provider serves as a lightweight fallback when the
extension is not installed. When both are available, `nvidia-nim/...` models
provide the broader feature set.

### Resolved: Adopted from Official

1. ~~**Add `NVCF-POLL-SECONDS: "3600"` header**~~ — ✅ Done in `models/registry.ts:90` (set on every model).
2. ~~**Explicit `supportsStrictMode: false`** — Add to `default` family~~ — ✅ Already done in `config/model-families.ts:537`
3. ~~**Explicit `supportsLongCacheRetention: false`** — Add to `default` family~~ — ✅ Already done in `config/model-families.ts:538`

See `docs/nvidia-coexistence-analysis.md` for full details.

---

## Appendix: Old Extension Audit

The previous extension at `~/.pi/agent/extensions/nvidiaNim.ts` had these bugs that the new extension fixes:

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| 1 | `before_provider_request` checked `payload.model.startsWith("nvidia-nim/")` | Handler never fired - all thinking formats broken | Check raw model ID directly |
| 2 | `requiresMistralToolIds` is not a real compat field | Silently ignored, no runtime error but feature didn't work | Removed, using `requiresToolResultName` instead |
| 3 | DeepSeek V4 `reasoning_effort` sent as top-level parameter | NIM expects it inside `chat_template_kwargs` | Handler moves it into `chat_template_kwargs` |
| 4 | DeepSeek V3 `supportsReasoningEffort` without `thinkingFormat` | Top-level `reasoning_effort` meaningless to NIM | Handler converts to `chat_template_kwargs.thinking` |
| 5 | Kimi K2 / StepFun routing differed from DeepSeek V3 | Kimi needs chat-template conversion; StepFun uses native `reasoning_effort` | Family-specific routing and live verification |
| 6 | `console.log` on every startup/request | Noise in production | Removed |
| 7 | Flat Sets/Records for classification | Hard to maintain when NVIDIA adds models | Regex-based family patterns |
| 8 | Always fetches `/v1/models` on startup | 1-2s startup latency | Removed dynamic discovery entirely - static list only |

---

*End of documentation.*
