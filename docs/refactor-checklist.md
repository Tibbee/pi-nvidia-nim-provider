# Refactor Checklist

## P0 — Correctness
- [x] Fix invalid `thinkingFormat` handling for `reasoning-effort` models.
- [x] Ensure families that add thinking support also expose `reasoning: true`.
- [x] Verify the model filter excludes all non-LLM categories.
- [ ] Keep model routing and thinking dispatch in sync.

## P1 — Testing
- [x] Add unit tests for `handlers/thinking.ts`.
- [ ] Add snapshot tests for `before_provider_request` payload rewrites.
- [x] Add registry tests for model filtering, deduping, and family assignment.
- [x] Add a regression test for non-NVIDIA providers not being touched.

## P2 — Maintainability
- [ ] Reduce duplicated regex logic between `MODEL_FAMILIES` and `classifyThinkingFormat()`.
- [ ] Replace loose `Record<string, unknown>` compat usage with stronger typing where possible.
- [ ] Remove dead intermediate fields that do not reach the final registry.

## P3 — Documentation sync
- [x] Update the main docs after behavior changes.
- [x] Update the audit notes to match the current codebase.
- [x] Keep this checklist and `refactor-plan.md` aligned.

## Implementation order
1. Correctness fixes
2. Tests
3. Shared logic cleanup
4. Docs sync
