# Pi API Audit: NVIDIA NIM Extension

> **Status:** Maintained audit, not a historical snapshot
> **Last reviewed:** 2026-07-16
> **Extension version:** 1.0.1
> **Pi source reviewed:** v0.73.0 (`ai`, `coding-agent`, and `agent` packages)

This document tracks compatibility risks found while comparing the extension with
Pi's `openai-completions` provider. Findings are reviewed against the current
source; code snippets from the original audit are intentionally omitted when
they no longer describe the implementation.

## Summary

| # | Severity | Finding | Current status |
|---|----------|---------|----------------|
| 1 | Critical | Provider context is absent from `BeforeProviderRequestEvent` | **Resolved** — the hook uses `ctx.model.provider` and the raw model registry |
| 2 | High | `mixtral` family could be shadowed by generic `mistral` routing | **Resolved** — specific family precedes the catch-all |
| 3 | Medium | NIM could inherit Pi's OpenAI `store` default | **Resolved** — `supportsStore: false` is applied at the registry merge point |
| 4 | Medium | DeepSeek replay messages may require empty `reasoning_content` | **Resolved for current DeepSeek V4** |
| 5 | Medium | Default family could advertise unsupported reasoning effort | **Resolved** — default explicitly disables it |
| 6 | Low | Temporary system-thinking state could leak through the payload | **Resolved** — handler state is returned as `TransformResult` |
| 7 | Low | `authHeader` could duplicate the OpenAI client's bearer header | **Resolved** — provider registration relies on `openai-completions` auth |
| 8 | Low | Request hook could affect non-NIM models | **Resolved** — scoped by provider context and registry membership |
| 9 | Low | `stream_options.include_usage` support was inferred by Pi | **Partially verified** — accepted by Inkling and Laguna probes; not all families checked |
| 10 | Low | Long cache-retention parameters may reach NIM | **Resolved defensively** — default disables long cache retention |
| 11 | None | Always-thinking models have no request toggle | **By design** — applies to Inkling, Kimi-thinking, MiniMax M2, Magistral, and StepFun cases |
| 12 | Low | Handler-format safety check does not cover every routing format | **Open** — add stronger init-time or test-time coverage |

## Resolved findings

### 1. Provider-scoped request hook

Pi's `BeforeProviderRequestEvent` contains the payload but not a provider field.
The extension therefore uses `ctx.model?.provider === "nvidia-nim"` and then
checks the raw `payload.model` against `STATIC_MODEL_MAP`. This keeps the hook
narrowly scoped without relying on an absent event property.

### 2. First-match family routing

`MODEL_FAMILIES` is ordered specific-to-general. The `mixtral` family now
appears before the generic `mistral` family, so `mistralai/mixtral` receives its
intended compatibility settings.

### 3. NIM storage default

NIM is not an OpenAI storage provider. `applyFamilyCompat()` applies
`supportsStore: false` before family and model-level compat merges. The default
family also declares it explicitly, and a regression test covers an otherwise
generic model.

### 4. DeepSeek assistant-message replay

The current DeepSeek V4 family sets
`requiresReasoningContentOnAssistantMessages: true`, which protects replayed
assistant messages during compaction or session resume. No DeepSeek V3 family is
currently registered; add equivalent coverage if one returns to the catalog.

### 5. Unsupported default effort

The default family explicitly sets `supportsReasoningEffort: false`. Models that
actually support effort use a more specific family or native Pi compatibility.

### 6. Temporary thinking state

System-message handlers return `thinkingEnabled` through `TransformResult`
instead of storing `_systemThinkingEnabled` on the outgoing request payload.

### 7. Authentication header ownership

The provider uses Pi's `openai-completions` API without `authHeader: true`.
Bearer-header construction remains owned by the OpenAI-compatible client.

### 8. Non-NIM isolation

The request hook first checks the selected provider and then verifies that the
raw model ID belongs to the static NIM registry. The response hook applies the
same provider guard for NIM error notifications.

### 10. Cache-retention defense

The default family sets `supportsLongCacheRetention: false`. Do not enable long
cache retention for NIM unless a live probe demonstrates that the endpoint
accepts the parameter.

## Open findings and follow-up actions

### 9. Streaming usage parameter

Pi may send `stream_options: { include_usage: true }` when compatibility allows
it. A dedicated `stream-with-usage` probe case returned HTTP 200 and usage data
for Inkling, Laguna XS 2.1, GLM-5.2, and MiniMax M3.

This is evidence for those endpoints, not a guarantee for every NIM model. Keep
this finding partially verified until more representative families are checked
or a provider-wide NIM contract is documented.

### 12. Handler-format safety coverage

The current init-time check verifies that families using Pi's native DeepSeek
format have a corresponding custom handler mapping. It does not prove that every
custom handler mapping still points to a valid family or that every family with
special routing has a request snapshot.

Follow-up:

1. Assert every `FAMILY_HANDLER_FORMATS` key resolves to a family.
2. Assert every non-`none` handler format has at least one snapshot case.
3. Keep the specific-before-general ordering test for new families.

## Compatibility verification status

The opt-in probe tool (`tools/probe_nim.ts`) currently records request status,
response encoding, reasoning deltas, streaming, usage, and observed tool calls.
The latest focused probes showed:

| Model | Reasoning | Streaming | Usage option | Tool call |
|-------|-----------|-----------|--------------|-----------|
| GLM-5.2 | `reasoning_content` with current toggle | Passed | Passed | Not observed |
| MiniMax M3 | `reasoning_content` with adaptive/enabled modes | Passed | Passed | Not observed |
| Inkling | `reasoning_content`, always on | Passed | Passed | Not observed |
| Laguna XS 2.1 | `reasoning_content` when enabled | Passed | Passed | Not observed |

A tool payload being accepted is not the same as a tool call being emitted.
Tool support therefore remains unknown until a forced invocation and tool-result
round trip are verified.

## Remaining implementation backlog

1. Add a forced tool-call probe and a tool-result replay/stream contract test.
2. Add broader live verification records for the remaining reasoning families.
3. Add non-NIM regression coverage in a full Pi integration environment.
4. Add typecheck/lint/build scripts; `npm test` and `npm pack --dry-run` are the
   current automated checks.
5. Add catalog drift automation around metadata refresh and models.dev comparison.
6. Add release notes and issue templates for compatibility reports.

The extension intentionally does **not** add a custom `streamSimple` or response
normalizer. Pi's built-in `openai-completions` path owns response streaming;
stream fixtures should test that integration rather than introduce a competing
parser.
