# NVIDIA NIM Metadata Fetcher — Usage Guide

## Quick Start

```bash
# Test a single model (recommended for debugging)
npx tsx tools/fetch_nim_metadata.ts --cards -m stepfun-ai/step-3.5-flash -v -o test-model.json

# Full metadata refresh
npx tsx tools/fetch_nim_metadata.ts --cards
```

## Command Line Options

| Flag | Alias | Description | Example |
|------|-------|-------------|---------|
| `--cards` | | Fetch detailed metadata from docs | `--cards` |
| `--verbose` | `-v` | Print progress for each model | `-v` |
| `--model=` | `-m` | Test a single model | `-m stepfun-ai/step-3.5-flash` |
| `--output=` | `-o` | Output file | `-o test-output.json` |

## Examples

```bash
# Test Step-3.5 Flash
npx tsx tools/fetch_nim_metadata.ts --cards -m stepfun-ai/step-3.5-flash -v -o test-step.json

# Test DeepSeek V4
npx tsx tools/fetch_nim_metadata.ts --cards -m deepseek-ai/deepseek-v4-flash -v

# Test with shorter flags
npx tsx tools/fetch_nim_metadata.ts -m deepseek-ai/deepseek-v4-flash -v -o deepseek-v4.json

# Full fetch (all models)
npx tsx tools/fetch_nim_metadata.ts --cards

# Output to custom file
npx tsx tools/fetch_nim_metadata.ts --cards -o metadata-new.json
```

## What Gets Extracted

For each model, the scraper extracts:

- **contextWindow**: Max input tokens (from "Input Context Length (ISL): XXXK")
- **maxOutputTokens**: Max output tokens (from "max_tokens: 1 to XXX")
- **supportsVision**: Whether model accepts images
- **supportsReasoning**: Whether model has thinking/reasoning
- **thinkingFormat**: The thinking format type

```
fetchModelIds()        → GET /v1/models → returns {id, owned_by}[]
│
└─ For each model (batch of 5, 300ms delay):
   ├─ fetchModelData(modelId, owned_by)
   │  ├─ Try slug variations
   │  │   ├─ base: {org}/{model} → org-model
   │  │   ├─ dots→dashes: org-model-v1.0 → org-model-v1-0
   │  │   ├─ dots→underscores: org_model_v1.0 → org_model_v1_0
   │  │   └─ special: -X → X (e.g., glm-5.1 → glm5.1)
   │  │
   │  ├─ Fetch {DOCS_BASE_URL}/{slug}-infer
   │  │   ├─ Find SSR-Props JSON (id="ssr-props")
   │  │   ├─ Parse OpenAPI schema for max_tokens
   │  │   │   └─ limit = schema.properties.max_tokens.maximum
   │  │   └─ Break on first successful fetch
   │  │
   │  ├─ Fetch {DOCS_BASE_URL}/{slug} (non-infer page)
   │  │   ├─ parseStructuredVisionSupport()
   │  │   │   └─ Match: <strong>Input Type(s):</strong> Text, Image, Video
   │  │   └─ parseStructuredContextWindow()
   │  │       └─ Match: <strong>Input Context Length (ISL):</strong> 256K
   │  │
   │  ├─ Regex heuristics from -infer page
   │  │   ├─ parseContextWindow()
   │  │   │   └─ "input context length: XXX tokens"
   │  │   └─ parseMaxOutputTokens()
   │  │       └─ "max_tokens.*maximum: XXX"
   │  │
   │  ├─ Feature detection
   │  │   ├─ detectVisionSupport() — ID keywords + "type": "image"
   │  │   ├─ detectReasoningSupport() — "reasoning model", "thinking mode"
   │  │   └─ detectThinkingFormat() — ID patterns + HTML content
   │  │
   │  ├─ Apply fallbacks
   │  │   ├─ getYardstickFallback() — family-based defaults
   │  │   └─ FALLBACK_LIMITS_MAP — specific model overrides
   │  │
   │  └─ Return ModelMetadata
   │
   └─ Write metadata.json
```

## Issues Found (BEFORE fix)

### Issue 1: `maxOutputTokens=1` (4 models)

**Affected models:**
- `mistralai/magistral-small-2506`
- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- `stepfun-ai/step-3.5-flash`

**Root cause** (ORIGINAL CODE):

```typescript
if (limit != null && isFinite(limit) && limit > 0 && limit <= 32768) {
    meta.maxOutputTokens = limit;
}
```

The code found `maximum: 1` in the OpenAPI schema. This happens when:
1. The schema has `minimum: 1` instead of `maximum` (mislabeled)
2. The schema has no limit and the parser picks up a default of 1
3. The HTML contains "1" as a context/limit value that's not the max output

**Why the cap fails**: The `limit <= 32768` filter passes `1` (it's <= 32768).

### Issue 2: Missing `contextWindow` (14 LLMs)

**Affected models include:**
- `mistralai/devstral-2-123b-instruct-2512`
- `mistralai/magistral-small-2506`
- `mistralai/mistral-medium-3-instruct`
- `nvidia/nemotron-3-nano-30b-a3b`
- `qwen/qwen2.5-coder-32b-instruct`
- More...

**Root causes:**
1. No docs page exists for the model
2. The structured/non-infer page doesn't have the ISL field
3. The regex patterns don't match the HTML content

### Issue 3: Missing `maxOutputTokens` (25 LLMs)

These are primarily embedding models that passed the `isLLMModel()` filter but have no output token limits (they return embeddings, not text).

## Implementation Priority

| Priority | Enhancement | Impact |
|----------|-------------|--------|
| 1 | Fix `maxOutputTokens=1` rejection | Fixes 4 broken models |
| 2 | Add hierarchical fallback logic | Fixes missing context/maxOutput |
| 3 | Add more slug variations | Finds more docs pages |
| 4 | Embedding model filter | Cleaner output |
| 5 | Validation report | Better debugging |

## Files Modified

| File | Changes |
|------|---------|
| `tools/fetch_nim_metadata.ts` | Main enhancement target |
| `models/metadata.json` | Regenerated after enhancements |