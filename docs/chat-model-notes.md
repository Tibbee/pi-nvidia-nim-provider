# Chat model notes and provider comparison

These notes were moved from the README to keep setup instructions easier to find. Dates and model counts describe the recorded probes and comparison snapshots, not a fresh check of the hosted endpoints.

[Back to the README](../README.md#chat-models-and-thinking-support)

## Catalog audit 2026-10-17

Version 1.15.0 keeps 16 chat models: add Step 5 Preview and Nemotron 3.5 Super
VL, remove Mistral Nemotron and Kimi K3. An outage, timeout, missing account
entitlement, or generic 404 is **inconclusive**, never retirement evidence.
The existing-model sweep made one 4-token request per model with a 30-second
timeout and no retries. Four responded, two explicitly retired, ten were
inconclusive. These observations do not prove full conversation, tools or vision.

| Existing model | Observation | Action |
|---|---|---|
| DeepSeek V4.1 Flash | 30 s timeout | Keep |
| DiffusionGemma | HTTP 200 | Keep |
| Gemma 4 31B | 30 s timeout | Keep |
| Llama 3.2 11B Vision | HTTP 200 | Keep |
| Llama 3.2 90B Vision | 30 s timeout | Keep |
| Muse Glimmer | 30 s timeout | Keep |
| Mistral Nemotron | Explicit HTTP 410; card notice September 27, unsupported after September 28 | Remove |
| Kimi K3 | Explicit HTTP 410; card notice October 14, unsupported after October 15 | Remove |
| Nemotron 3 Nano Omni | HTTP 503 | Keep |
| Nemotron 3 Super | HTTP 200 | Keep |
| Nemotron 3 Ultra | HTTP 503 | Keep |
| Nemotron 3.5 Lightning | 30 s timeout | Keep |
| GPT-OSS 20B | HTTP 200 | Keep |
| Laguna XS 2.1 | 30 s timeout | Keep |
| GLM-5.3 | 30 s timeout; future notice October 27, unsupported after October 28 | Keep until effective retirement |
| GLM-5.3 Flash | 30 s timeout; no past retirement established | Keep |

NVIDIA notice sources: [Mistral Nemotron](https://build.nvidia.com/mistralai/mistral-nemotron),
[Kimi K3](https://build.nvidia.com/moonshotai/kimi-k3), and
[GLM-5.3](https://build.nvidia.com/z-ai/glm-5-3). The generator's explicit
retired-ID list prevents both removed entries from returning during a refresh.
It does not blacklist GLM-5.3's future date or any inconclusive model.

### New chat models

- [Step 5 Preview](https://build.nvidia.com/stepfun-ai/step-5-preview): NVIDIA
  hosted configuration is 1,048,576 context tokens; text/image input. Its
  request maximum spans that combined window, so the extension uses the
  hosted 4096-token default as a conservative output budget. The hosted
  checkpoint always reasons; `high` is the sole visible on level, no effort
  parameter or disable switch. Streaming returned HTTP 200 with separate
  reasoning and final-answer deltas (8.5 s). Preserve assistant reasoning
  during replay per the hosted schema. Tool/vision support is documented,
  not live-tested by this probe.
- [Nemotron 3.5 Super VL](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b):
  the hosted build configuration is 262,144 context tokens, although the
  upstream architecture card describes 1M. Hosted output maximum is 131,072.
  Text/image input and exact off/low/high controls; playground snippets
  translate these to `enable_thinking` and `low_effort`. All three streamed
  HTTP 200; off yielded 0 reasoning characters, low 175 and high 276 on one
  short prompt. Those samples verify transport/on-off behavior, not a general
  depth ordering. Do not inherit generic Nemotron's 32768 reasoning budget.
  Video and complete tool round trips are outside this extension's new
  verification; Pi's catalog declares text/image input only.

Local reports: `tools/output/refresh-2026-10-17/chat-retirement-audit.json`,
`public-card-audit.json`, and `new-chat-probes.json`. They contain scoped
status/count/settings evidence, not API keys or generated reasoning text.
Older sections below remain dated historical snapshots.

## Comparison with Pi's built-in `nvidia` provider

**Historical comparison snapshot (Pi 0.85.1), not the supported runtime baseline.** That bundled provider exposed 20 NVIDIA models in the comparison (21 at runtime, which additionally listed `z-ai/glm-5.3-flash`), versus this extension's 16. Counts below describe that snapshot. Generate an updated comparison against your installed Pi with:

```bash
npm run compare:pi -- \
  --json-output=tools/output/pi-nvidia-compare.json \
  --markdown-output=tools/output/pi-nvidia-compare.md
```

That historical report contains:

- 11 shared model IDs
- 9 official-only models
- 5 extension-only models
- 9 shared models with at least one parameter or compatibility difference
- 2 exact shared matches: both Llama 3.2 vision models

| Aspect | Built-in `nvidia` | This extension `nvidia-nim` |
|--------|-------------------|-----------------------------|
| Models | 20 curated | 16 curated |
| Shared catalog | 11 models | 11 models |
| Thinking control | Basic metadata; DeepSeek has a native `deepseek` map, but no NIM-specific Kimi, GLM, or Nemotron transforms | Family-specific thinking maps and request transforms |
| Compatibility baseline | `supportsStrictMode: false`, `supportsLongCacheRetention: false`, `supportsStore: false` | Same baseline on every model, plus NIM-specific flags |
| Request normalization | No | Content arrays, `max_tokens`, reasoning replay, and model-specific extras |
| API key | `NVIDIA_API_KEY` | `NVIDIA_NIM_API_KEY` with `NVIDIA_API_KEY` fallback |

The comparison includes headers, reasoning/input declarations, cost, context window, output limit, reasoning budget, thinking-level maps, example request extras, and every compatibility key. Provider-level fields such as `api`, `provider`, and `baseUrl` are intentionally reported separately rather than treated as per-model differences.

The remaining differences are not all defects. Pi's official catalog supplies its own limits and prices for models such as Kimi K3, Nemotron 3 Super/Ultra, and GPT-OSS 20B. The extension retains card-derived or probe-verified values where the hosted NIM request contract differs. It also adds `reasoningBudget`, `thinkingFormat`, `requiresReasoningContentOnAssistantMessages`, `supportsUsageInStreaming`, and `exampleRequestExtra` fields that the official catalog does not carry.

Official-only models are Gemma 3 4B/12B, Mistral 7B Instruct v0.3, Kimi K2.6, Cosmos Reason2 8B, and the two legacy Llama 3.1 Nemotron entries — every one of them answers 404 "Function not found for account", so the built-in catalog advertises entries that cannot be called. Extension-only models are DeepSeek V4.1 Flash, DiffusionGemma 26B, Gemma 4 31B, and Mistral Nemotron. The comparison reads pi-ai's bundled catalog snapshot, which now also carries `z-ai/glm-5.3` and `z-ai/glm-5.3-flash`, so those two count as shared.

Use `nvidia-nim/...` when you need the NIM-specific thinking transforms and compatibility flags. Use `nvidia/...` for Pi's native handling of its curated catalog.

### Models with thinking support

DeepSeek V4.1 Flash, GLM-5.3 and GLM-5.3 Flash, Kimi K3, Muse Glimmer, DiffusionGemma, Nemotron (3-Nano Omni, 3-Super, 3-Ultra, 3.5 Lightning), GPT-OSS 20B, and Laguna XS 2.1.

- GLM-5.3 and GLM-5.3 Flash keep thinking permanently on — both build cards state the generation prompt opens a think block unconditionally, and live requests with `enable_thinking: false` or `thinking: {"type":"disabled"}` still returned `reasoning_content`. The effort ladder is `low` / `high` / `max` (default `max`; any other value falls back to `max`), so pi offers exactly those three levels: `off`, `minimal`, `medium`, and `xhigh` map to `null` and are hidden rather than aliased onto a neighbouring effort. `clear_thinking` defaults to `false` in the chat template, so the extension injects `chat_template_kwargs.clear_thinking: true` for chat turns.
- DeepSeek V4: live NIM requests confirmed content-only non-think and separate `reasoning_content` for high and max via `chat_template_kwargs`. Pi exposes only `off`, `high`, and `max` for these models; `reasoning_effort` travels inside `chat_template_kwargs`.
- The extension ships one DeepSeek V4 endpoint: `deepseek-ai/deepseek-v4.1-flash`. The older IDs are all gone — the unsuffixed `deepseek-v4-flash`/`deepseek-v4-pro` and `deepseek-ai/deepseek-v4-pro-0813` reached end of life on 2026-08-07 and 2026-09-14, and `deepseek-ai/deepseek-v4-flash-0731` (shipped by 1.8.1) followed on **2026-09-21**: it now answers `410 Gone` with that date and has dropped from `/v1/models`. Its build card still returns 200, as all three earlier ones do, so only the live sweep proves liveness.
- DeepSeek V4.1 Flash (`deepseek-ai/deepseek-v4.1-flash`, build-listed 2026-09-18) is a text/image Mixture-of-Experts release with a **combined** 1,048,576-token input+output window, OpenAI-format tool calls, and a 262,144-token output cap — the card's own `max_tokens` default. The card publishes `max_tokens.maximum` = 1,048,576, i.e. the whole context; the extension ships the documented default instead, because prompt and completion share that window — a cap equal to it is a parameter bound, not an output budget. Although the release declares no Jinja chat template and its documented schema lists no thinking parameter, the hosted endpoint implements the same `chat_template_kwargs` protocol as V4 Flash: probes on 2026-09-25 showed `thinking: false` suppressing reasoning entirely (0 reasoning chars vs 74 for the unparameterised baseline), `reasoning_effort: "max"` deepening it (122), and `"high"` matching the default, so pi offers the same off/high/max ladder. Top-level `reasoning_effort` — string `"none"` and numeric `100`, DeepSeek's documented 1–100 reference encoding — answered `504` with no usable body. Expect heavy queueing: `/v1/models` answers in ~200 ms, while an accepted completion waited ~198 s for its first byte; when the queue is saturated the gateway answers `504` after roughly 300 s with an empty body, which is admission pressure rather than a parameter problem (requests with a 1,024-token cap fail the same way at the same moment).
- GLM-5.3 Flash has its own build card now (`build.nvidia.com/z-ai/glm-5-3-flash`, published mid-September 2026), which confirms text/image input up to 8 images per request, structured output, OpenAI-format tool calls, and the same 1,048,576-token context and `low`/`high`/`max` ladder as GLM-5.3. Earlier it was shipped from live probes alone, and during that rollout roughly one request in three answered `404 Function ...: Not found for account` — those 404s did not reproduce on 2026-09-17. Both GLM endpoints are currently slow rather than unavailable: re-probes measured 57–123 s to first byte with occasional 150 s+ stalls, so retry long before concluding the endpoint is down (pi does not retry 404).
- Retired on the hosted endpoint: Step-3.7 Flash (2026-08-28), Nemotron 3 Nano 30B (2026-09-01), GPT-OSS 120B (2026-09-03), MiniMax M3 (2026-09-09), DeepSeek V4 Pro 0813 (2026-09-14), DeepSeek V4 Flash 0731 (2026-09-21). All six answer `410 Gone` with an explicit end-of-life date, but their build-page cards still return 200, so the live aliveness sweep — not the card — is the liveness signal.
- Kimi K3 (`moonshotai/kimi-k3`) is the newest Moonshot model on NIM: text/image input, 1,048,576-token context (NVIDIA's official card value), 65,536-token output, OpenAI-format tool calls, a boolean `chat_template_kwargs.thinking` toggle plus card-documented `reasoning_effort` levels (`low` / `high` / `max`), and separate `reasoning_content`. The card became officially listed on the build page on 2026-08-28; before that the extension carried it from live probes alone. **Practical warning: it is near unusable at times** — probe latency ranged from 1 s to 46 s for the same request and the free-tier endpoint repeatedly rate-limits (429) in bursts, so expect intermittent multi-minute-feeling turns; treat it as a capacity-constrained endpoint.
- Muse Glimmer 30B supports text and image input with a 131,072-token context. Hosted NIM accepts top-level `reasoning_effort` and streams separate `reasoning_content`; `none` was accepted but still produced reasoning in live probes.
- Nemotron 3.5 Lightning 30B has a 1,048,576-token context with text input. NVIDIA documents no `reasoning_effort`; thinking is toggled via `enable_thinking` with a top-level `reasoning_budget` (default 16384, max 32768). Live probes confirmed `enable_thinking: false` and `reasoning_effort: none` both stop reasoning, and tool calls work.
