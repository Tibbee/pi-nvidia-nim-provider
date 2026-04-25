# Context for Next Session: NVIDIA NIM Provider Extension

## Project Location
`E:\Munka\Programming\TypeJavaScript\NvidiaProvider`

## What Was Built
A pi coding agent extension that registers NVIDIA NIM as a custom model provider at `nvidia-nim`, making 50+ models available. Uses `api: "openai-completions"` (no custom streaming).

## Current Status
- Extension loads and models appear in `/model` picker
- Basic streaming works (tested with V4 Flash)
- Non-NVIDIA providers still work (no conflicts)
- **Known issue**: DeepSeek V4 Flash thinking/reasoning did NOT show in pi's thinking panel — it appeared as normal response text instead of in the separate think box

## Root Cause Analysis of Thinking Issue
DeepSeek V4 on NIM requires BOTH fields in `chat_template_kwargs`:
- `thinking: true/false` — enables reasoning mode
- `reasoning_effort: "none"|"high"|"max"` — controls depth

Our previous config only set `supportsReasoningEffort: true`, which made pi send a top-level `reasoning_effort` but NOT `thinking: true`. We've now switched to `thinkingFormat: "deepseek"` which makes pi send both `params.thinking = { type: "enabled" }` and `params.reasoning_effort`. Our `before_provider_request` handler then converts these into `chat_template_kwargs: { thinking: true, reasoning_effort: "max" }` and removes the top-level originals.

**This fix has NOT been tested yet.**

## Architecture
```
index.ts                          # Extension entry + before_provider_request handler
├── models/
│   ├── types.ts                  # NimModelConfig type + NimThinkingFormat
│   ├── registry.ts               # Combines models, applies family compat
│   ├── chat-models.ts            # ~30 chat models
│   ├── coding-models.ts          # ~20 coding/agentic models
│   ├── reasoning-models.ts       # ~25 reasoning models
│   └── vision-models.ts          # ~7 vision models
├── config/
│   ├── model-families.ts         # 30+ families with compat + thinking format classification
│   └── defaults.ts               # Base URL, API key env, filter patterns
├── tools/
│   ├── fetch_nim_metadata.ts     # Comprehensive metadata fetcher (API + model cards)
│   └── fetch_nim_models.ts       # Basic model ID list fetcher (superseded)
└── docs/
    ├── IMPLEMENTATION_PLAN.md    # Full design doc
    ├── OLD_EXTENSION_AUDIT.md   # Bug-by-bug audit of previous nvidiaNim.ts
    └── TEST_PROMPT.md            # This file
```

## Thinking Format Handling (the hard part)

| Format | Models | Mechanism |
|--------|--------|-----------|
| `qwen-chat-template` | Qwen3, GLM, Phi-4-Mini-Flash, Magistral, Seed, Nemotron-Nano-9B | Pi handles natively via `thinkingFormat: "qwen-chat-template"` |
| `deepseek-v4` | DeepSeek V4 Flash/Pro | Pi sends `thinking: {type: "enabled"} + reasoning_effort` via `thinkingFormat: "deepseek"`. Handler converts to `chat_template_kwargs: {thinking: true, reasoning_effort: "none"|"high"|"max"}` |
| `deepseek-nim` | V3.x, R1, Kimi-K2-Thinking, K2.5, Nemotron-Ultra/Super | Same as above but handler converts to `chat_template_kwargs: {thinking: true/false}` only |
| `stepfun-parallel` | Step 3.5 Flash | Handler maps `reasoning_effort` → `chat_template_kwargs: {parallel_reasoning_mode}` |
| `minimax-inline` | MiniMax M2.x | Always thinks inline with `<antha>` tags. `requiresThinkingAsText: true` |
| `reasoning-effort` | GPT-OSS 120B/20B | Standard `reasoning_effort` with `minimal→low` mapping. Pi handles natively |

## Bug Fixes vs Old Extension
1. `before_provider_request` now fires (old one checked `payload.model.startsWith("nvidia-nim/")` — never matched)
2. Removed fake `requiresMistralToolIds` compat field
3. DeepSeek V4 now injects BOTH `thinking: true` AND `reasoning_effort` into chat_template_kwargs
4. Top-level `thinking` and `reasoning_effort` are removed after conversion
5. No console.log in production

## Dynamic Model Fetcher
- `tools/fetch_nim_metadata.ts` — Fetches model IDs from `/v1/models` API, then optionally scrapes model cards from build.nvidia.com via tavily-extract for context windows, reasoning info, etc.
- Usage: `npx tsx tools/fetch_nim_metadata.ts --cards --verbose --output models/metadata.json`
- Requires both `NVIDIA_API_KEY` and `TAVILY_API_KEY`
- Current results: 87 models, context window for 13, thinking format for 15
- **Needs improvement**: reasoning detection (labels not parsed from tavily output), context window parsing (many models still missing)

## Old Extension
Location: `E:/Munka/Node/PI/config/.pi/agent/extensions/nvidiaNim.ts`
- Must be disabled (renamed to `.ts.disabled`) before testing our extension
- Has a critical bug: before_provider_request handler never fires

## Testing Instructions
1. Disable old extension: `mv ~/.pi/agent/extensions/nvidiaNim.ts ~/.pi/agent/extensions/nvidiaNim.ts.disabled`
2. Start pi with our extension: `pi -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider`
3. Use a non-NVIDIA model first, then switch to test NVIDIA NIM models
4. Key test: DeepSeek V4 Flash with thinking ON — verify thinking appears in pi's thinking panel (not as normal text)
5. Test that switching back to non-NVIDIA model still works
6. Test other reasoning models: Qwen3 Coder, GLM-5.1, Step 3.5 Flash, MiniMax M2

## Remaining Work
- [ ] Test the `thinkingFormat: "deepseek"` fix for V4 Flash thinking panel
- [ ] Verify thinking works for DeepSeek V3, Kimi K2, Nemotron Ultra/Super
- [ ] Verify thinking works for StepFun Step 3.5 Flash
- [ ] User will systematically verify each model family's custom parameters
- [ ] Improve fetch_nim_metadata.ts reasoning detection and context window parsing
- [ ] Create GitHub repo and push
