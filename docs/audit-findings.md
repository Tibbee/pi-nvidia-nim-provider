# Audit: NvidiaProvider Extension vs pi Library Source (v0.73.0)

## Scope

- **Extension:** `pi-extension-nvidia-nim` at `E:\Munka\Programming\TypeJavaScript\NvidiaProvider`
- **pi library:** Full source at `E:\Munka\Programming\TypeJavaScript\pi-mono-main` (monorepo: `ai`, `coding-agent`, `agent` packages)
- **Date:** 2026-05-06
- **Source version:** v0.73.0 (packages/ai, packages/coding-agent, packages/agent)

---

## 1. `BeforeProviderRequestEvent` / `AfterProviderResponseEvent` lack `provider` field

**Severity:** Critical (requires verification)
**Files:** `index.ts:18-19`, `index.ts:68-69`, `runner.ts:890-922`, `types.ts:612-621`

### What the extension does

```typescript
// index.ts:18 (before_provider_request)
if (event.provider !== "nvidia-nim") return;

// index.ts:69 (after_provider_response)
if (event.provider !== "nvidia-nim") return undefined;
```

### What pi actually provides

The `emitBeforeProviderRequest` method in `runner.ts:900-903` creates:

```typescript
const event: BeforeProviderRequestEvent = {
    type: "before_provider_request",
    payload: currentPayload,
};
```

Similarly, `emit()` in `sdk.ts:228-232` creates `after_provider_response` events with only `type`, `status`, and `headers` — **no `provider` field**.

The `BeforeProviderRequestEvent` type (`types.ts:611-615`) confirms:

```typescript
export interface BeforeProviderRequestEvent {
    type: "before_provider_request";
    payload: unknown;
}
```

There is **no `provider` field** on either event type, and no `provider` field is set at runtime in the event construction. The extension's check `event.provider !== "nvidia-nim"` always evaluates to `true` (`undefined !== "nvidia-nim"`), which would cause the handler to return early without modifying the payload.

### Nuance

User reports thinking works across all model families (DeepSeek, Kimi, Nemotron, Qwen, GLM). Possible explanations:
1. NVIDIA NIM's API gateway internally converts pi's native params (`thinking` / `reasoning_effort`) to the model-specific formats, making the `before_provider_request` handler redundant for thinking format conversion
2. A runtime mechanism not visible in the source provides `provider` context (unlikely given the source audit)
3. The models tested happen to work without the handler's specific transformations (e.g., system-message-based Nemotron models might default to thinking-on behavior)

**Recommended action:** Verify by logging inside `handleBeforeProviderRequest` at runtime. If `event.provider` is indeed `undefined`, the handler signature needs to change — either:
- Remove the `event.provider` guard and use only `payload.model` + `STATIC_MODEL_MAP.has(modelId)` as the gate
- Or use `ctx.model.provider` (available via the `ExtensionContext` second parameter, currently unused)

**Status:** Needs verification

---

## 2. `mixtral` family pattern is unreachable (dead code)

**Severity:** High (bug)
**File:** `config/model-families.ts:409-418`

The `mixtral` family at line 409:

```typescript
{
    name: "mixtral",
    pattern: /^mistralai\/mixtral/,
    compat: {
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
        requiresToolResultName: true,
    },
}
```

is defined AFTER the broader `mistral` family at line 289:

```typescript
{
    name: "mistral",
    pattern: /^mistralai\//,
    compat: {
        requiresToolResultName: true,
        requiresThinkingAsText: true,
        ...
    },
}
```

Since `MODEL_FAMILIES` uses **first-match-wins**, the `mistral` pattern `/^mistralai\//` catches ALL `mistralai/` models including `mistralai/mixtral`, making the `mixtral` entry unreachable.

**Impact:** If mixtral models exist in metadata and need different compat from generic mistral (e.g., `supportsReasoningEffort: false` vs no override, no `requiresThinkingAsText`), those differences are not applied.

**Fix:** Move the `mixtral` entry **before** the `mistral` entry (to line ~288):

```typescript
// Mixtral — before generic mistral catch-all
{
    name: "mixtral",
    pattern: /^mistralai\/mixtral/,
    compat: { supportsReasoningEffort: false, maxTokensField: "max_tokens", requiresToolResultName: true },
},
// Generic mistral — after specific mistral sub-families
{
    name: "mistral",
    pattern: /^mistralai\//,
    compat: { requiresToolResultName: true, requiresThinkingAsText: true, maxTokensField: "max_tokens" },
},
```

**Status:** Not resolved

---

## 3. `supportsStore` auto-detection is wrong for NIM

**Severity:** Medium (unnecessary params sent)
**File:** `openai-completions.ts:1034-1088` (pi source), all extension family compat entries

### What pi does

```typescript
// openai-completions.ts:1063-1064
const isNonStandard = provider === "cerebras" || baseUrl.includes("cerebras.ai") || ...;
return { supportsStore: !isNonStandard, ... };
```

Since `nvidia-nim` provider is not in `isNonStandard` and `integrate.api.nvidia.com` matches none of the URL patterns, `supportsStore` auto-detects as `true`. pi then sends `store: false` in every request.

### What should happen

NVIDIA NIM is a non-standard provider. `store: false` is a parameter for Azure/OpenAI's persistent storage feature. Sending it to NIM is at best ignored, at worst causes errors.

None of the extension's family compat entries set `supportsStore: false`.

**Fix:** Add `supportsStore: false` to all family compat entries. The simplest approach is adding it to the `default` family at line 450:

```typescript
{
    name: "default",
    pattern: /.*/,
    compat: {
        supportsDeveloperRole: false,
        supportsStore: false,     // ADD
        maxTokensField: "max_tokens",
    },
}
```

NVIDIA NIM-specific families already override with specific compat, but all families should be explicit about `supportsStore`.

**Status:** Not resolved

---

## 4. `requiresReasoningContentOnAssistantMessages` not set for DeepSeek models on NIM

**Severity:** Medium (potential replay errors)
**File:** `config/model-families.ts:14-40` (deepseek-v4, deepseek-v3 families), `openai-completions.ts:1072` (pi source)

### What pi does

```typescript
// openai-completions.ts:1072
const isDeepSeek = provider === "deepseek" || baseUrl.includes("deepseek.com");
// ...
requiresReasoningContentOnAssistantMessages: isDeepSeek,
```

The auto-detection checks `provider === "deepseek"` but the NIM provider is `"nvidia-nim"`. The base URL `integrate.api.nvidia.com` doesn't contain `deepseek.com`. So `requiresReasoningContentOnAssistantMessages` auto-detects as `false`.

### What this flag does

In `convertMessages()` (openai-completions.ts:857-863): when replaying assistant messages with thinking content, if `requiresReasoningContentOnAssistantMessages` is `true` and `reasoning_content` is absent, an empty `reasoning_content: ""` is injected. DeepSeek models require this field on every replayed assistant message when reasoning is enabled.

Without it, replayed conversations (compaction, session resume) may fail with DeepSeek models hosted on NIM.

**Fix:** Set in the deepseek family compat entries:

```typescript
{
    name: "deepseek-v4",
    pattern: /^deepseek-ai\/deepseek-v4/,
    compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "deepseek",
        maxTokensField: "max_tokens",
        requiresReasoningContentOnAssistantMessages: true,  // ADD
    },
},
{
    name: "deepseek-v3",
    pattern: /^deepseek-ai\/deepseek-(v3|r1)/,
    compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "deepseek",
        maxTokensField: "max_tokens",
        requiresReasoningContentOnAssistantMessages: true,  // ADD
    },
},
```

**Status:** Not resolved

---

## 5. Default family missing `supportsReasoningEffort: false`

**Severity:** Medium (incorrect defaults for future models)
**File:** `config/model-families.ts:450-457`

```typescript
{
    name: "default",
    pattern: /.*/,
    compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
    },
}
```

The default family does NOT set `supportsReasoningEffort`. For any model not matching a specific family, the auto-detected value from `detectCompat()` is used — which is `true` for NIM (no exclusion patterns match).

Most NIM models DO have explicit family overrides (37 of 39 families set it), but the default is wrong for any future non-reasoning model added to metadata.json that doesn't match a specific family.

**Fix:** Add `supportsReasoningEffort: false` to the default family:

```typescript
{
    name: "default",
    pattern: /.*/,
    compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,  // ADD
        maxTokensField: "max_tokens",
    },
}
```

**Status:** Not resolved

---

## 6. `_systemThinkingEnabled` internal flag on payload

**Severity:** Low (fragile pattern)
**File:** `handlers/thinking.ts:111,136`, `index.ts:63`

The `nemotron-system-detailed` and `nemotron-system-think` handler cases set a temporary flag on the raw payload:

```typescript
(payload as any)._systemThinkingEnabled = thinking;
```

This is later read by `hasEnabledThinking()` and cleaned up at the end of `handleBeforeProviderRequest`:

```typescript
delete (payload as any)._systemThinkingEnabled;
```

### Issues

1. If `handleBeforeProviderRequest` returns early (e.g., `event.provider` guard), the flag is leaked onto the payload sent to the API
2. If another extension runs `before_provider_request` after this one and inspects the payload, it sees this internal flag
3. The cleanup assumes the payload was modified — if `modified` is `false` after the handler, the payload with the flag is returned

**Fix:** Store thinking state in a local variable instead of on the payload object. Pass it explicitly instead of re-checking through `hasEnabledThinking`:

```typescript
// In handleBeforeProviderRequest:
const thinkingEnabledForBudgets = hasEnabledThinking(payload);
const format = classifyThinkingFormat(modelId);
let modified = applyCustomThinkingFormat(payload, format, modelId);

// Pass thinking state explicitly for budget injection:
if (modelConfig.reasoningBudget != null && thinkingEnabledForBudgets) {
    // ...
}
```

And in `applyCustomThinkingFormat`, return the thinking state alongside the boolean:

```typescript
type TransformResult = { modified: boolean; thinkingEnabled: boolean };
```

**Status:** Not resolved

---

## 7. `authHeader: true` causes double `Authorization` header on requests

**Severity:** Low (works but redundant)
**File:** `index.ts:79-85`, `model-registry.ts:700-705` (pi source), `openai-completions.ts:471-476` (pi source)

The extension registers the provider with `authHeader: true`:

```typescript
pi.registerProvider("nvidia-nim", {
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_ENV,
    api: "openai-completions",
    authHeader: true,   // ← this
    models: STATIC_MODELS,
});
```

### How auth flows

1. **Model registry** (`model-registry.ts:700-704`): When `authHeader` is true, resolves the API key and adds `Authorization: Bearer ${apiKey}` to the resolved headers
2. **OpenAI completions provider** (`openai-completions.ts:471-476`): `createClient` passes `apiKey` to `new OpenAI({ apiKey })`, and the OpenAI SDK itself adds `Authorization: Bearer ${apiKey}` to every HTTP request

Result: **Two** `Authorization` headers on each request — one from the OpenAI SDK and one from the authHeader-enriched headers. Most servers handle duplicates gracefully, but it's redundant.

### Note

The `authHeader` option is documented in pi as being for "custom APIs where the auth mechanism is a simple Bearer token." Since this extension uses `api: "openai-completions"` which handles auth natively via the OpenAI SDK, `authHeader: true` is unnecessary.

**Fix:** Remove `authHeader: true`:

```typescript
pi.registerProvider("nvidia-nim", {
    baseUrl: NIM_BASE_URL,
    apiKey: NIM_API_KEY_ENV,
    api: "openai-completions",
    models: STATIC_MODELS,
});
```

**Status:** Not resolved

---

## 8. `before_provider_request` handler returns modified payload even for non-NIM models

**Severity:** Low (logic clarity)
**File:** `index.ts:18-66`

Currently the handler uses `event.provider` as the gate. Per finding #1, this is dead code if `provider` is truly missing. Either way, the design should be:

```typescript
export function handleBeforeProviderRequest(event: BeforeProviderRequestEventLike) {
    const payload = event.payload as Record<string, unknown>;
    const modelId = payload.model as string | undefined;
    // Gate on known NIM model ID instead of provider
    if (!modelId || !STATIC_MODEL_MAP.has(modelId)) return;
    // ... rest of handler
}
```

This bypasses the need for any `provider` field on the event and directly gates on whether the model ID is in the NIM registry.

**Fix:** Replace `event.provider` check with `STATIC_MODEL_MAP.has(modelId)` check.

**Status:** Not resolved

---

## 9. `supportsUsageInStreaming` auto-detected as `true`

**Severity:** Low (ignored param)
**File:** `openai-completions.ts:1067` (pi source)

pi's `detectCompat()` sets `supportsUsageInStreaming: true` for NIM. This causes pi to send `stream_options: { include_usage: true }` with every request. If NIM doesn't support this, it's silently ignored. If a NIM model errors on unknown params, this could cause failures.

The extension does not override this in any family compat.

**Fix:** Verify NIM supports `stream_options.include_usage`. If not, set `supportsUsageInStreaming: false` in the default family.

**Status:** Needs verification

---

## 10. `prompt_cache_key` and `prompt_cache_retention` sent to NIM

**Severity:** Low (unnecessary params)
**File:** `openai-completions.ts:493-498` (pi source)

pi's `buildParams` checks the base URL for `api.openai.com` before sending `prompt_cache_key`. Since NIM's base URL is `integrate.api.nvidia.com`, the OpenAI-specific check avoids sending it. However, the generic path (`cacheRetention === "long" && compat.supportsLongCacheRetention`) could theoretically trigger.

Since `supportsLongCacheRetention` auto-detects as `true` for NIM (no exclusion match), when global `PI_CACHE_RETENTION=long` is set, pi would send `prompt_cache_retention: "24h"`. NIM likely ignores unknown params.

**Status:** No action needed unless NIM errors on unknown params

---

## 11. `kimi-k2-thinking` family has no `compat` for reasoning

**Severity:** Low (no-op, but conceptually misleading)
**File:** `config/model-families.ts:146-154`

```typescript
{
    name: "kimi-k2-thinking",
    pattern: /^moonshotai\/kimi-k2-thinking/,
    compat: {
        supportsDeveloperRole: false,
        maxTokensField: "max_tokens",
    },
    thinkingLevelMap: { off: null }, // Cannot disable thinking
}
```

The `kimi-k2-thinking` model always thinks, but has no `thinkingFormat` in compat and no `supportsReasoningEffort`. pi would NOT add any thinking parameters to the request. However, since `thinkingLevelMap` triggers `reasoning: true` in `applyFamilyCompat` (line 518-528), the model appears as reasoning-capable in the picker.

The user can select thinking levels, but pi sends no params — NIM handles thinking server-side for this model. This is intentional per AGENTS.md ("always thinks — no toggle, no params").

The same pattern applies to: `magistral` (line 133), `stepfun` (line 197), `minimax-m2` (line 122). These are correct as-is.

**Status:** Intended design, no issue

---

## 12. `FAMILY_HANDLER_FORMATS` safety check has a blind spot

**Severity:** Low (init-time warning)
**File:** `config/model-families.ts:485-493`

```typescript
const FAMILIES_MISSING_HANDLER = MODEL_FAMILIES
    .filter((f) => f.compat?.thinkingFormat === "deepseek" && !FAMILY_HANDLER_FORMATS[f.name])
    .map((f) => f.name);
if (FAMILIES_MISSING_HANDLER.length > 0) {
    console.warn("[nvidia-nim] Warning: families with thinkingFormat=deepseek missing from FAMILY_HANDLER_FORMATS:", ...);
}
```

This checks that any family with `thinkingFormat: "deepseek"` also has a handler format entry. However, there are handler formats (like `"thinking-budget"`, `"nemotron-system-detailed"`, etc.) that map to families WITHOUT `thinkingFormat: "deepseek"` in compat. There's no check that these families need handler entries despite not having `thinkingFormat`.

More importantly, if the `before_provider_request` hook is non-functional (finding #1), the handler format routing is moot. The safety check succeeds, but the handlers never run.

**Status:** Valid but overshadowed by finding #1

---

## 13. Summary

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | **Critical** | `BeforeProviderRequestEvent` lacks `provider` field — handler guard may be dead code | Needs verification |
| 2 | **High** | `mixtral` family unreachable (dead code) — shadowed by broader `mistral` pattern | Not resolved |
| 3 | **Medium** | `supportsStore` auto-detected as `true`, pi sends unnecessary `store: false` param | Not resolved |
| 4 | **Medium** | `requiresReasoningContentOnAssistantMessages` not set for DeepSeek models on NIM | Not resolved |
| 5 | **Medium** | Default family missing `supportsReasoningEffort: false` — wrong defaults for new models | Not resolved |
| 6 | **Low** | `_systemThinkingEnabled` flag stored on raw payload — fragile cleanup pattern | Not resolved |
| 7 | **Low** | `authHeader: true` causes double `Authorization` header (redundant) | Not resolved |
| 8 | **Low** | Handler gates on `event.provider` (likely missing) instead of registry membership | Not resolved |
| 9 | **Low** | `supportsUsageInStreaming` auto-detected as `true` — verify NIM support | Needs verification |
| 10 | **Low** | `prompt_cache_key/retention` may be sent if `PI_CACHE_RETENTION=long` — verify NIM behavior | Needs verification |
| 11 | **None** | Always-thinking models have no params in compat — intentional design | By design |
| 12 | **None** | Handler format safety check works but target handlers may be dead — finding #1 overshadows | Informational |

---

## 14. Previously resolved issues (carried forward from v0.72.1 audit)

These were identified in the previous audit and have been addressed in the current codebase:

- `"reasoning-effort"` is NOT a valid `thinkingFormat` — Fixed: `mapThinkingFormatToCompat` now correctly maps to `{ supportsReasoningEffort: true }` without setting `thinkingFormat`
- `reasoning` field not merged by `applyFamilyCompat` — Fixed: `familyEnablesReasoning` logic at model-families.ts:518-528 now forces `reasoning: true` when thinking is enabled via family
- `compat` typed as `Record<string, unknown>` — Fixed: now uses `OpenAICompletionsCompat` from pi-ai
- Duplicate model-ID regex in `classifyThinkingFormat` — Fixed: now reads from `FAMILY_HANDLER_FORMATS` lookup table
- No `after_provider_response` hook — Fixed: handler now warns on 429 responses
- `BeforeProviderRequestEvent` lacks `provider` in pi type — Previously fixed by local type wrapper; finding #1 supersedes this with the runtime analysis

---

## 15. Recommended priority actions

1. **Verify finding #1** — Add a `console.log` in `handleBeforeProviderRequest` to check `event.provider` at runtime. If it's `undefined`, restructure the gate to use `STATIC_MODEL_MAP.has(modelId)`.
2. **Fix finding #2** — Move `mixtral` before the generic `mistral` family pattern.
3. **Fix finding #3** — Add `supportsStore: false` to the default family (and all families for clarity).
4. **Fix finding #4** — Add `requiresReasoningContentOnAssistantMessages: true` to deepseek-v4 and deepseek-v3 families.
5. **Fix finding #5** — Add `supportsReasoningEffort: false` to the default family.
6. **Fix finding #7** — Remove `authHeader: true` (redundant with `openai-completions`).
7. **Fix finding #8** — Replace the `event.provider` guard with a registry-based check.
8. **Fix finding #6** — Refactor `_systemThinkingEnabled` to use local state instead of payload pollution.
