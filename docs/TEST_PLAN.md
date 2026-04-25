# Test Plan — NVIDIA NIM Provider Extension

## Pre-Test Setup

1. **Disable old extension**:
   ```bash
   mv E:/Munka/Node/PI/config/.pi/agent/extensions/nvidiaNim.ts E:/Munka/Node/PI/config/.pi/agent/extensions/nvidiaNim.ts.disabled
   ```

2. **Start pi with the new extension** (using a non-NVIDIA model as default):
   ```bash
   pi -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider
   ```

3. **Switch models** using `/model` or `Ctrl+P` — NVIDIA NIM models appear as `nvidia-nim/model-id`

---

## Category 1: Model List Verification

**Goal**: Confirm all curated models appear in the picker.

```bash
pi --list-models -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider | grep nvidia-nim
```

- [ ] Count matches ~50+ models
- [ ] Spot-check these models exist in the list:
  - `nvidia-nim/deepseek-ai/deepseek-v4-flash`
  - `nvidia-nim/deepseek-ai/deepseek-v4-pro`
  - `nvidia-nim/qwen/qwen3-coder-480b-a35b-instruct`
  - `nvidia-nim/z-ai/glm-5.1`
  - `nvidia-nim/stepfun-ai/step-3.5-flash`
  - `nvidia-nim/minimaxai/minimax-m2.7`
  - `nvidia-nim/openai/gpt-oss-120b`
  - `nvidia-nim/mistralai/magistral-small-2506`
  - `nvidia-nim/moonshotai/kimi-k2-thinking`
  - `nvidia-nim/nvidia/llama-3.1-nemotron-ultra-253b-v1`

---

## Category 2: Non-Reasoning Basic Streaming (5 models)

**Goal**: Verify basic text generation works across different model families.

For each model, switch to it and ask: **"What is 2+2? Reply in one word."**

| # | Model | Family | Why test this one |
|---|-------|--------|-------------------|
| 1 | `meta/llama-3.3-70b-instruct` | llama | Most popular base family |
| 2 | `google/gemma-3-12b-it` | gemma | Google family, non-reasoning |
| 3 | `mistralai/mistral-large-2-instruct` | mistral | Mistral non-reasoning, `requiresToolResultName` |
| 4 | `nvidia/nemotron-4-340b-instruct` | nemotron | NVIDIA's own model |
| 5 | `ibm/granite-3.3-8b-instruct` | granite | IBM family |

- [ ] All 5 produce a correct short answer
- [ ] No errors or garbled text
- [ ] Streaming completes normally (no hang)

---

## Category 3: Thinking Format — `deepseek` → `deepseek-v4` (2 models)

**Goal**: Verify DeepSeek V4 thinking appears in pi's **separate thinking panel** (not as regular text).

For each model, switch to it and ask: **"What is 15% of 847? Think step by step.**"

| # | Model | Expected behavior |
|---|-------|-------------------|
| 1 | `deepseek-ai/deepseek-v4-flash` | Thinking panel shows reasoning; response has final answer |
| 2 | `deepseek-ai/deepseek-v4-pro` | Same as above |

**What to check:**
- [ ] Thinking content appears in pi's thinking panel (separate collapsible section), NOT in the main response text
- [ ] The main response contains the final answer only
- [ ] No `chat_template_kwargs` or `reasoning_effort` errors in any console output
- [ ] Try toggling thinking OFF (`/thinking off` or similar) — model should respond without reasoning

**How to verify the payload** (optional, if you can see network/debug output):
- [ ] Top-level `thinking` and `reasoning_effort` are NOT present in the API request
- [ ] `chat_template_kwargs.thinking === true`
- [ ] `chat_template_kwargs.reasoning_effort` is one of `"none"`, `"high"`, `"max"`

---

## Category 4: Thinking Format — `deepseek` → `deepseek-nim` (4 models)

**Goal**: Verify DeepSeek V3 / Kimi / Nemotron thinking works with the simpler `chat_template_kwargs: { thinking: true/false }` format.

For each model, switch to it and ask: **"Is 9.11 bigger than 9.9? Think carefully.**"

| # | Model | Expected behavior |
|---|-------|-------------------|
| 1 | `deepseek-ai/deepseek-v3.1` | Thinking panel shows reasoning |
| 2 | `deepseek-ai/deepseek-v3.2` | Thinking panel shows reasoning |
| 3 | `moonshotai/kimi-k2-thinking` | Thinking panel shows reasoning; `reasoning_content` in response |
| 4 | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | Thinking panel shows reasoning |

**What to check:**
- [ ] Thinking content appears in pi's thinking panel (NOT as regular text)
- [ ] Main response has the final answer
- [ ] No API errors about unknown fields
- [ ] Top-level `thinking` and `reasoning_effort` removed from request
- [ ] `chat_template_kwargs.thinking === true` (NO `reasoning_effort` in kwargs for these)

---

## Category 5: Thinking Format — `qwen-chat-template` (4 models)

**Goal**: Verify pi's native `qwen-chat-template` works correctly on NIM.

For each model, switch to it and ask: **"Explain why the sky is blue in 2 sentences. Think about it first.**"

| # | Model | Expected behavior |
|---|-------|-------------------|
| 1 | `qwen/qwen3-coder-480b-a35b-instruct` | Thinking panel shows reasoning |
| 2 | `z-ai/glm-5.1` | Thinking panel shows reasoning; also verify `clear_thinking: false` is injected |
| 3 | `mistralai/magistral-small-2506` | Thinking panel shows reasoning |
| 4 | `bytedance/seed-oss-36b-instruct` | Thinking panel shows reasoning |

**What to check:**
- [ ] Thinking appears in pi's thinking panel
- [ ] For GLM-5.1 specifically: no extra artifacts or duplicated thinking
- [ ] No `chat_template_kwargs` errors
- [ ] Pi injects `enable_thinking: true` and `preserve_thinking: true` (native behavior)

---

## Category 6: Thinking Format — `stepfun-parallel` (1 model)

**Goal**: Verify StepFun's custom `parallel_reasoning_mode` gets injected correctly.

Switch to `stepfun-ai/step-3.5-flash` and ask: **"Write a Python function to find the longest palindromic substring. Think through your approach first.**"

**What to check:**
- [ ] Thinking appears in pi's thinking panel
- [ ] No `reasoning_effort` in top-level API request
- [ ] `chat_template_kwargs.parallel_reasoning_mode` is one of `"none"`, `"low"`, `"medium"`, `"heavy"`
- [ ] No API errors

---

## Category 7: Thinking Format — `minimax-inline` (1 model)

**Goal**: Verify MiniMax M2 thinks inline with `<antha>` tags and they don't leak.

Switch to `minimaxai/minimax-m2.7` and ask: **"What is the capital of France? Think about it.**"

**What to check:**
- [ ] Model responds (possibly with visible `<antha>...</antha>` tags in thinking panel)
- [ ] Tags do NOT appear in the main response text shown to user
- [ ] `requiresThinkingAsText: true` prevents tag leaking into conversation history
- [ ] No API errors

---

## Category 8: Thinking Format — `reasoning-effort` (1 model)

**Goal**: Verify GPT-OSS standard `reasoning_effort` works with the `minimal → low` mapping.

Switch to `openai/gpt-oss-120b` and ask: **"Solve: if x² + 5x + 6 = 0, what is x?**"

**What to check:**
- [ ] Thinking appears in pi's thinking panel
- [ ] If you set reasoning effort to `minimal`, it gets mapped to `low` (not rejected by NIM)
- [ ] No API errors

---

## Category 9: Vision Models (2 models)

**Goal**: Verify image input works for multimodal models.

For each model, attach an image and ask: **"Describe what you see in this image.**"

| # | Model | Notes |
|---|-------|-------|
| 1 | `meta/llama-3.2-11b-vision-instruct` | Llama vision |
| 2 | `google/gemma-3-27b-it` | Gemma vision |

**What to check:**
- [ ] Model accepts the image
- [ ] Returns a reasonable description
- [ ] No "model does not support images" errors

---

## Category 10: Non-NVIDIA Provider Regression (1 test)

**Goal**: Our extension must NOT break other providers.

1. Switch to a non-NVIDIA model (e.g., an OpenRouter model)
2. Ask: **"What is 3+3? Reply in one word.**"

- [ ] Non-NVIDIA model responds correctly
- [ ] No errors or conflicts
- [ ] The `before_provider_request` handler does NOT intercept non-NIM requests (early return on model lookup miss)

---

## Category 11: Dynamic Model Discovery (1 test)

**Goal**: Verify `NIM_DYNAMIC_MODELS=1` works.

```bash
NIM_DYNAMIC_MODELS=1 pi --list-models -e E:/Munka/Programming/TypeJavaScript/NvidiaProvider | grep nvidia-nim | wc -l
```

- [ ] Model count is HIGHER than the static list (should include models from the API that aren't in our curated list)
- [ ] All static models are still present
- [ ] Dynamic models have reasonable defaults (contextWindow, etc.)

---

## Category 12: Error Handling (2 tests)

**Goal**: Verify graceful degradation.

1. **Invalid model**: Switch to a non-existent NIM model ID (if dynamic discovery adds one that's been removed). Or just try a model that might be rate-limited.
   - [ ] Error message is clear, not a crash

2. **No API key**: Temporarily unset `NVIDIA_API_KEY` and start pi
   - [ ] Extension loads but models show auth errors when used
   - [ ] No crash during startup

---

## Category 13: Tool Calling (2 models)

**Goal**: Verify tool/function calling works.

Switch to the model and ask it to use a tool (e.g., file read/write or bash). These models are known for agentic coding:

| # | Model | Notes |
|---|-------|-------|
| 1 | `deepseek-ai/deepseek-v4-flash` | Primary coding model |
| 2 | `qwen/qwen3-coder-480b-a35b-instruct` | Qwen's coding flagship |

**What to check:**
- [ ] Model generates tool calls in the correct format
- [ ] Tool results are processed correctly
- [ ] For Mistral models specifically: `requiresToolResultName` ensures tool results include `name` field (test `mistralai/devstral-2-123b-instruct-2512` if time permits)

---

## Summary Checklist

| # | Category | Models | Priority | Status |
|---|----------|--------|----------|--------|
| 1 | Model list | all | P0 | ☐ |
| 2 | Basic streaming | 5 | P0 | ☐ |
| 3 | DeepSeek V4 thinking | 2 | **P0** | ☐ |
| 4 | DeepSeek V3/Kimi/Nemotron thinking | 4 | P0 | ☐ |
| 5 | Qwen-chat-template thinking | 4 | P1 | ☐ |
| 6 | StepFun parallel thinking | 1 | P1 | ☐ |
| 7 | MiniMax inline thinking | 1 | P1 | ☐ |
| 8 | GPT-OSS reasoning effort | 1 | P2 | ☐ |
| 9 | Vision | 2 | P2 | ☐ |
| 10 | Non-NVIDIA regression | 1 | **P0** | ☐ |
| 11 | Dynamic discovery | 1 | P2 | ☐ |
| 12 | Error handling | 2 | P2 | ☐ |
| 13 | Tool calling | 2 | P1 | ☐ |

**Total: ~27 individual tests across 13 categories**

### Critical path (do these first):
1. Category 10 (non-NVIDIA regression — must not break existing setup)
2. Category 3 (DeepSeek V4 thinking — the known bug we just fixed)
3. Category 4 (DeepSeek V3/Kimi/Nemotron thinking — same handler, different format)
4. Category 2 (basic streaming sanity)
5. Category 5 (qwen-chat-template — most models use this)
