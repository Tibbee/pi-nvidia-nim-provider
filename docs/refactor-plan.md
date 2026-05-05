# Refactor Plan

## Goal
Bring the NVIDIA NIM provider extension to a more reliable, testable, and maintainable state without changing its core pi-native design.

## What to improve

### P0 — Correctness
- Fix invalid `thinkingFormat` handling for `reasoning-effort` models.
- Ensure families that add thinking support also expose `reasoning: true`.
- Verify the model filter excludes all non-LLM categories.
- Keep model routing and thinking dispatch in sync.

### P1 — Testing
- Add unit tests for `handlers/thinking.ts`.
- Add snapshot tests for `before_provider_request` payload rewrites.
- Add registry tests for model filtering, deduping, and family assignment.
- Add a regression test for non-NVIDIA providers not being touched.

### P2 — Maintainability
- Reduce duplicated regex logic between `MODEL_FAMILIES` and `classifyThinkingFormat()`.
- Replace loose `Record<string, unknown>` compat usage with stronger typing where possible.
- Remove dead intermediate fields that do not reach the final registry.

### P3 — Documentation sync
- Update docs after behavior changes.
- Keep `docs/README.md`, `docs/audit-findings.md`, and this plan aligned.

## Proposed order

### Phase 1: Fix correctness
1. Update `mapThinkingFormatToCompat()` so `reasoning-effort` does not emit an invalid compat value.
2. Merge/fill `reasoning: true` in `applyFamilyCompat()` when a family enables thinking.
3. Audit `isLLMModel()` against the current metadata and remove any leaked non-LLM entries.
4. Re-check StepFun / DeepSeek / Kimi / Nemotron dispatch paths after the above changes.

### Phase 2: Add tests
1. Create test fixtures for representative models:
   - DeepSeek V4
   - DeepSeek V3 / Kimi
   - GPT-OSS
   - GLM
   - MiniMax
   - StepFun
2. Snapshot the final payload sent from `before_provider_request`.
3. Verify `STATIC_MODELS` contains only intended chat/code/reasoning/vision entries.
4. Add a regression test for non-NVIDIA providers remaining untouched.

### Phase 3: Refactor shared model logic
1. Consolidate family-driven thinking dispatch into one source of truth.
2. Remove duplicated regex checks where possible.
3. Tighten config typing around `compat` and model metadata.
4. Remove any fields that are only used during intermediate build steps.

### Phase 4: Documentation cleanup
1. Update the main docs with the final behavior.
2. Update the audit notes to match the current codebase.
3. Add a short “what changed” section if the refactor changes model behavior.

## Success criteria
- No invalid compat values are emitted.
- Thinking toggles are visible for models that support them.
- No excluded model categories leak into the provider list.
- Payload transforms are covered by tests.
- Routing logic is easier to change without breaking dispatch.

## Suggested implementation checkpoints
- **Checkpoint 1:** correctness fixes merged
- **Checkpoint 2:** tests added and passing
- **Checkpoint 3:** shared logic simplified
- **Checkpoint 4:** docs updated

## Notes
- Keep the pi-native `openai-completions` approach.
- Do not edit `models/metadata.json` manually.
- Prefer small, reviewable changes over a large rewrite.
