# Audit: NvidiaProvider Extension vs pi Library API (v0.72.1)

## Scope

- **Extension:** `pi-extension-nvidia-nim` at `E:\Munka\Programming\TypeJavaScript\NvidiaProvider`
- **pi library:** `@mariozechner/pi-coding-agent` v0.72.1 at `E:\Munka\Node\PI\node_modules\@mariozechner\...`
- **Date:** 2026-05-03

> Note: this is a historical audit. Some findings have since been fixed in the working tree; keep the current codebase and this report in sync.

---

## 1. `"reasoning-effort"` is NOT a valid `thinkingFormat` value

**Severity:** Critical (bug)
**Status:** Resolved in current branch
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
**Status:** Resolved in current branch
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
**Status:** Resolved in current branch
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

**Resolution:** The matched family now carries the resolved handler format in a lookup table, and `classifyThinkingFormat` reads that resolved family result instead of repeating regex checks.

---

## 4. `compat` typed as `Record<string, unknown>` loses type safety

**Severity:** Low (type safety)
**Status:** Resolved in current branch
**File:** `models/types.ts:16`

```typescript
compat?: OpenAICompletionsCompat;
```

Pi v0.72.1 exports the strongly-typed `OpenAICompletionsCompat` interface with all known fields. Using it would catch misspellings at compile time — e.g., `"requireToolResultName"` instead of `"requiresToolResultName"`, or `"thinkingFormat"` with a value that isn't in the union.

The `NimModelConfig` currently has extension-internal fields (`exampleRequestExtra`, `reasoningBudget`) that aren't part of pi's `ProviderModelConfig`, so a 1:1 mapping isn't possible without keeping the internal type. But `compat` specifically should be typed:

```typescript
import type { OpenAICompletionsCompat } from "@mariozechner/pi-ai";

compat?: OpenAICompletionsCompat;
```

---

## 5. Dead fields on registry metadata

**Severity:** Low (cleanup)
**Status:** Partially resolved in current branch
**File:** `models/registry.ts:14-15`

```typescript
reasoningEffortValues?: string[];
```

`reasoningEffortDefault` was removed from the registry metadata shape, but `reasoningEffortValues` is still used during model build to create `thinkingLevelMap` and therefore is not dead.

The final provider registry only stores `thinkingLevelMap`, so any remaining metadata-only fields should stay confined to the build pipeline. Consider trimming `MetadataEntry` further only if the build logic no longer needs them.

---

## 6. `BeforeProviderRequestEvent` lacks `provider` field in pi's type definition

**Severity:** Low (type assertion needed)
**Status:** Resolved in current branch
**Files:** `index.ts:17`, `pi-coding-agent/dist/core/extensions/types.d.ts:457-460`

The extension now wraps the untyped event in a local `{ provider?: string }` shape before checking `nvidia-nim`, so the runtime-only field is handled without relying on the published pi type.

---

## 7. Duplicate model-ID regex in `classifyThinkingFormat`

**Severity:** Low (maintenance risk)
**Status:** Resolved in current branch
**File:** `config/model-families.ts:406-424`

The function previously repeated model-ID checks that already exist in family patterns:

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
**Status:** Resolved in current branch
**File:** `index.ts`

Pi supports `pi.on("after_provider_response", handler)` which fires after each HTTP response. The extension now uses it to warn on NVIDIA 429 rate-limit responses and surface retry-after hints.

---

## 9. No `reasoningBudget` for models that need it via family compat

**Severity:** Low (consistency)
**Status:** Resolved in current branch
**Files:** `config/model-families.ts:248`, `index.ts:52-54`

The handler already injects `reasoningBudget` for any model that provides it in metadata, not just Nemotron. Current metadata covers Seed OSS, Nemotron 3 Nano Omni reasoning, and Nemotron 3 Super.

---

## 10. Summary

| # | Severity | Description |
|---|----------|-------------|
| 1 | **Critical** | `"reasoning-effort"` not a valid `thinkingFormat` — breaks models with that scraper label |
| 2 | **High** | `reasoning` field not merged by `applyFamilyCompat` — hides thinking toggle for StepFun and similar |
| 3 | **Medium** | Resolved: family lookup now supplies the handler format |
| 4 | **Medium** | Resolved: `compat` now uses `OpenAICompletionsCompat` |
| 5 | **Low** | Partially resolved: `reasoningEffortDefault` removed; `reasoningEffortValues` remains build-time metadata |
| 6 | **Low** | Resolved: local event wrapper handles `provider` safely |
| 7 | **Low** | Resolved: `classifyThinkingFormat` now reads the matched family handler format |
| 8 | **Low** | Resolved: `after_provider_response` now warns on rate limits |
| 9 | **Low** | Resolved: reasoning budgets are data-driven from metadata when present |
