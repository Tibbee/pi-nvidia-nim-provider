# Audit: NvidiaProvider Extension vs pi Library API (v0.72.1)

## Scope

- **Extension:** `pi-extension-nvidia-nim` at `E:\Munka\Programming\TypeJavaScript\NvidiaProvider`
- **pi library:** `@mariozechner/pi-coding-agent` v0.72.1 at `E:\Munka\Node\PI\node_modules\@mariozechner\...`
- **Date:** 2026-05-03

---

## 1. `"reasoning-effort"` is NOT a valid `thinkingFormat` value

**Severity:** Critical (bug)
**File:** `models/registry.ts:43`

`mapThinkingFormatToCompat` maps the scraper label `"reasoning-effort"` to:

```typescript
{ thinkingFormat: "reasoning-effort", supportsReasoningEffort: true }
```

Per `OpenAICompletionsCompat` (`pi-ai/dist/types.d.ts:263`), valid `thinkingFormat` values are:

```
"openai" | "openrouter" | "deepseek" | "zai" | "qwen" | "qwen-chat-template"
```

`"reasoning-effort"` is **not a recognized value**. Pi will silently ignore it and fall back to the default `"openai"` behavior, which means these models may get double-handling (pi sets `reasoning_effort` on the payload, then pi again handles it as OpenAI).

The correct compat for models that only need `reasoning_effort` (no custom thinking format) is simply:

```typescript
{ supportsReasoningEffort: true }
```

with **no** `thinkingFormat` key at all. Then `classifyThinkingFormat` returns `"reasoning-effort"` which is a no-op in the handler — pi handles it natively.

**Action:** Verify which models in `metadata.json` have `thinkingFormat: "reasoning-effort"`. Fix `mapThinkingFormatToCompat` to omit `thinkingFormat` in this case. Confirm that the `classifyThinkingFormat` function still returns `"reasoning-effort"` to skip the handler (it should, since `compat.thinkingFormat` will be `undefined` and the hardcoded checks won't match, returning `"none"` — but `"none"` is the handler no-op, which is correct).

---

## 2. `reasoning` field not merged by `applyFamilyCompat` for thinking models

**Severity:** High (bug)
**File:** `config/model-families.ts:427-446`

`applyFamilyCompat` merges `compat`, `thinkingLevelMap`, and `reasoningBudget` from family into each model, but never touches the `reasoning` field.

### Affected scenario

The `stepfun` family (lines 177-184) sets `supportsReasoningEffort: true` and `thinkingFormat: undefined`. If a StepFun model in `metadata.json` has `supportsReasoning: false`, the family overlay correctly adds `supportsReasoningEffort: true` to compat, but the top-level `reasoning` remains `false`.

Pi uses `model.reasoning` to determine whether to show thinking level controls in the picker. A StepFun model with `reasoning: false` would hide the thinking toggle, making it impossible to enable reasoning.

Same applies to any family that adds thinking support via `thinkingFormat` or `supportsReasoningEffort` but matches a model scraped with `supportsReasoning: false`.

**Suggested fix:**

```typescript
export function applyFamilyCompat(models: NimModelConfig[]): NimModelConfig[] {
  return models.map((model) => {
    const family = findFamily(model.id);
    const { ...providerModel } = model;
    if (family) {
      providerModel.compat = { ...family.compat, ...model.compat };
      if (family.thinkingLevelMap || model.thinkingLevelMap) {
        providerModel.thinkingLevelMap = {
          ...(family.thinkingLevelMap ?? {}),
          ...(model.thinkingLevelMap ?? {}),
        };
      }
      if (family.reasoningBudget != null || model.reasoningBudget != null) {
        providerModel.reasoningBudget = model.reasoningBudget ?? family.reasoningBudget;
      }
      // NEW: force reasoning=true when family provides thinking compat
      if (family.compat?.thinkingFormat || family.compat?.supportsReasoningEffort) {
        providerModel.reasoning = true;
      }
    }
    return providerModel;
  });
}
```

---

## 3. StepFun dispatch duplicated across family definition and `classifyThinkingFormat`

**Severity:** Medium (maintenance risk)
**Files:** `config/model-families.ts:177-184`, `config/model-families.ts:421`

The `stepfun` family has `supportsReasoningEffort: true` with **no** `thinkingFormat`:

```typescript
{
  name: "stepfun",
  pattern: /^stepfun-ai\//,
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    maxTokensField: "max_tokens",
  },
}
```

Then `classifyThinkingFormat` (line 421) independently re-checks:

```typescript
if (/^stepfun-ai\//.test(modelId)) return "stepfun-parallel";
```

This means:
1. Pi sees `supportsReasoningEffort: true` and sends `reasoning_effort` as a top-level field
2. The handler then **removes** `reasoning_effort` and converts it to `chat_template_kwargs.parallel_reasoning_mode`

If someone changes the family pattern but forgets `classifyThinkingFormat`, the StepFun API would receive `reasoning_effort` at top-level instead of `chat_template_kwargs.parallel_reasoning_mode` — breaking thinking.

**Suggested fix:** Store the resolved handler format in compat during model building, eliminating the need for model-ID regex in `classifyThinkingFormat`. For example, the stepfun family could set a custom field:

```typescript
compat: {
  supportsReasoningEffort: true,
  // Custom extension-internal field:
  nimThinkingFormat: "stepfun-parallel",
  // ...
}
```

Then `classifyThinkingFormat` reads from compat instead of repeating model-ID regexes.

---

## 4. `compat` typed as `Record<string, unknown>` loses type safety

**Severity:** Low (type safety)
**File:** `models/types.ts:16`

```typescript
compat?: Record<string, unknown>;
```

Pi v0.72.1 exports the strongly-typed `OpenAICompletionsCompat` interface with all known fields. Using it would catch misspellings at compile time — e.g., `"requireToolResultName"` instead of `"requiresToolResultName"`, or `"thinkingFormat"` with a value that isn't in the union.

The `NimModelConfig` currently has extension-internal fields (`exampleRequestExtra`, `reasoningBudget`) that aren't part of pi's `ProviderModelConfig`, so a 1:1 mapping isn't possible without keeping the internal type. But `compat` specifically should be typed:

```typescript
import type { OpenAICompletionsCompat } from "@mariozechner/pi-ai";

compat?: OpenAICompletionsCompat;
```

---

## 5. Dead fields on `NimModelConfig`

**Severity:** Low (cleanup)
**File:** `models/types.ts:12-13`

```typescript
reasoningEffortValues?: string[];
reasoningEffortDefault?: string;
```

These are set during `metadataToModelConfig` but are **never read** after `buildReasoningEffortThinkingLevelMap` runs at model build time (which produces `thinkingLevelMap`). After that, only `thinkingLevelMap` is used by pi.

They're not part of pi's `ProviderModelConfig`, so they don't leak into pi's model registry, but they take up memory on every model object in `STATIC_MODELS`. Consider removing them from `NimModelConfig` or marking them as intermediate-only (never stored on the final config).

---

## 6. `BeforeProviderRequestEvent` lacks `provider` field in pi's type definition

**Severity:** Low (type assertion needed)
**Files:** `index.ts:17`, `pi-coding-agent/dist/core/extensions/types.d.ts:457-460`

The extension accesses `event.provider`:

```typescript
if (event.provider !== "nvidia-nim") return;
```

But the published type is:

```typescript
export interface BeforeProviderRequestEvent {
    type: "before_provider_request";
    payload: unknown;
}
```

No `provider` field. This works at runtime because the runtime object carries extra properties, but TypeScript may flag it under strict settings. The extension should use a type assertion:

```typescript
const provider = (event as BeforeProviderRequestEvent & { provider?: string }).provider;
if (provider !== "nvidia-nim") return;
```

Or pi should publish the `provider` field in the type definition.

---

## 7. Duplicate model-ID regex in `classifyThinkingFormat`

**Severity:** Low (maintenance risk)
**File:** `config/model-families.ts:406-424`

The function repeats model-ID checks that already exist in family patterns:

| Model pattern | Family pattern (line) | classify check (line) |
|---|---|---|
| `kimi-k2-thinking` | `/^moonshotai\/kimi-k2-thinking/` (136) | `if (/^moonshotai\/kimi-k2-thinking/.test(modelId))` (417) |
| `kimi-k2.5` | `/^moonshotai\/kimi-k2\.5/` (146) | `if (/^moonshotai\/kimi-k2\.5/.test(modelId))` (418) |
| `nemotron-ultra/super` | `/^nvidia\/llama-3\.\d-nemotron-(ultra\|super)/` (210) | `if (/^nvidia\/llama-3\.\d-nemotron-(ultra\|super)/.test(modelId))` (419-420) |
| `stepfun-ai` | `/^stepfun-ai\//` (178) | `if (/^stepfun-ai\//.test(modelId))` (421) |

These are only needed because `compat.thinkingFormat: "deepseek"` is ambiguous: V4 needs different handler logic than V3/R1. The duplication is acceptable given the ambiguity, but it should be documented or the family definition should carry the resolved handler format directly.

---

## 8. No `after_provider_response` hook usage

**Severity:** Low (observability)
**File:** `index.ts`

Pi supports `pi.on("after_provider_response", handler)` which fires after each HTTP response. Could be used for:

- Logging NVIDIA rate-limit headers (`x-ratelimit-remaining`, etc.)
- Debugging response status codes for new models
- Emitting warnings when `content-filter` error codes appear

Currently unused. Consider it for diagnostics in future.

---

## 9. No `reasoningBudget` for models that need it via family compat

**Severity:** Low (consistency)
**Files:** `config/model-families.ts:248`, `index.ts:52-54`

The `nemotron` family sets `reasoningBudget: 32768`, and the handler sets `payload.reasoning_budget` only when thinking is enabled. This is correct, but other families (Kimi, DeepSeek) support thinking with potentially different budgets. If NVIDIA's API schema documents per-model reasoning budgets, these should be populated from metadata and/or family defaults for all thinking models.

---

## 10. Summary

| # | Severity | Description |
|---|----------|-------------|
| 1 | **Critical** | `"reasoning-effort"` not a valid `thinkingFormat` — breaks models with that scraper label |
| 2 | **High** | `reasoning` field not merged by `applyFamilyCompat` — hides thinking toggle for StepFun and similar |
| 3 | **Medium** | StepFun dispatch duplicated across family + classify function |
| 4 | **Medium** | `compat` typed as `Record<string, unknown>` loses TS compile-time checks |
| 5 | **Low** | Dead fields `reasoningEffortValues`/`reasoningEffortDefault` on NimModelConfig |
| 6 | **Low** | `event.provider` missing from pi's `BeforeProviderRequestEvent` type |
| 7 | **Low** | `classifyThinkingFormat` duplicates model-ID regexes from family patterns |
| 8 | **Low** | `after_provider_response` hook available but unused |
| 9 | **Low** | `reasoningBudget` only set for nemotron, not other thinking models |
