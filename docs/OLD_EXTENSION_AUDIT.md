# Audit of Old nvidiaNim.ts Extension

## Critical Bug: `before_provider_request` Handler Never Fires

**Location:** Lines 633-639
```typescript
const fullModelId = payload.model as string | undefined;
if (!fullModelId?.startsWith(`${PROVIDER_NAME}/`)) return;
const model = fullModelId.slice(PROVIDER_NAME.length + 1);
```

**The problem:** `payload.model` in the OpenAI completions request body is set by pi-ai's `buildParams()` to `model.id` — the **raw model ID** like `"deepseek-ai/deepseek-v4-flash"`. It does NOT contain a provider prefix like `"nvidia-nim/"`.

**Impact:** The `startsWith("nvidia-nim/")` check **always fails**, so the entire `before_provider_request` handler is a dead code path. None of the custom thinking format handling for DeepSeek V4, DeepSeek V3/Kimi/Nemotron, or StepFun ever executes.

**Real-world effect:**
- DeepSeek V4 Flash/Pro: `reasoning_effort` stays as a top-level parameter (pi sends it via `supportsReasoningEffort`). NIM may or may not accept it — it expects it inside `chat_template_kwargs`. **Result: reasoning likely broken or defaults.**
- DeepSeek V3.1/V3.2/Kimi-K2-Thinking/Nemotron-Ultra: `chat_template_kwargs: { thinking: true }` is never injected. **Result: thinking mode never activates.**
- StepFun Step 3.5 Flash: `chat_template_kwargs: { parallel_reasoning_mode }` is never set. **Result: parallel reasoning never activates.**

**Fix in new extension:** Check `payload.model` directly without a provider prefix. The model ID is the raw NIM API ID like `"deepseek-ai/deepseek-v4-flash"`.

---

## Bug: `requiresMistralToolIds` Is Not a Real Compat Field

**Location:** Line ~577 (inside `buildModelEntry`)
```typescript
if (modelId.startsWith("mistralai/")) {
  entry.compat = { ...entry.compat, requiresToolResultName: true, requiresThinkingAsText: true, requiresMistralToolIds: true };
}
```

**The problem:** `requiresMistralToolIds` does not exist in pi-ai's `OpenAICompletionsCompat` interface. It's silently ignored.

**Impact:** No runtime error, but whatever feature this was meant to enable (likely Mistral's tool call ID format) is not actually working. If Mistral models need special tool ID handling, this would need to be done in `before_provider_request` by rewriting the tool call IDs in the messages.

---

## Issue: DeepSeek V4 `reasoningEffortMap` Conflict with `before_provider_request`

**Location:** Lines ~559-564
```typescript
if (DEEPSEEK_V4_MODELS[modelId]) {
  entry.compat = { ...entry.compat, supportsReasoningEffort: true };
}
```

And in `DEEPSEEK_V4_MODELS`:
```typescript
"deepseek-ai/deepseek-v4-flash": { enable: { reasoning_effort: "high" }, disable: { reasoning_effort: "none" } },
```

**The problem:** `supportsReasoningEffort: true` tells pi to send `reasoning_effort` as a **top-level** parameter in the request. But on NIM, DeepSeek V4 expects `reasoning_effort` **inside `chat_template_kwargs`**. Since the `before_provider_request` handler never fires (due to Bug #1), `reasoning_effort` remains as a top-level parameter, which NIM may ignore or reject.

Even if the handler DID fire, it would **replace** `payload.chat_template_kwargs` entirely (setting it to `{ reasoning_effort: "high" }`), but pi may have already set `chat_template_kwargs` for other reasons. The handler should:
1. Remove the top-level `reasoning_effort` (since NIM doesn't expect it there)
2. Move the mapped value into `chat_template_kwargs.reasoning_effort`

**Fix in new extension:** The `before_provider_request` handler for DeepSeek V4 must:
- Delete `payload.reasoning_effort` (remove from top level)
- Set `payload.chat_template_kwargs = { ...payload.chat_template_kwargs, reasoning_effort: mappedValue }`

---

## Issue: DeepSeek V3 `supportsReasoningEffort: true` Without `thinkingFormat`

**Location:** The DeepSeek V3 models have `supportsReasoningEffort: true` in compat but NO `thinkingFormat`.

**The problem:** When reasoning is enabled, pi sends `reasoning_effort` as a top-level parameter. But NIM's DeepSeek V3 expects `chat_template_kwargs: { thinking: true }`. Since `before_provider_request` never fires, `thinking: true` is never injected, and the top-level `reasoning_effort` is meaningless to NIM.

**Fix in new extension:** For DeepSeek V3 models:
- Set `supportsReasoningEffort: true` so the UI shows the thinking dropdown
- In `before_provider_request`: delete `payload.reasoning_effort`, inject `chat_template_kwargs: { thinking: true/false }`

---

## Issue: Kimi K2 Thinking/K2.5 Same Problem as DeepSeek V3

Same issue — `supportsReasoningEffort: true` is set, but the `before_provider_request` handler (which would inject `chat_template_kwargs: { thinking: true }`) never fires due to Bug #1.

---

## Issue: StepFun Step 3.5 Flash Same Problem

`supportsReasoningEffort: true` is set for the UI, but the `before_provider_request` handler that remaps `reasoning_effort` → `chat_template_kwargs: { parallel_reasoning_mode }` never fires.

---

## Minor Issue: Console.log Statements in Production

**Location:** Lines ~561, ~648, ~655
```typescript
console.log(`[nvidia-nim] V4 model detected: ${modelId}, setting supportsReasoningEffort: true`);
console.log(`[nvidia-nim] V4 handler triggered for ${model}...`);
console.log(`[nvidia-nim] Set chat_template_kwargs: ...`);
```

These run on every startup and every request. Should be removed or gated behind a debug flag.

---

## Design Issue: Flat Set/Record Classification vs Family-Based

The old extension uses flat Sets and Records for model classification:
- `QWEN_CHAT_TEMPLATE_MODELS = new Set([...])`
- `DEEPSEEK_STYLE_THINKING = { modelId: { enable, disable } }`
- `MINIMAX_MODELS = new Set([...])`

This requires manual updates when NVIDIA adds new models. A family-based approach using regex patterns is more maintainable.

---

## Design Issue: Dynamic Fetch Always Runs

The old extension always fetches `/v1/models` on startup if `NVIDIA_API_KEY` is set. This adds ~1-2 seconds of latency to every pi startup. The new extension makes this opt-in via `NIM_DYNAMIC_MODELS=1`.

---

## Correct Knowledge to Preserve

The old extension has correct knowledge about NIM model behavior that we must preserve:

1. **Qwen/GLM/Phi/Magistral** → `thinkingFormat: "qwen-chat-template"` ✅ (pi handles natively)
2. **DeepSeek V4** → `chat_template_kwargs: { reasoning_effort: "none"|"high"|"max" }` ✅ (but handler broken)
3. **DeepSeek V3/Kimi/Nemotron-Ultra** → `chat_template_kwargs: { thinking: true/false }` ✅ (but handler broken)
4. **StepFun** → `chat_template_kwargs: { parallel_reasoning_mode: "none"|"low"|"medium"|"heavy" }` ✅ (but handler broken)
5. **MiniMax M2** → always thinks inline, `requiresThinkingAsText: true` ✅
6. **Mistral** → `requiresToolResultName: true`, `requiresThinkingAsText: true` ✅ (but `requiresMistralToolIds` is fake)
7. **GPT-OSS** → `supportsReasoningEffort: true`, `reasoningEffortMap: { minimal: "low" }` ✅
8. **All NIM models** → `supportsDeveloperRole: false`, `maxTokensField: "max_tokens"` ✅
9. **Detailed contextWindow/maxTokens per model** ✅
10. **Comprehensive SKIP_MODELS list** ✅
